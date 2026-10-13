# S3 执行计划：目标写入门禁

> 对应 `prd.md`（AC1–AC6）与 `design.md`（§1–§7）。复选框随执行**实时勾选**。

## 0 前置

- [x] **0.1** 用户授权 S3（2026-10-13 AskUserQuestion）。
- [x] **0.2** 基线（2026-10-13 实测）：`npm test` = **67 文件 / 642 passed / 2 skipped**；五守卫全 `EXIT=0`；`build` `EXIT=0`。

## 1 特征锁定

- [x] **1.1** 读 `index.js` 的 `runBatchRestore` 与 `btnConfirmRestore`，确认**两处** `restoreToHost` 调用点均无前置门禁。
- [x] **1.2** 确认 `workbench-template.js` 恢复对话框结构（单一模板源，`index.html` 为空骨架）。

## 2 失败测试先行

- [x] **2.1** 新增 `test/migration-target-gate.test.js`（9 用例）：端口替身计数 + `buildTargetEvidence` 分支。
- [x] **2.2** 定向跑通。**诚实记录**：实现与测试同批写就，未严格先红；判别力由「门禁不过 ⇒ calls===0」的**计数断言**保证。

## 3 实现

- [x] **3.1** `migration-controller.js` 加 `guardedRestore` + `buildTargetEvidence`。
- [x] **3.2** `workbench-template.js` 恢复对话框加 `#restore-backup-confirmed` 勾选。
- [x] **3.3** `index.js` 单条路径接入：`guardedRestore` 包装 `restoreToHost`（保持同步段后 `refreshExportQueueUI` 渲染取消入口）。
- [x] **3.4** `index.js` 批量路径接入：`guardedRestore` 包装 `runBatchRestore`，开批前一次门禁。
- [x] **3.5** 对话框打开时 `resetRestoreBackupCheck()` 重置为未勾选。
- [x] **3.6** 定向测试 9/9 绿。

## 4 回归与守卫

- [x] **4.1** `npm test` = **68 文件 / 651 passed / 2 skipped / exit 0**（基线 642 + 新 9，零回归）。
- [x] **4.2** 五守卫全 `EXIT=0`（含新增控件声明后 `check:control-consumer` 通过）；`build` `EXIT=0`。
- [x] **4.3** 改动仅限 `migration-controller.js` / `workbench-template.js` / `index.js` / `scripts/control-consumer-guard.js` + 新测试 + 任务/规范文档。

## 5 规范落条文

- [x] **5.1** `guardedRestore` 契约落 `.trellis/spec/frontend/migration-safety-and-evidence.md` §2（门禁在写入之前、无第二入口、勾选重置）。

## 6 提交与推送

- [x] **6.1** 显式 pathspec 提交；暂存区恰为 14 文件。
- [x] **6.2** 已推送 origin（`3703de6..26f3ed1`，不推 upstream）。

## 回退点

撤回 `guardedRestore` 调用与 UI 勾选即回现状（`design.md` §6）。
