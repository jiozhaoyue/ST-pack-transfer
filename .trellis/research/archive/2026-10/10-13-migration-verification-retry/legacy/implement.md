# S4 执行计划：核对结论与重试

> 对应 `prd.md`（AC1–AC6）与 `design.md`（§1–§7）。复选框随执行**实时勾选**。

## 0 前置

- [x] **0.1** 用户授权 S4（2026-10-13 AskUserQuestion）。
- [x] **0.2** 基线（2026-10-13 实测）：`npm test` = **68 文件 / 651 passed / 2 skipped**；五守卫全 `EXIT=0`；`build` `EXIT=0`。

## 1 失败测试先行

- [x] **1.1** 新增 `test/migration-verification.test.js`（9 用例）：四态/优先级/空证据 + 归一 + 「写一半后断开」夹具。
- [x] **1.2** 定向跑通。**诚实记录**：实现与测试同批写就，未严格先红；判别力由四态**优先级断言**（failed 压 unknown/exception）保证。

## 2 实现

- [x] **2.1** `migration-evidence.js` 加 `classifyOutcome` + `buildVerificationEvidence` + `MIGRATION_OUTCOMES`。
- [x] **2.2** `index.js` 加 `buildRestoreVerification` 并接 `classifyOutcome`，单条恢复按 outcome 显示（文案不再夸大为「成功」）。
- [x] **2.3** 定向测试 9/9 绿。

## 3 回归与守卫

- [x] **3.1** `npm test` = **69 文件 / 660 passed / 2 skipped / exit 0**（基线 651 + 新 9，零回归）。
- [x] **3.2** 五守卫全 `EXIT=0`；`build` `EXIT=0`。
- [x] **3.3** 改动仅限 `migration-evidence.js` / `index.js` + 新测试 + 任务/规范文档。

## 4 规范落条文

- [x] **4.1** 契约落 `.trellis/spec/frontend/migration-safety-and-evidence.md` §3.3（四态优先级、归一字段、「未逐条读回」边界）。

## 5 提交与推送

- [x] **5.1** 显式 pathspec 提交；校验暂存区。
- [x] **5.2** 推送 origin。

## 回退点

撤回 `classifyOutcome` 调用与文案改动即回现状（不影响已写数据）。
