# 源端引导与三类交付（S2）

> 父任务：`10-01-safe-migration-productization`（S2 分片）。本文件是**工作副本**，规范条文最终落 `.trellis/spec/`。
> 前置：S1（`10-13-migration-plan-and-write-gate`）已实现 `createMigrationPlan` / `evaluateWriteGate` / `assessRetry`；
> S0 三份取证已落 `10-01/research/`。

## Goal

修一个**现状真实缺口**：`handleHostExport` 只把**转换后的目标包**送进待导出区，
**原始源备份被丢弃**（`index.js:1672-1799`：`rawBackupBlob` 在 `needsTransform` 时被 `finalBlob` 顶替，原包不再入队）。
⇒ 用户拿不到「保底文件」，一旦目标导入出问题无从回退（`R-04` / `AC-03`）。

本片把源端交付抽成**可测纯函数**并接入，让用户拿到**三类独立产物**：**源备份**（保底）、**目标包**（迁移用）、**独立报告**。

## Requirements

| 编号 | 要求 |
| --- | --- |
| R1 | 新增 `src/ui/migration-controller.js` 的 `buildSourceDeliveries(input)`：**纯函数**，输入源备份 / 目标包 / 报告，输出待入队项数组；不读 DOM、不发请求 |
| R2 | 三类交付**用途不混淆**：源备份是**未转换原包**、目标包是**转换后原生布局包**、报告是独立文本；命名含用途标识 |
| R3 | **无转换时不重复**：`hasTransform=false`（源即目标）只入队一份，不产生「源备份 == 目标包」的两条重复项 |
| R4 | `src/storage/db.js` 的 `ORIGINS` 新增 `SOURCE_BACKUP`（`source-backup`）与 `REPORT`（`report`）；`src/ui/export-queue.js` 的 `ORIGIN_LABELS` 同步加中文标签 |
| R5 | `index.js` 的 `handleHostExport` **接入**三类交付（单包 / 分卷 / 增量三种分支都要拿到源备份与报告）；**不改**现有转换、分卷、增量分支的逻辑 |
| R6 | 新增 `test/migration-journey.test.js`（源端部分）：覆盖 R1–R3 的纯函数行为 |
| R7 | **不引入**第二个执行者：本轮**不**把 `btnHostFetch` 委托给新控制器（那是 S5 的入口切换）；只抽离交付构建 |
| R8 | 不新增依赖、不改 `src/vendor/**`（`L1-MR-11` / `C-4`）；目标包**不得**加新外层包裹（`AC-03`） |

## Acceptance Criteria

- [ ] **AC1** `buildSourceDeliveries` 在有转换时返回**三项**：源备份（`origin='source-backup'`，原包字节）+ 目标包（`origin='converted'`）+ 报告（`origin='report'`）；
- [ ] **AC2** `hasTransform=false` 时**只返回源备份 + 报告**（不产生重复的目标包项）；
- [ ] **AC3** 三类命名可区分用途（源备份 / 目标包 / 报告各自带标识后缀），且目标包**不含**外层套装目录；
- [ ] **AC4** `handleHostExport` 三种分支（单包 / 分卷 / 增量）执行后，待导出区**都**含源备份与报告项；
- [ ] **AC5** 特征锁定：现有转换产物的**条目集合与布局**不变（接入三类交付**不改变**目标包本身）；
- [ ] **AC6** `ORIGINS.SOURCE_BACKUP` / `ORIGINS.REPORT` 在 `export-queue` 渲染出中文标签（非回落「转换生成」）；
- [ ] **AC7** `npm test` 全绿；五守卫 + `build` 零回归（相对开工基线）。

## Constraints

- **C1** `buildSourceDeliveries` 必须纯：无 DOM / `fetch` / `window`，可在 Node 直接测（`L1-MR-6`）。
- **C2** 接入保守：只在 `handleHostExport` 的产物入队点改造，**不重构**函数骨架、不改 `btnHostFetch` 委托。
- **C3** 不新增依赖、不改 vendor。
- **C4** 不碰实例、不发网络请求、不运行 E2E。

## Out of Scope

- 不做控制器委托与向导 UI（S5 的入口切换）。
- 不做目标写入安全门接入（S3）。
- 不做目标核对（S4）。
- 不做 PT 原生归档转换（独立格式适配分片）。

## Open Questions

| 编号 | 问题 | 处置 |
| --- | --- | --- |
| OQ-1 | 「源备份」是否要加用途后缀（会改变原包文件名）？ | 本片取**加后缀**（`_源备份`）以保证 `AC-03` 的「用途不混淆」；若用户要求保留原名，S5 再调 |
| OQ-2 | 报告以文本文件入队还是仅 UI 呈现？ | 本片**两者都做**：UI 呈现沿用 `view.renderReport`，同时入队一份 `.txt` 供领取（`AC-03`「可领取」） |
