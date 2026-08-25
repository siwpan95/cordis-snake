// src/achievements-data.js
// ───────────────────────────────────────────────────────────────────────────
// 成就数据外置（P2 调研扩充）。
//
// 设计原则（Everything is a Plugin 的延伸：一切皆数据）：
//   换一套成就 = 换这个文件（或换 achievement-track 插件），服务与追踪逻辑零改动。
//   每条成就只描述"是什么 + 何时达成"，不写"怎么监听事件"——事件→stats 的映射
//   在 track 插件里统一处理，成就定义保持纯数据、可独立校验（JSON 友好）。
//
// 字段：
//   id      唯一键
//   name    展示名
//   category 8 大类之一
//   grade   bronze / silver / gold / platinum
//   desc    达成说明
//   hidden  隐藏成就（默认 false，解锁前不在 UI 展示）
//   check(stats) -> bool  达成判定；stats 由 track 插件在运行时累计（见下）
//
// stats 快照字段（track 插件维护）：
//   eats        累计进食份数
//   maxLen      观测到的最长蛇身
//   score       单局最高分（取所有蛇最高）
//   pickups     累计拾取道具次数
//   pickupTypes 拾取过的不同道具种类数
//   combos      观测到的最高连锁倍率
//   ticks       累计心跳帧数
//   deaths      累计死亡次数
//   bossDeaths  被 Boss 消灭次数
//   bossDefeated 累计击败 Boss 数
//   levels      抵达过的最高关卡
//   modesPlayed 体验过的不同模式数
//   gameOvers   游戏结束次数
// ───────────────────────────────────────────────────────────────────────────

export const GRADES = ['bronze', 'silver', 'gold', 'platinum']

export const CATEGORIES = ['成长', '进食', '存活', '分数', '道具', '连击', '探索', 'BOSS']

