// plugins/achievements.js
// ───────────────────────────────────────────────────────────────────────────
// 成就追踪插件（achievement-track）—— 把"游戏事件"翻译成"成就解锁"。
//
// P2 重构为「数据驱动」：
//   - 成就定义全部外置到 src/achievements-data.js（纯数据 + check(stats) 谓词）；
//   - 本插件只负责：① 注册全部定义 ② 把各类事件累计进 stats 快照
//     ③ 每次事件后重算尚未解锁的成就。换一套成就 = 改数据文件，本文件不动。
//
// 它只 inject 成就服务本身；其它能力（snakes/score/modes/level）都用 ctx.get()
// 懒读取——这些服务可能不在场（默认 disabled），用 get 不会触发 Cordis 的
// inject 守卫，插件始终保持 ACTIVE 而非 PENDING。
// ───────────────────────────────────────────────────────────────────────────
import { ACHIEVEMENTS } from '../achievements-data.js'

export const achievementTrackPlugin = {
  name: 'achievement-track',
  inject: ['achievements'],
  apply(ctx) {
    const A = ctx.achievements

    // 1) 数据外置：把所有成就定义登记进服务。
    for (const a of ACHIEVEMENTS) {
      A.define(a.id, {
        name: a.name,
        desc: a.desc,
        category: a.category,
        grade: a.grade,
        hidden: !!a.hidden,
      })
    }

    // 2.5) 跨模块收口（P6）：若挂了存档服务，启动即恢复已解锁集合；
    //      每次解锁后持久化。懒读 ctx.get('storage')，未挂载则不持久化。
    const storage = ctx.get('storage')
    if (storage) {
      const saved = storage.get('achievements', [])
      if (Array.isArray(saved)) for (const id of saved) A.unlock(id) // 恢复（空操作若已解锁）
    }

    // 2) 运行时累计统计快照（被各事件喂养，供 check(stats) 判定）。
    const stats = {
      eats: 0,
      maxLen: 0,
      score: 0,
      pickups: 0,
      pickupTypes: 0,
      combos: 0,
      ticks: 0,
      deaths: 0,
      bossDeaths: 0,
      bossDefeated: 0,
      levels: 0,
      modesPlayed: 0,
      gameOvers: 0,
    }
    const typesSeen = new Set() // 拾取过的道具种类
    const modesSeen = new Set() // 体验过的模式名

    // 3) 重算：遍历未解锁成就，达标即解锁（幂等，unlock 内部去重）。
    const evaluate = () => {
      for (const a of ACHIEVEMENTS) {
        if (A.isUnlocked(a.id)) continue
        try {
          if (a.check(stats)) A.unlock(a.id)
        } catch {
          /* 单条谓词异常不影响其它成就 */
        }
      }
    }

    // 观测最长蛇身（每帧 / 每次进食刷新）。
    const refreshLen = () => {
      const sn = ctx.get('snakes')
      if (!sn) return
      for (const s of sn.list) {
        if (s.alive && s.body.length > stats.maxLen) stats.maxLen = s.body.length
      }
    }

    // 记录当前模式（modes 插件在场时）。
    const recordMode = () => {
      const m = ctx.get('modes')?.current
      if (m) {
        modesSeen.add(m)
        stats.modesPlayed = modesSeen.size
      }
    }

    const offs = [
      ctx.on('achievement/unlock', () => {
        if (storage) storage.set('achievements', A.list().map((a) => a.id)) // 持久化解锁集合
      }),
      ctx.on('snake/eat', ({ id }) => {
        stats.eats += 1
        refreshLen()
        const sc = ctx.get('score')
        if (sc) stats.combos = Math.max(stats.combos, sc.combo(id) || 0)
        evaluate()
      }),
      ctx.on('score/change', ({ score, combo }) => {
        if (typeof score === 'number') stats.score = Math.max(stats.score, score)
        if (typeof combo === 'number') stats.combos = Math.max(stats.combos, combo)
        evaluate()
      }),
      ctx.on('powerup/pickup', ({ type }) => {
        stats.pickups += 1
        if (type) {
          typesSeen.add(type)
          stats.pickupTypes = typesSeen.size
        }
        evaluate()
      }),
      ctx.on('level/up', ({ level }) => {
        if (typeof level === 'number') stats.levels = Math.max(stats.levels, level)
        evaluate()
      }),
      ctx.on('snake/die', ({ reason }) => {
        stats.deaths += 1
        if (reason === 'boss') stats.bossDeaths += 1
        evaluate()
      }),
      // Boss 系统（P5）落地的击败事件：提前监听，联动零成本。
      ctx.on('boss/defeated', () => {
        stats.bossDefeated += 1
        evaluate()
      }),
      ctx.on('tick', () => {
        stats.ticks += 1
        refreshLen()
        recordMode()
        evaluate()
      }),
      ctx.on('game/over', () => {
        stats.gameOvers += 1
        recordMode()
        evaluate()
      }),
    ]

    return () => offs.forEach((o) => o())
  },
}
