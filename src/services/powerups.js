// services/powerups.js
// ───────────────────────────────────────────────────────────────────────────
// 道具服务（ctx.powerups）—— 可插拔的"增益/减益"能力缝。
//
// 设计映射调研结论（蛇类游戏 Boost Cubes / ECS 效果系统）：
//   · 效果 = 带时长计时器的组件，由本服务的 tick() 统一处理到期与续效；
//   · 即时效果（golden/shrink）在拾取时触发一次；持续效果（phase/speed/…
//     ）以"是否激活"被 snake/score 等插件按需读取（capability 调用）；
//   · 磁吸（magnet）是持续的全局效果，每帧把食物向最近蛇头推进一步。
// 研调得到的 8 类道具全部在此注册，要加新效果只是多塞一条 registerEffect。
// ───────────────────────────────────────────────────────────────────────────
import { Service } from 'cordis'

const dist = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y)

export class PowerupService extends Service {
  static provide = 'powerups'
  static inject = ['board', 'snakes']

  constructor(ctx, config = {}) {
    super(ctx, 'powerups')
    this.maxOnBoard = config.maxOnBoard ?? 3
    this.types = [
      'speed', 'slow', 'phase', 'magnet', 'multiplier', 'golden', 'shrink', 'reverse',
      // —— 研调扩充（P1）：9 类新道具，全部惰性、可热拔插 ——
      'portal', 'drill', 'ghost', 'frenzy', 'poison', 'extra-life', 'bomb', 'mystery', 'slowmo',
    ]
    this.glyphs = {
      speed: '»', slow: '≈', phase: '◇', magnet: 'U',
      multiplier: '×', golden: '$', shrink: '−', reverse: '⧉',
      portal: '⧖', drill: '⊕', ghost: '☻', frenzy: '⁘',
      poison: '☠', 'extra-life': '♥', bomb: '✸', mystery: '?', slowmo: '⏳',
    }
    this.cells = [] // 盘面上的道具 [{x,y,type}]
    this.active = new Map() // snakeId -> [{type, remaining}]
    this.effects = {} // type -> {duration, onPickup, onTick}

    // —— 默认效果注册表（研调得到的 8 类 + P1 扩充 9 类，全部可热拔插）——
    this.registerEffect('speed', { duration: 40 }) // 加速：每帧走两步
    this.registerEffect('slow', { duration: 40 }) // 减速：隔帧走一步
    this.registerEffect('phase', { duration: 50 }) // 穿墙/穿身：忽略碰撞死亡
    this.registerEffect('magnet', { duration: 60, onTick: (c) => this._magnetTick(c) }) // 吸食物
    this.registerEffect('multiplier', { duration: 50 }) // 计分 ×3
    this.registerEffect('golden', { duration: 0, onPickup: (c, id) => c.emit('score/add', { id, amount: 5 }) }) // +5 分
    this.registerEffect('shrink', { duration: 0, onPickup: (c, id) => c.get('snakes')?.shrink(id, 2) }) // 缩短 2 节
    this.registerEffect('reverse', { duration: 40 }) // 反向控制：方向取反

    // —— P1 新道具 ——
    // portal（传送门）：拾取即把蛇头瞬移到随机空格（成对简化为单次闪现）。
    this.registerEffect('portal', {
      duration: 0,
      onPickup: (c, id) => {
        const s = c.get('snakes')?.get(id)
        if (!s) return
        const cell = c.get('snakes')?.randomFreeCell()
        if (!cell) return
        s.body = [cell, ...s.body.slice(0, s.body.length - 1)] // 头瞬移，身体保持结构
      },
    })
    // drill（破障）：持续期内可撞穿障碍（在 snake 插件里移除障碍并免死）。
    this.registerEffect('drill', { duration: 50 })
    // ghost（穿身不穿墙）：持续期内只与"自身"蛇身碰撞，可穿过其它蛇。
    this.registerEffect('ghost', { duration: 50 })
    // frenzy（撒食物）：立即在随机空格撒 5 份奖励食物（board.bonusFood）。
    this.registerEffect('frenzy', {
      duration: 0,
      onPickup: (c) => {
        const b = c.board
        if (!b) return
        for (let i = 0; i < 5; i++) {
          const cell = b.randomFreeCell()
          if (cell) b.addFood(cell)
        }
      },
    })
    // poison（毒）：拾取即死（陷阱类道具）。
    this.registerEffect('poison', { duration: 0, onPickup: (c, id) => c.get('snakes')?.kill(id, 'poison') })
    // extra-life（护盾）：抵消一次致命碰撞，原地复活 + 短暂无敌（在 snake 插件里消费 s._shield）。
    this.registerEffect('extra-life', {
      duration: 0,
      onPickup: (c, id) => {
        const s = c.get('snakes')?.get(id)
        if (s) s._shield = (s._shield || 0) + 1
      },
    })
    // bomb（清周围）：拾取即清除蛇头周围 3×3 内的障碍物。
    this.registerEffect('bomb', {
      duration: 0,
      onPickup: (c, id) => {
        const s = c.get('snakes')?.get(id)
        const b = c.board
        if (!s || !b) return
        const h = s.body[0]
        for (let dx = -1; dx <= 1; dx++)
          for (let dy = -1; dy <= 1; dy++) {
            const p = { x: h.x + dx, y: h.y + dy }
            if (b.inBounds(p)) b.removeObstacle(p)
          }
      },
    })
    // mystery（随机）：拾取即随机套用一种其它道具效果。
    this.registerEffect('mystery', {
      duration: 0,
      onPickup: (c, id) => {
        const pool = this.types.filter((t) => t !== 'mystery')
        const t = pool[Math.floor(Math.random() * pool.length)]
        this.pickup(id, t)
      },
    })
    // slowmo（全局减速）：持续期内所有蛇隔帧移动（由 isGlobalActive 在 snake 插件里读取）。
    this.registerEffect('slowmo', { duration: 60 })
  }

