// plugins/powerups.js
// ───────────────────────────────────────────────────────────────────────────
// 道具刷新插件（powerup-spawn）—— 把"盘面道具"这件事自动化。
//
// inject powerups 服务：本插件自身是"可选驱动"，没有它时 PowerupService 仍在，
// 只是盘面上不刷道具（reactive coeffect）。它做三件事：
//   1) 每 tick 推进效果计时（powerups.tick）；
//   2) 每隔 spawnEvery 帧在随机空格刷一个随机类型道具；
//   3) 监听 snake/move，蛇头踩到道具格即拾取（pickup）。
// 一切副作用都挂在 ctx 上，卸载时自动回收。
// ───────────────────────────────────────────────────────────────────────────
export const powerupSpawnPlugin = {
  name: 'powerup-spawn',
  inject: ['board', 'snakes', 'powerups', 'timer'],
  apply(ctx, config = {}) {
    const cfg = { spawnEvery: 30, maxOnBoard: 3, ...config }
    let sinceSpawn = 0

    const offTick = ctx.on('tick', () => {
      ctx.powerups.tick()
      sinceSpawn += 1
      if (sinceSpawn < cfg.spawnEvery) return
      sinceSpawn = 0
      if (ctx.powerups.cells.length >= cfg.maxOnBoard) return
      const cell = ctx.snakes.randomFreeCell()
      if (!cell) return
      if (ctx.powerups.cells.some((c) => c.x === cell.x && c.y === cell.y)) return
      const type = ctx.powerups.types[Math.floor(Math.random() * ctx.powerups.types.length)]
      ctx.powerups.spawnAt(cell, type)
    })

    const offMove = ctx.on('snake/move', ({ id, head }) => {
      const idx = ctx.powerups.cells.findIndex((c) => c.x === head.x && c.y === head.y)
      if (idx < 0) return
      const cell = ctx.powerups.cells[idx]
      ctx.powerups.cells.splice(idx, 1)
      ctx.powerups.pickup(id, cell.type)
    })

    // 关卡联动（P6）：升级 → 道具刷新更快（进度越高奖励越密），下限 8 帧。
    const offLevel = ctx.on('level/up', () => {
      cfg.spawnEvery = Math.max(8, Math.round(cfg.spawnEvery * 0.85))
    })

    // 暴露当前刷新间隔，便于其它模块/自测读取（跨模块可读缝）。
    const disposeProvide = ctx.provide('powerup-spawn', { rate: () => cfg.spawnEvery })

    return () => {
      offTick()
      offMove()
      offLevel()
      disposeProvide()
    }
  },
}
