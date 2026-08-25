// services/combo.js
// ───────────────────────────────────────────────────────────────────────────
// 连锁服务（ctx.combo）—— P6「跨模块收口」把"连锁倍率"从 score 插件的私有
// 闭包提升为**一等跨模块能力缝**：任何插件（成就 / 渲染 / Boss / 模式）都能直接
// 读 ctx.combo，而不必耦合 score。score 插件通过 ctx.get('combo') 懒读并委托，
// 未挂载时退回自身内部实现（保持向后兼容，旧自测零改动）。
//
// 设计（Endless Snake 式）：连续进食落在时间窗口内则倍率逐级 +1，最高 ×5；
// 窗口外断连即重置（revertible：卸载服务，连锁状态随之回收）。
// ───────────────────────────────────────────────────────────────────────────
import { Service } from 'cordis'

export class ComboService extends Service {
  static provide = 'combo'

  constructor(ctx, config = {}) {
    super(ctx, 'combo')
    this.window = config.window ?? 8 // 连锁窗口（tick）
    this.max = config.max ?? 5 // 倍率上限 ×5
    this.map = new Map() // id -> { count, lastTick }
    this.tick = 0
    // 心跳：推进帧计数 + 窗口外断连回收。监听器挂在服务 ctx 上，卸载自动回收。
    ctx.on('tick', () => {
      this.tick++
      for (const [id, c] of this.map) {
        if (this.tick - c.lastTick > this.window) this.map.delete(id)
      }
    })
  }

  /** 进食一口：窗口内续连 +1，否则重置为 1。返回当前连锁数。 */
  bump(id) {
    const c = this.map.get(id) || { count: 0, lastTick: -9999 }
    c.count = this.tick - c.lastTick <= this.window ? c.count + 1 : 1
    c.lastTick = this.tick
    this.map.set(id, c)
    const count = this.count(id)
    this.ctx.emit('combo/change', { id, combo: count, mult: this.mult(id) })
    return count
  }

  count(id) {
    return Math.min(this.map.get(id)?.count ?? 0, this.max)
  }

  /** 连锁倍率（1..max）。 */
  mult(id) {
    return Math.max(1, this.count(id))
  }

  best(id) {
    return this.count(id)
  }

  reset() {
    this.map.clear()
  }
}
