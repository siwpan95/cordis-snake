// plugins/snake.js
// ───────────────────────────────────────────────────────────────────────────
// 蛇身逻辑插件 —— 游戏规则本体（支持多蛇 + 道具 + 穿屏环绕）。
//
// inject 声明四个依赖：board / timer / input / snakes。只要任一依赖未就绪，
// 本插件就保持在 PENDING 而不激活；依赖齐备后被框架自动激活（响应式共效应）。
//
// 道具（由 ctx.powerups 提供，非必需）通过"capability 调用"读取，而非事件：
//   · phase（穿墙/穿身）：忽略本蛇的碰撞死亡判定；
//   · speed（加速）：本帧额外再走一步；
//   · slow（减速）：per-snake 闸门，隔帧才移动；
//   · reverse（反向控制）：取当前方向的反向。
// 这样"加一个效果"只是往 PowerupService 注册表多塞一条，本文件零改动。
// ───────────────────────────────────────────────────────────────────────────
export const snakePlugin = {
  name: 'snake',
  inject: ['board', 'timer', 'input', 'snakes'],
  apply(ctx) {
    ctx.logger.info('snake 插件已激活（依赖 board/timer/input/snakes 已齐备）')
    const offTick = ctx.on('tick', () => stepAll(ctx))
    return () => {
      offTick()
      ctx.logger.info('snake 插件已停用（所有副作用已回滚）')
    }
  },
}

const eq = (a, b) => a.x === b.x && a.y === b.y

/** 取某蛇本帧方向，并应用 reverse 道具（若有）。 */
function dirOf(ctx, s) {
  const d = { ...ctx.input.dirOf(s.id) }
  const power = ctx.get('powerups')
  if (power && power.isActive(s.id, 'reverse')) return { x: -d.x, y: -d.y }
  return d
}

/** 计算新蛇头；若棋盘开启 wrap 则做穿屏环绕。 */
function nextHead(board, head, dir) {
  let nh = { x: head.x + dir.x, y: head.y + dir.y }
  if (board.wrap) {
    if (nh.x < 0) nh.x = board.width - 1
    else if (nh.x >= board.width) nh.x = 0
    if (nh.y < 0) nh.y = board.height - 1
    else if (nh.y >= board.height) nh.y = 0
  }
  return nh
}

function stepAll(ctx) {
  const board = ctx.board
  const snakes = ctx.snakes
  if (board.status !== 'running') return
  const power = ctx.get('powerups')
  const alive = snakes.list.filter((s) => s.alive)
  for (const s of alive) if (s._invincible > 0) s._invincible--

  // slow：per-snake 闸门，隔帧才移动；slowmo 为全局减速，作用于所有蛇。
  const skip = new Set()
  if (power) {
    for (const s of alive) {
      const slow = power.isActive(s.id, 'slow') || power.isGlobalActive('slowmo')
      if (slow) {
        s._slowGate = !s._slowGate
        if (!s._slowGate) skip.add(s.id)
      }
    }
  }

  // 1) 本帧首步意图。
  const moves = []
  for (const s of alive) {
    if (skip.has(s.id)) continue
    const dir = dirOf(ctx, s)
    s.dir = dir
    moves.push({ s, nh: nextHead(board, s.body[0], dir) })
  }

  // 2) 死亡判定（phase 豁免墙/障碍/自身；drill 破障；ghost 穿它蛇；护盾抵消一次）。
  const dead = new Set()
  const revived = new Set() // 护盾抵消致命碰撞：本帧原地不动地复活
  const consumeShield = (s) => { s._shield -= 1; s._invincible = 40 }

  for (const m of moves) {
    const { s, nh } = m
    if (s._invincible > 0) continue // 无敌期内免死
    const phased = power && power.isActive(s.id, 'phase')
    if (phased) continue
    if (!board.inBounds(nh)) {
      if (s._shield > 0) { consumeShield(s); revived.add(s.id); continue }
      dead.add(s.id); continue
    }
    if (board.isObstacle(nh)) {
      if (power && power.isActive(s.id, 'drill')) { board.removeObstacle(nh); continue } // 钻地破障
      if (s._shield > 0) { consumeShield(s); revived.add(s.id); continue }
      dead.add(s.id); continue
    }
    const occ = power && power.isActive(s.id, 'ghost')
      ? snakes.occupiedBy(s.id, nh, true) // 穿身：只与自身蛇身碰撞
      : snakes.occupiedGlobal(nh, true)
    if (occ) {
      if (s._shield > 0) { consumeShield(s); revived.add(s.id); continue }
      dead.add(s.id); continue
    }
  }
  // 头对头：两蛇本帧冲向同一格 → 同归于尽（护盾可抵消）。
  for (let i = 0; i < moves.length; i++)
    for (let j = i + 1; j < moves.length; j++)
      if (eq(moves[i].nh, moves[j].nh)) {
        for (const k of [i, j]) {
          const sk = moves[k].s
          if (sk._invincible > 0) continue
          if (sk._shield > 0) { consumeShield(sk); revived.add(sk.id); continue }
          dead.add(sk.id)
        }
      }

  // 3) 应用首步 + 进食。
  let foodConsumed = false
  for (const m of moves) {
    const { s, nh } = m
    if (dead.has(s.id)) {
      snakes.kill(s.id, 'collision')
      continue
    }
    if (revived.has(s.id)) continue // 护盾复活：本帧原地不动
    const ate = !foodConsumed && board.isFood(nh)
    const ns = [nh, ...s.body]
    if (!ate) ns.pop()
    s.body = ns
    ctx.emit('snake/move', { id: s.id, head: nh })
    if (ate) {
      if (board.food && board.food.x === nh.x && board.food.y === nh.y) {
        board.food = null // 显式清 primary food：food 插件缺席时也杜绝幽灵食物
      } else {
        board.removeFood(nh) // 奖励食物
      }
      foodConsumed = true
      s.score += 1
      ctx.emit('snake/eat', { id: s.id, head: nh })
    }
  }
  if (snakes.allDead()) {
    ctx.emit('game/over', 'all-dead')
    return
  }

  // 4) speed：额外再走一步（仅自身，不与它蛇做头对头判定）。
  if (power) {
    for (const s of snakes.list.filter((x) => x.alive && !skip.has(x.id) && !revived.has(x.id))) {
      if (!power.isActive(s.id, 'speed')) continue
      const dir = dirOf(ctx, s)
      const nh = nextHead(board, s.body[0], dir)
      const phased = power.isActive(s.id, 'phase')
      const ghost = power.isActive(s.id, 'ghost')
      const drill = power.isActive(s.id, 'drill')
      if (!phased) {
        if (!board.inBounds(nh)) continue
        if (board.isObstacle(nh)) {
          if (drill) board.removeObstacle(nh)
          else continue
        }
        const occ = ghost ? snakes.occupiedBy(s.id, nh, true) : snakes.occupiedGlobal(nh, true)
        if (occ) continue
      }
      const ate = !foodConsumed && board.isFood(nh)
      const ns = [nh, ...s.body]
      if (!ate) ns.pop()
      s.body = ns
      ctx.emit('snake/move', { id: s.id, head: nh })
      if (ate) {
        if (board.food && board.food.x === nh.x && board.food.y === nh.y) {
          board.food = null // 显式清 primary food：food 插件缺席时也杜绝幽灵食物
        } else {
          board.removeFood(nh) // 奖励食物
        }
        foodConsumed = true
        s.score += 1
        ctx.emit('snake/eat', { id: s.id, head: nh })
      }
    }
    if (snakes.allDead()) ctx.emit('game/over', 'all-dead')
  }
}