export const ACHIEVEMENTS = [
  // ── 成长：蛇身最长 ──
  { id: 'growth_5', name: '初长成', category: '成长', grade: 'bronze', desc: '蛇身达到 5 节', check: (s) => s.maxLen >= 5 },
  { id: 'growth_10', name: '修长', category: '成长', grade: 'silver', desc: '蛇身达到 10 节', check: (s) => s.maxLen >= 10 },
  { id: 'growth_20', name: '巨蟒', category: '成长', grade: 'gold', desc: '蛇身达到 20 节', check: (s) => s.maxLen >= 20 },
  { id: 'growth_50', name: '远古之蛇', category: '成长', grade: 'platinum', desc: '蛇身达到 50 节', check: (s) => s.maxLen >= 50 },

  // ── 进食：累计食物 ──
  { id: 'eat_1', name: '初尝', category: '进食', grade: 'bronze', desc: '吃到第一份食物', check: (s) => s.eats >= 1 },
  { id: 'eat_10', name: '小有积蓄', category: '进食', grade: 'bronze', desc: '累计吃 10 份食物', check: (s) => s.eats >= 10 },
  { id: 'eat_50', name: '饕餮', category: '进食', grade: 'silver', desc: '累计吃 50 份食物', check: (s) => s.eats >= 50 },
  { id: 'eat_200', name: '暴食者', category: '进食', grade: 'gold', desc: '累计吃 200 份食物', check: (s) => s.eats >= 200 },
  { id: 'eat_1000', name: '吞天', category: '进食', grade: 'platinum', desc: '累计吃 1000 份食物', check: (s) => s.eats >= 1000 },

  // ── 存活：累计帧数 ──
  { id: 'survive_100', name: '站稳脚跟', category: '存活', grade: 'bronze', desc: '存活满 100 帧', check: (s) => s.ticks >= 100 },
  { id: 'survive_300', name: '老练', category: '存活', grade: 'silver', desc: '存活满 300 帧', check: (s) => s.ticks >= 300 },
  { id: 'survive_1000', name: '不死者', category: '存活', grade: 'gold', desc: '存活满 1000 帧', check: (s) => s.ticks >= 1000 },
  { id: 'survivalist', name: '永恒', category: '存活', grade: 'platinum', desc: '存活满 3000 帧', check: (s) => s.ticks >= 3000 },

  // ── 分数：单局最高分 ──
  { id: 'score_50', name: '小试牛刀', category: '分数', grade: 'bronze', desc: '单局得分达到 50', check: (s) => s.score >= 50 },
  { id: 'score_200', name: '得分手', category: '分数', grade: 'silver', desc: '单局得分达到 200', check: (s) => s.score >= 200 },
  { id: 'score_500', name: '高手', category: '分数', grade: 'gold', desc: '单局得分达到 500', check: (s) => s.score >= 500 },
  { id: 'score_1000', name: '宗师', category: '分数', grade: 'platinum', desc: '单局得分达到 1000', check: (s) => s.score >= 1000 },
  { id: 'score_5000', name: '???', category: '分数', grade: 'platinum', hidden: true, desc: '单局得分达到 5000（隐藏）', check: (s) => s.score >= 5000 },

  // ── 道具：拾取次数与种类 ──
  { id: 'power_1', name: '初见奇物', category: '道具', grade: 'bronze', desc: '拾取 1 个道具', check: (s) => s.pickups >= 1 },
  { id: 'power_5', name: '收藏家', category: '道具', grade: 'bronze', desc: '累计拾取 5 个道具', check: (s) => s.pickups >= 5 },
  { id: 'power_20', name: '道具狂人', category: '道具', grade: 'silver', desc: '累计拾取 20 个道具', check: (s) => s.pickups >= 20 },
  { id: 'power_collector', name: '博学家', category: '道具', grade: 'gold', desc: '拾取过 8 种不同道具', check: (s) => s.pickupTypes >= 8 },
  { id: 'power_master', name: '万物通晓', category: '道具', grade: 'platinum', desc: '拾取过全部 17 种道具', check: (s) => s.pickupTypes >= 17 },

  // ── 连击：最高连锁倍率 ──
  { id: 'combo_3', name: '连击', category: '连击', grade: 'bronze', desc: '达成 3 连锁', check: (s) => s.combos >= 3 },
  { id: 'combo_4', name: '狂热', category: '连击', grade: 'silver', desc: '达成 4 连锁', check: (s) => s.combos >= 4 },
  { id: 'combo_5', name: '完美连锁', category: '连击', grade: 'gold', hidden: true, desc: '达成 5 连锁（隐藏）', check: (s) => s.combos >= 5 },

  // ── 探索：模式 / 关卡 / 综合 ──
  { id: 'level_5', name: '步入深处', category: '探索', grade: 'bronze', desc: '抵达第 5 关', check: (s) => s.levels >= 5 },
  { id: 'level_10', name: '深渊行者', category: '探索', grade: 'silver', desc: '抵达第 10 关', check: (s) => s.levels >= 10 },
  { id: 'explorer_modes', name: '跨界者', category: '探索', grade: 'silver', desc: '体验过 2 种不同模式', check: (s) => s.modesPlayed >= 2 },
  { id: 'explorer_allmodes', name: '万象', category: '探索', grade: 'gold', desc: '体验过 6 种不同模式', check: (s) => s.modesPlayed >= 6 },
  { id: 'globetrotter', name: '环游者', category: '探索', grade: 'gold', desc: '蛇身 30+ 且累计吃 100 份', check: (s) => s.maxLen >= 30 && s.eats >= 100 },

  // ── BOSS：击败 / 殒落（P5 Boss 系统实现后自动联动）──
  { id: 'boss_slayer', name: '屠龙者', category: 'BOSS', grade: 'bronze', desc: '击败 1 个 Boss', check: (s) => s.bossDefeated >= 1 },
  { id: 'boss_hunter', name: '猎手', category: 'BOSS', grade: 'silver', desc: '累计击败 3 个 Boss', check: (s) => s.bossDefeated >= 3 },
  { id: 'boss_slayer_legend', name: '???', category: 'BOSS', grade: 'platinum', hidden: true, desc: '击败 10 个 Boss（隐藏）', check: (s) => s.bossDefeated >= 10 },
  { id: 'boss_fallen', name: '铭记此役', category: 'BOSS', grade: 'bronze', desc: '被 Boss 消灭', check: (s) => s.bossDeaths >= 1 },
]
