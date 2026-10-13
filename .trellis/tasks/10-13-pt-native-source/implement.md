# 实施清单：PT 原生归档作为源

> 复选框随执行实时勾选（本片为单会话连续执行）。

## 1. 核心模块

- [x] 新建 `src/core/pt-archive.js`：`parsePtManifest`（format/版本/结构/路径安全/唯一性）+ `classifyPtEntry` + `createPtNativeHubReader`（两趟读取、逐条目 sha256 校验、8 类模块重建、`thirdPartyFolders` 统计）。
- [x] `transform.js`：`convert()` 对 `PT_NATIVE` 源改为「重建 + `routingLayout=ST`」；`thirdPartyFolders` 预扫改走重建器；`appendFrom` 对 PT 源显式作废（无续传）。
- [x] `plan-preview.js`：`generatePlan()` 同源处理（`readBlobs=false`）。
- [x] `migration-plan.js`：拆 `VALID_SOURCE_LAYOUTS`（含 `pt-native`）/ `VALID_TARGET_LAYOUTS`。

## 2. 测试与夹具

- [x] `fixtures/gen.js`：新增 `ptEntries()` + `ptManifest()`（含逐条目 sha256）+ `fixture-pt.zip` 入 `generateAll`。
- [x] `test/pt-archive.test.js`：识别 / 坐标解析 / manifest 校验 / 重建 8 类落位 / 内部条目不泄漏 / sha256 负例 / 端到端 pt→st/l/tt。
- [x] `test/migration-plan.test.js`：`pt-native` 作源通过、作目标拒绝。
- [x] `test/gen-fixtures-cli.test.js`：夹具清单加 `fixture-pt.zip`。
- [x] `e2e/standalone/specs/cross-host.e2e.cjs`：源加 PT 原生（带 `expect` 计数）⇒ 4 源 × 4 目标 = 16 条。

## 3. 验证命令（全部实跑）

- [x] `npx vitest run` ⇒ **734 passed / 2 skipped / 0 failed**（基线 724 ⇒ 净增 10，零回退）。
- [x] 五守卫（css-scope / dom-injection / template-source / dom-scope / control-consumer）⇒ 全 EXIT 0。
- [x] `npm run build` + `npm run build:offline` ⇒ 全绿。
- [x] `node e2e/standalone/run.cjs --only cross-host --rebuild` ⇒ **94/94**，16 条路径逐条 OK。
- [x] `node e2e/standalone/run.cjs`（全量独立形态）⇒ **496/496**，零失败。

## 4. 规范与文档同步

- [x] `guides/tavern-datapack-formats.md`：PT 布局行改写 + 新增「PT 原生归档重建」节（映射表 / 两趟 / 有损点 / 校验 / 证据面）。
- [x] `guides/plugin-driven-pack-and-write-guards.md` §9：3 源 → 4 源，12 → 16 条，PT 出边打通。
- [x] `guides/standalone-web-and-cloud-e2e.md`：cross-host spec 行更新。
- [x] `backend/error-handling.md`：删「暂不支持」行，加 PT 版本不符 / sha256 不符两条。
- [x] `backend/database-guidelines.md`：PT 原生行改写。
- [x] `backend/directory-structure.md` + `frontend/directory-structure.md`：加 `pt-archive.js`。
- [x] `docs/DEVELOPER-GUIDE.md` §6：AC-12 行更新 + PT 源有损点 / 无续传两行。
- [x] `CLAUDE.md`：core 清单加 `pt-archive.js`；测试基线数字更新。

## 5. 收口

- [ ] 提交（显式 pathspec，校验暂存集合）+ 推送 origin。
- [ ] 回填父任务 `10-01` 的 `implement.md`（S8/D-23 分片）与 PRD `AC-12` 注记。
- [ ] 归档本子任务。
