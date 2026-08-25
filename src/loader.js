// loader.js
// ───────────────────────────────────────────────────────────────────────────
// 声明式组合 + 真实 HMR（Hot Module Reload）。
//
// 核心理念（DeepSeek Harness 的 cordis.yml 思路）："游戏由哪些插件构成"完全
// 是一份数据（manifest.json），而不是写死的代码。换渲染器、加关卡、加多人、
// 换音效后端，都只是改动这份清单。
//
// HMR 机制用的是 Cordis 原生的 scope 原语（core rc.8 不自带文件监听器的
// Loader 类，那在 @cordis/loader / @koishijs/loader 里；但 scope 级的
// 热重载就是 Cordis 的真实机制）：
//   · 每个挂载的插件都持有一个 Fiber；
//   · 配置变更 → 对受影响 Fiber 调 fiber.update()（框架自动回滚/重建 effect）；
//   · provider 插件变更 → dispose 它及其依赖者再重新 plugin（保证依赖图一致）；
//   · 插件增删 → dispose / plugin；
//   · 监听 manifest 文件，变更即触发上述 diff —— 这就是真正的"热插拔"。
// ───────────────────────────────────────────────────────────────────────────
import { watch } from 'node:fs'
import { readManifest } from './manifest.js'
import {
  TimerService,
  BoardService,
  InputService,
  SnakesService,
  SoundService,
  foodPlugin,
  scorePlugin,
  aiPlugin,
  keyboardPlugin,
  keyboardP2Plugin,
  snakePlugin,
  rendererPlugin,
  gamePlugin,
  levelPlugin,
  multiplayerPlugin,
  soundBeepPlugin,
  soundWavPlugin,
  soundHooksPlugin,
  loggerConsolePlugin,
  PowerupService,
  powerupSpawnPlugin,
  AchievementService,
  achievementTrackPlugin,
  ThemeService,
  themePalettePlugin,
  modePlugin,
  bossPlugin,
  particlePlugin,
  ComboService,
  StorageService,
  AuditService,
} from './plugins/index.js'

export const REGISTRY = {
  timer: TimerService,
  board: BoardService,
  input: InputService,
  snakes: SnakesService,
  sound: SoundService,
  food: foodPlugin,
  score: scorePlugin,
  'input-ai': aiPlugin,
  'input-keyboard': keyboardPlugin,
  'input-keyboard-p2': keyboardP2Plugin,
  snake: snakePlugin,
  'renderer-terminal': rendererPlugin,
  game: gamePlugin,
  level: levelPlugin,
  multiplayer: multiplayerPlugin,
  'sound-beep': soundBeepPlugin,
  'sound-wav': soundWavPlugin,
  'sound-hooks': soundHooksPlugin,
  'logger-console': loggerConsolePlugin,
  // ── 研调扩展 ──
  powerups: PowerupService,
  'powerup-spawn': powerupSpawnPlugin,
  achievements: AchievementService,
  'achievement-track': achievementTrackPlugin,
  themes: ThemeService,
  'theme-palettes': themePalettePlugin,
  modes: modePlugin,
  boss: bossPlugin,
  particles: particlePlugin,
  // ── 跨模块收口（P6）──
  combo: ComboService,
  storage: StorageService,
  // ── 安全审计（P-C / B16）──
  audit: AuditService,
}

function pluginMeta(plugin) {
  if (!plugin) return { provides: null, injects: [] }
  const provides = plugin.provide ?? (plugin.static && plugin.static.provide) ?? null
  const injects = plugin.inject ?? []
  return { provides, injects: Array.isArray(injects) ? injects : Object.keys(injects || {}) }
}

/**
 * 规范化比较两段配置：键序无关、递归处理对象/数组。
 * 避免等价配置因键序不同或嵌套顺序差异而误触发 provider 重载。
 * （manifest 为纯 JSON，函数/undefined 不应出现；若万一出现，按其位置字符串化。）
 */
function stableStringify(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v)
  if (Array.isArray(v)) return '[' + v.map(stableStringify).join(',') + ']'
  const keys = Object.keys(v).sort()
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + stableStringify(v[k])).join(',') + '}'
}

export function configEqual(a, b) {
  return stableStringify(a ?? {}) === stableStringify(b ?? {})
}

/**
 * 基于 Cordis scope 原语的真实 HMR Loader。
 */
export class CordisLoader {
  /**
   * @param {import('cordis').Context} ctx
   * @param {Record<string, any>} registry 名字 → 插件
   * @param {{ manifestPath?: string }} opts
   */
  constructor(ctx, registry, opts = {}) {
    this.ctx = ctx
    this.registry = registry
    this.manifestPath = opts.manifestPath
    this.fibers = {} // 名字 → Fiber
    this.watcher = null
  }

  /** 首次装载：按 manifest 建立全部插件 Fiber。 */
  load(manifest, overrides = {}) {
    const fibers = {}
    for (const entry of manifest.plugins) {
      if (entry.enabled === false) continue
      const plugin = this.registry[entry.name]
      if (!plugin) {
        this.ctx.logger.warn(`跳过未知插件: ${entry.name}`)
        continue
      }
      const config = { ...(entry.config ?? {}), ...(overrides[entry.name] ?? {}) }
      fibers[entry.name] = this.ctx.plugin(plugin, config)
    }
    this.fibers = fibers
    return this.fibers
  }

