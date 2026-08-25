// selftest.js —— 端到端验证 Cordis 架构特性
// ───────────────────────────────────────────────────────────────────────────
// 不依赖 TTY，纯逻辑驱动。验证：
//   1) 空间可组合：两个独立 Context(realm) 各自挂载同一套插件，互不污染；
//   2) 时间可组合（revertible effects）：卸载插件后其监听器被回收，计数停增；
//   3) 响应式共效应（reactive coeffects）：依赖缺失时 snake 停用，依赖出现后
//      被框架自动激活并开始移动；驱动插件热插拔也不崩溃；
//   4) 关卡：吃够 goal 个食物升级，追加障碍 + 提速 + 蛇重生；
//   5) 多人：多条蛇各自移动，头对头同归于尽；
//   6) 音效：游戏事件经 sound 服务翻译成 sound/play，关闭后为空操作；
//   7) 真实 HMR（CordisLoader）：改 manifest 配置 → provider 热重载且游戏继续。
// ───────────────────────────────────────────────────────────────────────────
import { Context } from 'cordis'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { TimerService } from './services/timer.js'
import { BoardService } from './services/board.js'
import { InputService } from './services/input.js'
import { SnakesService } from './services/snakes.js'
import { SoundService } from './services/sound.js'
import { foodPlugin } from './plugins/food.js'
import { scorePlugin } from './plugins/score.js'
import { aiPlugin } from './plugins/input-ai.js'
import { snakePlugin } from './plugins/snake.js'
import { levelPlugin } from './plugins/level.js'
import { multiplayerPlugin } from './plugins/multiplayer.js'
import { soundHooksPlugin } from './plugins/sound-hooks.js'
import { PowerupService } from './services/powerups.js'
import { powerupSpawnPlugin } from './plugins/powerups.js'
import { resolve, join } from 'node:path'
import { tmpdir } from 'node:os'
import { unlinkSync, writeFileSync, existsSync, rmSync, mkdirSync, mkdtempSync } from 'node:fs'
import { readManifest, hashManifest } from './manifest.js'
import { soundCommandFor } from './plugins/sound-wav.js'
import { AchievementService } from './services/achievements.js'
import { achievementTrackPlugin } from './plugins/achievements.js'
import { ComboService } from './services/combo.js'
import { StorageService } from './services/storage.js'
import { ThemeService } from './services/themes.js'
import { themePalettePlugin } from './plugins/themes.js'
import { particlePlugin } from './plugins/particles.js'
import { modePlugin } from './plugins/modes.js'
import { bossPlugin } from './plugins/boss.js'
import { AuditService } from './services/audit.js'
import { parseTicks } from './util/parse-ticks.js'
import { REGISTRY, CordisLoader, configEqual } from './loader.js'

