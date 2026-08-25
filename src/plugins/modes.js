// plugins/modes.js
// ───────────────────────────────────────────────────────────────────────────
// 游戏模式插件（modes）—— 把"玩法"做成可插拔模式。
//
// 研调得到的模式，各自只是"在挂载时改写世界/蛇群/计时器的一些配置"，不写
// 任何新规则。board 的 wrap / initialLength、障碍、计时器都由它驱动；重开
// （game/reset）时复原对应模式，保证一局到底同一种玩法。
//
// P4 新增 4 种模式（共 10 种）：
//   · decay    衰减：每隔 decayInterval 帧，所有蛇缩短 1 节（逼玩家持续进食）。
//   · portal   传送：每隔 portalInterval 帧，把每条蛇头随机闪现到空格
//                   （复用 P1 portal 效果的瞬移逻辑，演示能力被模式复用）。
//   · obstacle 障碍：每隔 obstacleInterval 帧，在随机空格撒 obstacleCount 个障碍。
//   · daily    每日：按日期（或 config.seed）做确定性 seeded 布局，当天可复现。
// ───────────────────────────────────────────────────────────────────────────
export const modePlugin = {
  name: 'modes',
  inject: ['board', 'snakes', 'timer'],
  apply(ctx, config = {}) {
    const mode = config.mode || 'classic'
    const board = ctx.board
    const snakes = ctx.snakes
    const timer = ctx.timer
    let modeDisposers = [] // 当前模式挂的副作用（storm/timer 监听器）

    const applyMode = () => {
      // 重新应用模式前，先回收上一次（含 game/reset 触发的重应用）的副作用，
      // 否则每次重开会叠加多个 storm/timer 监听器（时间可组合的逆操作）。
      modeDisposers.forEach((d) => d())
      modeDisposers = []
      if (mode === 'survival') {
        board.initialLength = 6
        snakes.list.forEach((s) => snakes.grow(s.id, 5))
      } else if (mode === 'open') {
        board.wrap = true
      } else if (mode === 'maze') {
        generateMaze(board)
      } else if (mode === 'battle') {
        modeDisposers.push(startStorm(ctx, board, snakes))
      } else if (mode === 'timeattack') {
        modeDisposers.push(startTimeAttack(ctx, timer, config.seconds ?? 120))
      } else if (mode === 'decay') {
        modeDisposers.push(startDecay(ctx, snakes, config.decayInterval ?? 30))
      } else if (mode === 'portal') {
        modeDisposers.push(startPortal(ctx, snakes, config.portalInterval ?? 50))
      } else if (mode === 'obstacle') {
        modeDisposers.push(
          startObstacle(ctx, board, snakes, {
            interval: config.obstacleInterval ?? 40,
            count: config.obstacleCount ?? 1,
          }),
        )
      } else if (mode === 'daily') {
        generateDaily(board, snakes, config.seed ?? dailySeed())
      }
    }

    applyMode()
    const offReset = ctx.on('game/reset', applyMode)

    // 暴露当前模式（渲染器/其它插件可读），演示"模式也是能力缝"。
    const provide = ctx.provide('modes', { current: () => mode })

    return () => {
      offReset()
      modeDisposers.forEach((d) => d())
      provide()
    }
  },
}

/** 迷宫：在盘内按规律布障碍，留出中心安全区。 */
function generateMaze(board) {
  for (let y = 2; y < board.height - 2; y += 3) {
    for (let x = 2; x < board.width - 2; x += 3) {
      const cx = Math.floor(board.width / 2)
      const cy = Math.floor(board.height / 2)
      if (Math.abs(x - cx) < 3 && Math.abs(y - cy) < 3) continue
      board.addObstacle({ x, y })
    }
  }
}

