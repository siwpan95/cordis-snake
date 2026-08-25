// plugins/multiplayer.js
// ───────────────────────────────────────────────────────────────────────────
// 多人插件 —— 在单人主蛇 p1 之外，再 spawn N 条 AI 对手蛇（cpu1..cpuN）。
// 移动规则、碰撞、计分全部复用既有的 snake / score 插件，本插件只负责
// "多生几条蛇"与"重开时把它们补回来"。AI 驱动由 input-ai 插件完成
// （它只喂 source==='ai' 的蛇），因此本插件与驱动彻底解耦、可独立热插拔。
//
// 想玩本地双人？再启用 input-keyboard-p2（IJKL 控制 p2 人类蛇）即可，
// 同样不需要改动任何规则代码。
// ───────────────────────────────────────────────────────────────────────────
export const multiplayerPlugin = {
  name: 'multiplayer',
  inject: ['snakes', 'input'],
  apply(ctx, config) {
    const n = config?.count ?? 1

    const spawnOpponents = () => {
      for (let i = 0; i < n; i++) {
        const id = 'cpu' + (i + 1)
        if (ctx.snakes.get(id)) continue
        ctx.snakes.spawn({
          id,
          color: ctx.snakes.colors[(i + 1) % ctx.snakes.colors.length],
          dir: { x: -1, y: 0 },
          source: 'ai',
        })
        ctx.input.ensure(id, { x: -1, y: 0 })
      }
    }
    spawnOpponents()

    // 满局重开后把对手补回来（snakes.reset 会清空它们）。
    const offReset = ctx.on('game/reset', () => spawnOpponents())

    ctx.logger.info(`[多人] 已加入 ${n} 名 AI 对手（cpu1..cpu${n}）`)

    return () => {
      offReset()
      // 卸载本插件：受控移除对手蛇（主蛇 p1 保留），保持 this.list 引用稳定。
      for (let i = 0; i < n; i++) {
        ctx.snakes.remove('cpu' + (i + 1))
      }
    }
  },
}
