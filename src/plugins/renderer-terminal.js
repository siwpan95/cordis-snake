// plugins/renderer-terminal.js
// ───────────────────────────────────────────────────────────────────────────
// 终端渲染插件（provider: 'renderer'）—— 又一个可替换的"视图 seam"。
//
// 现在绘制：障碍物 '#'、各蛇（蛇头用其 color 字符、身体 'o'）、食物 '*'，
// 并在底部显示每条蛇的分数与当前关卡。想换 Canvas / Web / 远程投屏？再写
// 一个提供 'renderer' 的插件替换它即可，游戏逻辑一行都不用动。
// ───────────────────────────────────────────────────────────────────────────
export const rendererPlugin = {
  name: 'renderer-terminal',
  provide: 'renderer',
  inject: ['board', 'snakes', 'themes'],
  apply(ctx) {
    const disposeProvide = ctx.provide('renderer', {
      render: () => draw(ctx),
    })
    return () => disposeProvide()
  },
}

function draw(ctx) {
  const board = ctx.board
  const snakes = ctx.snakes
  const { width, height, status } = board
  const theme = ctx.themes?.get?.() ?? { wall: '#', food: '*', body: 'o', powerup: '◆', particle: '·' }
  const skin = ctx.themes?.skinOf?.()
  const grid = Array.from({ length: height }, () => new Array(width).fill(' '))

  for (const o of board.obstacles) {
    if (o.y >= 0 && o.y < height && o.x >= 0 && o.x < width) grid[o.y][o.x] = theme.wall
  }

  // 道具（取 PowerupService 的字形；powerups 是可选插件，用 ctx.get 懒读）
  const power = ctx.get('powerups')
  const glyphOf = (type) => power?.glyphs?.[type] ?? theme.powerup
  if (power) {
    for (const c of power.cells) {
      if (c.y >= 0 && c.y < height && c.x >= 0 && c.x < width) grid[c.y][c.x] = glyphOf(c.type)
    }
  }

  for (const sn of snakes.list) {
    sn.body.forEach((b, i) => {
      if (b.y >= 0 && b.y < height && b.x >= 0 && b.x < width) {
        // 蛇身字符：优先用皮肤描边 pattern（按段序号交替），否则用调色板 body。
        const bodyGlyph = skin?.pattern
          ? skin.pattern[i % skin.pattern.length]
          : (theme.body ?? 'o')
        grid[b.y][b.x] = i === 0 ? (theme.head ?? sn.color) : bodyGlyph
      }
    })
  }
  if (board.food) grid[board.food.y][board.food.x] = theme.food

  // Boss（取 boss 能力的字形 / 配色；boss 是可选插件，用 ctx.get 懒读）
  const bossApi = ctx.get('boss')
  if (bossApi?.exists?.()) {
    const reset = '\x1b[0m'
    for (const b of bossApi.list()) {
      if (b.y >= 0 && b.y < height && b.x >= 0 && b.x < width) {
        const ansi = b.color || ''
        grid[b.y][b.x] = (ansi + (b.glyph || '☠') + (ansi ? reset : ''))
      }
    }
  }

  // 粒子（按 kind 造型 + 取主题色着色；坐标取整防 grid 浮点索引越界）
  // 用 ctx.get 懒读：particles 是可选插件，未挂载时返回 undefined 而不阻断渲染。
  const parts = ctx.get('particles')?.bursts?.()
  if (parts) {
    const KIND_GLYPH = { eat: '✧', power: '○', die: '✸', over: '✺' }
    const reset = '\x1b[0m'
    for (const p of parts) {
      const px = Math.floor(p.x)
      const py = Math.floor(p.y)
      if (py >= 0 && py < height && px >= 0 && px < width && grid[py][px] === ' ') {
        const ansi = theme.colors?.[p.color] || ''
        const glyph = KIND_GLYPH[p.kind] || theme.particle
        grid[py][px] = ansi + glyph + (ansi ? reset : '')
      }
    }
  }

  const top = '┌' + '─'.repeat(width) + '┐'
  const bottom = '└' + '─'.repeat(width) + '┘'
  const lines = [top]
  for (const row of grid) lines.push('│' + row.join('') + '│')
  lines.push(bottom)

  // 状态行：每条蛇分数 + 关卡 + 当前皮肤
  const score = ctx.get('score')
  const level = ctx.get('level')
  const scoreLine = snakes.list.map((sn) => `${sn.id}:${score ? score.get(sn.id) : 0}`).join('  ')
  const lvlLine = level ? `  关卡 ${level.get()}` : ''
  const themeLine = ctx.themes ? `  [${ctx.themes.current}·${ctx.themes.currentSkin}]` : ''
  const bossLine = bossApi?.exists?.() ? `  BOSS ${bossApi.current()} ${bossApi.hp()}/${bossApi.maxHp()}` : ''
  const statusLine = status === 'over' ? '  [GAME OVER]' : ''
  process.stdout.write('\x1b[2J\x1b[H' + lines.join('\n') + '\n' + scoreLine + lvlLine + themeLine + bossLine + statusLine + '\n')
}