/** 大逃杀毒圈：每隔一段 tick 向内收缩一圈并落障碍，圈外蛇被吞。 */
function startStorm(ctx, board, snakes) {
  let minX = 0
  let minY = 0
  let maxX = board.width - 1
  let maxY = board.height - 1
  let counter = 0
  const interval = 40
  const off = ctx.on('tick', () => {
    counter += 1
    if (counter < interval) return
    counter = 0
    if (maxX - minX < 4 || maxY - minY < 4) return
    for (let y = minY; y <= maxY; y++) {
      board.addObstacle({ x: minX, y })
      board.addObstacle({ x: maxX, y })
    }
    for (let x = minX; x <= maxX; x++) {
      board.addObstacle({ x, y: minY })
      board.addObstacle({ x, y: maxY })
    }
    minX += 1
    maxX -= 1
    minY += 1
    maxY -= 1
    for (const s of snakes.list.filter((s) => s.alive)) {
      const h = s.body[0]
      if (h.x <= minX || h.x >= maxX || h.y <= minY || h.y >= maxY) snakes.kill(s.id, 'storm')
    }
    ctx.emit('storm/shrink', { minX, minY, maxX, maxY })
    if (snakes.allDead()) ctx.emit('game/over', 'storm')
  })
  return off
}

/** 限时模式：按秒数换算成 tick 倒计时，归零即结束。 */
function startTimeAttack(ctx, timer, seconds) {
  const total = Math.max(1, Math.round((seconds * 1000) / (timer.intervalMs || 100)))
  let left = total
  const off = ctx.on('tick', () => {
    left -= 1
    ctx.emit('timeattack/tick', { left })
    if (left <= 0) {
      ctx.board.status = 'over'
      ctx.emit('game/over', 'time-up')
    }
  })
  return off
}

/** P4 decay：每隔 interval 帧把所有存活蛇缩短 1 节（至少留 1 节）。 */
function startDecay(ctx, snakes, interval) {
  let counter = 0
  const off = ctx.on('tick', () => {
    counter += 1
    if (counter < interval) return
    counter = 0
    for (const s of snakes.list.filter((s) => s.alive)) snakes.shrink(s.id, 1)
    ctx.emit('decay/shrink', { length: snakes.list[0]?.body.length ?? 0 })
  })
  return off
}

/** P4 portal：每隔 interval 帧把所有蛇头随机闪现到空格（复用 P1 portal 逻辑）。 */
function startPortal(ctx, snakes, interval) {
  let counter = 0
  const off = ctx.on('tick', () => {
    counter += 1
    if (counter < interval) return
    counter = 0
    for (const s of snakes.list.filter((s) => s.alive)) teleportHead(snakes, s.id)
    ctx.emit('portal/jump', { count: snakes.list.filter((s) => s.alive).length })
  })
  return off
}

/** 蛇头瞬移到随机空格（与 PowerupService 'portal' 效果同构，演示能力复用）。 */
function teleportHead(snakes, id) {
  const s = snakes.get(id)
  if (!s) return
  const cell = snakes.randomFreeCell()
  if (!cell) return
  s.body = [cell, ...s.body.slice(0, s.body.length - 1)] // 头瞬移，身体保持结构
}

/** P4 obstacle：每隔 interval 帧在随机空格撒 count 个障碍。 */
function startObstacle(ctx, board, snakes, { interval, count }) {
  let counter = 0
  const off = ctx.on('tick', () => {
    counter += 1
    if (counter < interval) return
    counter = 0
    let added = 0
    for (let i = 0; i < count; i++) {
      const c = snakes.randomFreeCell()
      if (!c) break
      board.addObstacle(c)
      added += 1
    }
    if (added > 0) ctx.emit('obstacle/spawn', { added })
  })
  return off
}

/** P4 daily：按 seed 确定性生成障碍布局（当天日期 → 可复现每日挑战）。 */
function generateDaily(board, snakes, seed) {
  const rng = mulberry32(seed)
  // 在盘内随机撒约 12% 的障碍，留中心 3×3 安全区。
  const total = Math.floor(board.width * board.height * 0.12)
  let placed = 0
  let guard = 0
  while (placed < total && guard < total * 20) {
    guard += 1
    const x = Math.floor(rng() * board.width)
    const y = Math.floor(rng() * board.height)
    const cx = Math.floor(board.width / 2)
    const cy = Math.floor(board.height / 2)
    if (Math.abs(x - cx) < 2 && Math.abs(y - cy) < 2) continue
    if (board.isObstacle({ x, y })) continue
    board.addObstacle({ x, y })
    placed += 1
  }
}

/** mulberry32：轻量确定性 PRNG（daily 模式可复现布局）。 */
function mulberry32(seed) {
  let a = seed >>> 0
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 每日种子：把本地日期 YYYYMMDD 压成 32 位整数。 */
function dailySeed() {
  const d = new Date()
  return (d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate()) >>> 0
}
