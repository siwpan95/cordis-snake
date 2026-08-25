// plugins/game.js
// ───────────────────────────────────────────────────────────────────────────
// 游戏编排插件 —— 把各插件"粘"起来的薄层：每帧渲染、处理结束/重开/退出、
// 转发 AI 热插拔请求。
//
// 它只依赖 board / timer / snakes（通过 inject），渲染器/分数/关卡用
// ctx.get() 可选注入，因此换掉 renderer、去掉 score、关掉 level 都不会让它
// 崩溃。编排逻辑本身也是插件，没有任何特权。
// ───────────────────────────────────────────────────────────────────────────
export const gamePlugin = {
  name: 'game',
  inject: ['board', 'timer', 'snakes'],
  apply(ctx) {
    const renderer = ctx.get('renderer')
    let tickCount = 0

    const offTick = ctx.on('tick', () => {
      tickCount++
      if (renderer) {
        renderer.render()
      } else if (tickCount % 25 === 0) {
        const p1 = ctx.snakes.get('p1')
        ctx.logger.info(`演示中… 第 ${tickCount} 帧 主蛇长=${p1?.body.length ?? 0} 状态=${ctx.board.status}`)
      }
    })

    const offOver = ctx.on('game/over', (reason) => {
      ctx.board.status = 'over'
      ctx.timer.stop()
      const score = ctx.get('score')
      const final = score
        ? ctx.snakes.list.map((s) => `${s.id}=${score.get(s.id)}`).join(' ')
        : ''
      ctx.logger.info(`游戏结束（${reason}）${final}`)
    })

    // 满局重开：清场（含障碍）、重生主蛇、计时器复位，再广播 game/reset
    // 让 score / level / food / multiplayer 各自复位（revertible + reactive）。
    const offRestart = ctx.on('meta/restart', () => {
      ctx.board.reset() // 清空障碍物
      ctx.snakes.reset() // 仅留主蛇 p1
      ctx.timer.reset() // interval 回到基准并重启
      ctx.emit('game/reset') // 各插件据此复位自身状态
    })

    const offQuit = ctx.on('meta/quit', () => ctx.emit('game/quit'))
    const offAi = ctx.on('meta/ai-toggle', () => ctx.emit('plugin/toggle-ai'))

    return () => {
      offTick()
      offOver()
      offRestart()
      offQuit()
      offAi()
    }
  },
}
