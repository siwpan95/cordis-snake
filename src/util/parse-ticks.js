// util/parse-ticks.js
// ───────────────────────────────────────────────────────────────────────────
// B18：--ticks 启动参数校验（无副作用的纯函数，供 index.js 与 selftest 共享）。
//
// 旧逻辑：`Number(ticksArg.split('=')[1])` 对 `--ticks=abc` 得到 NaN 静默跳过、
// 对 `--ticks=1e9` 等超大值存在死循环/内存风险。这里集中收敛校验：
//   · 必须是正整数（Number.isInteger）；
//   · 1 <= n <= TICKS_MAX（上限防死循环）；
//   · 非法值统一回退默认 TICKS_DEFAULT，并标记 ok=false 供调用方告警。
// ───────────────────────────────────────────────────────────────────────────
export const TICKS_DEFAULT = 400
export const TICKS_MAX = 100000

/**
 * @param {string|undefined} arg 形如 `--ticks=400` 的命令行参数，或 undefined。
 * @returns {{ value:number, ok:boolean, raw?:string }}
 */
export function parseTicks(arg) {
  if (!arg) return { value: TICKS_DEFAULT, ok: true }
  const raw = arg.split('=')[1] ?? ''
  const n = Number(raw)
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0 || n > TICKS_MAX) {
    return { value: TICKS_DEFAULT, ok: false, raw }
  }
  return { value: n, ok: true, raw }
}
