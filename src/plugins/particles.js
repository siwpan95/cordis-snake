// plugins/particles.js
// ───────────────────────────────────────────────────────────────────────────
// 粒子/反馈插件（particles）—— 把"游戏事件"翻译成"短暂视觉爆发"。
//
// 它监听 eat / powerup / die / over 等事件，在对应坐标投放一组带寿命的粒子，
// 并通过 ctx.provide('particles') 暴露 bursts() 给渲染器读取（可选视图 seam）。
// 全部是 observe 型副作用，卸载即回收；粒子自身也每帧衰减寿命并位移。
//
// P3 增强：每类事件有独立"造型"（kind）与方向速度（vx/vy），color 字段指向
// 当前调色板的 colors[kind]，渲染器据此取主题色着色（吃=火花/道具=环/
// 死=爆裂/结束=冲击波）。
// ───────────────────────────────────────────────────────────────────────────
export const particlePlugin = {
  name: 'particles',
  inject: ['snakes', 'board'],
  apply(ctx) {
    const bursts = [] // [{x,y,vx,vy,kind,life,color}]

    // 各事件类型的造型参数：寿命、方向速度、取色键。
    const SHAPES = {
      eat: { life: 8, vx: 0, vy: -0.4, color: 'eat' }, // 火花：向上飘
      power: { life: 10, vx: 0, vy: 0, color: 'power' }, // 环：原地停留
      die: { life: 9, vx: 0.5, vy: 0.5, color: 'die' }, // 爆裂：向外扩
      over: { life: 12, vx: 0, vy: 0, color: 'over' }, // 冲击波：原地强闪
    }

    const add = (x, y, kind) => {
      const s = SHAPES[kind] || SHAPES.eat
      bursts.push({ x, y, vx: s.vx, vy: s.vy, kind, life: s.life, color: s.color })
    }

    const offs = [
      ctx.on('snake/eat', ({ head }) => add(head.x, head.y, 'eat')),
      ctx.on('powerup/pickup', ({ id }) => {
        const s = ctx.snakes.get(id)
        if (s) add(s.body[0].x, s.body[0].y, 'power')
      }),
      ctx.on('snake/die', ({ id }) => {
        const s = ctx.snakes.get(id)
        if (s) add(s.body[0].x, s.body[0].y, 'die')
      }),
      ctx.on('game/over', () =>
        ctx.snakes.list.forEach((s) => s.body[0] && add(s.body[0].x, s.body[0].y, 'over')),
      ),
    ]
    const offTick = ctx.on('tick', () => {
      for (let i = bursts.length - 1; i >= 0; i--) {
        const b = bursts[i]
        b.x += b.vx // 按方向速度位移
        b.y += b.vy
        b.life -= 1
        if (b.life <= 0) bursts.splice(i, 1)
      }
    })
    const disposeProvide = ctx.provide('particles', {
      bursts: () => bursts,
      add,
    })

    return () => {
      offs.forEach((o) => o())
      offTick()
      disposeProvide()
    }
  },
}
