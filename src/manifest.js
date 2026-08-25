// manifest.js
// ───────────────────────────────────────────────────────────────────────────
// 声明式 manifest 的安全读取（P-A / B10）。
//
// 读取 manifest.json 并（若同目录存在 `<manifest>.sha256` 侧车签名文件）校验其
// SHA256 完整性：内容或签名不匹配 → 抛错（fail-closed），游戏拒绝以被篡改的配置启动。
//
// 设计取舍：
//   · 签名是「可选但一旦存在即强制」——dev 不生成侧车则放行（零摩擦）；生产用
//     `scripts/sign-manifest.mjs` 生成侧车后，任何对 manifest 的篡改都会被阻断。
//   · 哈希针对「文件原始字节」（与签名脚本读取方式一致），而非 JSON.parse 后的对象，
//     避免格式化差异导致误判。
//   · 信任边界：谁能写 manifest（及其 .sha256 侧车），谁就拥有运行时配置权。生产应
//     使 manifest 只读、侧车不可写（见 README §信任边界）。
// ───────────────────────────────────────────────────────────────────────────
import { readFileSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'

/** 读取并（可选）校验 manifest 完整性。返回解析后的 manifest 对象。 */
export function readManifest(path) {
  const raw = readFileSync(path, 'utf-8')
  const manifest = JSON.parse(raw)

  const sigPath = path + '.sha256'
  if (existsSync(sigPath)) {
    const expected = readFileSync(sigPath, 'utf-8').trim().toLowerCase()
    const actual = createHash('sha256').update(raw).digest('hex')
    if (actual !== expected) {
      throw new Error(`[manifest] 签名校验失败: ${path}（内容或签名不匹配，疑似被篡改）`)
    }
  }
  return manifest
}

/** 计算 manifest 文件原始字节的 SHA256（供签名脚本复用，保证与 readManifest 一致）。 */
export function hashManifest(path) {
  return createHash('sha256').update(readFileSync(path, 'utf-8')).digest('hex')
}
