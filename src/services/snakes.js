// services/snakes.js
// ───────────────────────────────────────────────────────────────────────────
// 蛇群服务（ctx.snakes）—— 所有蛇（单人即一条，多人即多条）的统一模型。
//
// 为什么把"蛇"也做成一个服务而不是写在 snake 插件里？
//   · 占用判定（occupiedGlobal）、随机空格（randomFreeCell）、计分、存活
//     统计都是"关于蛇群的世界知识"，属于能力缝，应当可被注入/替换；
//   · 多人模式只是"再 spawn 几条蛇"，游戏规则（snake 插件）完全不变；
//   · 渲染器/食物/AI 都从 ctx.snakes 读，零耦合。
// ───────────────────────────────────────────────────────────────────────────
import { Service } from 'cordis'

export class SnakesService extends Service {
  static provide = 'snakes'
  // 需要世界尺寸：声明 inject 让 Cordis 在 board 就绪后才激活本服务，
  // 并把它混入本 fiber 的上下文（否则跨 fiber 的 ctx.get('board') 取不到）。
  static inject = ['board']

  constructor(ctx, config = {}) {
    super(ctx, 'snakes')
    // 每条蛇的"蛇头字符"，渲染时用；ASCII 安全。
    this.colors = config.colors ?? ['@', '1', '2', '3', '4']
    this.list = []
    this.reset()
  }

  /** 全场重置：清场，只留一条人类主蛇 p1。 */
  reset() {
    this.list = []
    this.spawn({ id: 'p1', color: this.colors[0], dir: { x: 1, y: 0 }, source: 'human' })
  }

  spawn({ id, color, dir, source, pos }) {
    const board = this.ctx.get('board')
    const w = board.width
    const h = board.height
    const p = pos ?? { x: Math.floor(w / 2), y: Math.floor(h / 2) }
    this.list.push({
      id,
      body: [{ ...p }],
      dir: { ...dir },
      alive: true,
      color: color ?? '?',
      source: source ?? 'human', // 'human' | 'ai'
      score: 0,
    })
  }

  get(id) {
    return this.list.find((s) => s.id === id)
  }

  headOf(id) {
    return this.get(id)?.body[0]
  }

  /**
   * 全局占用：任一存活蛇的身体（排除尾格则允许"尾随"）或障碍物。
   * 仅 tail 由 allowTail 决定可否进入；所有蛇（含自身）的身体一律计入——
   * 自撞判定即依赖此（蛇头撞入自身非尾身体 → 死亡）。
   */
  occupiedGlobal(p, allowTail = true) {
    if (this.ctx.get('board').isObstacle(p)) return true
    for (const s of this.list) {
      if (!s.alive) continue
      const n = s.body.length
      for (let i = 0; i < n; i++) {
        if (allowTail && i === n - 1) continue // 尾格下一步让出，可进入
        if (s.body[i].x === p.x && s.body[i].y === p.y) return true
      }
    }
    return false
  }

  /**
   * 仅某条蛇自身身体的占用（ghost 道具用）：可穿过其它蛇，但仍撞自己身体。
   * 直接遍历该蛇 body（id 即自身），故不考虑其它蛇。
   */
  occupiedBy(id, p, allowTail = true) {
    const s = this.get(id)
    if (!s || !s.alive) return false
    const n = s.body.length
    for (let i = 0; i < n; i++) {
      if (allowTail && i === n - 1) continue // 尾格下一步让出，可进入
      if (s.body[i].x === p.x && s.body[i].y === p.y) return true
    }
    return false
  }

  /** 所有不被任何蛇身/障碍占用的格子（用于随机放食物）。 */
  freeCells() {
    const board = this.ctx.get('board')
    const cells = []
    for (let y = 0; y < board.height; y++)
      for (let x = 0; x < board.width; x++) {
        const p = { x, y }
        if (!this.occupiedGlobal(p)) cells.push(p)
      }
    if (!cells.length) return []
    return cells
  }

  randomFreeCell() {
    const cells = this.freeCells()
    if (!cells.length) return null
    return cells[Math.floor(Math.random() * cells.length)]
  }

  kill(id, reason) {
    const s = this.get(id)
    if (s && s.alive) {
      s.alive = false
      this.ctx.emit('snake/die', { id, reason })
    }
  }

  aliveCount() {
    return this.list.filter((s) => s.alive).length
  }

  allDead() {
    return this.list.length > 0 && this.aliveCount() === 0
  }

  /** 受控移除一条蛇（多人卸载用）：原地 splice，保持 this.list 引用稳定，避免闭包/快照读到陈旧数组。 */
  remove(id) {
    const i = this.list.findIndex((s) => s.id === id)
    if (i >= 0) this.list.splice(i, 1)
  }

  scoreOf(id) {
    return this.get(id)?.score ?? 0
  }

  /** 增长：在尾部追加 n 节（Survival 模式起步更长）。 */
  grow(id, n = 1) {
    const s = this.get(id)
    if (!s) return
    const tail = s.body[s.body.length - 1] ?? { x: 0, y: 0 }
    for (let i = 0; i < n; i++) s.body.push({ ...tail })
  }

  /** 缩短：从尾部砍掉 n 节（shrink 道具用），至少留 1 节。 */
  shrink(id, n = 1) {
    const s = this.get(id)
    if (!s || s.body.length <= 1) return
    s.body = s.body.slice(0, Math.max(1, s.body.length - n))
  }

  /** 关卡/重开时把所有蛇重新摆回随机空格、长度归 1（保留 id/颜色/来源）。 */
  respawnAll() {
    const board = this.ctx.get('board')
    const w = board.width
    const h = board.height
    const cx = Math.floor(w / 2)
    const cy = Math.floor(h / 2)
    this.list.forEach((s, idx) => {
      let p = { x: Math.min(cx + idx, w - 2), y: cy }
      if (this.occupiedGlobal(p)) p = this.randomFreeCell() ?? p
      s.body = [{ ...p }]
      s.dir = { x: 1, y: 0 }
      s.alive = true
    })
  }
}
