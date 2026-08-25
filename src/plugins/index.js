// plugins/index.js —— 插件注册表（名字 → 插件对象）。
// loader 据此把 manifest 里的名字映射到真实插件。
export { TimerService } from '../services/timer.js'
export { BoardService } from '../services/board.js'
export { InputService } from '../services/input.js'
export { SnakesService } from '../services/snakes.js'
export { SoundService } from '../services/sound.js'
export { foodPlugin } from './food.js'
export { scorePlugin } from './score.js'
export { aiPlugin } from './input-ai.js'
export { keyboardPlugin } from './input-keyboard.js'
export { keyboardP2Plugin } from './input-keyboard-p2.js'
export { snakePlugin } from './snake.js'
export { rendererPlugin } from './renderer-terminal.js'
export { gamePlugin } from './game.js'
export { levelPlugin } from './level.js'
export { multiplayerPlugin } from './multiplayer.js'
export { soundBeepPlugin } from './sound-beep.js'
export { soundWavPlugin } from './sound-wav.js'
export { soundHooksPlugin } from './sound-hooks.js'
export { loggerConsolePlugin } from './logger-console.js'

// ── 研调扩展：道具 / 成就 / 皮肤 / 模式 / Boss / 粒子 ──
export { PowerupService } from '../services/powerups.js'
export { powerupSpawnPlugin } from './powerups.js'
export { AchievementService } from '../services/achievements.js'
export { achievementTrackPlugin } from './achievements.js'
export { ThemeService } from '../services/themes.js'
export { themePalettePlugin } from './themes.js'
export { modePlugin } from './modes.js'
export { bossPlugin } from './boss.js'
export { particlePlugin } from './particles.js'

// ── 跨模块收口（P6）：连锁 / 存档 能力缝 ──
export { ComboService } from '../services/combo.js'
export { StorageService } from '../services/storage.js'

// ── 安全审计（P-C / B16）──
export { AuditService } from '../services/audit.js'
