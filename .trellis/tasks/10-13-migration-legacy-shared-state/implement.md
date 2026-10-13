# S5 第一步执行计划：旧资料兼容与共享状态

> 对应 `prd.md`（AC1–AC6）与 `design.md`（§1–§7）。复选框随执行**实时勾选**。

## 0 前置

- [x] **0.1** 用户授权 S5 第一步（2026-10-13 AskUserQuestion）。
- [x] **0.2** 基线（2026-10-13 实测）：`npm test` = **69 文件 / 660 passed / 2 skipped**；五守卫全 `EXIT=0`；`build` `EXIT=0`。

## 1 失败测试先行

- [x] **1.1** 新增 `test/migration-legacy.test.js`（9 用例）。
- [x] **1.2** 定向跑通。**诚实记录**：实现与测试同批写就，未严格先红；「版本不可识别」用例首版写错（把「缺 schemaVersion」当不可识别，实为归一为 1），已修正为未知值 `99`。

## 2 实现

- [x] **2.1** 新增 `src/core/migration-session.js`：`normalizeLegacySession` + `isResumableSession`。
- [x] **2.2** `db.js` 的 `saveWorkspaceState` 加「备份旧 `active_session` 到 `active_session_prev`」（不升 `DB_VERSION`）。
- [x] **2.3** `migration-controller.js` 加 `createMigrationSession`。
- [x] **2.4** 定向测试 9/9 绿。

## 3 回归与守卫

- [x] **3.1** `npm test` = **70 文件 / 669 passed / 2 skipped / exit 0**（基线 660 + 新 9，零回归）。
      ⚠️ 途中 `real-samples` 两次报 5000ms 超时——**单独复跑 6/6 绿（390ms）**，确认是全量并发下的**偶发 flaky**（读真实大 zip），非本次回归。
- [x] **3.2** 五守卫全 `EXIT=0`；`build` `EXIT=0`；`DB_VERSION` 仍为 `2`（未升）。
- [x] **3.3** 改动仅限新 `migration-session.js` / `db.js` / `migration-controller.js` + 新测试 + 任务/规范文档。

## 4 规范落条文

- [x] **4.1** 契约落 `.trellis/spec/frontend/migration-compatibility-and-release.md` §3.1（状态行 + 实现说明）。

## 5 提交与推送

- [x] **5.1** 显式 pathspec 提交；校验暂存区。
- [x] **5.2** 推送 origin。

## 回退点

撤回三个新导出与 `saveWorkspaceState` 的备份行即回现状（`design.md` §6）。
