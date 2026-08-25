// scripts/sign-manifest.mjs —— 为 manifest 生成 SHA256 完整性签名侧车
// ───────────────────────────────────────────────────────────────────────────
// 用法：
//   node scripts/sign-manifest.mjs [manifest.json]
// 默认对 ./manifest.json 计算原始字节 SHA256，写入同目录 <manifest>.sha256。
// 之后 src/manifest.js 的 readManifest 会在每次加载（含 --watch 热重载）时校验：
// 内容或签名不匹配即拒绝（fail-closed）。
//
// 生产部署建议：生成侧车后使 manifest.json 与 *.sha256 只读，任何配置变更都
// 需重新运行本脚本。dev 环境不生成侧车即可免校验自由编辑。
// ───────────────────────────────────────────────────────────────────────────
import { readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'

const target = resolve(process.argv[2] || 'manifest.json')
const raw = readFileSync(target, 'utf-8')
const hash = createHash('sha256').update(raw).digest('hex')
writeFileSync(target + '.sha256', hash + '\n', 'utf-8')
process.stdout.write(`已签名: ${target}\n  -> ${target}.sha256\n  sha256: ${hash}\n`)
