// services/themes.js
// ───────────────────────────────────────────────────────────────────────────
// 主题/皮肤服务（ctx.themes）—— 渲染层的"配色能力缝"。
//
// 研调指出现代蛇类游戏普遍支持"可换皮肤 / 按模式换配色"。这里把配色抽象成
// 一组调色板（palette），并把"蛇身描边样式"抽象成独立的 skin（与配色解耦）。
// 渲染器只读取 ctx.themes.get() / ctx.themes.skinOf()，换皮肤 = 换一个 palette
// 或一个 skin，游戏逻辑与渲染字符都无需改动（又一个可替换的 view seam）。
//
// P3 增强：
//   · 内置调色板从 4 套扩到 12 套；
//   · 新增独立 skin 注册表（solid/striped/scaled/chevron/circuit…），演示
//     颜色与描边解耦；
//   · 每套调色板带 colors{kind} 的 ANSI 码，供粒子按事件类型取主题色着色。
// ───────────────────────────────────────────────────────────────────────────
import { Service } from 'cordis'

// 每套调色板按事件类型给出 4 个 ANSI 前景色（粒子着色用）。
// 8 色 ANSI：30黑 31红 32绿 33黄 34蓝 35品红 36青 37白，90-97 为亮色。
const C = (eat, power, die, over) => ({ eat, power, die, over })

export class ThemeService extends Service {
  static provide = 'themes'

  constructor(ctx, config = {}) {
    super(ctx, 'themes')
    this.current = config.theme || 'classic'
    this.currentSkin = config.skin || 'solid'
    this.palettes = {}
    this.skins = {}

    // ── 12 套内置调色板（渲染字符必须 ASCII/单宽安全）─────────────────────
    this.register('classic', {
      wall: '#', food: '*', body: 'o', head: null, powerup: '◆', particle: '·', status: '',
      colors: C('\x1b[33m', '\x1b[35m', '\x1b[31m', '\x1b[36m'),
    })
    this.register('neon', {
      wall: '█', food: '●', body: '▓', head: null, powerup: '✦', particle: '✧', status: '\x1b[36m',
      colors: C('\x1b[36m', '\x1b[35m', '\x1b[31m', '\x1b[32m'),
    })
    this.register('retro', {
      wall: '▓', food: '♦', body: '░', head: null, powerup: '★', particle: '·', status: '',
      colors: C('\x1b[33m', '\x1b[35m', '\x1b[31m', '\x1b[37m'),
    })
    this.register('mono', {
      wall: '#', food: 'O', body: '.', head: null, powerup: '+', particle: ':', status: '',
      colors: C('\x1b[37m', '\x1b[37m', '\x1b[37m', '\x1b[37m'),
    })
    this.register('sunset', {
      wall: '#', food: '☀', body: '░', head: null, powerup: '✿', particle: '·', status: '',
      colors: C('\x1b[33m', '\x1b[31m', '\x1b[35m', '\x1b[31m'),
    })
    this.register('matrix', {
      wall: '▒', food: '❖', body: '▓', head: null, powerup: '⟡', particle: '⋮', status: '',
      colors: C('\x1b[32m', '\x1b[32m', '\x1b[31m', '\x1b[36m'),
    })
    this.register('ocean', {
      wall: '≈', food: '✦', body: '▓', head: null, powerup: '◉', particle: '∙', status: '',
      colors: C('\x1b[34m', '\x1b[36m', '\x1b[31m', '\x1b[34m'),
    })
    this.register('forest', {
      wall: '♣', food: '❀', body: '░', head: null, powerup: '✤', particle: '·', status: '',
      colors: C('\x1b[32m', '\x1b[33m', '\x1b[31m', '\x1b[32m'),
    })
    this.register('candy', {
      wall: '✿', food: '❤', body: '▒', head: null, powerup: '✷', particle: '·', status: '',
      colors: C('\x1b[35m', '\x1b[36m', '\x1b[31m', '\x1b[35m'),
    })
    this.register('ember', {
      wall: '▓', food: '✦', body: '▒', head: null, powerup: '✸', particle: '·', status: '',
      colors: C('\x1b[31m', '\x1b[33m', '\x1b[31m', '\x1b[33m'),
    })
    this.register('ice', {
      wall: '░', food: '❄', body: '▒', head: null, powerup: '✦', particle: '·', status: '',
      colors: C('\x1b[36m', '\x1b[37m', '\x1b[34m', '\x1b[36m'),
    })
    this.register('vapor', {
      wall: '▒', food: '✺', body: '▓', head: null, powerup: '✶', particle: '·', status: '',
      colors: C('\x1b[35m', '\x1b[36m', '\x1b[34m', '\x1b[32m'),
    })

    // ── 皮肤：蛇身/蛇头的"描边样式"（与配色解耦）─────────────────────────
    // pattern 为 null → 直接用调色板的 body 字符；否则按 body 段序号交替取字形。
    this.registerSkin('solid', { pattern: null })
    this.registerSkin('striped', { pattern: ['▓', '▒'] })
    this.registerSkin('scaled', { pattern: ['░', '▒'] })
    this.registerSkin('chevron', { pattern: ['◄', '►'] })
    this.registerSkin('circuit', { pattern: ['╬', '╫'] })
  }

  register(name, p) {
    this.palettes[name] = p
  }

  registerSkin(name, s) {
    this.skins[name] = s
  }

  set(name) {
    if (this.palettes[name]) this.current = name
  }

  setSkin(name) {
    if (this.skins[name]) this.currentSkin = name
  }

  get() {
    return this.palettes[this.current] || this.palettes['classic']
  }

  // 当前皮肤定义；渲染器据 pattern 决定每段蛇身字符。
  skinOf() {
    return this.skins[this.currentSkin] || this.skins['solid']
  }

  list() {
    return Object.keys(this.palettes)
  }

  skinsList() {
    return Object.keys(this.skins)
  }
}
