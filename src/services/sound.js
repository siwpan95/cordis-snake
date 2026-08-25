// services/sound.js
// ───────────────────────────────────────────────────────────────────────────
// 音效服务（ctx.sound）—— 又一个可替换的"能力缝"。
//
// 它本身不发声，只把游戏事件翻译成 'sound/play' 事件并广播；具体怎么出声
// 由后端插件决定（sound-beep 用终端蜂鸣、sound-wav 用合成 WAV）。没有任何
// 后端挂载时 play() 是空操作——音效对游戏逻辑零侵入、零致命。
// ───────────────────────────────────────────────────────────────────────────
import { Service } from 'cordis'

export class SoundService extends Service {
  static provide = 'sound'

  constructor(ctx, config = {}) {
    super(ctx, 'sound')
    this.enabled = config.enabled !== false
    this.volume = config.volume ?? 1
  }

  /** 播放一个具名音效（eat / levelup / crash / die ...）。 */
  play(name, opts = {}) {
    if (!this.enabled) return
    this.ctx.emit('sound/play', { name, ...opts })
  }
}
