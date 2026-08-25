// plugins/themes.js
// ───────────────────────────────────────────────────────────────────────────
// 皮肤插件（theme-palettes）—— 示范"皮肤也是插件"，且与配色解耦。
//
// 基础 12 套调色板（classic…vapor）已在 ThemeService 内置；本插件往 ctx.themes
// 继续注册**独立的皮肤**（决定蛇身描边样式），并按配置切到指定皮肤。换皮肤、
// 加皮肤都不碰渲染器与游戏逻辑；调色板（颜色）与皮肤（描边）是两条正交轴。
// ───────────────────────────────────────────────────────────────────────────
export const themePalettePlugin = {
  name: 'theme-palettes',
  inject: ['themes'],
  apply(ctx, config = {}) {
    // 皮肤：仅影响蛇身描边字形，不携颜色（颜色仍由调色板提供）。
    ctx.themes.registerSkin('glitch', { pattern: ['◆', '◇'] })
    ctx.themes.registerSkin('dotted', { pattern: ['.', '·'] })
    ctx.themes.registerSkin('rainbow', { pattern: ['◍'] })

    if (config.skin && ctx.themes.skinsList().includes(config.skin)) ctx.themes.setSkin(config.skin)
  },
}
