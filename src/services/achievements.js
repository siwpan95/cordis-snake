// services/achievements.js
// ───────────────────────────────────────────────────────────────────────────
// 成就服务（ctx.achievements）—— 又一个声明式能力缝。
//
// 成就 = 一条"被定义的条目" + "达成时解锁"。具体解锁条件由 achievement-track
// 插件监听游戏事件去触发（事件驱动，松耦合）。服务本身只负责登记与幂等解锁，
// 与具体玩法完全解耦——换一套成就只是换一个 track 插件。
// ───────────────────────────────────────────────────────────────────────────
import { Service } from 'cordis'

export class AchievementService extends Service {
  static provide = 'achievements'

  constructor(ctx, config = {}) {
    super(ctx, 'achievements')
    this.defs = new Map() // id -> {desc, hidden}
    this.unlocked = new Set()
  }

  /**
   * 登记一条成就。兼容两种调用：
   *   define(id, '描述')                              —— 旧式字符串
   *   define(id, { name, desc, category, grade, hidden }) —— P2 富元数据
   */
  define(id, def = {}) {
    const d = typeof def === 'string' ? { desc: def } : def
    this.defs.set(id, {
      id,
      name: d.name ?? id,
      desc: d.desc ?? d.name ?? id,
      category: d.category ?? '未分类',
      grade: d.grade ?? 'bronze',
      hidden: !!d.hidden,
    })
  }

  /** 读取某成就的完整元数据。 */
  meta(id) {
    return this.defs.get(id)
  }

  /** 幂等解锁：只在首次触发时广播 achievement/unlock。 */
  unlock(id) {
    if (this.unlocked.has(id)) return false
    if (!this.defs.has(id)) this.defs.set(id, { id, desc: id, hidden: false })
    this.unlocked.add(id)
    this.ctx.emit('achievement/unlock', { id, ...this.defs.get(id) })
    return true
  }

  isUnlocked(id) {
    return this.unlocked.has(id)
  }

  /** 已解锁成就列表（含完整元数据，隐藏成就也在内）。 */
  list() {
    return [...this.unlocked].map((id) => ({ id, ...(this.defs.get(id) ?? { desc: id }) }))
  }

  /** 全部已登记成就的元数据（含未解锁），供 UI / 自测遍历。 */
  all() {
    return [...this.defs.values()]
  }
}