  registerEffect(type, def) {
    this.effects[type] = { duration: 0, ...def }
  }

  // —— 盘面道具 ——
  spawnAt(cell, type) {
    if (this.cells.some((c) => c.x === cell.x && c.y === cell.y)) return
    this.cells.push({ x: cell.x, y: cell.y, type })
    this.ctx.emit('powerup/spawn', { ...cell, type })
  }
  removeAt(cell) {
    const i = this.cells.findIndex((c) => c.x === cell.x && c.y === cell.y)
    if (i >= 0) this.cells.splice(i, 1)
  }

  // —— 拾取：登记持续效果 / 触发即时效果 ——
  pickup(snakeId, type) {
    const def = this.effects[type]
    if (!def) return
    if (def.duration > 0) {
      if (!this.active.has(snakeId)) this.active.set(snakeId, [])
      this.active.get(snakeId).push({ type, remaining: def.duration })
    }
    if (def.onPickup) def.onPickup(this.ctx, snakeId)
    this.ctx.emit('powerup/pickup', { id: snakeId, type })
  }

  // —— 每帧推进：续效 + 到期回收（revertible effect 的"时间可组合"）——
  tick() {
    for (const [id, list] of this.active) {
      for (let i = list.length - 1; i >= 0; i--) {
        const e = list[i]
        const def = this.effects[e.type]
        if (def?.onTick) def.onTick(this.ctx)
        e.remaining -= 1
        if (e.remaining <= 0) {
          list.splice(i, 1)
          this.ctx.emit('powerup/expire', { id, type: e.type })
        }
      }
      if (!list.length) this.active.delete(id)
    }
  }

  isActive(snakeId, type) {
    return (this.active.get(snakeId) ?? []).some((e) => e.type === type && e.remaining > 0)
  }

  /** 全局效果：任一存活蛇持有即视为生效（slowmo 等全局控制用）。 */
  isGlobalActive(type) {
    for (const [id, list] of this.active) {
      if ((list || []).some((e) => e.type === type && e.remaining > 0)) return true
    }
    return false
  }

  activeOf(snakeId) {
    return (this.active.get(snakeId) ?? []).map((e) => e.type)
  }

  /** magnet 效果：每帧把食物朝最近存活蛇头推进一步（绕过障碍/蛇身）。 */
  _magnetTick(c) {
    const b = c.board
    const s = c.snakes
    if (!b || !b.food || !s) return
    const heads = s.list.filter((x) => x.alive).map((x) => x.body[0])
    if (!heads.length) return
    let near = heads[0]
    let best = Infinity
    for (const h of heads) {
      const d = dist(h, b.food)
      if (d < best) {
        best = d
        near = h
      }
    }
    const dx = Math.sign(near.x - b.food.x)
    const dy = Math.sign(near.y - b.food.y)
    const cand =
      Math.abs(near.x - b.food.x) >= Math.abs(near.y - b.food.y)
        ? { x: b.food.x + dx, y: b.food.y }
        : { x: b.food.x, y: b.food.y + dy }
    if (b.inBounds(cand) && !b.isObstacle(cand) && !s.occupiedGlobal(cand)) b.food = cand
  }
}
