// plugins/sound-wav.js
// ───────────────────────────────────────────────────────────────────────────
// 音效后端（合成 WAV）—— 收到 'sound/play' 时现场合成一段短纯音 WAV，用
// Windows PowerShell 的 Media.SoundPlayer 播放，播完即删临时文件。
//
// 纯 JS 合成、无需原生依赖；在非 Windows / 无 PowerShell 环境下 try/catch
// 静默降级——音效对游戏逻辑零致命。这正体现"一切皆插件"：换音频后端只是
// 换一个监听 'sound/play' 的插件。
// ───────────────────────────────────────────────────────────────────────────
import { writeFileSync, unlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFile } from 'node:child_process'

// 具名音效: 频率 / 时长(秒)
const TONES = {
  eat: { freq: 880, dur: 0.06 },
  levelup: { freq: 1175, dur: 0.12 },
  crash: { freq: 140, dur: 0.25 },
  die: { freq: 200, dur: 0.18 },
  turn: { freq: 660, dur: 0.03 },
}

// 承载 WAV 路径的环境变量名（P-A / B17）：路径绝不内联进 PowerShell -Command 字符串，
// 而是经环境变量传入，彻底规避单引号路径破坏字面量导致注入/失效的问题。
const WAV_ENV = 'SNAKE_WAV_PATH'

/**
 * 构造播放命令（导出供测试断言）。
 * @param {string} wavPath 临时 WAV 文件的绝对/相对路径
 * @returns {{ args: string[], env: Record<string,string> }}
 */
export function soundCommandFor(wavPath) {
  // 路径只经 $env: 读取，命令体不含任何用户路径字面量 → 路径含 ' 也不破坏。
  const cmd = `$p=$env:${WAV_ENV}; if($p){ (New-Object Media.SoundPlayer $p).PlaySync() }`
  return { args: ['-NoProfile', '-Command', cmd], env: { [WAV_ENV]: wavPath } }
}

function makeWav(freq, dur) {
  const sr = 44100
  const n = Math.floor(sr * dur)
  const buf = Buffer.alloc(44 + n * 2)
  buf.write('RIFF', 0)
  buf.writeUInt32LE(36 + n * 2, 4)
  buf.write('WAVE', 8)
  buf.write('fmt ', 12)
  buf.writeUInt32LE(16, 16)
  buf.writeUInt16LE(1, 20) // PCM
  buf.writeUInt16LE(1, 22) // mono
  buf.writeUInt32LE(sr, 24)
  buf.writeUInt32LE(sr * 2, 28)
  buf.writeUInt16LE(2, 32)
  buf.writeUInt16LE(16, 34)
  buf.write('data', 36)
  buf.writeUInt32LE(n * 2, 40)
  for (let i = 0; i < n; i++) {
    const env = Math.max(0, 1 - i / (n * 0.15)) // 简单淡出，避免爆音
    const v = Math.sin((2 * Math.PI * freq * i) / sr) * 32767 * env
    buf.writeInt16LE((v | 0), 44 + i * 2)
  }
  return buf
}

export const soundWavPlugin = {
  name: 'sound-wav',
  inject: ['sound'],
  apply(ctx) {
    const off = ctx.on('sound/play', ({ name }) => {
      const t = TONES[name]
      if (!t) return
      try {
        const f = join(tmpdir(), `cordis_snake_${name}_${Date.now()}.wav`)
        writeFileSync(f, makeWav(t.freq, t.dur))
        const { args, env } = soundCommandFor(f)
        execFile('powershell', args, { env: { ...process.env, ...env } }, () => {
          try {
            unlinkSync(f)
          } catch {
            /* ignore */
          }
        })
      } catch {
        /* 无声即降级 */
      }
    })
    return () => off()
  },
}
