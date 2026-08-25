// index.js —— 应用入口（app 层）
// ───────────────────────────────────────────────────────────────────────────
// 这一层只做"数据/组合"而非"写死逻辑"：
//   1. 读 manifest.json（声明式地说"游戏由哪些插件组成"）；
//   2. 按运行环境（TTY / headless）与命令行开关选择插件——本质是改配置；
//   3. 用真实的 CordisLoader 装载；可选 --watch 监听 manifest 变更做 HMR；
//   4. 处理 AI 热插拔与退出（调用 Cordis 的 dispose，让框架自动回滚副作用）。
//
// 这里没有任何"游戏规则"代码。规则全在插件里。这就是
// "Everything is a Plugin / 没有特权核心"。
// ───────────────────────────────────────────────────────────────────────────
import { Context } from 'cordis'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { REGISTRY, CordisLoader } from './loader.js'
import { readManifest } from './manifest.js'
import { parseTicks, TICKS_DEFAULT, TICKS_MAX } from './util/parse-ticks.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const manifestPath = join(__dirname, '..', 'manifest.json')

// 带 SHA256 完整性校验的 manifest 读取（B10）；无 .sha256 侧车则放行（dev）。
function loadManifest() {
  return readManifest(manifestPath)
}

function setEnabled(manifest, name, enabled) {
  const entry = manifest.plugins.find((p) => p.name === name)
  if (entry) entry.enabled = enabled
}

