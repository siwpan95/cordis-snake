// services/input.js
// ───────────────────────────────────────────────────────────────────────────
// 输入服务（ctx.input）—— 一个稳定、常驻的能力服务（capability seam）。
//
// 多人化后，方向按"蛇 id"区分：每条蛇有自己的 dir 与 source。键盘 / AI
// 仍然是两个"驱动插件"，各自向这个稳定服务喂对应蛇的方向。好处不变：
//   · 热插拔 = 挂载/卸载一个驱动插件，只回收它自己的监听器（revertible
//     effect），绝不会触发"卸载被依赖的 provider"那条易崩的级联路径；
//   · 仍然"一切皆插件"：换控制方式只是换驱动插件，移动逻辑零改动。
// ───────────────────────────────────────────────────────────────────────────
import { Service } from 'cordis'

export class InputService extends Service {
  static provide = 'input'

  constructor(ctx, config = {}) {
    super(ctx, 'input')
    this.dirs = {} // id -> {x,y}
    this.sources = {} // id -> 'keyboard' | 'ai' | ...
    this.defaultDir = { x: 1, y: 0 }
  }

  /** 确保某条蛇有方向记录（默认向右）。 */
  ensure(id, dir = this.defaultDir) {
    if (!this.dirs[id]) {
      this.dirs[id] = { ...dir }
      if (!this.sources[id]) this.sources[id] = 'none'
    }
  }

  /**
   * 设定某条蛇的方向：拒绝 180° 反向（相对该蛇自身当前方向），
   * 广播 'input/direction' 供其它插件监听。
   */
  setDirection(id, dir, source) {
    this.ensure(id)
    const cur = this.dirs[id]
    if (dir.x === -cur.x && dir.y === -cur.y) return // 不可掉头
    this.dirs[id] = dir
    if (source) this.sources[id] = source
    this.ctx.emit('input/direction', { id, dir })
  }

  dirOf(id) {
    this.ensure(id)
    return this.dirs[id]
  }

  /** 兼容旧读取：返回主蛇 p1 的方向。 */
  get currentDir() {
    return this.dirOf('p1')
  }
}
