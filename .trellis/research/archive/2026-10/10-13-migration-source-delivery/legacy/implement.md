# S2 执行计划：源端三类交付

> 对应 `prd.md`（AC1–AC7）与 `design.md`（§1–§6）。
> **勾选纪律**：复选框随执行**实时勾选**。

## 0 前置

- [x] **0.1** 用户授权 S2 全流程（2026-10-13 AskUserQuestion）。
- [x] **0.2** 基线（2026-10-13 实测）：`npm test` = **66 文件 / 635 passed / 2 skipped / exit 0**。
- [x] **0.3** 五守卫全 `EXIT=0`；`npm run build` `EXIT=0`。

## 1 特征锁定（接入前）

- [x] **1.1** 读 `index.js:1493-1835` 全量 `handleHostExport`；确认产物出口实为**两处**：
      分卷出口（`splitResult.parts` 入队处）与单包出口（**含 delta**，`isDeltaPatch` 决定 origin）——
      增量不单独入队，走单包出口。
- [x] **1.2** 现有目标包由 `runConversionTask` 产出、字节不变（`AC-05`：`buildSourceDeliveries` 只引用不复制）。

## 2 失败测试先行

- [x] **2.1** 新增 `test/migration-journey.test.js`（7 用例），覆盖 AC1/AC2/AC3/AC6 及契约边界。
- [x] **2.2** 定向跑通。**诚实记录**：实现与测试同批写就，未严格先红；判别力由「blob 同一引用」「无转换不重复」等**结构断言**保证。

## 3 实现

- [x] **3.1** `src/storage/db.js`：`ORIGINS` 加 `SOURCE_BACKUP` / `REPORT`。
- [x] **3.2** `src/ui/export-queue.js`：`ORIGIN_LABELS` 加「源备份」/「迁移报告」标签。
- [x] **3.3** 新增 `src/ui/migration-controller.js`：`buildSourceDeliveries`（纯函数，target.origin 可覆盖）。
- [x] **3.4** `index.js` 接入：单包出口改为三类交付；分卷出口追加「源备份 + 报告」；提升 `conversionReport` 到块外。
- [x] **3.5** 定向测试 7/7 绿。

## 4 回归与守卫

- [x] **4.1** `npm test` = **67 文件 / 642 passed / 2 skipped / exit 0**（基线 635 + 新 7，零回归）。
- [x] **4.2** 五守卫全 `EXIT=0`；`npm run build` `EXIT=0`。
- [x] **4.3** 改动仅限 2 新文件（`migration-controller.js`、`migration-journey.test.js`）+ `db.js` / `export-queue.js` / `index.js` 的加性改动 + 任务/规范文档。

## 5 规范落条文

- [x] **5.1** 契约落 `.trellis/spec/frontend/migration-user-journey.md`：状态行更新为「源端三类交付已于 S2 实现」，
      §3.4 补 `buildSourceDeliveries` 的 origin / 不重复 / 无外层套装说明与接入点。

## 6 提交与推送

- [x] **6.1** 显式 pathspec 提交；`git diff --staged --name-only` 恰等于本片集合（14 文件）。
- [x] **6.2** 已推送 origin（`6ff827c..f30e68a`，不推 upstream）。

## 回退点

未接按钮委托、未改转换逻辑；撤回 `buildSourceDeliveries` 与两处 `enqueue` 改动即完全回退（`design.md` §5）。
