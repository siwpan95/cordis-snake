// plugins/food.js
// ───────────────────────────────────────────────────────────────────────────
// 食物生成插件 —— 监听 'snake/eat'，在随机空格子重新放置食物。
//
// 它只依赖 ctx.board 与 ctx.snakes（通过 inject 声明），不关心是谁、用什么
// 方式让哪条蛇吃到食物。依赖以"声明式 coeffect"表达：服务就绪前不激活。
// 空格子由 snakes 服务统一裁决（避开所有蛇身与障碍），所以多蛇下也安全。
// ───────────────────────────────────────────────────────────────────────────
export const foodPlugin = {
  name: 'food',
  inject: ['board', 'snakes'],
  apply(ctx) {
    // 取一个空闲格放食物；若 Boss 在场，避开其占用格（B19：食物排除 Boss 格）。
    const place = () => {
      let chosen = null
      for (let i = 0; i < 64; i++) {
        const c = ctx.snakes.randomFreeCell()
        if (!c) break
        const onBoss = ctx.get('boss')?.list?.().some((b) => b.x === c.x && b.y === c.y)
        if (!onBoss) { chosen = c; break }
        chosen = c // 退化：极小棋盘全被 Boss 占据时仍放（避免无限循环）
      }
      ctx.board.food = chosen
    }

    place() // 初始放一份
    const offEat = ctx.on('snake/eat', place)
    const offReset = ctx.on('game/reset', place)

    return () => {
      offEat()
      offReset()
    }
  },
}
