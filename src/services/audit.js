// services/audit.js
// ───────────────────────────────────────────────────────────────────────────
// 安全审计日志服务（ctx.audit）—— P-C / B16「联网/多人前补安全审计日志」。
//
// 当前游戏为本地单人对局（多人为本地 AI 对手，无真正联网）；本服务的定位是
// 在「对局边界 + 玩家生命周期」处留下结构化审计轨迹，未来接入真实联网/多人
// 时即可直接复用，无需改动审计逻辑。
//
// 设计原则：
//   · 零侵入——只订阅既有的 game/* 与 snake/die 事件，不改任何游戏规则；
//   · 结构化——每条 entry 含时间戳 t、category、event 与任意 data，便于检索；
//   · 可观测——同时写入 ctx.logger（[audit] 前缀），并 emit('audit/entry') 供
//     测试/下游消费；entries 数组保留完整现场，便于事后溯源；
//   · 订阅挂在服务自身 ctx 上（与 ComboService 订阅 tick 同构），服务卸载即自动回收。
// ───────────────────────────────────────────────────────────────────────────
import { Service } from 'cordis'

export class AuditService extends Service {
  static provide = 'audit'

  constructor(ctx, config = {}) {
    super(ctx, 'audit')
    this.maxEntries = config.maxEntries ?? 1000
    this.entries = []
    ctx.on('audit/record', (entry) => this._push(entry)) // 允许外部直接投递

    // ── 订阅既有对局事件 → 结构化审计（以下事件均在代码内已 emit）──
    // 注意：用 ctx.get('snakes') 懒读，避免对 snakes 服务的硬 inject 依赖
    // （与 SnakesService.occupiedGlobal 同构），使审计服务零侵入依赖图。
    ctx.on('game/reset', () => {
      const snakes = ctx.get('snakes')
      const participants = snakes
        ? snakes.list.map((s) => ({ id: s.id, source: s.source }))
        : []
      this.log('round', 'start', { participants })
    })
    ctx.on('game/over', (reason) => {
      this.log('round', 'end', { reason: reason ?? 'unknown' })
    })
    ctx.on('game/quit', () => {
      this.log('session', 'end', {})
    })
    ctx.on('snake/die', ({ id, reason }) => {
      this.log('player', 'leave', { id, reason: reason ?? 'unknown' })
    })
  }

  /** 记录一条审计条目。 */
  log(category, event, data = {}) {
    const entry = { t: Date.now(), category, event, ...data }
    this._push(entry)
    this.ctx.logger.info(`[audit] ${category}/${event} ${JSON.stringify(data)}`)
    this.ctx.emit('audit/entry', entry)
    return entry
  }

  _push(entry) {
    this.entries.push(entry)
    // 上限保护：超出则丢弃最旧条目（审计重在近期现场）。
    if (this.entries.length > this.maxEntries) {
      this.entries.splice(0, this.entries.length - this.maxEntries)
    }
  }

  /** 取最近 n 条（默认全部）。 */
  recent(n) {
    return n ? this.entries.slice(-n) : [...this.entries]
  }

  clear() {
    this.entries.length = 0
  }
}