  /** 热重载：与旧 Fiber 集合做 diff，最小代价地应用 manifest 变更。 */
  async reload(manifest, overrides = {}) {
    const desired = new Map()
    for (const e of manifest.plugins) {
      if (e.enabled === false) continue
      if (!this.registry[e.name]) continue
      desired.set(e.name, { ...(e.config ?? {}), ...(overrides[e.name] ?? {}) })
    }
    const current = new Set(Object.keys(this.fibers))
    const next = new Set(desired.keys())

    // 1) 移除：启用集里消失的插件 → dispose（await 旧 fiber 注销，避免重挂竞态）。
    for (const name of current) {
      if (!next.has(name)) {
        this.ctx.logger.info(`[HMR] 卸载 ${name}`)
        await this._dispose(name)
      }
    }
    // 2) 新增：启用集里出现的插件 → plugin。
    for (const name of next) {
      if (!current.has(name)) {
        this.ctx.logger.info(`[HMR] 挂载 ${name}`)
        this.fibers[name] = this.ctx.plugin(this.registry[name], desired.get(name))
      }
    }
    // 3) 变更：配置不同的插件，按"是否 provider"选择 reload 策略。
    for (const name of next) {
      if (!current.has(name)) continue
      const f = this.fibers[name]
      const newCfg = desired.get(name)
      if (!configEqual(f.config, newCfg)) await this._reloadEntry(name, newCfg)
    }
    return this.fibers
  }

  _dispose(name) {
    const f = this.fibers[name]
    if (!f) return Promise.resolve()
    delete this.fibers[name]
    return f.dispose().catch(() => {})
  }

  /** 求 provider 的「全部传递依赖者」闭包（含自身）：沿 inject→provide 链向下遍历。 */
  _dependentsClosure(name) {
    const result = new Set([name])
    const queue = [name]
    while (queue.length) {
      const cur = queue.shift()
      const provides = pluginMeta(this.registry[cur]).provides
      if (!provides) continue
      for (const other of Object.keys(this.fibers)) {
        if (result.has(other)) continue
        if (pluginMeta(this.registry[other]).injects.includes(provides)) {
          result.add(other)
          queue.push(other)
        }
      }
    }
    return result
  }

  /** 依赖图拓扑序：provider（被依赖者）在前，dependent 在后，确保重挂时依赖先就绪。 */
  _topoOrder(names) {
    const set = new Set(names)
    const ordered = []
    const seen = new Set()
    const visit = (n) => {
      if (seen.has(n)) return
      seen.add(n)
      for (const dep of pluginMeta(this.registry[n]).injects) {
        for (const d of names) {
          if (d === n) continue
          if (pluginMeta(this.registry[d]).provides === dep) visit(d)
        }
      }
      ordered.push(n)
    }
    for (const n of names) visit(n)
    return ordered
  }

  async _reloadEntry(name, newCfg) {
    const meta = pluginMeta(this.registry[name])
    if (!meta.provides) {
      // 普通插件：用 Cordis 原生 update() 重新执行（effect 自动回滚重建）。
      this.ctx.logger.info(`[HMR] update ${name}`)
      this.fibers[name].update(newCfg)
      return
    }
    // provider 变更：连同「全部传递依赖者」一起 dispose+replugin（依赖图闭包），
    // 避免 A→B→C 多级依赖下只重挂 B、C 仍持陈旧 ctx.B 引用的级联陈旧问题。
    const closure = this._dependentsClosure(name)
    const cfgs = {}
    for (const d of closure) cfgs[d] = d === name ? newCfg : this.fibers[d]?.config
    const deps = [...closure].filter((x) => x !== name)
    this.ctx.logger.info(`[HMR] 重载 provider ${name}（含依赖 ${deps.join(',') || '无'}）`)
    const ordered = this._topoOrder([...closure])
    // 先按「依赖者优先」逆序 dispose，避免先摘被依赖者导致孤儿 effect。
    for (const d of [...ordered].reverse()) {
      if (this.fibers[d]) await this._dispose(d)
    }
    // 再按 provider 优先序重挂，保证 dependent 激活时读到最新 ctx.${provide}。
    for (const d of ordered) {
      this.fibers[d] = this.ctx.plugin(this.registry[d], cfgs[d])
    }
  }

  /** 处理一次 manifest 变更：读取 → reload（沿用 watch 时透传的 overrides）。供 fs 回调与测试复用。 */
  _handleManifestChange() {
    try {
      const manifest = readManifest(this.manifestPath)
      this.ctx.logger.info('[HMR] 检测到 manifest 变更，热重载中…')
      return this.reload(manifest, this._watchOverrides).catch((e) => {
        this.ctx.logger.warn('[HMR] 热重载失败: ' + e.message)
      })
    } catch (e) {
      this.ctx.logger.warn('[HMR] 读取/解析 manifest 失败: ' + e.message)
    }
  }

  /** 监听 manifest 文件，变更即热重载（带去抖）。overrides 透传进每次 reload，使 --headless --watch 重载后仍生效。 */
  watch(path = this.manifestPath, overrides = {}) {
    if (!path) return
    this.manifestPath = path
    this._watchOverrides = overrides
    let timer = null
    this.watcher = watch(path, () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => this._handleManifestChange(), 120)
    })
  }

  unwatch() {
    if (this.watcher) {
      this.watcher.close()
      this.watcher = null
    }
  }
}
