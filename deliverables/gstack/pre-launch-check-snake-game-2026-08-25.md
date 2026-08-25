# 上线前全检报告 · Cordis 贪吃蛇（E:\docs\snake-game）

**日期**：2026-08-25
**场景**：上线前检查（代码审查 + 安全审计 + QA 测试与发布）
**参与成员**：产品评审员（代码审查 / review skill）、安全官（STRIDE + OWASP 审计）、质量门神（QA 测试与发布 / qa skill）

---

## 📌 TL;DR（执行摘要）

- **整体结论**：🟡 **有条件通过（Conditional Go）** —— 三项检查单独均给出「有条件通过」，综合存在 **3 个上线前阻塞项**，修复后转 🟢 Go。
- **阻塞项数量**：3（B2 lockfile 指向本地 HTTP 镜像 / B1 AI 热插拔重复挂载 / B4 自测 Boss 段 flaky）。
- **严重度分布**：🔴 0 / 🟠 1 / 🟡 8 / 🟢 多项（低）。
- **关键更正（去风险）**：主理人点名的两处疑虑（`index.js:111` fiber 就绪 await、`index.js:154` SIGINT 退出监听）经 Cordis 实测探针验证 **均非 bug** —— Cordis Fiber 确实暴露 `async await()`，且事件为双向冒泡（`meta/quit` → `game/quit` 桥接有效）。
- **下一步**：修复 3 个阻塞项 → 重跑 `node src/selftest.js`（应连续 101/101、exit 0）与 `node scripts/verify-all.mjs` → 转 🟢 Go。

---

## 🎯 核心结论卡片

| 项目 | 内容 |
|------|------|
| Go / No-Go | 🟡 条件 Go（3 阻塞项修复后转 🟢） |
| 严重度分布 | 🔴 0 / 🟠 1 / 🟡 8 / 🟢 多项 |
| 关键行动项 | 3 条阻塞（P0）+ 6 条建议（P1/P2） |
| 建议负责人 | 发布/DevSecOps（B2）、核心开发（B1/B4/B5/B6）、QA（B4 复验） |
| 产品健康分（QA） | 92 / 100（功能完整，唯一真问题是 flaky 测试） |

---

## 1. 各成员核心结论

### 🔍 产品评审员（代码审查，review skill 7 透镜 + Cordis 探针）
- **核心判断**：架构应用得当（capability service / revertible effect / reactive coeffect / 基于 fiber 原语的真实 HMR），核心玩法经自带 101/101 自测佐证正确；点名的两处疑虑实测均非问题。
- **关键建议**：1 项高危 **F1 AI 热插拔重复挂载**（`index.js:125-135`，multiplayer/p2 下双 AI 驱动 + 孤儿 fiber 累积）须强制修复；3 项中危（Boss shockwave 无视护盾、HMR provider 重载未 await dispose、`occupiedGlobal` 死参数）建议上线前处理。

### 🛡️ 安全官（STRIDE + OWASP Top 10 审计）
- **核心判断**：针对「本地终端游戏、默认无网络」威胁模型设计良好 —— 无远程攻击面、无命令/代码注入、无密钥泄露、REGISTRY 白名单阻断未授权代码加载。所有发现均为中低危。
- **关键建议**：**P0 阻塞 B2** —— `package-lock.json` 全部 `resolved` 指向 `http://127.0.0.1:8899`（本地 HTTP 镜像、无 TLS），CI/用户端 `npm ci` 不可复现、分发阻断；另建议 cordis RC 依赖 pin 稳定版、对 `StorageService.filePath` 做沙箱化、生产环境固化 manifest 信任边界。

