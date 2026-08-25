// plugins/score.js
// ───────────────────────────────────────────────────────────────────────────
// 分数统计插件（ctx.score）—— 通过监听 'snake/eat' 按蛇 id 累加分数。
//
// 多蛇下分数天然是"每蛇一份"；单蛇时 get() 默认返回 p1。它不持有游戏状态、
// 不参与移动，只是"对事件做出反应"。分数服务用 ctx.provide 暴露出去，
// UI / 自测可注入并按 id 读取。卸载时监听器与服务一并被框架回收。
//
// P1 新增 combo 连锁倍率（Endless Snake 式）：连续进食落在时间窗口内则倍率
// 逐级 +1，最高 5×；窗口外断连即重置。倍率同时叠加 multiplier 道具（×3）。
// ───────────────────────────────────────────────────────────────────────────
export const scorePlugin = {
  name: 'score',
  inject: ['board'],
  apply(ctx) {
    const scores = new Map() // id -> number
    // 连锁：优先用全局 combo 能力缝（P6）；未挂载时退回本插件内部实现（向后兼容）。
    const comboApi = () => ctx.get('combo')
    const localMap = new Map() // id -> { count, lastTick }
    let tickCount = 0
    const COMBO_WINDOW = 8 // tick 窗口：超过则断连
    const MAX_COMBO = 5 // 倍率上限 ×5

    const comboCount = (id) => {
      const c = comboApi()
      if (c) return c.count(id)
      return Math.min(localMap.get(id)?.count || 0, MAX_COMBO)
    }
    const comboMult = (id) => Math.max(1, comboCount(id))
    const bumpCombo = (id) => {
      const c = comboApi()
      if (c) { c.bump(id); return }
      const e = localMap.get(id) || { count: 0, lastTick: -9999 }
      e.count = tickCount - e.lastTick <= COMBO_WINDOW ? e.count + 1 : 1
      e.lastTick = tickCount
      localMap.set(id, e)
    }

    const addScore = (id, amount = 1) => {
      const power = ctx.get('powerups')
      const mult = power?.isActive(id, 'multiplier') ? 3 : 1
      const amt = amount * comboMult(id) * mult
      scores.set(id, (scores.get(id) ?? 0) + amt)
      ctx.emit('score/change', { id, score: scores.get(id), combo: comboCount(id) })
    }

    // 心跳计数 + 窗口外断连回收（仅内部实现需要；全局缝自带）。
    const offTick = ctx.on('tick', () => {
      tickCount++
      for (const [id, e] of localMap) {
        if (tickCount - e.lastTick > COMBO_WINDOW) localMap.delete(id)
      }
    })

    // 进食：先累积 combo，再按（combo × multiplier）计分。
    const offEat = ctx.on('snake/eat', ({ id }) => {
      bumpCombo(id)
      addScore(id, 1)
    })

    // 即时加分（golden 等）：不参与 combo 累积，但享受当前倍率。
    const offAdd = ctx.on('score/add', ({ id, amount = 1 }) => addScore(id, amount))

    const clear = () => {
      scores.clear()
      localMap.clear()
      comboApi()?.reset?.()
      ctx.emit('score/change', { id: 'p1', score: 0, combo: 0 })
    }

    const disposeProvide = ctx.provide('score', {
      get: (id = 'p1') => scores.get(id) ?? 0,
      combo: (id = 'p1') => comboCount(id),
      leaderboard: () =>
        [...scores.entries()]
          .map(([id, s]) => ({ id, score: s }))
          .sort((a, b) => b.score - a.score),
      reset: clear,
    })

    const offReset = ctx.on('game/reset', clear)

    return () => {
      offTick()
      offEat()
      offAdd()
      offReset()
      disposeProvide()
    }
  },
}
