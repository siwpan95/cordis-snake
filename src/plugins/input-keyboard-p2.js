// plugins/input-keyboard-p2.js
// ───────────────────────────────────────────────────────────────────────────
// 键盘「驱动插件」（玩家 2）—— 本地双人对战用。IJKL 控制第二条蛇 p2。
// 仅当 manifest 启用 multiplayer 且本插件启用时才有意义（否则没有 p2 蛇）。
// 与 P1 插件完全对称：都只是向稳定 input 服务喂方向，热插拔互不干扰。
// ───────────────────────────────────────────────────────────────────────────
import readline from 'node:readline'

const DIR_MAP = {
  i: { x: 0, y: -1 }, // 上
  k: { x: 0, y: 1 }, // 下
  j: { x: -1, y: 0 }, // 左
  l: { x: 1, y: 0 }, // 右
}

export const keyboardP2Plugin = {
  name: 'input-keyboard-p2',
  inject: ['input', 'snakes'],
  apply(ctx) {
    // 确保存在 p2 蛇（multiplayer 插件通常已 spawn；此处兜底）。
    if (!ctx.snakes.get('p2')) {
      ctx.snakes.spawn({ id: 'p2', color: ctx.snakes.colors[1] ?? '2', dir: { x: -1, y: 0 }, source: 'human' })
      ctx.input.ensure('p2', { x: -1, y: 0 })
    }

    readline.emitKeypressEvents(process.stdin)
    if (process.stdin.isTTY) process.stdin.setRawMode(true)
    process.stdin.resume()

    const handler = (str, key) => {
      if (!key) return
      const name = key.name?.toLowerCase?.() ?? str?.toLowerCase?.()
      if (DIR_MAP[name]) ctx.input.setDirection('p2', DIR_MAP[name], 'keyboard2')
    }

    process.stdin.on('keypress', handler)

    return () => {
      process.stdin.removeListener('keypress', handler)
      if (process.stdin.isTTY) process.stdin.setRawMode(false)
      process.stdin.pause()
    }
  },
}
