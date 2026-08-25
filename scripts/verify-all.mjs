// verify-all.mjs —— 项目内一键全量验证脚本
// ───────────────────────────────────────────────────────────────────────────
//   node scripts/verify-all.mjs
//
// 顺序跑：
//   1) 端到端自测 (8 节：空间/时间/响应式/关卡/多人/音效/真实 HMR/研调扩展)
//   2) Headless AI 自对弈 800 帧（验证 p1 真正被 AI 驱动）
//   3) Headless Multiplayer 演示 300 帧（p1 + cpu1 共存）
//   4) Headless 研调框架冒烟 200 帧（--powerups --mode=maze，验证新能力缝不崩溃）
//   5) Headless P4 模式冒烟 200 帧（--mode=obstacle，验证新增玩法不崩溃）
//   6) Headless P5 Boss 冒烟 200 帧（--boss=juggernaut，验证血条/攻击模式不崩溃）
//   7) Headless P6 跨模块冒烟 200 帧（--powerups --boss=juggernaut，验证 level/up 联动不崩溃）
//

// 全部通过 → 退出码 0；任一失败 → 退出码 1。
// 用 spawn + 子进程隔离，单节点失败不影响后续节点被跳过（按需打印）。
// ───────────────────────────────────────────────────────────────────────────
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')

function run(label, args) {
  return new Promise((resolveP) => {
    process.stdout.write(`\n── ${label} ──\n`)
    const child = spawn(process.execPath, args, { cwd: root, stdio: 'inherit' })
    let exited = false
    child.on('error', (e) => {
      if (exited) return
      exited = true
      process.stdout.write(`[错误] 无法启动 ${args.join(' ')}: ${e?.message || e}\n`)
      resolveP(false)
    })
    child.on('close', (code) => {
      if (exited) return
      exited = true
      resolveP(code === 0)
    })
  })
}

async function main() {
  process.stdout.write('=== Cordis 贪吃蛇 · 一键全量验证 ===\n')
  process.stdout.write(`时间：${new Date().toISOString()}\n`)
  process.stdout.write(`项目根：${root}\n\n`)

  const steps = [
    ['1) 端到端自测 (8 节：含研调扩展)',
      ['src/selftest.js']],
    ['2) Headless AI 自对弈 (p1 真被驱动, 800 帧)',
      ['src/index.js', '--headless', '--ticks=800']],
    ['3) Headless Multiplayer 演示 (p1 + cpu1, 300 帧)',
      ['src/index.js', '--headless', '--ticks=300', '--multiplayer']],
    ['4) Headless 研调框架冒烟 (--powerups --mode=maze, 200 帧)',
      ['src/index.js', '--headless', '--ticks=200', '--powerups', '--mode=maze']],
    ['5) Headless P4 模式冒烟 (--mode=obstacle, 200 帧)',
      ['src/index.js', '--headless', '--ticks=200', '--mode=obstacle']],
    ['6) Headless P5 Boss 冒烟 (--boss=juggernaut, 200 帧)',
      ['src/index.js', '--headless', '--ticks=200', '--boss=juggernaut']],
    ['7) Headless P6 跨模块冒烟 (--powerups --boss=juggernaut, 200 帧)',
      ['src/index.js', '--headless', '--ticks=200', '--powerups', '--boss=juggernaut']],
  ]

  const results = []
  for (const [label, args] of steps) {
    const ok = await run(label, args)
    results.push({ label, ok })
    if (!ok) process.stdout.write(`  ↳ 失败，但继续运行剩余步骤以便一次性看到全部问题\n`)
  }

  process.stdout.write('\n=== 汇总 ===\n')
  for (const r of results) process.stdout.write(`${r.ok ? '✅' : '❌'}  ${r.label}\n`)
  const allOk = results.every((r) => r.ok)
  process.stdout.write(allOk ? '\n🎉 全部通过\n' : '\n❗ 存在失败，请把上方原始输出贴回\n')
  process.exit(allOk ? 0 : 1)
}

main()
