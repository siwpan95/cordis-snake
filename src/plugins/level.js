// plugins/level.js
// ───────────────────────────────────────────────────────────────────────────
// 关卡插件 —— 给游戏加上"进度"维度：每吃够 goal 个食物就升一级。
// 升级时：在世界里追加障碍物（静态墙）、加快心跳（提速）、把所有蛇重生到
// 随机空格并保留分数，最后广播 'level/up'（音效/渲染可响应）。
//
// 它只依赖 board / timer / snakes，并把"当前关卡"作为 ctx.level 服务暴露
// 出去——又是一次 capability seam：关卡规则本身也是可替换的插件。
// ───────────────────────────────────────────────────────────────────────────
export const levelPlugin = {
  name: 'level',
  inject: ['board', 'timer', 'snakes'],
  apply(ctx, config) {
    const cfg = { goal: 5, speedStep: 0.9, obstaclesPerLevel: 2, ...config }
    let current = 1
    let eatenThisLevel = 0

    const provide = ctx.provide('level', {
      get: () => current,
      goal: () => cfg.goal,
      reset: () => {
        current = 1
        eatenThisLevel = 0
      },
    })

    const offEat = ctx.on('snake/eat', () => {
      eatenThisLevel++
      if (eatenThisLevel >= cfg.goal) {
        eatenThisLevel = 0
        current++
        advance(ctx, current, cfg)
        ctx.emit('level/up', { level: current })
      }
    })

    // 满局重开：关卡计数归零（障碍物由 game 插件的 board.reset 清空）。
    const offReset = ctx.on('game/reset', () => {
      current = 1
      eatenThisLevel = 0
    })

    return () => {
      offEat()
      offReset()
      provide()
    }
  },
}

function advance(ctx, level, cfg) {
  // 1) 追加障碍物（避开所有蛇身，由 snakes 统一裁决）。
  for (let i = 0; i < cfg.obstaclesPerLevel; i++) {
    const c = ctx.snakes.randomFreeCell()
    if (c) ctx.board.addObstacle(c)
  }
  // 2) 提速：心跳间隔按比例缩短，下限 40ms。
  const newMs = Math.max(40, Math.round(ctx.timer.intervalMs * cfg.speedStep))
  ctx.timer.stop()
  ctx.timer.intervalMs = newMs
  ctx.timer.start()
  // 3) 所有蛇重生到随机空格（保留 id/颜色/分数），障碍不碰蛇。
  ctx.snakes.respawnAll()
  // 4) 重新放置食物。
  ctx.board.food = ctx.snakes.randomFreeCell()
  ctx.logger.info(`[关卡] 进入第 ${level} 关 · 提速至 ${newMs}ms · 新增 ${cfg.obstaclesPerLevel} 障碍`)
}
