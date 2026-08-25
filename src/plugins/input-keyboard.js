// plugins/input-keyboard.js
// ───────────────────────────────────────────────────────────────────────────
// 键盘「驱动插件」（玩家 1）—— 仅在 TTY 下挂载。把 WASD / 方向键翻译成方向，
// 喂给稳定的 input 服务的主蛇 p1；'a'/'r'/'q' 翻译成热插拔 / 重开 / 退出等
// meta 事件。
//
// 它 inject ctx.input（所以 input 服务就绪后才激活），不提供任何服务，卸载时
// 只回收 raw mode 与监听器——干净、可逆、无崩。
// ───────────────────────────────────────────────────────────────────────────
import readline from 'node:readline'

const DIR_MAP = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
}

export const keyboardPlugin = {
  name: 'input-keyboard',
  inject: ['input'],
  apply(ctx) {
    readline.emitKeypressEvents(process.stdin)
    if (process.stdin.isTTY) process.stdin.setRawMode(true)
    process.stdin.resume()

    const handler = (str, key) => {
      if (!key) return
      const name = key.name
      if (key.ctrl && name === 'c') {
        ctx.emit('meta/quit')
        return
      }
      if (DIR_MAP[name]) {
        ctx.input.setDirection('p1', DIR_MAP[name], 'keyboard')
      } else if (name === 'a') {
        ctx.emit('meta/ai-toggle')
      } else if (name === 'r') {
        ctx.emit('meta/restart')
      } else if (name === 'q') {
        ctx.emit('meta/quit')
      }
    }

    process.stdin.on('keypress', handler)

    return () => {
      process.stdin.removeListener('keypress', handler)
      if (process.stdin.isTTY) process.stdin.setRawMode(false)
      process.stdin.pause()
    }
  },
}
