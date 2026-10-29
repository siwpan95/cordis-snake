# Cordis 贪吃蛇 · 一切皆插件的游戏

## 仓库角色定位（投资组合分级 ①）

> 本仓在 siwpan 投资组合（D:/projects/repos，共 133 仓）中定级为 **① 核心推进**，领域 **游戏引擎/框架**，定位 **引擎平台层**。
> **角色**：Cordis『一切皆插件』架构样例，随 cordis 维护。
> **维护策略**：① 核心推进——持续投入、不允许冻结；随所属收敛点 / 流水线长期演进。
> 投资组合统一分级索引（多机可查）：[组合分级决策索引 · allin 事实源](https://gitee.com/siwpan/allin/blob/master/docs/事实源/组合分级决策索引.md)。

> 仓库：<https://gitee.com/siwpan/cordis-snake> ｜ 许可：MIT-0（MIT No Attribution）（见 [LICENSE](LICENSE)）
> 注：文中 <PATH> 为路径占位符，请替换为你本机实际的目录 / 可执行文件路径。

用 **Cordis** 元框架（DeepSeek Harness 同款运行时内核）把贪吃蛇实现成一个
**「无特权核心、一切皆插件」** 的应用。本项目既是一个能玩的终端贪吃蛇，
也是一份**可运行的 Cordis 架构样例**：游戏逻辑、世界状态、蛇群、计时心跳、输入、
渲染、计分、关卡、多人、音效、日志，全都是插件。

---

## 一、调研结论（Cordis / DeepSeek Harness / 论文）

> 来源：cordis 官方仓库、cordiverse/paper、DeepSeek Harness 仓库、多篇技术解读（2026-08 检索）。

### 1. 论文：《A Programming Paradigm for Spatiotemporal Composability》
- 作者 **Yifan Shi、Wei Zhang（北京大学）、Tianyi Cui（DeepSeek-AI）**，2026-08-13 预印本（约 88 页）。
- 核心主张：把类型论里的 **effect（效应）/ coeffect（共效应）** 从「编译期静态分析工具」提升为
  **运行时机制**，为「动态组合（运行时增删/重配组件）」建立形式化基础，并以此实现框架 **Cordis**。
- 两个正交维度：
  - **时间可组合性（Temporal）**：组件被移除时，它对共享环境造成的所有副作用必须被**完全、可逆地回滚**
    → Cordis 的 *revertible effects*：每次上下文变换都携带一个逆操作，卸载时框架逆序自动调用。
  - **空间可组合性（Spatial）**：组件间依赖被**声明、被发现、并随依赖变化反应式地协调**
    → Cordis 的 *reactive coeffects*：组件声明 `inject`，依赖一到位就激活、一消失就停用。
  - 二者统一为单一**上下文类型（Context）**，并给出动态组合演算与 5 个元定理（含最关键的
    **合流定理 Theorem 73**：系统静止态 == 把最终配置从零静态装配的态）。

### 2. Cordis 框架
- 由 **Shigma**（Koishi 框架作者）创造，cordiverse 组织维护，MIT，TypeScript。
- 元框架（meta-framework）：**不规定业务**，只提供动态组合语义——Context / Service / Fiber / Event /
  Loader。连 `@cordisjs/plugin-timer`、`@cordisjs/plugin-logger-console` 这些基础设施**本身也是插件**。

### 3. DeepSeek Harness（"Everything is a Plugin"）
- DeepSeek 开源的 agent harness，**底层由 Cordis 驱动**（vendor 并加固了 Fiber 重入、HMR 等）。
- 模型适配器、工具、会话持久化、沙箱、文件系统、Web UI、甚至 **agent loop 本身**——全是插件。
- 设计哲学：**没有特权核心（no privileged core）**。换模型/工具/沙箱/循环只换一个插件，框架纹丝不动。
- 配置即数据（`cordis.yml`）：「这个 agent 由哪些插件组成」是一份可声明的清单。

> 关键澄清：**DeepSeek 不是 Cordis 的作者**，而是把 Cordis 用作 Harness 的运行时；论文与框架
> 出自 cordiverse，DeepSeek-AI 参与了论文。本游戏的「一切皆插件」即照搬这一范式。

---

## 二、运行方式

```bash
cd <PATH>
npm install          # 依赖（cordis 等）已随本项目装好，可跳过
npm start                                  # 终端交互模式（需 TTY）
node src/index.js --headless --ticks=800   # AI 自对弈演示（无 TTY 也能跑）
node src/index.js --watch                  # 真实 HMR：保存 manifest.json 即热重载
node src/index.js --multiplayer            # 加 1 名 AI 对手（多人）
node src/index.js --p2                     # 本地双人：WASD 控 p1，IJKL 控 p2
npm run selftest                            # 端到端验证 Cordis 架构特性（含关卡/多人/音效/HMR）
```

- **交互模式**：方向键 / `WASD` 控制 p1；`a` 热插拔 键盘↔AI 驱动；`r` 重开；`q` / `Ctrl-C` 退出。
- **headless**：用 AI 驱动自动玩 N 帧后打印结果，用于无终端环境验证（p1 自动设为 `source='ai'`）。
- **--watch（真实 HMR）**：`CordisLoader` 监听 `manifest.json`，保存即按 Cordis 原生 scope 原语
  （`Fiber.dispose` / `Fiber.update`）做最小代价热重载——改尺寸、增删插件、换渲染器都无需重启。
- **--multiplayer / --p2**：`multiplayer` 插件多 spawn 一条 AI 对手蛇；`input-keyboard-p2` 再 spawn
  一条人类 p2 蛇并用 `IJKL` 控制，规则零改动（多蛇碰撞 / 头对头同归于尽由 `snake` 统一裁决）。
- **selftest**：纯逻辑验证，不依赖终端，覆盖空间/时间/响应式可组合 + 关卡 + 多人 + 音效 + HMR。

---

## 三、架构映射（Cordis 概念 → 本游戏）

| Cordis 概念 | 本游戏中的体现 |
|---|---|
| **Context** | `new Context()` 是根上下文，所有插件挂载其上；`ctx.plugin/emit/effect/on` 经代理解析 |
| **Service** | `timer`/`board`/`input`/`snakes`/`sound`/`score` 以 `ctx.*` 暴露（常驻能力服务） |
| **Fiber** | 每个插件挂载产生一个 Fiber（PENDING→LOADING→ACTIVE→…），生命周期由框架托管 |
| **Effect（可逆效应）** | 所有副作用用 `ctx.effect()` 注册并返回 disposer；卸载时框架**逆序自动回收**（interval、监听器） |
| **Event** | `tick` / `input/direction` / `snake/eat` / `game/over` / `level/up` / `sound/play` / `meta/*` 等 |
| **inject（响应式共效应）** | `snake` 声明 `inject:['board','timer','input','snakes']`，依赖未齐备则保持 PENDING |
| **provide / seam** | `input` 是稳定能力服务；键盘 / AI 是两种可替换的「驱动插件」（seam 的另一种形态） |
| **isolate（空间可组合）** | 自测用两个独立 `Context` 跑两套游戏，互不污染；可进一步为同名服务建 realm |
| **Loader（配置即数据）** | `manifest.json` 声明「游戏由哪些插件组成」，切换能力只是改这份清单 |

---

## 四、目录结构

```
snake-game/
├── manifest.json              # 声明式插件清单（= DeepSeek Harness 的 cordis.yml）
├── package.json
├── src/
│   ├── index.js               # 应用入口：读 manifest、按环境选驱动、热插拔、退出清理
│   ├── loader.js              # 声明式组合 + 真实 Cordis HMR（Fiber.dispose/update + 文件 watch）
│   ├── selftest.js            # 端到端自测（空间/时间/响应式 + 关卡/多人/音效/HMR）
│   ├── services/
│   │   ├── timer.js           # ctx.timer —— 心跳（effect 追踪的 setInterval）
│   │   ├── board.js           # ctx.board —— 世界状态（唯一真相源：尺寸/食物/障碍/运行状态）
│   │   ├── input.js           # ctx.input —— 稳定的方向能力服务（按蛇 id 区分，含拒绝掉头）
│   │   ├── snakes.js          # ctx.snakes —— 多蛇统一模型（占用/计分/重生/头对头裁决）
│   │   └── sound.js           # ctx.sound —— 音效能力服务（翻译事件为 sound/play，关即空操作）
│   └── plugins/
│       ├── food.js            # 食物生成（inject board）
│       ├── score.js           # 计分（监听 snake/eat，按蛇 id 计分）
│       ├── input-ai.js        # AI「驱动插件」（BFS 自动寻路，拣 source==='ai' 的蛇）
│       ├── input-keyboard.js  # 键盘「驱动插件」（TTY：WASD/方向键 控 p1）
│       ├── input-keyboard-p2.js # 键盘「驱动插件」（TTY：IJKL 控 p2，兜底 spawn p2 蛇）
│       ├── snake.js           # 蛇身规则（inject board/timer/input/snakes，多蛇碰撞/头对头）
│       ├── renderer-terminal.js # 终端渲染「驱动插件」（依赖 board，多蛇+障碍绘制）
│       ├── game.js            # 编排：渲染/结束/重开/退出/转发热插拔
│       ├── level.js           # 关卡「插件」（inject board/timer/snakes，provide level）
│       ├── multiplayer.js     # 多人「插件」（inject snakes/input，spawn AI 对手蛇）
│       ├── sound-hooks.js     # 音效接线（监听游戏事件 → sound.play）
│       ├── sound-beep.js      # 音效后端（BEL 蜂鸣，零依赖兜底）
│       ├── sound-wav.js       # 音效后端（合成 WAV，PowerShell 播放，非 Win 静默降级）
│       └── logger-console.js  # 日志导出「插件」（连日志都可替换）
```

---

## 五、插件清单（一切皆插件）

| 插件 | 提供/依赖 | 角色 |
|---|---|---|
| `timer` | 提供 `ctx.timer` | 驱动 `tick` 心跳；interval 用 `ctx.effect` 注册，卸载即停 |
| `board` | 提供 `ctx.board` | 棋盘、食物、障碍的世界状态（single source of truth） |
| `input` | 提供 `ctx.input` | 稳定的方向能力服务，按蛇 id 区分、含「拒绝掉头」校验 |
| `snakes` | 提供 `ctx.snakes` | 多蛇统一模型：占用判定 / 计分 / 重生 / 头对头裁决 |
| `sound` | 提供 `ctx.sound` | 音效能力服务：事件 → `sound/play`；关闭即空操作 |
| `food` | 依赖 `board` | 随机放置 / 重放食物 |
| `score` | 依赖 `board`，提供 `ctx.score` | 监听 `snake/eat`，按蛇 id 计分，含排行榜 |
| `input-ai` | 依赖 `input,board,snakes` | AI 自动驾驶驱动（BFS 寻路，拣 `source==='ai'` 的蛇） |
| `input-keyboard` | 依赖 `input` | 键盘驱动 p1（TTY） |
| `input-keyboard-p2` | 依赖 `input,snakes` | 键盘驱动 p2（TTY），兜底 spawn p2 蛇 |
| `snake` | 依赖 `board,timer,input,snakes` | 游戏规则：移动、吃、撞墙/撞身/头对头判定（多蛇） |
| `renderer-terminal` | 依赖 `board`，提供 `ctx.renderer` | ANSI 终端绘制（多蛇 + 障碍） |
| `game` | 依赖 `board,timer` | 编排每帧渲染、结束/重开/退出、转发热插拔 |
| `level` | 依赖 `board,timer,snakes`，提供 `ctx.level` | 吃够 goal 升级：追加障碍 + 提速 + 蛇重生 |
| `multiplayer` | 依赖 `snakes,input` | spawn N 条 AI 对手蛇；重开时补回，卸载时移除 |
| `sound-hooks` | 依赖 `sound` | 游戏事件 → `sound.play`（eat/levelup/crash/die） |
| `sound-beep` | 依赖 `sound` | 音效后端：BEL 蜂鸣（零依赖兜底） |
| `sound-wav` | 依赖 `sound` | 音效后端：合成 WAV 用 PowerShell 播放（非 Win 静默降级） |
| `logger-console` | — | 把日志导出到 stderr（可整体替换） |

---

## 六、时空可组合性 + 本次扩展的体现

- **时间可组合（revertible effects）**：任意插件卸载时，其注册的所有副作用（定时器、事件监听器、
  提供的服务）被框架**逆序自动回收**。自测 *section 2* 用 `tick` 计数器插件验证：挂载后 5 帧 +5，
  卸载后计数停增。
- **空间可组合（isolate / realm）**：自测 *section 1* 用两个独立 `Context` 各挂一套游戏，跑 80 帧后
  各自尺寸、蛇状态完全独立、互不污染。
- **响应式共效应（reactive coeffects）**：`snake` 声明 `inject:['board','timer','input','snakes']`。
  自测 *section 3* 先**不挂 input** → snake 保持 PENDING、不随 `tick` 移动；**挂上 input** → 框架自动
  激活 snake、开始移动；热插拔驱动也不崩溃。
- **关卡（level 插件）**：吃够 `goal` 个食物升级，调用 `advance()` 追加障碍物、缩短心跳间隔、重 spawn
  所有蛇。障碍由 `board` 统一裁决，提速是对 `timer` 的 effect 再配置——全是数据驱动，规则零硬编码。
- **多人（multiplayer 插件）**：只是「多 spawn 几条蛇」，游戏规则（`snake`）完全不变。蛇间碰撞、
  **头对头同归于尽** 由 `snakes.occupiedGlobal` + `snake` 的 head-on 检测统一裁决；`input-keyboard-p2`
  再 spawn 一条人类 p2 蛇即成本地双人——证明「加玩法只是加插件」。
- **音效（sound 服务 + 后端插件）**：`sound` 只把事件翻译成 `sound/play`，**不出声**；具体出声由
  `sound-beep` / `sound-wav` 两个后端插件决定，换后端只是换一个监听 `sound/play` 的插件。无音频环境
  （非 Windows / 无 PowerShell / headless）下 `try/catch` 静默降级，对游戏逻辑零致命。
- **真实 HMR（CordisLoader + --watch）**：core rc.8 不自带文件监听器（`@cordis/loader` 才带），但
  **scope 级热重载就是 Cordis 的真实机制**。本项目据此实现：`fiber.dispose()` 卸载、`ctx.plugin()`
  重挂、`fiber.update(config)` 重建 effect；provider 插件变更时连同其依赖者一起 dispose+replugin 保证
  依赖图一致；并监听 `manifest.json` 保存事件触发上述 diff——这就是「保存即热插拔」。

---

## 七、一处实现取舍（重要）

`input` 被设计为**稳定常驻服务**，键盘 / AI / p2 是**驱动插件**向其喂方向，而非「互相替换的 input provider」。

原因：在 Cordis rc.8 中，**卸载一个仍被其他插件依赖的 provider** 会触发 provider 级联回收的边界
路径（异步续体里 `fiber.store` 被置空而抛错）。把输入做成稳定 seam、驱动做成可插拔消费者后：

- 热插拔 = 挂载/卸载驱动，只回收它自己的监听器，绝不触碰「被依赖 provider 的卸载」路径；
- 仍完整保留「一切皆插件」「配置即数据」「revertible effects」「reactive coeffects」的全部演示；
- 若确实需要**真正的 provider 互换**演示，可用 `ctx.isolate()` 在另一 realm 把 `input` 换成另一种实现
  （自测 section 1 的双 realm 已证明空间隔离可行）。

> 注：headless / 热插拔到 AI 时，需把**蛇对象** `p1.source` 设为 `'ai'`（而非仅改 `input.sources` 标记），
> 因为 `input-ai` 按蛇的 `source` 字段拣选被驱动蛇——这是一处易错点，已在 `index.js` 修正。

---

## 九、参考

- 论文仓库：https://github.com/cordiverse/paper
- Cordis 仓库：https://github.com/cordiverse/cordis
- DeepSeek Harness：https://github.com/deepseek-ai/deepseek-harness （"Everything is a Plugin"）
- 设计解读：cordis 的 "Meta-Framework of Spatiotemporal Composability"；DeepSeek Harness 的 Cordis 引擎五大机制

---

## 十、研调扩展框架（道具 / 皮肤 / 成就 / Boss / 模式 / 粒子）

> 本轮联网调研（蛇类游戏 Boost Cubes / ECS 效果系统 / Cordis 插件范式）后，把研调得到的
> 玩法全部落成**可插拔框架**——不管单个体感有用没用，先把骨架立起来。全部默认 `enabled:false`，
> 用命令行开关点亮，"框架可见、惰性启用"，整体自测 70/70 不受影响。

### 10.1 新增能力缝（Service = capability seam）

| 服务 | 文件 | 职责 |
|------|------|------|
| `ctx.powerups` | `services/powerups.js` | 道具注册表 + 盘面道具 + 激活计时（到期自动回收）。共 17 类：基础 8（speed/slow/phase/magnet/multiplier/golden/shrink/reverse）+ P1 扩充 9（portal/drill/ghost/frenzy/poison/extra-life/bomb/mystery/slowmo），含 `isGlobalActive` 全局效果查询 |
| `ctx.achievements` | `services/achievements.js` | 成就定义（**数据外置**到 `achievements-data.js`）+ 幂等解锁，暴露 `define/meta/unlock/isUnlocked/list/all` |
| `ctx.themes` | `services/themes.js` | 调色板注册表（**12 套内置**）+ 独立 skin 注册表 + 按 kind 的 `colors` ANSI 码 |
| `ctx.combo` | `services/combo.js` | **连锁倍率（P6 跨模块缝）**：每蛇独立 `count/mult`，`bump`/`reset`/`combo/change`；score 委托它，`ctx.get('combo')` 懒读（未挂载时 score 退回内部实现） |
| `ctx.storage` | `services/storage.js` | **跨局存档（P6 跨模块缝）**：`get/set/all` + 可选落盘 JSON（`filePath`）；achievements 启动恢复、解锁即持久化，零侵入联动 |

### 10.2 新增插件（Plugin = 行为）

| 插件 | 文件 | 作用 |
|------|------|------|
| `powerup-spawn` | `plugins/powerups.js` | 定时刷道具 + 蛇头踩中即拾取（监听 `snake/move`） |
| `achievement-track` | `plugins/achievements.js` | 把游戏事件累计进 `stats` 快照、每次事件后重算解锁（数据驱动，仅 `inject:['achievements']`，其它能力用 `ctx.get()` 懒读以兼容默认禁用） |
| `theme-palettes` | `plugins/themes.js` | 注册独立 **skin**（glitch/dotted/rainbow）并按配置切皮肤，演示"配色↔描边"解耦 |
| `modes` | `plugins/modes.js` | **10 种玩法**（classic/survival/open/maze/battle/timeattack + P4 的 decay/portal/obstacle/daily），挂载即改写世界/蛇群/计时器；暴露 `ctx.modes.current()` |
| `boss` | `plugins/boss.js` | 多 Boss 数据集（4 种差异化）+ 血条 + 攻击模式（chase/shockwave/spawn-obstacles/summon）+ 击败发 `boss/defeated`/`boss/cleared` |
| `particles` | `plugins/particles.js` | 把 eat/pickup/die/over 翻译成视觉粒子爆发 |
| `powerup-spawn` | `plugins/powerups.js` | 定时刷道具 + 蛇头踩中即拾取；**P6 关卡联动**：监听 `level/up` 缩短 `spawnEvery`（进度越高奖励越密），暴露 `ctx.get('powerup-spawn').rate()` |
| `boss` | `plugins/boss.js` | （见上）**P6 关卡联动**：监听 `level/up` 缩短每条 Boss 的攻击间隔（更激进）；`ctx.boss.list()` 现含 `interval` |

### 10.3 时空可组合性如何延续

- **revertible effects**：道具激活是带 `remaining` 的倒计时，卸载/到期时由 `PowerupService.tick()`
  逆序回收；Boss/粒子/成就是挂在 `ctx` 上的监听器，卸载即清理。
- **reactive coeffects**：`powerup-spawn` 的 `inject:['powerups']` 保证只在道具服务就绪后才刷道具；
  未启用 `powerups` 服务时，它保持 PENDING，游戏照常运行。
- **配置即数据**：六种模式、皮肤、是否启用 Boss/粒子，全在 `manifest.json` 里是数据，不是代码。

### 10.4 运行开关（全部可在 TTY / headless 下叠加）

```bash
node src/index.js --powerups                 # 开启道具（service + 刷新插件）
node src/index.js --boss                     # 开启 Boss（默认 wraith）
node src/index.js --boss=hydra                # 指定 Boss 数据集（wraith/juggernaut/weaver/hydra）
node src/index.js --particles                # 开启粒子反馈
node src/index.js --achievements             # 开启成就追踪
node src/index.js --mode=battle              # 大逃杀毒圈（battle/maze/timeattack/survival/open）
node src/index.js --theme=matrix             # 切到 matrix 皮肤
node src/index.js --powerups --mode=maze --boss --particles --achievements --theme=neon
```

### 10.5 P1 道具深度扩充（17 类 + combo 连锁）

- **9 类新道具**（全部惰性、可热拔插，由 `PowerupService` 注册、`snake` 插件消费）：
  - `portal` 传送门：拾取即把蛇头瞬移到随机空格（成对简化为单次闪现）。
  - `drill` 破障：持续期内撞穿障碍（移除障碍并免死）。
  - `ghost` 穿身不穿墙：持续期内只与自身蛇身碰撞，可穿过其它蛇（`snakes.occupiedBy` 支撑）。
  - `frenzy` 撒食物：立即在随机空格撒 5 份奖励食物（`board.bonusFood`，由 `snake` 统一进食判定）。
  - `poison` 毒：拾取即死（陷阱类）。
  - `extra-life` 护盾：抵消一次致命碰撞，原地复活 + 短暂无敌（消费 `s._shield`，本帧原地不动）。
  - `bomb` 清周围：拾取即清除蛇头周围 3×3 障碍（`board.removeObstacle`）。
  - `mystery` 随机：拾取即随机套用一种其它道具效果。
  - `slowmo` 全局减速：持续期内所有蛇隔帧移动（经 `isGlobalActive` 全局读取，非仅持有者）。
- **combo 连锁倍率**（`score` 插件）：连续进食落在时间窗口（8 tick）内则倍率逐级 +1，最高 ×5，窗口外断连即重置；倍率同时叠加 `multiplier` 道具（×3）。
- 验证：`selftest` §8 新增 10 组确定性断言（传送 / 破障 / 穿身 / 撒食 / 毒 / 护盾 / 清障 / 随机 / 全局减速 / combo），全量 `npm run verify` 4/4 通过。

### 10.6 P2 成就广度（数据外置，35 条 / 8 类）

- **一切皆数据**：成就定义全部抽到 `src/achievements-data.js`（纯数据 + `check(stats)` 谓词），`achievement-track` 插件只做"注册定义 + 累计 `stats` + 重算解锁"三件事。**换一套成就 = 改一个 JSON 友好文件，服务与追踪逻辑零改动。**
- **8 大类、35 条、3 条隐藏**：

  | 类别 | 条数 | 代表成就（递进） |
  |------|------|------|
  | 成长 | 4 | 初长成(5) → 修长(10) → 巨蟒(20) → 远古之蛇(50) |
  | 进食 | 5 | 初尝(1) → … → 暴食者(200) → 吞天(1000) |
  | 存活 | 4 | 站稳脚跟(100帧) → … → 永恒(3000帧) |
  | 分数 | 5 | 小试牛刀(50) → 宗师(1000) → ???(5000,隐藏) |
  | 道具 | 5 | 初见奇物(1) → 博学家(8种) → 万物通晓(17种全收集) |
  | 连击 | 3 | 连击(3) → 狂热(4) → 完美连锁(5,隐藏) |
  | 探索 | 5 | 步入深处(5关) → 跨界者(2模式) → 环游者(身30+吃100) |
  | BOSS | 4 | 屠龙者(1) → 猎手(3) → 铭纪此役(被击杀) → ???(10,隐藏) |

- **stats 快照**由事件喂养：`snake/eat`(eats/combo/maxLen)、`score/change`(score/combo)、`powerup/pickup`(pickups/种类)、`level/up`(levels)、`tick`(ticks/maxLen/模式)、`snake/die`(deaths/bossDeaths)、`game/over`、`boss/defeated`(Boss 系统 P5 落地后零成本联动)。
- **隐藏成就**：解锁前不在 UI 展示（`hidden:true`），触发照常解锁，3 条分别是高分(5000)、满连锁(5)、屠龙传说(10 Boss)。
- 验证：`selftest` §8 新增「成就广度」块——断言 `defs.size>=30`、插件在场外能力缺失仍 ACTIVE、跨 5 类确定性解锁（进食/连击/分数/道具/存活）；全量 `npm run verify` 4/4 通过。

### 10.7 P3 视觉增强（粒子造型 + 12 调色板 + 独立皮肤）

- **配色 / 描边两条正交轴**：
  - **调色板（颜色）**：`ThemeService` 内置 **12 套**（classic / neon / retro / mono / sunset / matrix / ocean / forest / candy / ember / ice / vapor），渲染字符保持 ASCII/单宽安全；每套带 `colors{kind}` 的 ANSI 码，供粒子按事件类型取**主题色**着色。
  - **皮肤（描边）**：独立 `skins` 注册表，定义蛇身/蛇头的描边样式（`pattern` 为字形数组，渲染器按 body 段序号交替取字），与颜色完全解耦。内置 5 套：solid / striped / scaled / chevron / circuit；`theme-palettes` 插件再注册 glitch / dotted / rainbow 演示"皮肤也是插件"。
  - **换色 = 换/改一个 palette；换描边 = 换一个 skin；二者互不干扰，渲染器与游戏逻辑零改动。** 这是 Cordis "重新组合" 理念在 view 层的延伸。
- **粒子按事件造型**：`particles` 插件监听 `snake/eat` / `powerup/pickup` / `snake/die` / `game/over`，按 `kind` 投放带方向速度（`vx/vy`）与寿命的爆发：吃=火花（上飘）/ 道具=环（原地）/ 死=爆裂（外扩）/ 结束=冲击波（强闪）。渲染器据 `kind` 选字形 + 据 `colors[kind]` 上色（ANSI 零宽，不影响方框对齐），坐标 `Math.floor` 取整防 grid 浮点索引越界。
- **同时修掉一个潜藏 bug**：`renderer-terminal` 原本在 `draw()` 里直接读 `ctx.themes` / `ctx.powerups` / `ctx.particles`，但只声明了 `inject:['board','snakes']`——在 TTY 交互渲染时会触发 Cordis `cannot get property without inject` 崩溃（headless 验证因不渲染而一直没暴露）。P3 把它补成 `inject:['board','snakes','themes']`，并把可选能力 `powerups` / `particles` 改用 `ctx.get()` 懒读，未挂载时不阻断激活。
- 验证：`selftest` §8 扩为「皮肤 + 粒子」两块——断言 12 套清单齐全、skin 注册/切换、`colors` 存在、`skinOf()` 正确、eat 粒子按 kind 生成且 `vy<0`、tick 后坐标始终有限；`npm run verify` 4/4 通过。状态行现显示 `[调色板·皮肤]`。

### 10.8 P4 模式补全（共 10 种玩法，decay/portal/obstacle/daily）

- **一切皆数据 → 一切皆模式**：玩法只是 `modes` 插件在挂载时改写世界/蛇群/计时器，不写新规则。P4 在原有 6 种（classic/survival/open/maze/battle/timeattack）基础上新增 4 种，总计 10 种，全部由 `manifest.json` 的 `mode` 字段或 `--mode=` 选择，零代码改动即可切换。
  - **decay 衰减**：每隔 `decayInterval`（默认 30）帧把所有存活蛇缩短 1 节（复用 `SnakesService.shrink`），逼玩家持续进食；至少留 1 节不会清零。
  - **portal 传送**：每隔 `portalInterval`（默认 50）帧把每条蛇头随机闪现到空格（`teleportHead`，与 P1 `PowerupService` 的 `portal` 效果**同构**——演示"道具能力被模式复用"，无需新增空间门数据结构）。
  - **obstacle 障碍**：每隔 `obstacleInterval`（默认 40）帧在随机空格撒 `obstacleCount`（默认 1）个障碍（复用 `board.addObstacle` + `snakes.randomFreeCell`，避开蛇身）。
  - **daily 每日挑战**：按本地日期（`dailySeed()`）或 `config.seed` 做 **mulberry32 确定性 PRNG** 布局，当天可复现（同种子同布局）。落约 12% 障碍并留中心安全区。
- **模式也是能力缝**：`modes` 插件新增 `ctx.provide('modes', { current })`，渲染器/其它插件可读当前模式（如状态行展示）。`game/reset` 触发 `applyMode` 重应用，副作用（tick 监听器）先回收再重建，杜绝重开叠加监听器。
- 验证：`selftest` §8 新增「模式（P4）」块——断言 daily 生成障碍 + 同种子可复现、decay 定期缩短（起步 5 节 → 9 帧后变短且 ≥1）、obstacle 定期生障碍、portal 瞬移长度守恒且蛇头在界内、`ctx.modes.current()==='portal'`；`npm run verify` 5/5 通过（新增第 5 步 `--mode=obstacle` 200 帧实跑）。

### 10.9 P5 Boss 系统（血条 / 攻击模式 / 多 Boss 数据集 + 成就联动）

- **多 Boss 数据集**：`plugins/boss.js` 内建 `BOSSES` 数据表，4 个差异化 Boss：`wraith`(幽影, hp3 追击)、`juggernaut`(巨像, hp6 慢速+冲击波)、`weaver`(织网者, hp4 定期撒障碍)、`hydra`(多头蛇, hp5 半血召唤援军)。换一套 Boss 只改数据表，逻辑不动。
- **血条**：每条 Boss 独立 `hp/maxHp`，`ctx.boss.list()` 暴露 `{name,x,y,hp,maxHp,attack,glyph,color}`，渲染器在 Boss 格画其字形 + 配色，状态行显示 `BOSS <名> <hp>/<maxHp>`。
- **攻击模式**（按各 Boss 自身节奏 `attackInterval` 触发）：`chase`(仅追击) / `shockwave`(以自身为心 `shockwaveRadius` 内蛇头击杀，持有 P1 `extra-life` 可免死——演示跨阶段能力复用) / `spawn-obstacles`(撒障碍) / `summon`(半血再放一个活体 Boss，演示多 Boss 同屏)。
- **战斗模型（事件驱动、自包含）**：蛇头"切入"Boss 格 → 对边沿触发造成 1 伤（`boss/hit`）；Boss 移动撞蛇身或冲击波 → `snakes.kill(id,'boss')`；Boss hp 归零 → `boss/defeated` 移出活体，顺序 `wave` 队列清空后发 `boss/cleared`。`game/reset` 重放整波。
- **成就联动（零成本接住 P2 缝）**：`achievement-track` 插件早已 `ctx.on('boss/defeated', …)` 累计 `stats.bossDefeated` → 自动解锁 `boss_slayer`(屠龙者)/`boss_hunter`(猎手)/`boss_slayer_legend`(隐藏)/`boss_fallen`(被 Boss 消灭)；`snake/die` reason `'boss'` 累计 `bossDeaths`。
- 运行：`--boss` 点亮插件，`--boss=<name>` 选数据集（如 `--boss=juggernaut`）；`manifest.json` 的 `modes`/`boss` 默认 `enabled:false`。
- 验证：`selftest` §8 扩为「Boss + 成就联动」两块——断言 hp>0、`list()` 单 Boss、`attackPattern()==='chase'`、`damage(99)` 后 `exists()===false` 且 `boss/defeated`/`boss/cleared` 各发 1 次；独立块挂载成就后击败 Boss → `isUnlocked('boss_slayer')` 为真；`npm run verify` 6/6 通过（新增第 6 步 `--boss=juggernaut` 200 帧实跑），另 headless 实跑 `--boss=hydra/weaver/wraith` 均正常推进无崩溃。

### 10.10 P6 跨模块收口（combo 全局缝 / 存档 / 关卡联动）

把前几期各自独立的缝"缝合"成一张真正的协作网，而非又加一层功能：

- **combo 全局化（能力缝提升）**：`services/combo.js` 新建 `ComboService`（`ctx.combo`），把连锁倍率从 `score` 插件的私有闭包提升为**一等跨模块能力**。score 通过 `ctx.get('combo')` 懒委托（未挂载时退回内部实现，旧自测零改动）；任何插件都能直接读 `ctx.combo.count/mult`，不再耦合 score。这呼应了"一切皆插件"的核心——**连计分规则里的连锁也是可共享的能力**。
- **存档 service（跨局进度外置）**：`services/storage.js` 新建 `StorageService`（`ctx.storage`），默认纯内存、配置 `filePath` 即落盘 JSON。成就插件通过 `ctx.get('storage')` 懒读：启动即 `unlock` 已保存集合，**解锁即持久化 `achievements` 数组**——换存档后端（localStorage/云）只改本服务，成就逻辑一行不动。
- **关卡联动（事件驱动缝合）**：`level/up` 现在被多个模块消费，关卡真正成为"跨模块进度枢纽"：
  - `powerup-spawn` 监听到 → `spawnEvery` 缩短（进度越高奖励越密），暴露 `ctx.get('powerup-spawn').rate()`；
  - `boss` 监听到 → 每条 Boss 攻击间隔缩短（更激进），`ctx.boss.list()` 现含 `interval`；
  - （既有消费方：`sound-hooks` 播放升级音效、`achievement-track` 累计 `levels`。）
- 运行：`--achievements` 点亮成就，`manifest.json` 的 `combo` 默认启用、`storage` 默认禁用（配置 `filePath` 即开启跨局存档）。
- 验证：`selftest` §8 新增「跨模块收口」三块——① combo 全局缝（`ctx.combo.count` 随进食累积、`ctx.score.combo` 与 `ctx.combo.count` 一致、倍率上限 ×5）；② 存档跨局恢复（击败 Boss 解锁 → 落盘 → 复用同一文件二次挂载自动恢复 `boss_slayer`）；③ 关卡联动（升级后 `powerup-spawn.rate()` 下降、Boss `interval` 下降）；`npm run verify` 7/7 通过（新增第 7 步 `--powerups --boss=juggernaut` 200 帧跨模块实跑）。

---

## 九、路线图总览（P0 → P6）

| 阶段 | 主题 | 关键交付 |
|------|------|----------|
| P0 | 基线确认 | Cordis「一切皆插件」骨架 + 真实 HMR Loader + 6 大能力缝 |
| P1 | 道具深度 | 17 类道具（含 combo 连锁倍率）+ `isGlobalActive` 全局效果 |
| P2 | 成就广度 | 数据外置 35 条 / 8 类成就，事件驱动解锁 |
| P3 | 视觉增强 | 12 调色板 + 独立 skin + 按 kind 造型的粒子 |
| P4 | 模式补全 | 10 种玩法（decay/portal/obstacle/daily 等） |
| P5 | Boss 系统 | 多 Boss 数据集 + 血条 + 攻击模式 + 成就联动 |
| P6 | 跨模块收口 | combo 全局缝 + 存档 service + 关卡联动（level 成进度枢纽） |

设计主线始终如一：**能力 = Service 缝，行为 = Plugin 织入，组合 = 声明式 manifest + 事件驱动**。每个阶段新增的东西都不改游戏核心循环，只是往这张协作网里再接一个节点。

---

## 八、验证

| 方式 | 命令 | 期望 |
|------|------|------|
| 仅自测 | `npm run selftest` | 全绿（含空间/时间/响应式/关卡/多人/音效/HMR + 研调扩展 4 组） |
| **一键全量** | `npm run verify` *(或 `node scripts/verify-all.mjs`)* | 全部 ✅ |
| Headless AI 自对弈 | `node src/index.js --headless --ticks=800` | 状态 running、得分 > 0、clean teardown |
| Headless 多人演示 | `node src/index.js --headless --ticks=300 --multiplayer` | p1 + cpu1 共存；游戏正常推进 |
| 研调扩展冒烟 | `node src/index.js --headless --ticks=200 --powerups --mode=maze` | 道具刷新/迷宫障碍/无崩溃退出 |
| P5 Boss 冒烟 | `node src/index.js --headless --ticks=200 --boss=juggernaut` | 血条/攻击模式实跑无崩溃 |
| P6 跨模块冒烟 | `node src/index.js --headless --ticks=200 --powerups --boss=juggernaut` | level/up 联动（道具/Boss）实跑无崩溃 |
| 真实 HMR 演示（需 TTY） | `node src/index.js --watch` | 改 `manifest.json` 后日志刷 `[热加载] xxx` |

`npm run verify` 顺序跑 ① 自测 → ② AI 800 帧 → ③ 多人 300 帧 → ④ 研调冒烟 → ⑤ P4 模式 → ⑥ P5 Boss → ⑦ P6 跨模块，任意失败退出码 1。

---

## 十一、上线前修复计划执行（gstack 全检 → 🟢 Go）

来源：`<PATH>`（产品评审员 / 安全官 / 质量门神三视角全检）。
原结论：**🟡 条件 Go**，3 个 P0 阻塞项 + 6 个 P1/P2 行动项。以下为发布前（P0 + P1）行动项的执行与验证。

### 阻塞项 / 行动项修复清单

| ID | 严重度 | 文件 | 修复 | 验证 |
|----|--------|------|------|------|
| **B1** | 🟠 高 | `src/index.js` | `plugin/toggle-ai` 切换前先 `dispose` 已存在的 `other`（multiplayer/p2 下 `input-ai` 随 manifest 挂载，旧逻辑覆盖引用 → 孤儿 fiber + 双 tick 监听/双 AI 驱动）；并用 manifest 真实 config 替代 `{}` | headless 模拟 multiplayer 反复切换 6 次：仅 1 份 `input-ai` fiber、`ctx.get` 无重复 provider、`p1` 被单 AI 驱动移动 |
| **B2** | 🟡 P0 | `package-lock.json` | 全部 `resolved` 由 `http://127.0.0.1:8899/...`（本地镜像、无 TLS）改写为 `https://registry.npmjs.org/...`（integrity 即真实 tgz 哈希，可直接复用） | 干净临时目录 `npm ci`（registry=npmjs）成功安装 3 包、完整性校验通过、exit 0；grep 确认 0 处 `127.0.0.1` |
| **B4** | 🟡 阻塞 | `src/selftest.js` | 第一 Boss 自测块原挂载「不受控蛇」（且误 spawn 同名 `p1` 与 `SnakesService` 自动生成的 `p1` 重 id，污染 Boss `lastHead` 追踪 → 随机被反杀）。改为复用自动生成的 `p1` 并移到角落作静止追击目标，Boss 至多贴脸 1 次、必不被击败 | `node src/selftest.js` **连续 12 次稳定 104/104、exit 0** |
| **B3** | 🟡 P1 | `package.json` | cordis 最新发布版即 `4.0.0-rc.8`（npm `latest` dist-tag 指向 rc.8，无稳定 4.x 可 pin）→ **书面接受 RC 风险**（按报告允许项）；锁文件已锁定 `^4.0.0-rc.8` | `npm view cordis version` 返回 `4.0.0-rc.8`，与设计一致 |
| **B5** | 🟡 P1 | `src/plugins/boss.js` | shockwave 原查 `isGlobalActive('extra-life')` 恒 false（extra-life `duration:0` 不进全局 active map）→ 护盾免死失效。改为查每条蛇 `s._shield>0` 并消费（`s._shield-=1; s._invincible=40`，与 `snake.js:82 consumeShield` 一致） | 新增断言：护盾蛇在 shockwave 中存活且护盾被消费；无护盾蛇被击杀；`npm run selftest` 全绿 |
| **B6** | 🟡 P1 | `src/loader.js` | HMR `reload` 改 `async`、`_dispose` 返回 `dispose()` 的 promise 并在 `reload`/`_reloadEntry` 内 `await`，消除 provider 重载时旧 fiber 注销与重挂的瞬时重注册竞态；`watch` 回调内 `await reload` | `selftest`「真实 HMR」块（provider 重载 + 增删插件）已 `await` 后通过；`npm run verify` 全绿 |

> 后续迭代项（B7 多级依赖闭包重载 / B8 `occupiedGlobal` 死参数 / B9 `storage` 沙箱化 / B10 manifest 信任边界 / B11–B15 / B19 测试覆盖）按报告归为「后续迭代」，本次未纳入发布前范围。

### 上线判定

- `npm run selftest` → **104/104**（原 101/101，P6 后新增断言 + 本次 B4/B5 加固）。
- `npm run verify` → **7/7 全绿**（含 P5 Boss、P6 跨模块实跑）。
- `npm ci`（干净环境 / HTTPS registry）→ **成功**，可分发生成 `package-lock.json`。
- 三类阻塞项（B1 重复挂载 / B2 镜像锁文件 / B4 flaky 自测）**均已修复并验证** → 综合结论由 🟡 条件 Go **转为 🟢 Go**。

## 十二、安全与信任边界（P-A 加固：B9 / B10 / B17）

本作是本地 Node CLI，默认无网络、无远程攻击面；以下加固针对「被篡改的本地配置 / 越权文件访问」威胁模型，属纵深防御。

### B9 · StorageService 路径沙箱（fail-closed）
- 存档落盘路径 `filePath` 一律解析进固定沙箱基目录（默认 `<cwd>/.snake-data`），`path.normalize` + 前缀校验，拒绝绝对路径与 `..` 穿越。
- manifest 若配置越界 `filePath` → 服务构造即抛错，游戏拒绝以被篡改配置启动（fail-closed）。
- 启用存档：在 `manifest.json` 的 `storage` 插件写相对 `filePath`（如 `"save/ach.json"`），文件将落在沙箱内；如需自定义基目录可加 `baseDir`。

### B10 · manifest SHA256 完整性 + 信任边界
- `src/manifest.js` 的 `readManifest(path)` 读取 manifest，并（若同目录存在 `<manifest>.sha256` 侧车签名文件）校验其 SHA256：内容或签名不匹配即抛错（fail-closed），初始装载与 `--watch` 热重载均覆盖。
- **签名是「可选但一旦存在即强制」**：dev 不生成侧车则放行（零编辑摩擦）；生产用 `node scripts/sign-manifest.mjs` 生成侧车后，任何 manifest 篡改都会被阻断。
- **信任边界（文档化）**：谁能写 `manifest.json`（及其 `.sha256` 侧车），谁就拥有运行时配置权（含 B9 的 `filePath`、启用哪些插件、Boss/模式等）。生产应使二者只读、侧车不可写；`--watch` 下任何可写 manifest 的实体都可在运行时改配置。

### B17 · sound-wav PowerShell 路径转义
- 合成 WAV 的临时路径不再内联进 PowerShell `-Command` 字符串（旧写法单引号路径含 `'` 会破坏字面量）；改为经环境变量 `SNAKE_WAV_PATH` 传入，`$env:SNAKE_WAV_PATH` 读取，路径含任意字符（含 `'`）都不破坏命令。

## 十三、HMR 与架构健壮性（P-B 加固：B7 / B8 / B11–B15）

本阶段不改游戏核心循环，聚焦「热重载一致性 + 清理死参数/死代码 + 受控移除」，全部经三道 CI 门禁（selftest 137/137、verify 7/7）验证。

### B7 · HMR 多级依赖闭包重载
- `loader.js` 的 provider 变更不再仅级联一层依赖：新增 `_dependentsClosure()` 沿 `inject→provide` 链求全部传递依赖者（A→B→C 三级改 A 会级联重挂 B、C），`_topoOrder()` 按 provider 优先拓扑序 dispose+replugin，保证 dependent 激活时读到最新 `ctx.${provide}`，消除陈旧引用级联。

### B8 · `occupiedGlobal` 死参数清理
- 删除从未使用的 `exceptId` 形参（旧调用靠 `allowTail=true` 规避，且若未来误设 `allowTail=false` 会引入自撞误判）；更新 `snake.js` / `input-ai.js` / `board.js` 三处调用为 2 参签名。自撞判定与尾格 `allowTail` 语义保持不变（selftest 已断言）。

### B11 · `--watch` 透传 overrides
- `index.js` 的 `loader.watch(manifestPath)` 改为 `loader.watch(manifestPath, overrides)`：headless 下的 `timer.auto=false` 等 overrides 在 `--headless --watch` 热重载后仍生效（overrides 经新增 `_watchOverrides` 透传到每次 `reload`）。

### B12 · `SnakesService.remove(id)` 受控移除
- 新增 `remove(id)`（原地 `splice`，保持 `this.list` 引用稳定，避免闭包/快照读到陈旧数组）；`multiplayer.js` 卸载对手蛇改用 `ctx.snakes.remove('cpuN')`，取代直接重赋值 `this.list`。

### B13 · 进食显式清 `board.food`
- `snake.js` 两处进食分支：吃到 primary food 时显式 `board.food = null`，杜绝 food 插件缺席时的「幽灵食物」（food 插件在场时仍由 `snake/eat` 监听正常补位）。

### B14 · 删除 `mountFromManifest` 死代码
- 移除 `loader.js` 中无引用的 `mountFromManifest` 导出（grep 确认仅定义、零调用）。

### B15 · `configEqual` 规范化比较
- 改为键序无关的稳定字符串化（递归处理对象/数组），避免等价配置因键序不同或嵌套顺序差异而误触发 provider 重载；已导出供 selftest 断言。


## 十四、供应链与可观测性（P-C 加固：B3 / B16 / B18）

本阶段聚焦「cordis RC 定夺 + 安全审计日志 + 启动参数校验」，全部经三道 CI 门禁（selftest 151/151、verify 7/7）验证。

### B3 · 接受 cordis `^4.0.0-rc.8`（RC 风险书面接受）
- `package.json` 运行依赖为 `cordis@^4.0.0-rc.8`。经核查，npm `latest` 即 `4.0.0-rc.8`，**当前尚无稳定 4.x 发布**，故**书面接受 RC 风险**（不强行 pin 到不存在的版本）。
- 缓解措施：本仓**没有 CI 工作流文件**（流水线未接入）；cordis / cosmokit 的 Supply-chain 告警改为在本地升级依赖时用 `npm audit --audit-level=high` 复核，一旦上游发布稳定版即升级并重跑本地门禁（`npm run gate` = selftest + verify）。

### B16 · 安全审计日志（对局边界 + 玩家生命周期）
- 新增 `src/services/audit.js`：`AuditService`（provide `audit`），维护 `entries` 数组（`recent(n)` / `clear()`），每条 entry 含 `t`(时间戳) / `category` / `event` / 任意 `data`；同时写入 `ctx.logger`（`[audit]` 前缀）并 `emit('audit/entry')` 供下游消费。
- 订阅既有对局事件（零侵入规则，仅读不改）：`game/reset`(round/start，含参与者快照) / `game/over`(round/end，含原因) / `game/quit`(session/end) / `snake/die`(player/leave，含 id+reason)。
- `manifest.json` 默认 `audit` **enabled**（自 P-D 起默认开启，零行为影响——仅在对局边界追加 `[audit]` 结构化日志，便于联网/多人上线前的可观测基线）。开关：命令行 `--no-audit` 可显式关闭（保留 `--audit` 作为显式开启别名）；或把 manifest 中 `audit.enabled` 置 `false`。
- 定位：当前为本地单人对局（多人为本地 AI 对手，无真联网）；本服务在对局边界留结构化审计轨迹，**未来接入真实联网/多人时直接复用，无需改审计逻辑**。

### B18 · `--ticks` 启动参数校验
- 抽出无副作用纯函数 `src/util/parse-ticks.js`：`parseTicks(arg)` 校验 `--ticks=N` 必须为 **正整数且 ≤ 100000**（上限防死循环/内存），非法值统一回退默认 `400` 并标记 `ok:false`；`index.js` 对非法值经 `root.logger.warn` 明确告警。
- 旧逻辑 `Number(ticksArg.split('=')[1])` 对 `--ticks=abc` 得 NaN 静默跳过、`--ticks=1e9` 超大值有死循环风险，现已收敛。
- 校验函数与 `index.js` 共享同一模块（避免重复解析逻辑），并由 selftest 单测覆盖（`--ticks=abc` / `3.5` / `-5` / `0` / `1e9` 均回退，`300` / 边界 `100000` 通过）。


## 十五、审计默认开启与运行开关

- **审计默认开启**：`manifest.json` 中 `audit.enabled` 已置 `true`（P-D 决定）。对局中自动输出 `[audit] round/start` / `player/leave` / `round/end` / `session/end` 结构化日志，零行为副作用。
- **关闭开关**：`--no-audit` 显式关闭审计（等同把 `audit.enabled` 置 `false`）；`--audit` 仍可作为显式开启别名保留。
- **音效开关**：`--no-sound` 关闭 `sound-wav` / `sound-hooks` 后端（避免无头/CI 环境起 PowerShell 进程），与 headless 自动关闭音效一致。
- **TTY 启动冒烟（测试用）**：`FORCE_TTY=1 node src/index.js --ticks=5` 在伪 TTY 判定下启动并有限帧运行后干净退出，供 CI/selftest 断言「TTY 代码路径初始化不崩溃」（真实 TTY 仍由 `process.stdin.isTTY` 决定）。


## 十六、测试覆盖补齐（P-D 加固：B19）

本阶段补齐确定性断言与集成测试，全部经三道 CI 门禁（selftest 155/155、verify 7/7）验证。

### B19 · 确定性断言与集成测试
- **食物不重叠**：selftest 挂载 board+snakes+food，反复触发 `snake/eat` 重新放置食物 40 次，断言 `board.food` 从不在任意蛇身/障碍格、且始终在界内（`randomFreeCell` 统一裁决空格，多蛇/障碍下安全）。
- **食物排除 Boss 格**：Boss 在场时，食物放置循环避开其占用格（`food.js` 的 `place()` 用 `ctx.get('boss')?.list()` 判定，无 Boss 时优雅降级）；selftest 60 次放置断言食物从不落在 Boss 格。
- **`--watch` 端到端**：复用 `loader._handleManifestChange` 确定性接缝，改 manifest 后断言 provider 配置热更新生效（`before=1 → after=9`），不依赖 `fs.watch` 异步事件（杜绝 flaky）。
- **TTY 启动冒烟**：selftest 以子进程 `FORCE_TTY=1 node src/index.js --ticks=5 --no-sound` 启动，断言退出码 0 且不抛错；覆盖 renderer-terminal + input-keyboard 在 TTY 判定下的初始化路径。
- 顺带修复：P-B 遗留的 B11 测试 bug（`lctx.loader` 误引用未定义变量，被 `safe` 静默判 FAIL），改为正确的局部 `loader` 实例引用，B11 恢复绿色。



