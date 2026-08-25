// plugins/sound-hooks.js
// ───────────────────────────────────────────────────────────────────────────
// 音效接线插件 —— 把游戏事件翻译成音效调用。它只依赖 ctx.sound，监听到
// 吃到食物 / 升级 / 死亡 / 游戏结束时播放对应音效。没有任何后端时（未挂载
// sound-wav / sound-beep）play() 是空操作，所以本插件可安全常驻。
// ───────────────────────────────────────────────────────────────────────────
export const soundHooksPlugin = {
  name: 'sound-hooks',
  inject: ['sound'],
  apply(ctx) {
    const offs = [
      ctx.on('snake/eat', () => ctx.sound.play('eat')),
      ctx.on('level/up', () => ctx.sound.play('levelup')),
      ctx.on('game/over', () => ctx.sound.play('crash')),
      ctx.on('snake/die', () => ctx.sound.play('die')),
    ]
    return () => offs.forEach((o) => o())
  },
}