async function main() {
  const args = process.argv.slice(2)

  if (args.includes('--selftest')) {
    const { runSelfTest } = await import('./selftest.js')
    process.exit((await runSelfTest()) ? 0 : 1)
  }

  const isTTY = !!process.stdin.isTTY || process.env.FORCE_TTY === '1'
  const headless = args.includes('--headless') || !isTTY
  const watchMode = args.includes('--watch')
  const multiplayer = args.includes('--multiplayer')
  const p2 = args.includes('--p2')

  // ── 研调扩展开关：把"是否启用某玩法"也做成配置差异（Everything is a Plugin）──
  const powerups = args.includes('--powerups')
  const boss = args.includes('--boss') || args.some((a) => a.startsWith('--boss='))
  const bossArg = args.find((a) => a.startsWith('--boss='))?.split('=')[1]
  const particles = args.includes('--particles')
  const achieve = args.includes('--achievements')
  const modeArg = args.find((a) => a.startsWith('--mode='))?.split('=')[1]
  const themeArg = args.find((a) => a.startsWith('--theme='))?.split('=')[1]
  const audit = args.includes('--audit')
  const noSound = args.includes('--no-sound')
  const noAudit = args.includes('--no-audit')

  const root = new Context()
  const manifest = loadManifest()

  // ── 仅配置差异：headless 用 AI 驱动、关音效（避免无头环境刷屏/起进程）──
  let inputProvider = 'input-keyboard'
  if (headless) {
    setEnabled(manifest, 'input-keyboard', false)
    setEnabled(manifest, 'input-ai', true)
    setEnabled(manifest, 'renderer-terminal', false)
    inputProvider = 'input-ai'
  }
  // 音效后端：headless 或显式 --no-sound 时关闭（避免无头环境起进程/刷屏）。
  if (headless || noSound) {
    setEnabled(manifest, 'sound-wav', false)
    setEnabled(manifest, 'sound-hooks', false)
  }
  // 多人：启用 AI 对手 + AI 驱动；本地双人再叠加 p2 键盘。
  if (multiplayer) {
    setEnabled(manifest, 'multiplayer', true)
    setEnabled(manifest, 'input-ai', true)
  }
  if (p2) {
    setEnabled(manifest, 'input-keyboard-p2', true)
    setEnabled(manifest, 'multiplayer', true)
    setEnabled(manifest, 'input-ai', true)
  }

  // 研调扩展：按开关点亮对应插件（默认关闭，框架可见但惰性）。
  if (powerups) {
    setEnabled(manifest, 'powerups', true)
    setEnabled(manifest, 'powerup-spawn', true)
  }
  if (achieve) {
    setEnabled(manifest, 'achievements', true)
    setEnabled(manifest, 'achievement-track', true)
  }
  if (boss) {
    setEnabled(manifest, 'boss', true)
    if (bossArg) {
      const m = manifest.plugins.find((p) => p.name === 'boss')
      if (m) m.config = { ...(m.config || {}), boss: bossArg }
    }
  }
  if (particles) setEnabled(manifest, 'particles', true)
  if (modeArg) {
    setEnabled(manifest, 'modes', true)
    const m = manifest.plugins.find((p) => p.name === 'modes')
    if (m) m.config = { ...(m.config || {}), mode: modeArg }
  }
  if (themeArg) {
    setEnabled(manifest, 'themes', true)
    setEnabled(manifest, 'theme-palettes', true)
    const t = manifest.plugins.find((p) => p.name === 'themes')
    if (t) t.config = { ...(t.config || {}), theme: themeArg }
  }
  if (audit) setEnabled(manifest, 'audit', true)
  if (noAudit) setEnabled(manifest, 'audit', false)

  const ticksArg = args.find((a) => a.startsWith('--ticks='))
  const tk = parseTicks(ticksArg)
  const runTicks = headless || !!ticksArg
  const overrides = {}
  if (runTicks) overrides.timer = { auto: false }
  const loader = new CordisLoader(root, REGISTRY, { manifestPath })
  const fibers = loader.load(manifest, overrides)

  // 插件是异步激活的（PENDING → ACTIVE），先等全部就绪再访问服务。
  await Promise.all(Object.values(fibers).map((f) => f.await?.()))

  // headless 下主蛇 p1 交给 AI 驱动：aiPlugin 按"蛇的 source 字段"拣选被驱蛇，
  // 因此必须改蛇对象 source，而非仅改 input 服务的 sources 标记。
  if (headless) {
    const p1 = root.snakes.get('p1')
    if (p1) p1.source = 'ai'
    root.input.ensure('p1')
  }

  // ── AI 热插拔：运行时卸载一个 input provider、挂载另一个 ──
  // 触发 snake 插件（inject input）反应式卸载→再激活，框架自动回收/重建
  // 其副作用（revertible effects + reactive coeffects）。
  let current = inputProvider
  root.on('plugin/toggle-ai', async () => {
    const other = current === 'input-keyboard' ? 'input-ai' : 'input-keyboard'
    root.logger.info(`[热插拔] 卸载 ${current}，挂载 ${other}`)
    // 先回收 other（multiplayer/p2 下 other 可能已随 manifest 挂载 → 不 dispose 即覆盖
    // 会产生孤儿 fiber + 双 tick 监听器，导致蛇被双 AI 驱动）。再回收 current。
    if (loader.fibers[other]) {
      await loader.fibers[other].dispose()
      delete loader.fibers[other]
    }
    if (loader.fibers[current]) {
      await loader.fibers[current].dispose()
      delete loader.fibers[current]
    }
    // 用 manifest 中的真实 config（而非 {}），避免丢失插件配置。
    const cfg = manifest.plugins.find((p) => p.name === other)?.config ?? {}
    loader.fibers[other] = root.plugin(REGISTRY[other], cfg)
    // 让主蛇 p1 的驱动方随切换变化：AI 插件只拣 source==='ai' 的蛇。
    const p1 = root.snakes.get('p1')
    if (p1) p1.source = other === 'input-ai' ? 'ai' : 'human'
    current = other
  })

  // ── 退出：干净卸载所有插件（所有 effect 逆序回滚）──
  let quitting = false
  const quit = async () => {
    if (quitting) return
    quitting = true
    loader.unwatch()
    root.logger.info('收到退出信号，正在卸载全部插件（副作用将自动回滚）…')
    for (const f of Object.values(loader.fibers)) {
      try {
        await f.dispose()
      } catch {
        /* 忽略单个卸载错误 */
      }
    }
    process.exit(0)
  }
  root.on('game/quit', quit)
  process.on('SIGINT', () => root.emit('meta/quit'))

  // ── --watch：监听 manifest 文件，保存即热重载（HMR）──
  if (watchMode) {
    loader.watch(manifestPath, overrides)
    root.logger.info('[HMR] 已开启 manifest 文件监听，修改并保存后自动热重载。')
  }

  if (runTicks) {
    // 演示：用 AI/手动驱动玩 N 帧后打印结果（N 可用 --ticks=400 指定；B18 校验）。
    // headless 或显式 --ticks（含 FORCE_TTY 启动冒烟）均走此有限帧循环。
    if (!tk.ok) {
      root.logger.warn(
        `[参数] --ticks=${tk.raw ?? ''} 非法（需为正整数且 ≤ ${TICKS_MAX}），回退默认 ${TICKS_DEFAULT}`,
      )
    }
    const N = tk.value
    for (let i = 0; i < N; i++) {
      if (root.board.status !== 'running') break
      root.timer.tick()
    }
    const score = root.get('score')?.get?.('p1') ?? 0
    const lb = root.get('score')?.leaderboard?.() ?? []
    root.logger.info(
      `[演示] 结束：状态=${root.board.status} 主蛇得分=${score} 蛇长=${root.snakes.get('p1')?.body.length ?? 0} 排行榜=${JSON.stringify(lb)}`,
    )
    await quit()
  }
  // TTY 模式（无 --ticks）：timer.auto=true 已在 manifest 中，游戏自行心跳，等待玩家操作。
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