### ✅ 质量门神（QA 测试与发布，qa skill）
- **核心判断**：产品功能完整，headless 演示与全部研调扩展冒烟全绿、退出干净（exit 0）；健康分 92/100。唯一真问题是 **ISSUE-001 自测 Boss 段 flaky**（非产品缺陷，但 CI 红不可接受）。
- **关键建议**：**阻塞项 B4** 加固第一 Boss 测试块（隔离不受控蛇）；补齐食物不重叠断言、TTY 启动冒烟、`--watch` 端到端验证等覆盖缺口。发布检查清单与回滚预案已就绪。

---

## 2. 综合审查发现（去重合并后按严重度排序）

| # | 严重度 | 类别 | 位置 | 问题描述 | 建议 | 来源 |
|---|--------|------|------|----------|------|------|
| B1 | 🟠 高 | 逻辑/健壮性 | `index.js:125-135` | AI 热插拔重复挂载：切换时未先 dispose 旧实例即覆盖，同一 provider 挂两份 → 双 `tick` 监听器 → p1 及 cpu 对手双 AI 驱动、孤儿 fiber 累积；且 `root.plugin(..., {})` 传空 config 丢失真实配置 | 切换前判 `other` 是否已挂载（已存在则跳过/先 dispose）；用 manifest 真实 config | 产品评审员 |
| B2 | 🟡 中（P0 阻塞） | 供应链/完整性 | `package-lock.json:19,25,50` | 依赖全部 `resolved` 指向 `http://127.0.0.1:8899`（本地 HTTP 镜像、无 TLS）；CI/用户端 `npm ci` 失败 → 无法复现安装 / 分发阻断 | 重新生成 lockfile 指向可信 HTTPS registry（npmjs 或内部代理），CI 用 `npm ci` | 安全官 |
| B3 | 🟡 中 | 供应链 | `package.json:13`;`package-lock.json:24` | 运行时依赖 `cordis@4.0.0-rc.8` 为 release candidate，稳定性/供应链风险 | pin 到 cordis 稳定版或书面接受 RC 风险；CI 加 `npm audit` | 安全官 |
| B4 | 🟡 中（阻塞） | 测试/Flaky | `selftest.js:696-731` | 第一 Boss 测试块挂载不受控蛇，随机布局下约 1/8 概率被蛇击杀 → 6 断言级联 FAIL；非产品缺陷但 CI 红不可接受 | 隔离 Boss（设 p1 `alive=false` / 移出棋盘 / 断言前不 tick / 临时无敌），仅验证存在/移动/在界内/血条/攻击模式 | 质量门神 |
| B5 | 🟡 中 | 逻辑 | `boss.js:107` | Boss shockwave 无视 extra-life 护盾：`isGlobalActive('extra-life')` 恒 false（duration:0 不进 active map），护盾免死承诺失效 | 改查 `s._shield > 0` 并消费一次（与 `snake.js:82 consumeShield` 一致） | 产品评审员 |
| B6 | 🟡 中 | 健壮性/架构 | `loader.js:167-195` | HMR provider 重载未 `await` dispose，重挂与旧 fiber 注销存在瞬时重注册竞态 | `_dispose` 返回 promise，调用方 `await` 后再 `plugin` | 产品评审员 |
| B7 | 🟡 中 | 架构/健壮性 | `loader.js:174-189` | HMR 级联仅一层：A→B→C 多级依赖重载 A 只重挂 B 不重挂 C，C 持陈旧 `ctx.B` 引用 | provider 重载做依赖图闭包遍历；或固化「插件一律动态读 `ctx.X`」约定 | 产品评审员 |
| B8 | 🟡 中 | 可维护性/逻辑陷阱 | `snakes.js:61-72` | `occupiedGlobal` 死参数 `exceptId`：声明但未使用，靠 `allowTail=true` 规避；未来 `allowTail` 置 false 将引入自撞误判 | 真正实现排除，或删参数并改注释 | 产品评审员 |
| B9 | 🟡 中（设计） | 注入/路径穿越 | `storage.js:18,22,47-48` | `StorageService.filePath` 由 manifest 控制、未规范化/无白名单；启用 storage 后可对任意路径读/写（默认 `enabled:false`） | 沙箱基目录 + 拒绝绝对路径与 `..` 穿越 + `path.normalize` 前缀校验 | 安全官 |
| B10 | 🟡 中（设计/信任） | 不安全设计 | `index.js:21-23`;`loader.js:205`;`--watch` | manifest 无完整性/签名校验；`--watch` 下任意可写 manifest 的实体可运行时改配置（含 B9 的 filePath） | 生产视为只读/加 SHA256 签名；文档化信任边界 | 安全官 |
| B11 | 🟢 低 | 健壮性 | `loader.js:198` + `index.js:157-159` | `watch` 丢失 headless overrides：未透传 `overrides`，`--headless --watch` 同用 timer.auto 回退 true | `loader.watch(manifestPath, overrides)` 透传 | 产品评审员 |
| B12 | 🟢 低 | 可维护性 | `multiplayer.js:42` | 卸载时直接重赋值 `ctx.snakes.list`，未来闭包/快照捕获会读陈旧引用 | 提供 `SnakesService.remove(id)` 受控移除 | 产品评审员 |
| B13 | 🟢 低 | 健壮性 | `snake.js:127-137` | 进食后未清 `board.food`，food 插件缺席时滞留已吃格 → 幽灵食物（默认启用 food 故无影响） | 进食分支显式 `board.food = null` | 产品评审员 |
| B14 | 🟢 低 | 可维护性 | `loader.js:224-237` | 死代码 `mountFromManifest` 导出无引用 | 删除或补用途说明 | 产品评审员 |
| B15 | 🟢 低 | 健壮性 | `loader.js:94-96` | `configEqual` 对键序敏感，可能误触发 provider 重载；含函数/undefined 配置会丢失 | 规范化比较（按 key 排序后 stringify 或浅比较） | 产品评审员 |
| B16 | 🟢 低 | 日志/监控 | 全局 | 无安全审计日志（本地单人游戏影响低） | 未来联网/多人补安全事件日志 | 安全官 |
| B17 | 🟢 低 | 注入（边缘） | `sound-wav.js:59-61` | PowerShell `-Command` 单引号包裹路径，若用户临时目录含 `'` 会破坏字面量（路径由 OS 决定、实际不可利用） | 参数化/转义，或避免字符串拼接 | 安全官 |
| B18 | 🟢 低 | 稳健性 | `index.js:165` | `--ticks=<非数字>` → `Number()` 为 NaN → 循环 no-op，非漏洞 | `Number.isFinite` 校验并给默认值/报错 | 安全官 |
| B19 | 🟢 低 | 覆盖率 | 自测缺断言 | 食物不重叠（探针 0 重叠、行为正确）、TTY 启动（无 TTY）、`--watch` e2e、食物排除 Boss 格 未覆盖/缺显式断言 | 补确定性断言与集成测试 | 质量门神 |

