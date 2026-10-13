# 实施清单：迁移核对证据构造与重试候选（S4 剩余项）

## 1. 纯模块

- [x] 新建 `src/core/migration-verification.js`：`buildRestoreVerification`（从 index.js 抽出）+ `summarizeVerification` + `selectRetryCandidates`（双重门）。纯逻辑，禁 DOM/网络。

## 2. 接线

- [x] `index.js`：删内联 `buildRestoreVerification`，改 import；`buildVerificationEvidence` 从 import 移除（已不在本文件使用）；恢复成功分支用 `summarizeVerification` 输出「机器核对 N / 人工确认 M，覆盖 X」日志。

## 3. 测试

- [x] `test/migration-verification.test.js`：新增 3 组（`buildRestoreVerification` 三形态 / `summarizeVerification` 汇总 / `selectRetryCandidates` 双重门含判别力）。

## 4. 验证命令（实跑）

- [x] `npx vitest run` ⇒ **768 passed / 2 skipped / 0 failed**（零回退）。
- [x] 五守卫 + `build` + `build:offline` ⇒ 全绿。
- [x] `node e2e/standalone/run.cjs --rebuild` ⇒ **496/496** 全绿。

## 5. 规范与文档

- [x] `frontend/migration-safety-and-evidence.md`：§2 契约清单加 3 个函数 + S4 抽取说明；§3.3 更新。
- [x] `docs/DEVELOPER-GUIDE.md` §6：自动全量读回核对行如实登记（判定就绪 / 执行待接）。

## 6. 收口

- [ ] 提交（显式 pathspec）+ 推送 origin。
- [ ] 回填父任务 `10-01` 的 `implement.md` S4 勾选。
- [ ] 归档本子任务。
