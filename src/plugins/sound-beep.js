// plugins/sound-beep.js
// ───────────────────────────────────────────────────────────────────────────
// 音效后端（蜂鸣）—— 收到 'sound/play' 时向终端写 ASCII BEL（\x07）。
// 零依赖、最稳的兜底；代价是音高单一。没有终端/TTY 时静默降级。
// ───────────────────────────────────────────────────────────────────────────
export const soundBeepPlugin = {
  name: 'sound-beep',
  inject: ['sound'],
  apply(ctx) {
    const off = ctx.on('sound/play', () => {
      try {
        process.stdout.write('\x07')
      } catch {
        /* 静默降级 */
      }
    })
    return () => off()
  },
}