---

## ⛔ 阻塞项清单（Go/No-Go 必列）

| ID | 阻塞项 | 修复后验收 |
|----|--------|-----------|
| B2 | lockfile 指向本地 HTTP 镜像，分发/CI 不可复现 | `npm ci` 在干净环境成功；`package-lock.json` 所有 `resolved` 为可信 HTTPS |
| B1 | AI 热插拔重复挂载（multiplayer/p2 下双驱动） | `--p2`/`--multiplayer` 下按 `a` 反复切换 N 次，仅 1 份 input-ai、无孤儿 fiber、蛇单驱动 |
| B4 | 自测 Boss 段 flaky | `node src/selftest.js` 连续 ≥10 次稳定 101/101、exit 0 |

---

## ✅ 行动清单

| # | 行动 | 负责方 | 紧急度 | 期望完成 |
|---|------|--------|--------|---------|
| 1 | 重新生成 `package-lock.json` 指向可信 HTTPS registry，CI 用 `npm ci` | 发布/DevSecOps | **P0（阻塞）** | 发布前 |
| 2 | 修复 AI 热插拔重复挂载（`index.js:125-135`）：切换前判已挂载、用真实 config | 核心开发 | **P0（阻塞）** | 发布前 |
| 3 | 加固第一 Boss 自测块隔离不受控蛇，消除 flaky | 核心开发/QA | **P0（阻塞）** | 发布前 |
| 4 | cordis 从 RC pin 稳定版（或书面接受 RC）+ CI 加 `npm audit` | 发布 | P1 | 发布前 |
| 5 | 修复 Boss shockwave 无视护盾（`boss.js:107` 改查 `s._shield>0`） | 核心开发 | P1 | 发布前 |
| 6 | HMR provider 重载 `await` dispose（`loader.js` `_dispose`） | 核心开发 | P1 | 发布前 |
| 7 | `StorageService.filePath` 沙箱化 + manifest 信任边界文档化（B9/B10） | 核心开发 | P2 | 后续迭代 |
| 8 | HMR 多级依赖闭包重载、`occupiedGlobal` 死参数等加固（B7/B8/B11~B15） | 核心开发 | P2 | 后续迭代 |
| 9 | 补测试覆盖：食物不重叠断言、TTY 启动冒烟、`--watch` e2e、食物排除 Boss 格（B19） | QA | P2 | 后续迭代 |

