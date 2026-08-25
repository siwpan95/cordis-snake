# 后续迭代路线图 · Cordis 贪吃蛇（B7–B19）

**日期**：2026-08-25
**关联报告**：`pre-launch-check-snake-game-2026-08-25.md`（B1–B6 已修复，项目状态 🟢 Go）
**阶段**：规划（Planning）—— 本文件仅定范围 / 优先级 / 验收，不执行代码改动
**CI 约束**：B7–B19 全部改动须经三道长期固化门禁（`npm ci` → `npm run selftest` → `npm run verify`），任一非零退出即阻断。

---

## 1. 范围与定位

| 维度 | 说明 |
|------|------|
| 来源 | 上线前报告「综合审查发现」B7–B19（共 13 项） |
| 严重度 | 🟡 中（B7/B8/B9/B10）· 🟢 低（B11–B19） |
| 紧急度 | 全部 **P2（后续迭代）**——非阻塞，不影响当前 🟢 Go |
| 共同点 | 均属「加固 / 可维护性 / 覆盖」类，不改游戏核心循环，单 PR 可独立交付 |
| 回滚兜底 | 「一切皆插件」——任何能力出问题 → manifest 对应插件 `enabled:false` 即可关，无需回滚代码 |

> B3（cordis 从 rc.8 pin 稳定版 / 或书面接受 RC + CI 补 `npm audit`）原列 P1「发布前」，但当前 `package.json` 仍为 `^4.0.0-rc.8`，故在本路线图中归并到 **P-C** 显式定夺，状态标记为「未决」。

---

## 2. 四期总览

| 期 | 主题 | 覆盖项 | 目标 | 建议顺序 |
|----|------|--------|------|----------|
| **P-A** | 安全加固 | B9 / B10 / B17 | 堵住 storage 路径穿越 + manifest 信任边界 + 音效路径注入边缘 | 1（最高风险） |
| **P-B** | HMR / 架构健壮性 | B7 / B8 / B11 / B12 / B13 / B14 / B15 | HMR 多级闭包重载 + 清理死参数/死代码 + 受控移除 | 2（**已执行** 2026-08-25） |
| **P-C** | 供应链与可观测性 | B3 / B16 / B18 | cordis RC 定夺 + 安全审计日志 + 启动参数校验 | 3（**已执行** 2026-08-25） |
| **P-D** | 测试覆盖补齐 | B19 | 补确定性断言与集成测试，固化进 selftest/verify | 4（**已执行** 2026-08-25） |

> 执行纪律：每期内部按表单项单 PR 推进；**P-D 的断言应随对应代码改动一同落地**（改一项、补一测），避免覆盖滞后。

---

## 3. P-A · 安全加固（优先级最高）

### B9 — `StorageService.filePath` 沙箱化
- **位置**：`src/services/storage.js:18,22,47-48`
- **问题**：`filePath` 由 manifest 控制、未规范化、无白名单；启用 storage 后可对任意路径读/写（默认 `enabled:false`）。
- **建议修复**：设沙箱基目录（如 `<root>/.data/`），`path.normalize` 后强制前缀校验，拒绝绝对路径与含 `..` 的穿越。
- **验收**：单测传入 `/etc/passwd`、`../escape.json`、`..\\..\\x.json` 均被拒绝并落到沙箱内；正常相对路径可读写。
- **量级**：S（~1 文件 + 单测）。

### B10 — manifest 完整性 / 信任边界
- **位置**：`index.js:21-23`；`loader.js:205`；`--watch`
- **问题**：manifest 无签名/完整性校验；`--watch` 下任意可写 manifest 的实体可运行时改配置（含 B9 的 `filePath`）。
- **建议修复**：生产视 manifest 为只读；加 SHA256 签名校验（dev 可关）；README 文档化信任边界（谁能改 manifest = 谁拥有运行时配置）。
- **验收**：篡改 manifest 内容后启动被拒（或 dev 告警）；文档新增「信任边界」小节。
- **量级**：M（签名 + 校验 + 文档）。

### B17 — `sound-wav` PowerShell 路径转义
- **位置**：`src/plugins/sound-wav.js:59-61`
- **问题**：PowerShell `-Command` 单引号包裹路径，临时目录含 `'` 会破坏字面量（路径由 OS 决定，实际不可利用）。
- **建议修复**：参数化 / 转义，或改用 `&` 调用运算符 + 数组参数，避免字符串拼接。
- **验收**：路径含 `'` 时仍能正确播放（或优雅失败不崩溃）。
- **量级**：S。

---

## 4. P-B · HMR / 架构健壮性（**已执行 2026-08-25**）

> 执行结果：7 项全部落地，新增 22 条 selftest 断言，门禁 **selftest 137/137**、**verify 7/7** 全绿。

### B7 — HMR 多级依赖闭包重载 ✅
- **位置**：`loader.js`（_reloadEntry / 新增 _dependentsClosure / _topoOrder）
- **改动**：provider 变更沿 `inject→provide` 链求全部传递依赖者闭包，按 provider 优先拓扑序 dispose+replugin；A→B→C 三级改 A 会级联重挂 B、C，消除 C 持陈旧 `ctx.B`。
- **验收**：selftest 构造 A/B/C/D(+E 无关) 三级依赖，断言闭包含 A/B/C/D、拓扑序 provider 优先、重挂全闭包且 A 用新配置、E 不受影响。

### B8 — `occupiedGlobal` 死参数 ✅
- **位置**：`src/services/snakes.js`（occupiedGlobal）+ `snake.js`/`input-ai.js`/`board.js` 调用点
- **改动**：删除未使用的 `exceptId` 形参，三处调用改 2 参签名；自撞判定与尾格 `allowTail` 语义不变。
- **验收**：selftest 断言自身非尾身体计入占用（自撞有效）、障碍计入、尾格 allowTail 可进入、死亡蛇不计入。

