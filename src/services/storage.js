// services/storage.js
// ───────────────────────────────────────────────────────────────────────────
// 存档服务（ctx.storage）—— P6「跨模块收口」把"跨局进度"外置为可插拔能力。
//
// 默认纯内存（不落盘，零副作用）；配置 filePath 时持久化到 JSON 文件，重启可恢复。
// achievements 插件通过 ctx.get('storage') 懒读并持久化解锁集合，实现零侵入联动——
// 换存档后端（localStorage / 云）只改本服务，成就逻辑一行不动。
//
// 安全（P-A / B9）：filePath 一律解析到固定沙箱基目录（默认 <cwd>/.snake-data），
// 拒绝绝对路径与 `..` 穿越。manifest 若配置越界路径 → 构造即抛错（fail-closed），
// 游戏拒绝以被篡改的配置启动。
// ───────────────────────────────────────────────────────────────────────────
import { Service } from 'cordis'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { resolve, relative, isAbsolute, dirname, sep } from 'node:path'

export class StorageService extends Service {
  static provide = 'storage'

  constructor(ctx, config = {}) {
    super(ctx, 'storage')
    // 沙箱基目录：固定、绝对；可由配置覆盖（同样受 _safePath 约束，不可逃逸沙箱）。
    this.baseDir = config.baseDir ? resolve(config.baseDir) : resolve(process.cwd(), '.snake-data')
    // 校验落盘路径：越界即拒绝（fail-closed）。
    this.filePath = config.filePath ? this._safePath(config.filePath) : null
    this.data = {}
    if (this.filePath && existsSync(this.filePath)) {
      try {
        this.data = JSON.parse(readFileSync(this.filePath, 'utf-8'))
      } catch {
        this.data = {}
      }
    }
  }

  /**
   * 把用户给定的 filePath 解析进沙箱，越界则抛错。
   * @param {string} userPath
   * @returns {string} 沙箱内的绝对路径
   */
  _safePath(userPath) {
    const abs = resolve(this.baseDir, userPath)
    const rel = relative(this.baseDir, abs)
    // rel === '' 表示落在沙箱根（允许）；rel 以 '..'+sep 开头 / 为绝对路径表示逃逸（拒绝）。
    if (rel !== '' && (rel.startsWith('..' + sep) || isAbsolute(rel))) {
      this.ctx?.logger?.warn?.(`[storage] 拒绝越界路径 "${userPath}"（沙箱: ${this.baseDir}）`)
      throw new Error(`[storage] 拒绝越界路径 "${userPath}"：必须位于沙箱 ${this.baseDir} 之内`)
    }
    return abs
  }

  get(key, def) {
    return key in this.data ? this.data[key] : def
  }

  set(key, val) {
    this.data[key] = val
    this.flush()
    return val
  }

  all() {
    return { ...this.data }
  }

  /** 落盘（仅配置了 filePath）。失败静默，不阻断游戏。 */
  flush() {
    if (!this.filePath) return
    try {
      mkdirSync(dirname(this.filePath), { recursive: true })
      writeFileSync(this.filePath, JSON.stringify(this.data, null, 2))
    } catch {
      /* 无写权限 / 路径非法：忽略 */
    }
  }
}
