// plugins/boss.js
// ───────────────────────────────────────────────────────────────────────────
// Boss 系统（P5）—— "世界里会主动出击的危险实体"，整套能力演示：
//   · 多 Boss 数据（BOSSES 数据集：不同 hp / 速度 / 攻击模式 / 配色）
//   · 血条（每条 Boss 独立 hp / maxHp，渲染器可画血条）
//   · 攻击模式（chase 追击 / shockwave 范围击杀 / spawn-obstacles 撒障碍 /
//              summon 半血召唤援军 —— 演示多 Boss 同屏）
//   · 击败联动（发 boss/defeated，P2 成就 track 插件零成本接住 → 屠龙者等解锁）
//
// 战斗模型（事件驱动、自包含，不依赖任何其它 disabled 插件）：
//   · 蛇头"切入"Boss 格 → 对 Boss 造成 1 点伤害（边沿触发，避免贴脸连击）。
//   · Boss 移动撞到蛇"身"（非头）→ 击杀该蛇（reason 'boss'）。
//   · Boss 的 shockwave 攻击：以自身为中心半径内蛇头 → 击杀（若持有 P1 extra-life 则免死）。
//   · Boss hp 归零 → emit('boss/defeated') 移出活体；顺序 wave 队列清空后 emit('boss/cleared')。
// ───────────────────────────────────────────────────────────────────────────
export const bossPlugin = {
  name: 'boss',
  inject: ['board', 'snakes', 'timer'],
  apply(ctx, config = {}) {
    // ── Boss 数据集（纯数据，换一套 Boss = 改这里）──
    const BOSSES = {
      wraith:     { name: '幽影 Wraith',     glyph: '☠', hp: 3, speed: 1, attack: 'chase',            color: '\x1b[35m' },
      juggernaut: { name: '巨像 Juggernaut', glyph: '♛', hp: 6, speed: 2, attack: 'shockwave',        color: '\x1b[31m', attackInterval: 40 },
      weaver:     { name: '织网者 Weaver',    glyph: '✸', hp: 4, speed: 1, attack: 'spawn-obstacles',  color: '\x1b[32m', attackInterval: 35 },
      hydra:      { name: '多头蛇 Hydra',    glyph: '⛧', hp: 5, speed: 1, attack: 'summon',           color: '\x1b[36m', attackInterval: 60 },
    }

    // 出场队列：--boss=<name> 或 config.boss 单选；config.wave 顺序多 Boss。
    const wave = config.wave
      ? [...config.wave]
      : [config.boss || 'wraith']
    const shockwaveRadius = config.shockwaveRadius ?? 3

    let bosses = []            // 活体 Boss 列表
    let queue = [...wave]      // 待出场 Boss 名（顺序 wave）
    let defeatedCount = 0
    let tick = 0
    const lastHead = new Map() // snakeId -> {x,y}，用于蛇头切入的边沿触发

    const spawnByName = (name) => {
      const meta = BOSSES[name] || BOSSES.wraith
      const cell = ctx.snakes.randomFreeCell()
      if (!cell) return null
      const entry = {
        name, meta,
        x: cell.x, y: cell.y,
        hp: meta.hp, maxHp: meta.hp,
        atkCounter: 0, summoned: false,
        interval: (config.attackInterval ?? meta.attackInterval) || 50, // 攻击节奏（config 可覆盖 / 关卡联动可缩短）
      }
      bosses.push(entry)
      ctx.emit('boss/spawn', { name, x: cell.x, y: cell.y, hp: meta.hp, maxHp: meta.hp })
      return entry
    }
    const spawnNext = () => {
      if (!queue.length) return
      spawnByName(queue.shift())
    }
    const spawnAll = () => {
      bosses = []
      queue = [...wave]
      defeatedCount = 0
      lastHead.clear()
      spawnNext()
    }
    const offReset = ctx.on('game/reset', spawnAll)
    // 关卡联动（P6）：升级 → Boss 攻击间隔缩短（进度越高越激进），下限 10 帧。
    const offLevel = ctx.on('level/up', () => {
      for (const b of bosses) b.interval = Math.max(10, Math.round(b.interval * 0.85))
    })
    spawnAll()

    // 单条 Boss 朝最近存活蛇头逼近（撞墙/障碍改走另一轴）。
    const moveBoss = (b) => {
      const targets = ctx.snakes.list.filter((s) => s.alive)
      if (!targets.length) return
      let nearest = targets[0]
      let best = Infinity
      for (const s of targets) {
        const d = Math.abs(s.body[0].x - b.x) + Math.abs(s.body[0].y - b.y)
        if (d < best) { best = d; nearest = s }
      }
      const h = nearest.body[0]
      const dx = Math.sign(h.x - b.x)
      const dy = Math.sign(h.y - b.y)
      let nx = b.x
      let ny = b.y
      if (Math.abs(h.x - b.x) >= Math.abs(h.y - b.y)) {
        nx += dx
        if (!ctx.board.inBounds({ x: nx, y: ny }) || ctx.board.isObstacle({ x: nx, y: ny })) { nx = b.x; ny += dy }
      } else {
        ny += dy
        if (!ctx.board.inBounds({ x: nx, y: ny }) || ctx.board.isObstacle({ x: nx, y: ny })) { ny = b.y; nx += dx }
      }
      if (!ctx.board.inBounds({ x: nx, y: ny }) || ctx.board.isObstacle({ x: nx, y: ny })) return
      b.x = nx; b.y = ny
      ctx.emit('boss/move', { name: b.name, x: b.x, y: b.y })
    }

    // 攻击模式：chase 无特殊攻击；其余按各自节奏触发。
    const runAttack = (b) => {
      if (b.meta.attack === 'shockwave') {
        ctx.emit('boss/attack', { name: b.name, kind: 'shockwave', x: b.x, y: b.y, radius: shockwaveRadius })
        for (const s of ctx.snakes.list.filter((s) => s.alive)) {
          const d = Math.abs(s.body[0].x - b.x) + Math.abs(s.body[0].y - b.y)
          if (d <= shockwaveRadius) {
            // 复用 P1 extra-life 护盾：持有 s._shield>0 免死（与 snake.js:82 consumeShield 一致）。
            // extra-life duration:0 不进全局 active map，故必须查每条蛇的 _shield 而非 isGlobalActive。
            if (s._shield > 0) {
              s._shield -= 1
              s._invincible = 40
            } else {
              ctx.snakes.kill(s.id, 'boss')
            }
          }
        }
      } else if (b.meta.attack === 'spawn-obstacles') {
        ctx.emit('boss/attack', { name: b.name, kind: 'spawn-obstacles', x: b.x, y: b.y })
        const c = ctx.snakes.randomFreeCell()
        if (c) ctx.board.addObstacle({ x: c.x, y: c.y })
      } else if (b.meta.attack === 'summon' && !b.summoned && b.hp <= b.maxHp / 2) {
        b.summoned = true
        ctx.emit('boss/attack', { name: b.name, kind: 'summon', x: b.x, y: b.y })
        spawnByName('wraith') // 援军：再放一个活体 Boss（演示多 Boss 同屏）
      }
    }

    // 碰撞结算：蛇头切入 Boss → 伤 Boss；Boss 撞蛇身 → 杀蛇。
    const resolveCollisions = () => {
      const live = ctx.snakes.list.filter((s) => s.alive)
      for (const s of live) {
        const head = s.body[0]
        const prev = lastHead.get(s.id)
        for (const b of bosses) {
          if (head.x === b.x && head.y === b.y) {
            const entered = !prev || prev.x !== head.x || prev.y !== head.y
            if (entered) applyDamage(b, 1) // 边沿触发：每"切入"一次只算 1 伤
            break
          }
        }
      }
      for (const b of bosses) {
        for (const s of live) {
          for (let i = 1; i < s.body.length; i++) {
            if (s.body[i].x === b.x && s.body[i].y === b.y) {
              ctx.snakes.kill(s.id, 'boss')
              break
            }
          }
        }
      }
      for (const s of ctx.snakes.list) {
        const h = s.body[0]
        lastHead.set(s.id, { x: h.x, y: h.y })
      }
    }

    const applyDamage = (b, n) => {
      b.hp -= n
      ctx.emit('boss/hit', { name: b.name, hp: b.hp, maxHp: b.maxHp })
      if (b.hp <= 0) defeatBoss(b)
    }
    const defeatBoss = (b) => {
      const idx = bosses.indexOf(b)
      if (idx >= 0) bosses.splice(idx, 1)
      defeatedCount += 1
      ctx.emit('boss/defeated', { name: b.name, total: defeatedCount })
      if (bosses.length === 0 && queue.length === 0) {
        ctx.emit('boss/cleared', { total: defeatedCount })
      } else if (bosses.length === 0 && queue.length > 0) {
        spawnNext() // 顺序 wave：上一个倒下，下一个出场
      }
    }

    const offTick = ctx.on('tick', () => {
      tick += 1
      for (const b of [...bosses]) {           // 快照：避免 summon 同帧新增 Boss 被重复驱动
        if (tick % b.meta.speed === 0) moveBoss(b)
        b.atkCounter += 1
        if (b.meta.attack !== 'chase' && b.atkCounter >= b.interval) {
          b.atkCounter = 0
          runAttack(b)
        }
      }
      resolveCollisions()
    })

    const disposeProvide = ctx.provide('boss', {
      pos: () => (bosses[0] ? { x: bosses[0].x, y: bosses[0].y } : null),
      exists: () => bosses.length > 0,
      list: () => bosses.map((b) => ({
        name: b.name, x: b.x, y: b.y, hp: b.hp, maxHp: b.maxHp,
        attack: b.meta.attack, interval: b.interval, glyph: b.meta.glyph, color: b.meta.color,
      })),
      hp: () => bosses[0]?.hp ?? 0,
      maxHp: () => bosses[0]?.maxHp ?? 0,
      alive: () => bosses.length,
      current: () => bosses[0]?.name ?? null,
      attackPattern: () => bosses[0]?.meta.attack ?? null,
      defeated: () => defeatedCount,
      // 外部伤害入口：供测试 / 未来"对 Boss 伤害"道具调用；默认打主 Boss。
      damage: (n = 1) => { if (bosses[0]) applyDamage(bosses[0], n); return bosses[0]?.hp ?? 0 },
      damageBoss: (i, n = 1) => { if (bosses[i]) applyDamage(bosses[i], n); return bosses[i]?.hp ?? 0 },
    })

    return () => {
      offReset()
      offTick()
      disposeProvide()
    }
  },
}
