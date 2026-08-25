// plugins/input-ai.js
// ───────────────────────────────────────────────────────────────────────────
// AI 自动驾驶「驱动插件」—— 监听 'tick'，为每条 source==='ai' 的蛇用 BFS 算
// 一条通往食物、避开蛇身与障碍的安全路径，再喂给稳定的 input 服务。
//
// 它只依赖 ctx.input / ctx.board / ctx.snakes，本身不提供任何服务，因此
// 热插拔它只是回收它注册在 ctx 上的 'tick' 监听器——纯 revertible effect，
// 安全无崩。BFS 避开所有蛇身（含其它 AI），因此多 AI 对战也不会无脑互撞。
// ───────────────────────────────────────────────────────────────────────────
export const aiPlugin = {
  name: 'input-ai',
  inject: ['input', 'board', 'snakes'],
  apply(ctx) {
    const offTick = ctx.on('tick', () => {
      if (ctx.board.status !== 'running') return
      for (const s of ctx.snakes.list) {
        if (!s.alive || s.source !== 'ai') continue
        if (!ctx.board.food) continue
        const cur = ctx.input.dirOf(s.id)
        const reverse = { x: -cur.x, y: -cur.y }
        const dir =
          bfsNextDir(ctx, s.body[0], ctx.board.food, reverse) ||
          safeDir(ctx, s.body[0], cur)
        if (dir) ctx.input.setDirection(s.id, dir, 'ai')
      }
    })
    return () => offTick()
  },
}

const DIRS = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
]
const keyOf = (p) => `${p.x},${p.y}`

/** BFS 求从 start 到 target、避开所有蛇身（尾格除外）与障碍的第一步方向。
 *  @param banFirst 起点处禁用的方向（如掉头），保证返回的第一步合法。 */
function bfsNextDir(ctx, start, target, banFirst) {
  const { board, snakes } = ctx
  const body = new Set()
  for (const s of snakes.list)
    for (let i = 0; i < s.body.length - 1; i++) body.add(keyOf(s.body[i]))
  const prev = new Map()
  const seen = new Set([keyOf(start)])
  const queue = [start]

  while (queue.length) {
    const cur = queue.shift()
    if (cur.x === target.x && cur.y === target.y) {
      let node = cur
      while (prev.has(keyOf(node)) && keyOf(prev.get(keyOf(node))) !== keyOf(start))
        node = prev.get(keyOf(node))
      return { x: node.x - start.x, y: node.y - start.y }
    }
    const atStart = cur.x === start.x && cur.y === start.y
    for (const d of DIRS) {
      if (atStart && banFirst && d.x === banFirst.x && d.y === banFirst.y) continue
      const nx = cur.x + d.x
      const ny = cur.y + d.y
      if (!board.inBounds({ x: nx, y: ny })) continue
      const k = nx + ',' + ny
      if (seen.has(k)) continue
      const isTarget = nx === target.x && ny === target.y
      if ((body.has(k) || board.isObstacle({ x: nx, y: ny })) && !isTarget) continue
      seen.add(k)
      prev.set(k, cur)
      queue.push({ x: nx, y: ny })
    }
  }
  return null
}

/** 兜底：选一个不反向、不立即撞墙/撞障碍/撞蛇身的方向。 */
function safeDir(ctx, head, current) {
  const { board, snakes } = ctx
  const reverse = { x: -current.x, y: -current.y }
  const cands = DIRS.filter((d) => !(d.x === reverse.x && d.y === reverse.y))
  for (const d of cands) {
    const nx = head.x + d.x
    const ny = head.y + d.y
    const p = { x: nx, y: ny }
    if (!board.inBounds(p)) continue
    if (board.isObstacle(p)) continue
    if (snakes.occupiedGlobal(p, true)) continue
    return d
  }
  return null
}
