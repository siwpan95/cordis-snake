// services/timer.js
// ───────────────────────────────────────────────────────────────────────────
// 计时器服务（ctx.timer）—— 又一个"插件"，而不是框架内建能力。
//
// 这里刻意把"游戏主循环的心跳"做成一个可被替换的 Service：
//   · DeepSeek Harness 里 model-adapter / agent-loop / web-ui 全是插件，
//     没有特权核心；连 timer 本身也只是 Cordis 的一个插件。
//   · 我们用 ctx.effect() 注册 setInterval，返回一个 disposer。
//     论文《A Programming Paradigm for Spatiotemporal Composability》称这为
//     "revertible effect（可逆效应）"：插件卸载时框架按逆序自动调用
//     disposer，interval 被 clear，无需作者手写 deactivate()。
// ───────────────────────────────────────────────────────────────────────────
import { Service } from 'cordis'

export class TimerService extends Service {
  // `static provide` 让本 Service 以名字 'timer' 注册到 ctx 上（ctx.timer）。
  static provide = 'timer'

  constructor(ctx, config = {}) {
    super(ctx, 'timer')
    this.baseIntervalMs = config.intervalMs ?? 120
    this.intervalMs = this.baseIntervalMs
    this._dispose = null
    // 配置驱动的"是否自动心跳"——同样是数据，不是硬编码。
    if (config.auto !== false) this.start()
  }

  /** 启动自动心跳：每个 intervalMs 向总线广播一个 'tick' 事件。 */
  start() {
    if (this._dispose) return
    // 关键：把 setInterval 包进 ctx.effect，使其生命周期归 Fiber 所有。
    // 服务被卸载时，框架会自动 clearInterval，做到"时间可组合"。
    this._dispose = this.ctx.effect(() => {
      const id = setInterval(() => this.ctx.emit('tick'), this.intervalMs)
      return () => clearInterval(id)
    }, 'timer/interval')
  }

  /** 暂停心跳（运行时暂停，不卸载服务）。 */
  stop() {
    if (this._dispose) {
      this._dispose()
      this._dispose = null
    }
  }

  /** 手动步进一帧——自测/headless 模式下用来确定性地驱动游戏。 */
  tick() {
    this.ctx.emit('tick')
  }

  /** 复位：interval 回到基准值并重启心跳（满局重开时用）。 */
  reset() {
    this.stop()
    this.intervalMs = this.baseIntervalMs
    this.start()
  }
}