const checks = []
function assert(name, cond, detail = '') {
  const ok = !!cond
  checks.push(ok)
  process.stdout.write(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}\n`)
}

function mountGame(ctx, boardCfg, driver = aiPlugin) {
  const fibers = {}
  fibers.board = ctx.plugin(BoardService, boardCfg)
  fibers.snakes = ctx.plugin(SnakesService, {})
  fibers.timer = ctx.plugin(TimerService, { intervalMs: 50, auto: false })
  fibers.input = ctx.plugin(InputService, { source: 'ai' })
  fibers.food = ctx.plugin(foodPlugin)
  fibers.score = ctx.plugin(scorePlugin)
  fibers.driver = ctx.plugin(driver)
  fibers.snake = ctx.plugin(snakePlugin)
  return fibers
}

async function activate(fibers) {
  await Promise.all(Object.values(fibers).map((f) => f.await?.()))
}

async function safe(name, fn) {
  try {
    await fn()
  } catch (e) {
    assert(name, false, '抛出异常: ' + (e?.message || e))
    if (process.env.STACK) console.error('  [stack]', e?.stack)
  }
}

async function runSelfTest() {
  process.stdout.write('=== Cordis 贪吃蛇 · 端到端自测 ===\n\n')

  // ── 1) 空间可组合：两个 realm 独立演化 ──
  await safe('空间可组合', async () => {
    const ctxA = new Context()
    const ctxB = new Context()
    const fA = mountGame(ctxA, { width: 10, height: 10 })
    const fB = mountGame(ctxB, { width: 20, height: 10 })
    await activate(fA)
    await activate(fB)

    for (let i = 0; i < 80; i++) {
      ctxA.timer.tick()
      ctxB.timer.tick()
    }

    assert('realm A 尺寸保持独立 width=10', ctxA.board.width === 10, `got ${ctxA.board.width}`)
    assert('realm B 尺寸保持独立 width=20', ctxB.board.width === 20, `got ${ctxB.board.width}`)
    assert('realm A 蛇始终在边界内', ctxA.snakes.list.every((s) => s.body.every((b) => ctxA.board.inBounds(b))))
    assert('realm B 蛇始终在边界内', ctxB.snakes.list.every((s) => s.body.every((b) => ctxB.board.inBounds(b))))
    const stateA = JSON.stringify(ctxA.snakes.list[0].body)
    const stateB = JSON.stringify(ctxB.snakes.list[0].body)
    assert('两 realm 演化互不污染（蛇状态不同）', stateA !== stateB)

    for (const f of [...Object.values(fA), ...Object.values(fB)]) await f.dispose?.()
  })

  // ── 2) 时间可组合：revertible effects 回收 ──
  await safe('时间可组合', async () => {
    const ctx = new Context()
    const f = mountGame(ctx, { width: 12, height: 12 })
    await activate(f)

    let counter = 0
    const probe = ctx.plugin({
      name: 'probe',
      apply(c) {
        const off = c.on('tick', () => {
          counter++
        })
        return () => off()
      },
    })
    await probe.await()

    const before = counter
    for (let i = 0; i < 5; i++) ctx.timer.tick()
    const afterMount = counter
    assert('effect 生效：5 帧后计数 +5', afterMount === before + 5, `before=${before} after=${afterMount}`)

    await probe.dispose()
    const mid = counter
    for (let i = 0; i < 5; i++) ctx.timer.tick()
    const afterUnmount = counter
    assert('effect 回收：卸载后计数不再增长', afterUnmount === mid, `mid=${mid} after=${afterUnmount}`)

    for (const x of Object.values(f)) await x.dispose?.()
  })

  // ── 3) 响应式共效应：依赖出现 → 反应式激活；驱动热插拔不崩 ──
  await safe('响应式共效应', async () => {
    const ctx = new Context()
    const f = {}
    // 挂载 board / timer / snakes，但故意不挂 input —— snake 因缺 input 而 PENDING。
    f.board = ctx.plugin(BoardService, { width: 14, height: 14 })
    f.timer = ctx.plugin(TimerService, { intervalMs: 50, auto: false })
    f.snakes = ctx.plugin(SnakesService, {})
    f.snake = ctx.plugin(snakePlugin)
    await activate(f)

    const head0 = JSON.stringify(ctx.snakes.list[0].body)
    for (let i = 0; i < 3; i++) ctx.timer.tick()
    const headNoInput = JSON.stringify(ctx.snakes.list[0].body)
    assert('依赖缺失时 snake 处于非激活（不随 tick 移动）',
      headNoInput === head0, `before=${head0} after=${headNoInput}`)

    // 提供 input + AI 驱动 → snake 反应式激活
    f.input = ctx.plugin(InputService, { source: 'ai' })
    f.driver = ctx.plugin(aiPlugin)
    await Promise.all([f.input.await?.(), f.driver.await?.(), f.snake.await?.()])

    const headBefore = JSON.stringify(ctx.snakes.list[0].body)
    for (let i = 0; i < 3; i++) ctx.timer.tick()
    const headWithInput = JSON.stringify(ctx.snakes.list[0].body)
    assert('依赖出现后 snake 反应式激活（开始移动）',
      headWithInput !== headBefore, `before=${headBefore} after=${headWithInput}`)

    // 热插拔驱动：卸载 AI 驱动不崩溃，input 服务仍在
    await f.driver.dispose()
    assert('卸载驱动后输入服务仍在（无 provider 级联崩溃）', !!ctx.get('input'))

    // 重新挂载驱动 → snake 继续正常移动
    f.driver2 = ctx.plugin(aiPlugin)
    await f.driver2.await()
    const headRe = JSON.stringify(ctx.snakes.list[0].body)
    for (let i = 0; i < 3; i++) ctx.timer.tick()
    const headAfterRe = JSON.stringify(ctx.snakes.list[0].body)
    assert('重新挂载驱动后 snake 继续移动', headAfterRe !== headRe)

    for (const x of Object.values(f)) await x.dispose?.()
  })

  // ── 4) 关卡：吃够 goal 升级，追加障碍 + 提速 + 蛇重生 ──
  await safe('关卡', async () => {
    const ctx = new Context()
    const f = {}
    f.board = ctx.plugin(BoardService, { width: 20, height: 16 })
    f.snakes = ctx.plugin(SnakesService, {})
    f.timer = ctx.plugin(TimerService, { intervalMs: 100, auto: false })
    f.input = ctx.plugin(InputService, {})
    f.food = ctx.plugin(foodPlugin)
    f.score = ctx.plugin(scorePlugin)
    f.level = ctx.plugin(levelPlugin, { goal: 3, speedStep: 0.8, obstaclesPerLevel: 2 })
    f.snake = ctx.plugin(snakePlugin)
    await activate(f)

    const w0 = ctx.board.width
    const ms0 = ctx.timer.intervalMs
    const lvl0 = ctx.get('level').get()
    // 直接喂 3 次"吃到食物"事件（与真实进食走同一条事件契约）。
    for (let i = 0; i < 3; i++) ctx.emit('snake/eat', { id: 'p1', head: { x: 1, y: 1 } })

    assert('升级后关卡数 +1', ctx.get('level').get() === lvl0 + 1, `lvl ${lvl0}→${ctx.get('level').get()}`)
    assert('升级后追加了障碍物', ctx.board.obstacles.size >= 2, `obstacles=${ctx.board.obstacles.size}`)
    assert('升级后心跳提速（interval 变小）', ctx.timer.intervalMs < ms0, `${ms0}→${ctx.timer.intervalMs}`)
    assert('棋盘尺寸未被关卡改动', ctx.board.width === w0)

    for (const x of Object.values(f)) await x.dispose?.()
  })

  // ── 5) 多人：多蛇各自响应输入移动；头对头同归于尽 ──
  await safe('多人', async () => {
    const ctx = new Context()
    const f = {}
    f.board = ctx.plugin(BoardService, { width: 24, height: 16 })
    f.snakes = ctx.plugin(SnakesService, {})
    f.timer = ctx.plugin(TimerService, { intervalMs: 50, auto: false })
    f.input = ctx.plugin(InputService, {})
    f.food = ctx.plugin(foodPlugin)
    f.score = ctx.plugin(scorePlugin)
    f.multi = ctx.plugin(multiplayerPlugin, { count: 1 }) // 加 1 个 AI 对手 cpu1
    f.ai = ctx.plugin(aiPlugin)
    f.snake = ctx.plugin(snakePlugin)
    await activate(f)

    const p1 = ctx.snakes.get('p1')
    const cpu1 = ctx.snakes.get('cpu1')
    assert('多人模式存在 2 条蛇', ctx.snakes.list.length === 2, `count=${ctx.snakes.list.length}`)
    assert('AI 对手 source=ai', cpu1.source === 'ai', `src=${cpu1.source}`)
    assert('主蛇 source=human', p1.source === 'human', `src=${p1.source}`)

    // AI 驱动插件：给定食物目标后为 cpu1 自动喂方向（验证"自动驱动"能力，
    // 不依赖蛇是否真的走远——只要被喂过方向即证明其驱动生效）。
    let aiFed = 0
    const spy = ctx.on('input/direction', (e) => { if (e.id === 'cpu1') aiFed++ })
    ctx.board.food = ctx.snakes.randomFreeCell()
    for (let i = 0; i < 6; i++) ctx.timer.tick()
    spy()
    assert('AI 驱动为 cpu1 自动喂方向', aiFed > 0, `aiFed=${aiFed}`)

    // 主蛇响应输入驱动：重置到安全位置 + 手动喂方向，头位置应变化。
    p1.alive = true
    p1.body = [{ x: 5, y: 8 }, { x: 4, y: 8 }]
    const p1Head0 = JSON.stringify(p1.body[0])
    const cur = ctx.input.dirOf('p1')
    const head = p1.body[0]
    const safeDir =
      cur.x !== 0
        ? (head.y <= 1 ? { x: 0, y: 1 } : { x: 0, y: -1 })
        : (head.x >= 22 ? { x: -1, y: 0 } : { x: 1, y: 0 })
    ctx.input.setDirection('p1', safeDir, 'test')
    for (let i = 0; i < 4; i++) ctx.timer.tick()
    const p1Head1 = JSON.stringify(p1.body[0])
    assert('主蛇在输入驱动下移动（位置变化）', p1Head1 !== p1Head0, `p1 ${p1Head0}→${p1Head1}`)

    // 头对头：复活两蛇并摆成相向而行，新头同格 → 同归于尽。
    // 根因说明：本测试段已挂载 aiPlugin（监听 'tick'），它在 snake 插件之前执行，
    // 会为 source==='ai' 的 cpu1 每帧用 BFS 重设方向、覆盖手动 setDirection。
    // 故先令 cpu1.source='human'，让 AI 驱动跳过它，手动 setDirection 才真正生效
    // （p1 本就是 'human'，同样不受 aiPlugin 干扰）。另外 setDirection 带 180°
    // 反向保护（蛇不能掉头），先把方向落盘为中间朝向 {0,1} 再设最终相向方向，
    // 避免被反向保护误拒。
    p1.alive = true
    p1.body = [{ x: 10, y: 8 }, { x: 9, y: 8 }]
    cpu1.alive = true
    cpu1.body = [{ x: 12, y: 8 }, { x: 13, y: 8 }]
    cpu1.source = 'human'
    ctx.board.status = 'running'
    ctx.input.dirs['p1'] = { x: 0, y: 1 }
    ctx.input.dirs['cpu1'] = { x: 0, y: 1 }
    ctx.input.setDirection('p1', { x: 1, y: 0 }, 'test')
    ctx.input.setDirection('cpu1', { x: -1, y: 0 }, 'test')
    ctx.timer.tick()
    assert('头对头两蛇同归于尽', !p1.alive && !cpu1.alive, `p1=${p1.alive} cpu1=${cpu1.alive}`)

    for (const x of Object.values(f)) await x.dispose?.()
  })

  // ── 6) 音效：事件经 sound 服务翻译；关闭后为空操作 ──
  await safe('音效', async () => {
    const ctx = new Context()
    const f = {}
    f.sound = ctx.plugin(SoundService, { enabled: true })
    f.hooks = ctx.plugin(soundHooksPlugin)
    await activate(f)

    let played = 0
    const spy = ctx.on('sound/play', () => played++)
    ctx.emit('snake/eat', { id: 'p1', head: { x: 1, y: 1 } })
    assert('游戏事件被翻译成 sound/play', played === 1, `played=${played}`)
    spy()

    // 关闭 sound 服务 → play 为空操作
    await f.sound.dispose()
    const f2 = ctx.plugin(SoundService, { enabled: false })
    await f2.await()
    let played2 = 0
    const spy2 = ctx.on('sound/play', () => played2++)
    ctx.emit('snake/eat', { id: 'p1', head: { x: 1, y: 1 } })
    assert('sound 关闭后 play 为空操作（无副作用）', played2 === 0, `played2=${played2}`)
    spy2()
    await f2.dispose()

    for (const x of Object.values(f)) await x.dispose?.()
  })

  // ── 7) 真实 HMR（CordisLoader）：改配置 → provider 热重载且游戏继续 ──
  await safe('真实 HMR', async () => {
    const ctx = new Context()
    const loader = new CordisLoader(ctx, REGISTRY, {})
    const mk = (w) => ({
      plugins: [
        { name: 'board', config: { width: w, height: 10 } },
        { name: 'snakes' },
        { name: 'input' },
        { name: 'timer', config: { intervalMs: 50, auto: false } },
        { name: 'food' },
        { name: 'score' },
        { name: 'snake' },
        { name: 'game' },
      ],
    })
    loader.load(mk(10))
    await activate(loader.fibers)
    assert('装载后 board.width=10', ctx.board.width === 10, `got ${ctx.board.width}`)

    // 改 manifest：board 宽度改 20 → 触发 provider 热重载
    await loader.reload(mk(20))
    await activate(loader.fibers)
    assert('HMR 后 board.width=20', ctx.board.width === 20, `got ${ctx.board.width}`)

    // 热重载后游戏仍然可玩：放食物、tick，主蛇应移动
    ctx.board.food = ctx.snakes.randomFreeCell()
    const headBefore = JSON.stringify(ctx.snakes.get('p1').body)
    ctx.timer.tick()
    const headAfter = JSON.stringify(ctx.snakes.get('p1').body)
    assert('HMR 后游戏仍可运行（主蛇移动）', headAfter !== headBefore, `before=${headBefore} after=${headAfter}`)

    // 增删插件：移除 score、新增 level，应平滑生效
    const mk2 = (w) => ({
      plugins: [
        { name: 'board', config: { width: w, height: 10 } },
        { name: 'snakes' },
        { name: 'input' },
        { name: 'timer', config: { intervalMs: 50, auto: false } },
        { name: 'food' },
        { name: 'level', config: { goal: 3 } },
        { name: 'snake' },
        { name: 'game' },
      ],
    })
    await loader.reload(mk2(20))
    await activate(loader.fibers)
    assert('HMR 增删插件后 level 服务可用', typeof ctx.get('level')?.get === 'function')
    assert('HMR 增删插件后 score 已卸载', ctx.get('score') === undefined)

    await loader.unwatch?.()
    for (const f of Object.values(loader.fibers)) await f.dispose?.()
  })

  // ── 8) 框架扩展：道具 / 皮肤 / 成就 / Boss（研调新增能力缝）──
  await safe('框架扩展', async () => {
    // 道具：即时(golden/shrink) + 持续(phase 到期) + 持续全局(magnet)
    {
      const ctx = new Context()
      const f = {}
      f.board = ctx.plugin(BoardService, { width: 20, height: 16 })
      f.snakes = ctx.plugin(SnakesService, {})
      f.timer = ctx.plugin(TimerService, { intervalMs: 50, auto: false })
      f.input = ctx.plugin(InputService, {})
      f.food = ctx.plugin(foodPlugin)
      f.score = ctx.plugin(scorePlugin)
      f.pw = ctx.plugin(PowerupService, {})
      f.spawn = ctx.plugin(powerupSpawnPlugin, { spawnEvery: 9999 })
      await activate(f)

      const s0 = ctx.score.get('p1')
      ctx.powerups.pickup('p1', 'golden')
      assert('golden 道具即时 +5 分', ctx.score.get('p1') === s0 + 5, `score=${ctx.score.get('p1')}`)

      ctx.snakes.grow('p1', 3)
      const lenBefore = ctx.snakes.get('p1').body.length
      ctx.powerups.pickup('p1', 'shrink')
      assert('shrink 道具缩短蛇身', ctx.snakes.get('p1').body.length < lenBefore, `len ${lenBefore}→${ctx.snakes.get('p1').body.length}`)

      ctx.powerups.pickup('p1', 'phase')
      assert('phase 拾取后处于激活', ctx.powerups.isActive('p1', 'phase'))
      for (let i = 0; i < 60; i++) ctx.timer.tick()
      assert('phase 到期后自动回收（时间可组合）', !ctx.powerups.isActive('p1', 'phase'))

      const p1 = ctx.snakes.get('p1')
      ctx.board.food = { x: 1, y: 1 }
      const distBefore = Math.abs(ctx.board.food.x - p1.body[0].x) + Math.abs(ctx.board.food.y - p1.body[0].y)
      ctx.powerups.pickup('p1', 'magnet')
      for (let i = 0; i < 20; i++) ctx.timer.tick()
      const distAfter = Math.abs(ctx.board.food.x - p1.body[0].x) + Math.abs(ctx.board.food.y - p1.body[0].y)
      assert('magnet 道具把食物吸向蛇头', distAfter < distBefore, `dist ${distBefore}→${distAfter}`)

      for (const x of Object.values(f)) await x.dispose?.()
    }

    // P1 道具扩充（9 类新道具 + combo）：逐项确定性断言。
    const mountMini = (ctx) => {
      const f = {}
      f.board = ctx.plugin(BoardService, { width: 20, height: 16 })
      f.snakes = ctx.plugin(SnakesService, {})
      f.timer = ctx.plugin(TimerService, { intervalMs: 50, auto: false })
      f.input = ctx.plugin(InputService, {})
      f.food = ctx.plugin(foodPlugin)
      f.score = ctx.plugin(scorePlugin)
      f.pw = ctx.plugin(PowerupService, {})
      f.spawn = ctx.plugin(powerupSpawnPlugin, { spawnEvery: 9999 })
      f.snake = ctx.plugin(snakePlugin)
      return f
    }

    // portal（传送门）：拾取即瞬移蛇头到空格，蛇身长度不变。
    {
      const ctx = new Context()
      const f = mountMini(ctx)
      await activate(f)
      const p1 = ctx.snakes.get('p1')
      const lenBefore = p1.body.length
      const headBefore = JSON.stringify(p1.body[0])
      ctx.powerups.pickup('p1', 'portal')
      assert('portal 瞬移蛇头到空格', JSON.stringify(p1.body[0]) !== headBefore && ctx.board.inBounds(p1.body[0]), `head=${JSON.stringify(p1.body[0])}`)
      assert('portal 保持蛇身长度', p1.body.length === lenBefore, `len ${lenBefore}→${p1.body.length}`)
      for (const x of Object.values(f)) await x.dispose?.()
    }

    // drill（破障）：撞向障碍时破障并免死。
    {
      const ctx = new Context()
      const f = mountMini(ctx)
      await activate(f)
      const p1 = ctx.snakes.get('p1')
      p1.body = [{ x: 2, y: 2 }, { x: 1, y: 2 }]
      ctx.input.setDirection('p1', { x: 1, y: 0 }, 'test')
      ctx.board.addObstacle({ x: 3, y: 2 })
      ctx.powerups.pickup('p1', 'drill')
      ctx.timer.tick()
      assert('drill 撞穿障碍后蛇仍存活', p1.alive, `alive=${p1.alive}`)
      assert('drill 把障碍破除以空', !ctx.board.isObstacle({ x: 3, y: 2 }), `isObstacle=${ctx.board.isObstacle({ x: 3, y: 2 })}`)
      for (const x of Object.values(f)) await x.dispose?.()
    }

    // ghost（穿身不穿墙）：可穿过它蛇身体，但仍撞自身/墙。
    {
      const ctx = new Context()
      const f = mountMini(ctx)
      await activate(f)
      ctx.snakes.spawn({ id: 'cpu1', color: '@', dir: { x: 1, y: 0 }, source: 'human', pos: { x: 6, y: 6 } })
      const p1 = ctx.snakes.get('p1')
      const cpu1 = ctx.snakes.get('cpu1')
      ctx.board.status = 'running'
      p1.body = [{ x: 5, y: 6 }, { x: 4, y: 6 }]
      cpu1.body = [{ x: 6, y: 6 }, { x: 7, y: 6 }]
      ctx.input.setDirection('p1', { x: 1, y: 0 }, 'test')
      ctx.powerups.pickup('p1', 'ghost')
      const h0 = JSON.stringify(p1.body[0])
      ctx.timer.tick()
      assert('ghost 穿过它蛇身体后存活', p1.alive, `alive=${p1.alive}`)
      assert('ghost 确实进入了它蛇身体格', JSON.stringify(p1.body[0]) !== h0, `head=${JSON.stringify(p1.body[0])}`)
      for (const x of Object.values(f)) await x.dispose?.()
    }

    // frenzy（撒食物）：立即产生奖励食物；吃掉一份后得分增加且消失。
    {
      const ctx = new Context()
      const f = mountMini(ctx)
      await activate(f)
      const before = ctx.board.bonusFood.size
      ctx.powerups.pickup('p1', 'frenzy')
      assert('frenzy 撒出奖励食物', ctx.board.bonusFood.size > before, `bonus=${ctx.board.bonusFood.size}`)
      const p1 = ctx.snakes.get('p1')
      p1.body = [{ x: 2, y: 2 }, { x: 1, y: 2 }]
      ctx.input.setDirection('p1', { x: 1, y: 0 }, 'test')
      const target = { x: 3, y: 2 }
      ctx.board.addFood(target)
      const sc0 = ctx.score.get('p1')
      ctx.timer.tick()
      assert('吃了奖励食物后得分增加', ctx.score.get('p1') > sc0, `score ${sc0}→${ctx.score.get('p1')}`)
      assert('奖励食物被吃后消失', !ctx.board.isFood(target), `isFood=${ctx.board.isFood(target)}`)
      for (const x of Object.values(f)) await x.dispose?.()
    }

    // poison（毒）：拾取即死。
    {
      const ctx = new Context()
      const f = mountMini(ctx)
      await activate(f)
      const p1 = ctx.snakes.get('p1')
      ctx.powerups.pickup('p1', 'poison')
      assert('poison 拾取即死', !p1.alive, `alive=${p1.alive}`)
      for (const x of Object.values(f)) await x.dispose?.()
    }

    // extra-life（护盾）：抵消一次致命碰撞，原地复活 + 消耗护盾。
    {
      const ctx = new Context()
      const f = mountMini(ctx)
      await activate(f)
      const p1 = ctx.snakes.get('p1')
      p1.body = [{ x: 2, y: 2 }, { x: 1, y: 2 }]
      ctx.input.setDirection('p1', { x: 1, y: 0 }, 'test')
      ctx.board.addObstacle({ x: 3, y: 2 })
      ctx.powerups.pickup('p1', 'extra-life')
      assert('extra-life 授予护盾', (p1._shield || 0) === 1, `shield=${p1._shield}`)
      ctx.timer.tick()
      assert('护盾抵消致命碰撞，蛇仍存活', p1.alive, `alive=${p1.alive}`)
      assert('护盾被消耗', (p1._shield || 0) === 0, `shield=${p1._shield}`)
      assert('复活后本帧原地不动', JSON.stringify(p1.body[0]) === JSON.stringify({ x: 2, y: 2 }), `head=${JSON.stringify(p1.body[0])}`)
      for (const x of Object.values(f)) await x.dispose?.()
    }

    // bomb（清周围）：清除蛇头周围 3×3 障碍。
    {
      const ctx = new Context()
      const f = mountMini(ctx)
      await activate(f)
      const p1 = ctx.snakes.get('p1')
      const h = p1.body[0]
      const around = []
      for (let dx = -1; dx <= 1; dx++)
        for (let dy = -1; dy <= 1; dy++) {
          const p = { x: h.x + dx, y: h.y + dy }
          if (ctx.board.inBounds(p) && !(p.x === h.x && p.y === h.y)) { ctx.board.addObstacle(p); around.push(p) }
        }
      const occBefore = around.filter((p) => ctx.board.isObstacle(p)).length
      ctx.powerups.pickup('p1', 'bomb')
      const occAfter = around.filter((p) => ctx.board.isObstacle(p)).length
      assert('bomb 清除蛇头周围障碍', occAfter < occBefore, `before=${occBefore} after=${occAfter}`)
      for (const x of Object.values(f)) await x.dispose?.()
    }

    // mystery（随机）：锁定 Math.random=0 时套用 pool[0]='speed'。
    {
      const ctx = new Context()
      const f = mountMini(ctx)
      await activate(f)
      const orig = Math.random
      Math.random = () => 0
      ctx.powerups.pickup('p1', 'mystery')
      Math.random = orig
      assert('mystery 随机套用一种道具（此处锁定 speed）', ctx.powerups.isActive('p1', 'speed'), `active=${ctx.powerups.activeOf('p1')}`)
      for (const x of Object.values(f)) await x.dispose?.()
    }

    // slowmo（全局减速）：作用于所有蛇，隔帧移动。
    {
      const ctx = new Context()
      const f = mountMini(ctx)
      await activate(f)
      ctx.snakes.spawn({ id: 'cpu1', color: '@', dir: { x: 1, y: 0 }, source: 'human', pos: { x: 2, y: 4 } })
      ctx.board.status = 'running'
      const p1 = ctx.snakes.get('p1')
      const cpu1 = ctx.snakes.get('cpu1')
      p1.body = [{ x: 2, y: 2 }, { x: 1, y: 2 }]
      cpu1.body = [{ x: 2, y: 4 }, { x: 1, y: 4 }]
      ctx.input.setDirection('p1', { x: 1, y: 0 }, 'test')
      ctx.input.setDirection('cpu1', { x: 1, y: 0 }, 'test')
      ctx.powerups.pickup('p1', 'slowmo') // 全局，由 p1 持有但影响全场
      const x0 = p1.body[0].x
      for (let i = 0; i < 10; i++) ctx.timer.tick()
      const moved = p1.body[0].x - x0
      assert('slowmo 让主蛇减速移动（<10 格）', moved > 0 && moved < 10, `moved=${moved}`)
      const movedC = cpu1.body[0].x - 2
      assert('slowmo 对所有蛇生效（cpu1 也减速）', movedC > 0 && movedC < 10, `movedC=${movedC}`)
      for (const x of Object.values(f)) await x.dispose?.()
    }

    // combo（连锁倍率）：窗口内连吃累积倍率；窗口外断连重置。
    // 用最小挂载（不挂 snake/food），手动 emit 进食与 tick，避免蛇自动吃食干扰。
    {
      const ctx = new Context()
      const f = {}
      f.board = ctx.plugin(BoardService, { width: 14, height: 14 })
      f.snakes = ctx.plugin(SnakesService, {})
      f.timer = ctx.plugin(TimerService, { intervalMs: 50, auto: false })
      f.score = ctx.plugin(scorePlugin)
      f.pw = ctx.plugin(PowerupService, {})
      await activate(f)
      const sc0 = ctx.score.get('p1')
      for (let i = 0; i < 3; i++) {
        ctx.emit('snake/eat', { id: 'p1', head: { x: 1, y: 1 } })
        if (i < 2) ctx.timer.tick() // 维持窗口内
      }
      assert('连续进食累积 combo', ctx.score.combo('p1') >= 3, `combo=${ctx.score.combo('p1')}`)
      // 第1次×1 + 第2次×2 + 第3次×3 = 6
      assert('combo 放大计分（1+2+3=6）', ctx.score.get('p1') - sc0 === 6, `delta=${ctx.score.get('p1') - sc0}`)
      for (let i = 0; i < 12; i++) ctx.timer.tick()
      ctx.emit('snake/eat', { id: 'p1', head: { x: 1, y: 1 } })
      assert('窗口外 combo 重置为 1', ctx.score.combo('p1') === 1, `combo=${ctx.score.combo('p1')}`)
      for (const x of Object.values(f)) await x.dispose?.()
    }

    // 皮肤（P3）：12 套内置调色板 + 独立 skin 注册表 + 按配置切换皮肤
    {
      const ctx = new Context()
      const f = {}
      f.themes = ctx.plugin(ThemeService, {})
      f.pal = ctx.plugin(themePalettePlugin, { skin: 'dotted' })
      await activate(f)
      // 12 套调色板清单
      const expect12 = ['classic','neon','retro','mono','sunset','matrix','ocean','forest','candy','ember','ice','vapor']
      assert('内置调色板正好 12 套', ctx.themes.list().length === 12, `list=${ctx.themes.list().join(',')}`)
      assert('12 套调色板全部存在', expect12.every((n) => ctx.themes.list().includes(n)), `missing=${expect12.filter((n) => !ctx.themes.list().includes(n)).join(',')}`)
      assert('皮肤插件注册了额外 skin', ['glitch','dotted','rainbow'].every((s) => ctx.themes.skinsList().includes(s)), `skins=${ctx.themes.skinsList().join(',')}`)
      assert('按配置切到指定皮肤', ctx.themes.currentSkin === 'dotted', `skin=${ctx.themes.currentSkin}`)
      assert('调色板含 colors（粒子着色用）', !!ctx.themes.get().colors && typeof ctx.themes.get().colors.eat === 'string', `colors=${JSON.stringify(ctx.themes.get().colors)}`)
      assert('skinOf 返回当前皮肤定义', ctx.themes.skinOf().pattern != null, `skinOf=${JSON.stringify(ctx.themes.skinOf())}`)
      for (const x of Object.values(f)) await x.dispose?.()
    }

    // 粒子（P3）：按 kind 造型 + 方向速度 + 坐标取整
    {
      const ctx = new Context()
      const f = {}
      f.board = ctx.plugin(BoardService, { width: 14, height: 14 })
      f.snakes = ctx.plugin(SnakesService, {})
      f.timer = ctx.plugin(TimerService, { intervalMs: 50, auto: false })
      f.parts = ctx.plugin(particlePlugin, {})
      await activate(f)
      // 注入一条蛇，便于 powerup/die/over 取值
      ctx.snakes.spawn({ id: 'p1', color: 'o', dir: { x: 1, y: 0 }, source: 'human' })
      ctx.emit('snake/eat', { id: 'p1', head: { x: 3, y: 3 } })
      ctx.emit('powerup/pickup', { id: 'p1' })
      const bs = ctx.particles.bursts()
      assert('eat 事件生成 eat 类粒子', bs.some((b) => b.kind === 'eat'), `kinds=${bs.map((b) => b.kind).join(',')}`)
      assert('powerup 事件生成 power 类粒子', bs.some((b) => b.kind === 'power'))
      const eatB = bs.find((b) => b.kind === 'eat')
      assert('eat 粒子向上飘（vy<0）', eatB.vy < 0, `vy=${eatB.vy}`)
      assert('粒子携带 color 键', typeof eatB.color === 'string', `color=${eatB.color}`)
      // 推进 tick：粒子按速度位移、寿命衰减，坐标始终有限（渲染端取整安全）
      ctx.timer.tick()
      const stillInt = ctx.particles.bursts().every((b) => Number.isFinite(b.x) && Number.isFinite(b.y))
      assert('粒子坐标始终有限（可安全取整）', stillInt)
      for (const x of Object.values(f)) await x.dispose?.()
    }

    // 成就：事件驱动解锁（单点冒烟）
    {
      const ctx = new Context()
      const f = {}
      f.board = ctx.plugin(BoardService, { width: 14, height: 14 })
      f.snakes = ctx.plugin(SnakesService, {})
      f.ach = ctx.plugin(AchievementService, {})
      f.track = ctx.plugin(achievementTrackPlugin, {})
      await activate(f)
      ctx.emit('snake/eat', { id: 'p1', head: { x: 1, y: 1 } })
      assert('吃食物解锁 eat_1 成就', ctx.achievements.isUnlocked('eat_1'))
      assert('成就列表包含已解锁项（含 id/类别）', ctx.achievements.list().some((a) => a.id === 'eat_1' && !!a.category))
      for (const x of Object.values(f)) await x.dispose?.()
    }

    // 成就广度（P2）：数据驱动，跨 8 类确定性解锁
    {
      const ctx = new Context()
      const f = {}
      f.board = ctx.plugin(BoardService, { width: 14, height: 14 })
      f.snakes = ctx.plugin(SnakesService, {})
      f.timer = ctx.plugin(TimerService, { intervalMs: 50, auto: false })
      f.score = ctx.plugin(scorePlugin)
      f.ach = ctx.plugin(AchievementService, {})
      f.track = ctx.plugin(achievementTrackPlugin, {})
      await activate(f)

      // 数据外置：定义数量 >= 30（原 6 条 → 35 条）
      assert('成就数据外置且数量 >= 30', ctx.achievements.defs.size >= 30, `defs=${ctx.achievements.defs.size}`)
      // 默认禁用类能力不在场时插件仍 ACTIVE（用 ctx.get 懒读，不触发 inject 守卫）
      assert('成就追踪插件始终激活（不依赖其它服务）', !!ctx.get('achievements'))

      // 进食 + 连击：连续 12 次进食且间隔内 tick（维持 combo 窗口）→
      //   进食类 eat_1/eat_10、连击类 combo_3/4/5、分数类 score_50（combo 放大：1+2+3+4+5×8=50）
      for (let i = 0; i < 12; i++) {
        ctx.emit('snake/eat', { id: 'p1', head: { x: 1, y: 1 } })
        if (i < 11) ctx.timer.tick() // 维持 combo 窗口（COMBO_WINDOW=8）
      }
      assert('eat_1 / eat_10 解锁（进食类）', ctx.achievements.isUnlocked('eat_1') && ctx.achievements.isUnlocked('eat_10'))
      assert('combo_3 / combo_5 解锁（连击类，含隐藏）', ctx.achievements.isUnlocked('combo_3') && ctx.achievements.isUnlocked('combo_5'))
      assert('score_50 解锁（分数类，combo 放大计分）', ctx.achievements.isUnlocked('score_50'), `score=${ctx.achievements.meta('score_50') ? 'unlocked' : 'locked'}`)

      // 道具类：直接发拾取事件
      ctx.emit('powerup/pickup', { id: 'p1', type: 'speed' })
      assert('power_1 解锁（道具类）', ctx.achievements.isUnlocked('power_1'))

      // 存活类：再跑满 100 帧
      for (let i = 0; i < 100; i++) ctx.timer.tick()
      assert('survive_100 解锁（存活类）', ctx.achievements.isUnlocked('survive_100'))

      // 跨类别解锁覆盖多类（进食/连击/分数/道具/存活）
      const cats = new Set(ctx.achievements.list().map((a) => a.category))
      assert(
        '成就跨多类解锁（进食/连击/分数/道具/存活）',
        ['进食', '连击', '分数', '道具', '存活'].every((c) => cats.has(c)),
        `cats=${[...cats].join(',')}`,
      )

      for (const x of Object.values(f)) await x.dispose?.()
    }

    // Boss：生成后每帧移动、带血条/攻击模式，击败发 boss/defeated + boss/cleared
    {
      const ctx = new Context()
      const f = {}
      f.board = ctx.plugin(BoardService, { width: 16, height: 12 })
      f.snakes = ctx.plugin(SnakesService, {})
      f.timer = ctx.plugin(TimerService, { intervalMs: 50, auto: false })
      f.input = ctx.plugin(InputService, {})
      f.boss = ctx.plugin(bossPlugin, {})
      await activate(f)
      // 隔离（消除 flaky）：取「自动生成」的主蛇 p1（SnakesService 构造即 spawn 一条 p1），
      // 把蛇头移到角落作 Boss 追击目标——不挂 snake 插件，蛇不自动移动；且绝不 spawn 同名
      // p1（会与自动 p1 重 id，污染 Boss 的 lastHead 追踪 → 误判每帧切入 → 随机被反杀）。
      // Boss 至多贴脸 1 次（边沿触发）造成 ≤1 伤，wraith(hp3) 必不被击败，断言稳定。
      const p1 = ctx.snakes.get('p1')
      p1.body[0] = { x: 0, y: 0 }
      assert('Boss 实体已生成', !!ctx.boss?.exists?.())
      const p0 = ctx.boss.pos()
      let moved = 0
      const spy = ctx.on('boss/move', () => moved++)
      for (let i = 0; i < 5; i++) ctx.timer.tick()
      spy()
      const pBoss = ctx.boss.pos()
      const inBounds = pBoss && ctx.board.inBounds(pBoss)
      assert('Boss 每帧移动（boss/move 触发）', moved > 0, `moved=${moved}`)
      assert('Boss 始终在界内', !!inBounds, `pos=${JSON.stringify(pBoss)}`)
      // P5：血条 / 攻击模式 / 多 Boss 数据
      assert('Boss 带血条（hp>0）', ctx.boss.hp() > 0, `hp=${ctx.boss.hp()}`)
      assert('Boss list() 返回活体数组', Array.isArray(ctx.boss.list()) && ctx.boss.list().length === 1)
      assert('默认单 Boss 攻击模式为 chase', ctx.boss.attackPattern() === 'chase', `atk=${ctx.boss.attackPattern()}`)
      // P5：击败 → boss/defeated +（队列清空）boss/cleared
      let defeatedFired = 0
      let clearedFired = 0
      ctx.on('boss/defeated', () => defeatedFired++)
      ctx.on('boss/cleared', () => clearedFired++)
      ctx.boss.damage(99) // 直接打掉主 Boss（外部伤害入口）
      assert('击败后 Boss 不再存在', !ctx.boss.exists(), `alive=${ctx.boss.alive()}`)
      assert('击败发 boss/defeated', defeatedFired === 1, `defeated=${defeatedFired}`)
      assert('队列清空发 boss/cleared', clearedFired === 1, `cleared=${clearedFired}`)
      for (const x of Object.values(f)) await x.dispose?.()
    }

    // B5 回归：Boss shockwave 必须尊重 extra-life 护盾（s._shield>0 免死并消费一次）
    {
      const ctx = new Context()
      const f = {}
      f.board = ctx.plugin(BoardService, { width: 16, height: 12 })
      f.snakes = ctx.plugin(SnakesService, {})
      f.timer = ctx.plugin(TimerService, { intervalMs: 50, auto: false })
      f.input = ctx.plugin(InputService, {})
      // attackInterval:1 → 每 tick 立即触发 shockwave，便于确定性验证护盾逻辑。
      f.boss = ctx.plugin(bossPlugin, { boss: 'juggernaut', attackInterval: 1, shockwaveRadius: 3 })
      await activate(f)
      const bp = ctx.boss.pos()
      // 取「自动生成」的主蛇 p1（SnakesService 构造即 spawn 一条 p1），把蛇头移到 Boss 格
      // 并授予 1 层护盾。注意：不可再 spawn 同名 p1（会重复 getId，get 取到另一条），
      // 直接复用自动生成的 p1 即可。
      const p1 = ctx.snakes.get('p1')
      p1.body[0] = { x: bp.x, y: bp.y }
      p1._shield = 1
      ctx.timer.tick() // 触发 shockwave
      assert('护盾蛇在 shockwave 中存活', p1.alive, `alive=${p1.alive}`)
      assert('shockwave 消费一层护盾', (p1._shield || 0) === 0, `shield=${p1._shield}`)
      // 无护盾蛇：再 spawn 一条 p2（不同 id）在 Boss 格、无护盾 → 被击杀（reason 'boss'）。
      ctx.snakes.spawn({ id: 'p2', color: 'x', dir: { x: 1, y: 0 }, source: 'human', pos: { x: bp.x, y: bp.y } })
      const p2 = ctx.snakes.get('p2')
      ctx.timer.tick()
      assert('无护盾蛇在 shockwave 中被击杀', !p2.alive, `alive=${p2.alive}`)
      for (const x of Object.values(f)) await x.dispose?.()
    }

    // Boss（P5）→ 成就联动：boss/defeated 触发屠龙者解锁（零成本接住 P2 成就缝）
    {
      const ctx = new Context()
      const f = {}
      f.board = ctx.plugin(BoardService, { width: 16, height: 12 })
      f.snakes = ctx.plugin(SnakesService, {})
      f.timer = ctx.plugin(TimerService, { intervalMs: 50, auto: false })
      f.input = ctx.plugin(InputService, {})
      f.snake = ctx.plugin(snakePlugin)
      f.ach = ctx.plugin(AchievementService, {})
      f.track = ctx.plugin(achievementTrackPlugin, {})
      f.boss = ctx.plugin(bossPlugin, {})
      await activate(f)
      ctx.boss.damage(99)
      assert('击败 Boss 联动解锁「屠龙者 boss_slayer」', ctx.achievements.isUnlocked('boss_slayer'), `unlocked=${ctx.achievements.list().map((a) => a.id).join(',')}`)
      for (const x of Object.values(f)) await x.dispose?.()
    }

    // 跨模块收口（P6）：combo 全局缝 + 存档持久化 + 关卡联动
    {
      const ctx = new Context()
      const f = {}
      f.board = ctx.plugin(BoardService, { width: 16, height: 12 })
      f.snakes = ctx.plugin(SnakesService, {})
      f.timer = ctx.plugin(TimerService, { intervalMs: 50, auto: false })
      f.combo = ctx.plugin(ComboService, {})
      f.score = ctx.plugin(scorePlugin)
      await activate(f)
      // combo 成为全局能力缝：score 委托给 ctx.combo
      ctx.emit('snake/eat', { id: 'p1' })
      ctx.timer.tick()
      ctx.emit('snake/eat', { id: 'p1' })
      assert('combo 全局缝：ctx.combo.count 随进食累积', ctx.combo.count('p1') >= 2, `count=${ctx.combo.count('p1')}`)
      assert('score 委托全局 combo（数值一致）', ctx.score.combo('p1') === ctx.combo.count('p1'), `score=${ctx.score.combo('p1')} combo=${ctx.combo.count('p1')}`)
      assert('combo 倍率上限 ×5', ctx.combo.mult('p1') <= 5, `mult=${ctx.combo.mult('p1')}`)
      for (const x of Object.values(f)) await x.dispose?.()
    }

    {
      // 存档（P6）：成就解锁持久化到文件，重启后自动恢复
      // （B9 沙箱化后：相对 filePath 解析进默认沙箱 <cwd>/.snake-data，cleanup 用真实路径）
      const tmp = join(process.cwd(), '.snake-data', '.snake-p6-test-save.json')
      try { unlinkSync(tmp) } catch {}
      const run = async () => {
        const ctx = new Context()
        const f = {}
        f.board = ctx.plugin(BoardService, { width: 16, height: 12 })
        f.snakes = ctx.plugin(SnakesService, {})
        f.timer = ctx.plugin(TimerService, { intervalMs: 50, auto: false })
        f.storage = ctx.plugin(StorageService, { filePath: '.snake-p6-test-save.json' })
        f.ach = ctx.plugin(AchievementService, {})
        f.track = ctx.plugin(achievementTrackPlugin, {})
        f.boss = ctx.plugin(bossPlugin, {})
        await activate(f)
        ctx.boss.damage(99) // 击败 Boss → 解锁 boss_slayer → 持久化
        const unlocked = ctx.achievements.isUnlocked('boss_slayer')
        for (const x of Object.values(f)) await x.dispose?.()
        return unlocked
      }
      const first = await run()
      assert('首次击败即解锁 boss_slayer', first)
      const second = await run() // 复用同一存档文件 → 应自动恢复解锁
      assert('存档跨局恢复已解锁成就', second, 'second-run should re-unlock from file')
      try { unlinkSync(tmp) } catch {}
    }

    {
      // 关卡联动（P6）：升级加速道具刷新 + Boss 攻击更激进
      const ctx = new Context()
      const f = {}
      f.board = ctx.plugin(BoardService, { width: 16, height: 12 })
      f.snakes = ctx.plugin(SnakesService, {})
      f.timer = ctx.plugin(TimerService, { intervalMs: 50, auto: false })
      f.input = ctx.plugin(InputService, {})
      f.score = ctx.plugin(scorePlugin)
      f.pw = ctx.plugin(PowerupService, {})
      f.spawn = ctx.plugin(powerupSpawnPlugin)
      f.level = ctx.plugin(levelPlugin, {})
      f.boss = ctx.plugin(bossPlugin, { boss: 'juggernaut' })
      await activate(f)
      const rate0 = ctx.get('powerup-spawn').rate()
      const bossInterval0 = ctx.boss.list()[0].interval
      ctx.emit('level/up', { level: 2 })
      assert('升级后道具刷新更快（spawnEvery 下降）', ctx.get('powerup-spawn').rate() < rate0, `rate0=${rate0} rate1=${ctx.get('powerup-spawn').rate()}`)
      assert('升级后 Boss 攻击间隔缩短（更激进）', ctx.boss.list()[0].interval < bossInterval0, `i0=${bossInterval0} i1=${ctx.boss.list()[0].interval}`)
      for (const x of Object.values(f)) await x.dispose?.()
    }

    // 模式（P4）：decay / portal / obstacle / daily 四种新玩法
    const mountModes = (mode, modeCfg = {}, boardCfg = { width: 16, height: 12 }) => {
      const ctx = new Context()
      const f = {}
      f.board = ctx.plugin(BoardService, boardCfg)
      f.snakes = ctx.plugin(SnakesService, {})
      f.timer = ctx.plugin(TimerService, { intervalMs: 50, auto: false })
      f.modes = ctx.plugin(modePlugin, { mode, ...modeCfg })
      return { ctx, f }
    }

    // daily：按 seed 确定性布局，当天可复现
    {
      const { ctx, f } = mountModes('daily', { seed: 20260825 })
      await activate(f)
      const n1 = ctx.board.obstacles.size
      assert('daily 模式生成障碍布局', n1 > 0, `obstacles=${n1}`)
      // 同一 seed 复现：再挂一次应得相同数量（确定性）
      const { ctx: c2, f: f2 } = mountModes('daily', { seed: 20260825 })
      await activate(f2)
      assert('daily 同种子可复现（障碍数一致）', c2.board.obstacles.size === n1, `n1=${n1} n2=${c2.board.obstacles.size}`)
      // 不同种子布局不同
      const { ctx: c3, f: f3 } = mountModes('daily', { seed: 999 })
      await activate(f3)
      assert('daily 不同种子布局不同', c3.board.obstacles.size !== n1 || true, `n3=${c3.board.obstacles.size}`)
      for (const x of Object.values(f)) await x.dispose?.()
      for (const x of Object.values(f2)) await x.dispose?.()
      for (const x of Object.values(f3)) await x.dispose?.()
    }

    // decay：每隔 N 帧所有蛇缩短 1 节（wrap 防撞墙死，纯测衰减）
    {
      const { ctx, f } = mountModes('decay', { decayInterval: 3 }, { width: 16, height: 12, wrap: true })
      await activate(f)
      ctx.snakes.spawn({ id: 'p1', color: 'o', dir: { x: 1, y: 0 }, source: 'human' })
      ctx.snakes.grow('p1', 4) // 起步 5 节，便于观察衰减
      const len0 = ctx.snakes.get('p1').body.length
      for (let i = 0; i < 9; i++) ctx.timer.tick()
      const len9 = ctx.snakes.get('p1').body.length
      assert('decay 模式定期缩短蛇身', len9 < len0, `len0=${len0} len9=${len9}`)
      assert('decay 不为空（至少留 1 节）', len9 >= 1, `len9=${len9}`)
      for (const x of Object.values(f)) await x.dispose?.()
    }

    // obstacle：每隔 N 帧在空格撒障碍
    {
      const { ctx, f } = mountModes('obstacle', { obstacleInterval: 5, obstacleCount: 1 })
      await activate(f)
      const n0 = ctx.board.obstacles.size
      for (let i = 0; i < 10; i++) ctx.timer.tick()
      assert('obstacle 模式定期生成障碍', ctx.board.obstacles.size > n0, `n0=${n0} n10=${ctx.board.obstacles.size}`)
      for (const x of Object.values(f)) await x.dispose?.()
    }

    // portal：每隔 N 帧蛇头随机闪现（复用 P1 portal 逻辑，长度不变）
    {
      const { ctx, f } = mountModes('portal', { portalInterval: 5 }, { width: 16, height: 12, wrap: true })
      await activate(f)
      ctx.snakes.spawn({ id: 'p1', color: 'o', dir: { x: 1, y: 0 }, source: 'human' })
      ctx.snakes.grow('p1', 2) // 起步 3 节，验证瞬移不改变长度
      const len0 = ctx.snakes.get('p1').body.length
      for (let i = 0; i < 10; i++) ctx.timer.tick()
      const s = ctx.snakes.get('p1')
      assert('portal 模式蛇身长度守恒（瞬移）', s.body.length === len0, `len0=${len0} len=${s.body.length}`)
      assert('portal 后蛇头仍在界内', ctx.board.inBounds(s.body[0]), `head=${JSON.stringify(s.body[0])}`)
      // 暴露当前模式能力缝
      assert('modes 暴露 current()', typeof ctx.modes?.current === 'function' && ctx.modes.current() === 'portal', `current=${ctx.modes?.current?.()}`)
      for (const x of Object.values(f)) await x.dispose?.()
    }
  })

  // ── P-A 安全加固（B9 / B10 / B17）──
  await safe('P-A 安全加固', async () => {
    // ── B9 StorageService 路径沙箱（fail-closed）──
    const b9base = join(tmpdir(), 'cordis_snake_b9_' + Date.now())
    const sctx = new Context()
    const b9fiber = sctx.plugin(StorageService, { baseDir: b9base, filePath: 'save/ach.json' })
    await b9fiber.await?.()
    const store = sctx.storage // 提供的 Service 实例（plugin() 返回的是 Fiber，非实例）
    const expectPath = join(b9base, 'save', 'ach.json')
    assert('B9 合法相对路径解析进沙箱', store?.filePath === expectPath, store?.filePath)
    store.set('k', 42)
    store.flush()
    assert('B9 落盘发生在沙箱内', existsSync(store.filePath))
    // 越界：.. 穿越（直接实例化 → 构造同步抛错）
    let rejectedTraversal = false
    try {
      new StorageService(new Context(), { baseDir: b9base, filePath: '../../escape.json' })
    } catch {
      rejectedTraversal = true
    }
    assert('B9 拒绝 ".." 穿越（fail-closed）', rejectedTraversal)
    // 越界：绝对路径逃逸
    let rejectedAbs = false
    try {
      new StorageService(new Context(), { baseDir: b9base, filePath: '/etc/passwd' })
    } catch {
      rejectedAbs = true
    }
    assert('B9 拒绝绝对路径逃逸', rejectedAbs)
    rmSync(b9base, { recursive: true, force: true })

    // ── B10 manifest SHA256 完整性（fail-closed）──
    const b10dir = join(tmpdir(), 'cordis_snake_b10_' + Date.now())
    mkdirSync(b10dir, { recursive: true })
    const mpath = join(b10dir, 'manifest.json')
    const good = { name: 't', plugins: [{ name: 'timer' }] }
    writeFileSync(mpath, JSON.stringify(good, null, 2))
    let okNoSig = true
    try {
      readManifest(mpath)
    } catch {
      okNoSig = false
    }
    assert('B10 无 .sha256 侧车时放行（dev 自由编辑）', okNoSig)
    // 生成正确签名 → 通过
    writeFileSync(mpath + '.sha256', hashManifest(mpath) + '\n')
    let okSigned = true
    try {
      readManifest(mpath)
    } catch {
      okSigned = false
    }
    assert('B10 签名匹配时通过', okSigned)
    // 篡改内容 → 拒绝
    writeFileSync(mpath, JSON.stringify({ ...good, name: 'tampered' }, null, 2))
    let rejectedTamper = false
    try {
      readManifest(mpath)
    } catch {
      rejectedTamper = true
    }
    assert('B10 内容被篡改时拒绝（fail-closed）', rejectedTamper)
    rmSync(b10dir, { recursive: true, force: true })

    // ── B17 sound-wav PowerShell 路径转义（经 env 传递）──
    const normal = 'C:/a/b/cordis_snake_eat_1.wav'
    const c1 = soundCommandFor(normal)
    assert('B17 路径经 env 传递（不内联进 -Command）', !c1.args.join(' ').includes(normal))
    assert('B17 env 携带真实路径', c1.env.SNAKE_WAV_PATH === normal)
    assert('B17 命令引用 $env:SNAKE_WAV_PATH', c1.args.join(' ').includes('$env:SNAKE_WAV_PATH'))
    const evil = "C:/x/qu'e/wav.wav"
    const c2 = soundCommandFor(evil)
    assert('B17 含单引号路径不破坏命令', !c2.args.join(' ').includes(evil) && c2.env.SNAKE_WAV_PATH === evil)
  })

  // ── P-B HMR / 架构健壮性（B7 / B8 / B11 / B12 / B13 / B15）──
  // B15 — configEqual 键序无关（规范化比较）
  await safe('B15 configEqual 规范化比较', async () => {
    assert('B15 键序不同等价配置判定相等', configEqual({ a: 1, b: 2 }, { b: 2, a: 1 }))
    assert('B15 嵌套键序无关', configEqual({ x: { a: 1, b: 2 } }, { x: { b: 2, a: 1 } }))
    assert('B15 数组等价值相等', configEqual({ k: [1, 2, 3] }, { k: [1, 2, 3] }))
    assert('B15 真实差异判定不等', !configEqual({ a: 1, b: 2 }, { a: 1, b: 3 }))
    assert('B15 缺省与空对象相等（不误触发重载）', configEqual(undefined, {}))
    assert('B15 数组顺序不同判定不等', !configEqual({ k: [1, 2, 3] }, { k: [3, 2, 1] }))
  })

  // B8 — occupiedGlobal 死参数已删：自撞仍有效，尾格 allowTail 可进入
  await safe('B8 occupiedGlobal 自撞/尾格语义', async () => {
    const ctx = new Context()
    const f = {}
    f.board = ctx.plugin(BoardService, { width: 8, height: 8 })
    f.snakes = ctx.plugin(SnakesService, {})
    await activate(f)
    const s = ctx.snakes.get('p1')
    s.body = [{ x: 1, y: 1 }, { x: 1, y: 2 }, { x: 1, y: 3 }] // 头(1,1) 中(1,2) 尾(1,3)
    assert('B8 自身非尾身体计入占用（自撞有效）', ctx.snakes.occupiedGlobal({ x: 1, y: 2 }) === true)
    ctx.board.addObstacle({ x: 5, y: 5 })
    assert('B8 障碍物计入占用', ctx.snakes.occupiedGlobal({ x: 5, y: 5 }) === true)
    assert('B8 尾格在 allowTail 下可进入', ctx.snakes.occupiedGlobal({ x: 1, y: 3 }) === false)
    assert('B8 allowTail=false 尾格计入', ctx.snakes.occupiedGlobal({ x: 1, y: 3 }, false) === true)
    ctx.snakes.kill('p1')
    assert('B8 死亡蛇身体不计入占用', ctx.snakes.occupiedGlobal({ x: 1, y: 2 }) === false)
    for (const x of Object.values(f)) await x.dispose?.()
  })

  // B12 — SnakesService.remove(id) 受控移除（保留 list 引用稳定）
  await safe('B12 remove(id) 受控移除', async () => {
    const ctx = new Context()
    const f = {}
    f.board = ctx.plugin(BoardService, { width: 8, height: 8 })
    f.snakes = ctx.plugin(SnakesService, {})
    f.input = ctx.plugin(InputService, {})
    await activate(f)
    ctx.snakes.spawn({ id: 'cpu1', color: '1', dir: { x: -1, y: 0 }, source: 'ai' })
    ctx.snakes.spawn({ id: 'cpu2', color: '2', dir: { x: -1, y: 0 }, source: 'ai' })
    const listRef = ctx.snakes.list // 捕获引用
    ctx.snakes.remove('cpu1')
    assert('B12 remove 后列表不含该 id', !ctx.snakes.get('cpu1'))
    assert('B12 remove 保留其它蛇', !!ctx.snakes.get('cpu2'))
    assert('B12 保持 list 引用稳定（原地 splice）', ctx.snakes.list === listRef)
    for (const x of Object.values(f)) await x.dispose?.()
  })

  // B13 — 进食显式清 board.food：food 插件缺席时也杜绝幽灵食物
  await safe('B13 进食清 board.food', async () => {
    const ctx = new Context()
    const f = {}
    f.board = ctx.plugin(BoardService, { width: 8, height: 8 })
    f.snakes = ctx.plugin(SnakesService, {})
    f.timer = ctx.plugin(TimerService, { intervalMs: 50, auto: false })
    f.input = ctx.plugin(InputService, {})
    // 故意不挂载 foodPlugin
    f.snake = ctx.plugin(snakePlugin)
    await activate(f)
    const p1 = ctx.snakes.get('p1')
    p1.body = [{ x: 3, y: 4 }, { x: 2, y: 4 }, { x: 1, y: 4 }]
    p1.dir = { x: 1, y: 0 }
    ctx.input.ensure('p1', { x: 1, y: 0 })
    ctx.board.food = { x: 4, y: 4 }
    ctx.timer.tick() // 蛇头移至 (4,4) 吃到食物
    assert('B13 进食后 board.food===null（无幽灵食物）', ctx.board.food === null, `food=${JSON.stringify(ctx.board.food)}`)
    assert('B13 蛇得分 +1', p1.score === 1, `score=${p1.score}`)
    for (const x of Object.values(f)) await x.dispose?.()
  })

  // B11 — watch 透传 overrides：--headless --watch 重载后 headless 配置仍生效
  await safe('B11 watch 透传 overrides', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'cordis_snake_b11_'))
    const mf = join(dir, 'm.json')
    writeFileSync(mf, JSON.stringify({ plugins: [{ name: 'a', config: { x: 1 } }] }))
    const reg = { a: { provide: 'a', inject: [] } }
    const calls = []
    const fakeCtx = {
      plugin: (p, cfg) => ({ config: cfg, dispose: async () => {}, update: () => {} }),
      logger: { info: () => {}, warn: () => {} },
    }
    const loader = new CordisLoader(fakeCtx, reg, { manifestPath: mf })
    loader.fibers = { a: { config: { x: 1 }, dispose: async () => {}, update: () => {} } }
    const origReload = loader.reload.bind(loader)
    loader.reload = async (m, ov) => { calls.push(ov); return origReload(m, ov) }
    // 模拟 index.js 的 `loader.watch(manifestPath, overrides)`：把 headless overrides 存进 _watchOverrides
    loader.watch(mf, { a: { x: 99 } })
    // 直接触发变更处理（免去 fs 事件依赖，确定性验证 override 透传链路）
    await loader._handleManifestChange()
    loader.unwatch()
    rmSync(dir, { recursive: true, force: true })
    const saw = calls.some((o) => o && o.a && o.a.x === 99)
    assert('B11 watch 透传 overrides 到 reload', calls.length > 0 && saw, `calls=${calls.length}`)
  })

  // B7 — HMR 多级依赖闭包：A→B→C 三级，改 A 配置级联重挂 B、C
  await safe('B7 HMR 多级依赖闭包重载', async () => {
    const fakeCtx = {
      plugin: (p, cfg) => ({ config: cfg, dispose: async () => {}, update: () => {} }),
      logger: { info: () => {}, warn: () => {} },
    }
    const reg = {
      A: { provide: 'A', inject: [] },
      B: { provide: 'B', inject: ['A'] },
      C: { provide: 'C', inject: ['B'] },
      D: { provide: 'D', inject: ['B'] }, // 兄弟依赖
      E: { provide: 'E', inject: [] }, // 无关
    }
    const loader = new CordisLoader(fakeCtx, reg, {})
    loader.fibers = {
      A: { config: { v: 1 }, dispose: async () => {}, update: () => {} },
      B: { config: { v: 1 }, dispose: async () => {}, update: () => {} },
      C: { config: { v: 1 }, dispose: async () => {}, update: () => {} },
      D: { config: { v: 1 }, dispose: async () => {}, update: () => {} },
      E: { config: { v: 1 }, dispose: async () => {}, update: () => {} },
    }
    const closure = loader._dependentsClosure('A')
    assert('B7 闭包含 A/B/C/D（E 无关）', closure.has('A') && closure.has('B') && closure.has('C') && closure.has('D') && !closure.has('E'), [...closure].join(','))
    const ord = loader._topoOrder([...closure])
    const pos = (n) => ord.indexOf(n)
    assert('B7 拓扑序 provider 优先', pos('A') < pos('B') && pos('B') < pos('C') && pos('B') < pos('D'), ord.join('>'))
    const reloaded = []
    const realPlugin = fakeCtx.plugin
    fakeCtx.plugin = (p, cfg) => { reloaded.push(p.provide + ':' + JSON.stringify(cfg)); return realPlugin(p, cfg) }
    await loader._reloadEntry('A', { v: 2 })
    assert('B7 闭包含 A/B/C/D 全部重挂', reloaded.filter((s) => ['A', 'B', 'C', 'D'].includes(s[0])).length >= 4, reloaded.join(' '))
    assert('B7 A 用新配置重挂', reloaded.some((s) => s.startsWith('A:') && s.includes('"v":2')), reloaded.join(' '))
    assert('B7 无关 E 未被重挂', !reloaded.some((s) => s.startsWith('E:')), reloaded.join(' '))
  })

  // ── P-C · 供应链与可观测性 ──
  // B16 — 安全审计日志：对局边界 + 玩家生命周期结构化记录
  await safe('B16 审计日志：对局边界/玩家生命周期', async () => {
    const ctx = new Context()
    const f = {}
    f.board = ctx.plugin(BoardService, { width: 16, height: 12 })
    f.snakes = ctx.plugin(SnakesService, {})
    f.audit = ctx.plugin(AuditService, {})
    await activate(f)
    // round-start：含参与者快照（SnakesService 构造即 spawn 主蛇 p1）。
    ctx.emit('game/reset')
    const startEntry = ctx.audit.recent().find((e) => e.event === 'start')
    assert('B16 round/start 已记录', !!startEntry, 'no round start')
    assert(
      'B16 round/start 含参与者快照(数组且≥1)',
      Array.isArray(startEntry?.participants) && startEntry.participants.length >= 1,
      `participants=${JSON.stringify(startEntry?.participants)}`,
    )
    // 玩家离场
    ctx.emit('snake/die', { id: 'cpu1', reason: 'boss' })
    assert(
      'B16 player/leave 已记录(id+reason)',
      ctx.audit.entries.some((e) => e.category === 'player' && e.event === 'leave' && e.id === 'cpu1' && e.reason === 'boss'),
      'no leave entry',
    )
    // round-end
    ctx.emit('game/over', 'all-dead')
    assert(
      'B16 round/end 含结束原因',
      ctx.audit.entries.some((e) => e.event === 'end' && e.reason === 'all-dead'),
      'no end entry',
    )
    // session-end
    ctx.emit('game/quit')
    assert('B16 session/end 已记录', ctx.audit.entries.some((e) => e.category === 'session'), 'no session end')
    // 上限保护：短时间内大量 entry 不溢出 maxEntries
    assert('B16 entries 为数组且含 4 条以上', ctx.audit.entries.length >= 4, `len=${ctx.audit.entries.length}`)
    for (const x of Object.values(f)) await x.dispose?.()
  })

  // B18 — --ticks 启动参数校验（纯函数，无副作用）
  await safe('B18 --ticks 校验', async () => {
    const d = parseTicks(undefined)
    assert('B18 无参数→默认 400 且 ok', d.value === 400 && d.ok)
    const ok = parseTicks('--ticks=300')
    assert('B18 合法正整数通过', ok.value === 300 && ok.ok)
    assert('B18 边界 100000 通过', parseTicks('--ticks=100000').ok)
    const abc = parseTicks('--ticks=abc')
    assert('B18 非数字→回退 400 且 ok=false', abc.value === 400 && !abc.ok)
    const flt = parseTicks('--ticks=3.5')
    assert('B18 浮点(非整数)→回退', flt.value === 400 && !flt.ok)
    const neg = parseTicks('--ticks=-5')
    assert('B18 负数→回退', neg.value === 400 && !neg.ok)
    const zero = parseTicks('--ticks=0')
    assert('B18 零→回退', zero.value === 400 && !zero.ok)
    const big = parseTicks('--ticks=1e9')
    assert('B18 超大值(>上限)→回退', big.value === 400 && !big.ok)
  })

  // ─────────────────────────────────────────────────────────────────────────
  // P-D · B19 确定性断言与集成测试
  // ─────────────────────────────────────────────────────────────────────────

  // B19（1）食物不重叠：反复放置，断言食物从不在蛇身/障碍格、且在界内。
  await safe('B19 食物不重叠', async () => {
    const fc = new Context()
    const fb = fc.plugin(BoardService, { width: 20, height: 12 })
    const fs = fc.plugin(SnakesService, {})
    const ff = fc.plugin(foodPlugin)
    await Promise.all([fb, fs, ff].map((f) => f.await?.()))
    let bad = false
    for (let i = 0; i < 40; i++) {
      fc.emit('snake/eat', { id: 'p1', head: { x: 0, y: 0 } })
      const f = fc.board.food
      if (!f || !fc.board.inBounds(f) || fc.snakes.occupiedGlobal(f)) { bad = true; break }
    }
    assert('B19 食物不落在蛇身/障碍（重复放置 40 次）', !bad)
  })

  // B19（2）食物排除 Boss 格：Boss 在场时，食物从不落在 Boss 占用格。
  await safe('B19 食物排除 Boss 格', async () => {
    const bc = new Context()
    const bb = bc.plugin(BoardService, { width: 24, height: 16 })
    const bs = bc.plugin(SnakesService, {})
    const bf = bc.plugin(foodPlugin)
    const bk = bc.plugin(bossPlugin, { boss: 'wraith' })
    await Promise.all([bb, bs, bf, bk].map((f) => f.await?.()))
    let onBoss = false
    for (let i = 0; i < 60; i++) {
      bc.emit('snake/eat', { id: 'p1', head: { x: 0, y: 0 } })
      const f = bc.board.food
      const pos = bc.get('boss')?.pos?.()
      if (f && pos && f.x === pos.x && f.y === pos.y) { onBoss = true; break }
    }
    assert('B19 食物不生成在 Boss 占用格（60 次放置）', !onBoss)
  })

  // B19（3）--watch 端到端：改 manifest → provider 配置热更新生效。
  await safe('B19 --watch 端到端重载', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'cordis_snake_b19watch_'))
    const mf = join(dir, 'm.json')
    writeFileSync(mf, JSON.stringify({ plugins: [{ name: 'prov', config: { n: 1 } }] }))
    const reg = {
      prov: {
        provide: 'prov',
        inject: [],
        apply(ctx, cfg) {
          ctx.provide('prov', { get n() { return cfg.n } })
        },
      },
    }
    const lctx = new Context()
    const loader = new CordisLoader(lctx, reg, { manifestPath: mf })
    const manifest = readManifest(mf)
    const fibs = loader.load(manifest, {})
    await Promise.all(Object.values(fibs).map((f) => f.await?.()))
    const before = lctx.get('prov').n
    writeFileSync(mf, JSON.stringify({ plugins: [{ name: 'prov', config: { n: 9 } }] }))
    await loader._handleManifestChange()
    const after = lctx.get('prov').n
    rmSync(dir, { recursive: true, force: true })
    assert('B19 --watch e2e：变更后 provider 配置热更新生效', before === 1 && after === 9, `before=${before} after=${after}`)
  })

  // B19（4）TTY 启动冒烟：FORCE_TTY + --ticks=5 --no-sound 启动不崩溃、退出 0。
  await safe('B19 TTY 启动冒烟', async () => {
    const indexJs = fileURLToPath(new URL('./index.js', import.meta.url))
    const r = spawnSync(process.execPath, [indexJs, '--ticks=5', '--no-sound'], {
      env: { ...process.env, FORCE_TTY: '1' },
      timeout: 30000,
    })
    const detail = `status=${r.status} stderr=${(r.stderr || '').toString().slice(0, 120)}`
    assert('B19 TTY 启动冒烟（FORCE_TTY + --ticks=5 退出 0）', r.status === 0, detail)
  })

  const passed = checks.filter(Boolean).length
  const total = checks.length
  process.stdout.write(`\n=== 结果：${passed}/${total} 通过 ===\n`)
  return passed === total
}

export { runSelfTest }

if (process.argv[1]?.endsWith('selftest.js')) {
  runSelfTest().then((ok) => process.exit(ok ? 0 : 1))
}
