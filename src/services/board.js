// services/board.js
// ───────────────────────────────────────────────────────────────────────────
// 世界状态服务（ctx.board）—— 游戏世界的唯一真相源（single source of truth）。
//
// 它现在只管"世界"：尺寸、食物坐标、障碍物、运行状态。蛇身的占用判定
// 委托给 ctx.snakes（统一的多蛇模型），障碍物是世界状态的一部分。
//
// 这正体现了 Cordis 论文的 "capability seam（能力缝）"：
//   世界 / 蛇群 / 输入 / 音效 各自是一个可被依赖注入、可被整体替换的服务。
// ───────────────────────────────────────────────────────────────────────────
import { Service } from 'cordis'

const keyOf = (p) => `${p.x},${p.y}`

export class BoardService extends Service {
  static provide = 'board'

  constructor(ctx, config = {}) {
    super(ctx, 'board')
    this.width = config.width ?? 24
    this.height = config.height ?? 16
    this.obstacles = new Set() // "x,y" 集合：关卡生成的静态墙
    this.bonusFood = new Set() // "x,y" 集合：frenzy 等道具撒出的奖励食物
    // 研调新增的可配置维度（被 modes 插件按需改写，默认关闭）：
    this.wrap = config.wrap ?? false // 穿屏环绕（Open-World 模式）
    this.initialLength = config.initialLength ?? 3 // 起步蛇长（Survival 模式用）
    this.reset()
  }

  /** 重置世界（默认清空障碍物，保留则用于关卡内重开）。 */
  reset(keepObstacles = false) {
    if (!keepObstacles) this.obstacles = new Set()
    this.bonusFood = new Set()
    this.food = null
    this.status = 'running' // 'running' | 'over'
  }

  inBounds(p) {
    return p.x >= 0 && p.x < this.width && p.y >= 0 && p.y < this.height
  }

  isObstacle(p) {
    return this.obstacles.has(keyOf(p))
  }

  addObstacle(p) {
    this.obstacles.add(keyOf(p))
  }

  removeObstacle(p) {
    this.obstacles.delete(keyOf(p))
  }

  clearObstacles() {
    this.obstacles = new Set()
  }

  /** 奖励食物（frenzy 等）：与 primary food 共用 isFood 判定。 */
  addFood(p) {
    this.bonusFood.add(keyOf(p))
  }

  removeFood(p) {
    this.bonusFood.delete(keyOf(p))
  }

  /** 是否某类食物（primary 或奖励食物）。供 snake 插件统一判定进食。 */
  isFood(p) {
    return (
      (this.food && this.food.x === p.x && this.food.y === p.y) ||
      this.bonusFood.has(keyOf(p))
    )
  }

  /**
   * 占用判定：障碍 OR 任一蛇身（由 snakes 服务统一裁决）。
   * keepTail=true 时排除每条蛇的尾格（因为下一步会让出，可进入）。
   */
  occupied(p, keepTail = false) {
    if (this.isObstacle(p)) return true
    return this.ctx.get('snakes')?.occupiedGlobal(p, keepTail) ?? false
  }

  /** 兼容旧读法：返回主蛇（list[0]）身体，便于无多蛇场景下直接读取。 */
  get snake() {
    return this.ctx.get('snakes')?.list?.[0]?.body ?? []
  }
  get dir() {
    return this.ctx.get('snakes')?.list?.[0]?.dir ?? { x: 1, y: 0 }
  }

  freeCells() {
    const s = this.ctx.get('snakes')
    if (s) return s.freeCells()
    const cells = []
    for (let y = 0; y < this.height; y++)
      for (let x = 0; x < this.width; x++)
        if (!this.isObstacle({ x, y })) cells.push({ x, y })
    return cells
  }

  randomFreeCell() {
    return this.ctx.get('snakes')?.randomFreeCell() ?? this.freeCells()[0] ?? null
  }

  /** 不可变快照（供渲染器读取）。 */
  state() {
    const s = this.ctx.get('snakes')
    return {
      width: this.width,
      height: this.height,
      obstacles: [...this.obstacles].map((k) => {
        const [x, y] = k.split(',').map(Number)
        return { x, y }
      }),
      snakes: s ? s.list.map((sn) => ({
        id: sn.id,
        color: sn.color,
        alive: sn.alive,
        body: sn.body.map((b) => ({ ...b })),
      })) : [],
      food: this.food ? { ...this.food } : null,
      bonusFood: [...this.bonusFood].map((k) => {
        const [x, y] = k.split(',').map(Number)
        return { x, y }
      }),
      status: this.status,
    }
  }
}