### B11 — `watch` 透传 overrides ✅
- **位置**：`src/index.js`（watch 调用）+ `loader.js`（新增 `_handleManifestChange` / `_watchOverrides`）
- **改动**：`loader.watch(manifestPath, overrides)` 透传 overrides 到每次 reload；headless 下 `--headless --watch` 重载后 `timer.auto=false` 仍生效。
- **验收**：selftest 验证 `watch` 设置的 overrides 经 `_handleManifestChange` 透传到 `reload`。

### B12 — `SnakesService.remove(id)` 受控移除 ✅
- **位置**：`src/services/snakes.js`（新增 remove）+ `src/plugins/multiplayer.js`
- **改动**：新增 `remove(id)` 原地 splice（保持 `this.list` 引用稳定）；多人卸载对手蛇改用 `ctx.snakes.remove('cpuN')`。
- **验收**：selftest 断言 remove 后列表不含该 id、保留其它蛇、list 引用稳定。

### B13 — 进食显式清 `board.food` ✅
- **位置**：`src/plugins/snake.js`（两处进食分支）
- **改动**：吃到 primary food 时显式 `board.food = null`，杜绝 food 插件缺席时的幽灵食物。
- **验收**：selftest 在 food 插件不挂载下断言进食后 `board.food === null` 且得分 +1。

### B14 — 删除 `mountFromManifest` 死代码 ✅
- **位置**：`src/loader.js`
- **改动**：删除零引用的 `mountFromManifest` 导出。
- **验收**：grep 确认全局无引用。

### B15 — `configEqual` 规范化比较 ✅
- **位置**：`src/loader.js`（configEqual + stableStringify，已导出）
- **改动**：键序无关的稳定字符串化（递归对象/数组），避免等价配置因键序误触发 provider 重载。
- **验收**：selftest 断言键序不同等价配置判相等、数组顺序不同判不等、缺省与空对象相等。

---

## 5. P-C · 供应链与可观测性

### B3 — cordis RC 定夺 + `npm audit`
- **位置**：`package.json:13`；`package-lock.json`
- **状态**：✅ 已决（上线前 gstack P1 已处理）—— `npm view cordis version` 显示 latest 即 `4.0.0-rc.8`，**无稳定 4.x**，故主理人决策为**书面接受 RC 风险**，`package.json` 锁 `^4.0.0-rc.8`；CI 已补 `npm audit` advisory 步骤持续监控。
- **遗留动作**：README 已记录 RC 接受声明（见 §十一）；本迭代只需保持 `ci.yml` 的 `npm audit` advisory 步骤不被移除即可。
- **量级**：XS（仅监控，无代码改动）。

### B16 — 安全审计日志
- **位置**：全局
- **问题**：无安全审计日志（本地单人游戏影响低）。
- **建议修复**：仅在联网/多人能力启用时补安全事件日志（加载/卸载/越权访问）。
- **验收**：多人模式开启时有结构化安全日志输出（默认关闭无开销）。
- **量级**：M（设计日志格式 + 埋点）。

### B18 — `--ticks` 非数字校验
- **位置**：`index.js:165`
- **问题**：`--ticks=<非数字>` → `Number()` 为 NaN → 循环 no-op（非漏洞）。
- **建议修复**：`Number.isFinite` 校验，非法给默认值或报错退出。
- **验收**：`--ticks=abc` 启动即报错（非零退出）或回退默认值并打印提示。
- **量级**：XS。

---

## 6. P-D · 测试覆盖补齐（贯穿各期）

### B19 — 补确定性断言与集成测试 ✅
- **位置**：`src/selftest.js`（P-D 测试块）
- **改动**：
  - 食物不重叠：board+snakes+food 挂载，40 次 `snake/eat` 重放，断言 `board.food` 不在蛇身/障碍、在界内；
  - 食物排除 Boss 格：`food.js` 的 `place()` 避开 `ctx.get('boss')?.list()` 占用格；selftest 60 次放置断言不落 Boss 格；
  - `--watch` e2e：复用 `loader._handleManifestChange` 确定性接缝，断言 provider 配置热更新 `before=1 → after=9`（不依赖 `fs.watch` 异步事件）；
  - TTY 启动冒烟：子进程 `FORCE_TTY=1 node src/index.js --ticks=5 --no-sound`，断言退出码 0、不抛错。
- **额外修复**：P-B 遗留的 B11 测试 bug（`lctx.loader` 误引用未定义变量被 `safe` 静默判 FAIL）→ 改为局部 `loader` 实例，B11 恢复绿色。
- **验收**：门禁 **selftest 155/155**、**verify 7/7** 全绿；B7–B19 全部 marked done，本报告归档为「已交付」。
- **量级**：M（测试工程，随 P-A~P-C 代码改动同步追加）。

---

## 7. 执行节奏与门禁关系

1. **单 PR 单能力缝**：每个 B 项独立 PR，降低回归面；manifest 关闭式回滚随时可用。
2. **改一项、补一测**：B7/B11/B13/B15/B19 等的验收断言随代码同一 PR 落地，避免覆盖滞后。
3. **三道门禁不可绕过**：`npm ci` → `selftest` → `verify` 全绿方可 merge；`npm audit` advisory 仅提示。
4. **建议推进顺序**：P-A（安全，最高风险）→ P-B（架构）→ P-C（供应链/可观测）→ P-D（覆盖，穿插执行）。
5. **完成判据**：B7–B19 全部 marked done 且对应断言进 selftest/verify，本报告归档为「已交付」。

---

> 本路线图由软件工坊 AI 协作生成，优先级与版本策略（尤其 B3）请由工程负责人复核拍板。
