// plugins/logger-console.js
// ───────────────────────────────────────────────────────────────────────────
// 控制台日志导出插件 —— 连"日志"都是一个可替换的插件。
//
// Cordis 自带 ctx.logger（一个 Service），但默认只把日志缓冲进内存。
// 真正的"写到哪里"由 exporter 决定。DeepSeek Harness 的 logger-console
// 也是插件。这里我们把它接到 stderr，避免污染 stdout 上的终端画面。
// ───────────────────────────────────────────────────────────────────────────
export const loggerConsolePlugin = {
  name: 'logger-console',
  apply(ctx) {
    const fmt = (a) => {
      if (a instanceof Error) return a.stack || a.message
      if (typeof a === 'object' && a !== null) return JSON.stringify(a)
      return String(a)
    }

    const disposeExporter = ctx.logger.exporter({
      colors: 1,
      export(message) {
        if (message.type === 'debug') return
        const ts = new Date(message.ts).toISOString().slice(11, 23)
        const text = message.args.map(fmt).join(' ')
        process.stderr.write(`${ts} ${message.name} ${message.type} ${text}\n`)
      },
    })

    return disposeExporter
  },
}