---

## 🔁 回滚预案（Rollback Plan）

- **性质**：本地 Node CLI，无服务端/云部署、无数据库迁移。
- **代码回滚**：`git revert` / 回退到上一个良好 tag；cordis 依赖锁于 `package-lock.json`。
- **能力回滚（特色）**：本作「一切皆插件」，任何新能力出问题 → 将 `manifest.json` 对应插件 `enabled:false` 即可关闭（无需改代码），或回退 manifest 到已知良好版本。
- **数据回滚**：存档文件（如 `.snake-p6-*.json`）若损坏，直接删除即可（仅成就解锁重置，非破坏性）。
- **健康检查**：CI 中 `node src/selftest.js` 与 `node scripts/verify-all.mjs` 退出码非 0 即告警；headless 演示非 0 即阻断发布。
- **验证回滚生效**：回退后重跑 `node src/index.js --headless --ticks=400` 确认 exit 0 且打印正常。

---

## ⚠️ 待完善 / 已知局限

- 三位成员均为**静态 + 实测只读审查**，未做真实多用户/网络压测（项目默认无网络，multiplayer 为本地 AI）。
- 代码审查的 B1/B5/B8 等需在 **multiplayer / p2 / boss** 玩法下动态验证并发时序（当前自测 101/101 通过，但可能未覆盖该路径的并发竞态）。
- 安全审计**未跑 `npm audit`**（离线本地镜像环境）；B3 建议 CI 补 `npm audit` 并核对 cordis 最新稳定版。
- QA 的 **TTY 启动**与 **`--watch` 端到端** 未覆盖（无 TTY CI 环境，headless 等价替代核心逻辑）。

---

## 📚 成员产出索引

- gstack-product-reviewer（产品评审员 / 代码审查）原始产出：逐文件静态审查 + `review` skill 7 透镜 + Cordis 事件双向冒泡/Fiber.await 探针验证；结论 🟡 有条件通过，1 高 + 3 中须修。
- gstack-security-officer（安全官 / 安全审计）原始产出：STRIDE 威胁建模 + OWASP Top 10 (2021) 检查表双框架静态审计；结论 🟡 有条件通过，1 P0 阻塞（lockfile）+ 1 P1 + 2 P2。
- gstack-qa-lead（质量门神 / QA 与发布）原始产出：实际运行 selftest/verify/headless 演示 + 发布检查清单 + 回滚预案；健康分 92/100，结论 🟡 条件 Go，1 阻塞（flaky 自测）。

---

> 本报告由软件工坊 AI 协作生成，关键决策请由工程负责人复核。
