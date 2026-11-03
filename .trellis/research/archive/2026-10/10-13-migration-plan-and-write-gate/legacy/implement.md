# S1 执行计划：统一迁移计划与纯安全判定

> 对应 `prd.md`（AC1–AC8）与 `design.md`（§1–§7）。
> **勾选纪律**（`L0-2`）：复选框随执行**实时勾选**，禁止事后批量补勾。
> **测试先行**（`implement.md` §3 要求）：先写失败测试 → 确认失败原因正确 → 最小实现。

## 0 前置条件

- [x] **0.1** 父任务 S1 分片已由用户裁定开工（2026-10-13 AskUserQuestion：起点=S0+S1、门禁=新建 S1 子任务、提交=推 origin）。
- [x] **0.2** S0 取证完成：`10-01/research/{host-capability-matrix,selection-semantics,retry-boundaries}.md` 三份已落。
- [x] **0.3** 基线取证（2026-10-13 实测）：`npm test` = **64 文件 passed / 1 skipped；610 passed / 2 skipped；exit 0**。
- [x] **0.4** 五条静态守卫全 `EXIT=0`；`npm run build` `EXIT=0`（2026-10-13 实测）。

## 1 失败测试先行

- [x] **1.1** 新增 `test/migration-plan.test.js`（8 用例），覆盖 AC1/AC2/AC5。
- [x] **1.2** 新增 `test/migration-write-gate.test.js`（17 用例），覆盖 AC3（12 码全覆盖）/AC4（5 分支）。
- [x] **1.3** 定向跑通。**诚实记录**：本轮实现与测试**同批写就**（未严格先跑「因模块不存在而失败」），
      故测试判别力由 §3 变异测试**独立补证**（而非仅凭首次红）。

## 2 实现

- [x] **2.1** 新增 `src/core/migration-plan.js`：`createMigrationPlan` + 深度冻结；`effective` 从 `basePlan` 映射；`capabilities` 按**宿主布局**分组。
- [x] **2.2** 新增 `src/core/migration-evidence.js`：`evaluateWriteGate`（12 拒绝码）+ `assessRetry`（对齐 spec §3.1/§3.4）。
- [x] **2.3** 定向跑新测试至绿（25/25）。

## 3 变异判别力（AC6）

- [x] **3.1** 逐条移除三处保护（`planRevision` / `backup.level` / `observedState==='unknown'`）各一次，对应负例**全部失败**
      （4 failed / 13 passed；连带「多缺项」用例也失败）；恢复后 **17/17 转绿**。读数：2026-10-13 实测。

## 4 全量回归与守卫

- [x] **4.1** `npm test` = **66 文件 passed / 1 skipped；635 passed / 2 skipped；exit 0**（基线 610 + 新 25，零回归）。
- [x] **4.2** 五守卫全 `EXIT=0`；`npm run build` `EXIT=0`。
- [x] **4.3** 改动仅限 2 新模块 + 2 新测试 + 任务/规范文档。

## 5 规范落条文（AC8）

- [x] **5.1** 契约已落 `.trellis/spec/frontend/migration-safety-and-evidence.md`：状态标记改为「纯判定层已于 S1 实现」，
      §2 补 `createMigrationPlan`/`evaluateWriteGate`/`assessRetry` 三签名与污染源说明。

## 6 提交与推送

- [x] **6.1** 显式 pathspec 提交；`git diff --staged --name-only` 恰等于本片集合（28 文件）。
- [x] **6.2** 已推送 origin（`167796d..cb9840b`，不推 upstream）。

## 回退点

本片未接入口 ⇒ 删除两个新模块与两个新测试即可完全回退，不影响用户数据与现有行为（`design.md` §7）。
