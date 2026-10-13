# 实施清单：目标预检与备份证据（S3 剩余项）

## 1. 纯模块（模块化核心）

- [x] 新建 `src/core/migration-target.js`：`CONFLICT_STATES`/`BACKUP_LEVELS`/`BACKUP_SCOPES`/`BACKUP_RETENTIONS`/`WRITE_CAPABILITY_STATES` + `assessTargetConflicts` + `buildTargetBackupEvidence` + `describeBackupEvidence` + `describeConflictState` + `describeTargetWriteCapability`。

## 2. 门禁与接线

- [x] `src/core/migration-evidence.js`：加 `GATE_REASONS.CONFLICT_UNKNOWN_UNACKNOWLEDGED` + 第 8 门（仅当提供 `conflicts` 时生效）。
- [x] `src/ui/migration-controller.js`：`buildTargetEvidence` 接受 `backup` / `conflicts` / `conflictAcknowledged`（旧参数零变化）。
- [x] `src/ui/workbench-template.js`：恢复对话框加 `#restore-conflict-ack` 与提示文案。
- [x] `index.js`：`buildRestoreGateContext` 传 `conflicts`（`unknown`）+ 勾选；`resetRestoreBackupCheck` 一并重置并刷新文案；`restoreGateReasonsText` 加新码文案。
- [x] `scripts/control-consumer-guard.js`：声明 `restore-conflict-ack` 消费点。

## 3. 测试

- [x] `test/migration-target.test.js`（新）：冲突（known/unknown/归一/空参）+ 备份（auto 三条件/降级/无产物/manual/判别力）+ 呈现（机器 vs 人工；未知不显示无冲突）+ 写能力三态。
- [x] `test/migration-write-gate.test.js`：冲突未知未确认拒绝 / 确认放行 / known 不触发 / 不提供不触发。
- [x] `test/migration-target-gate.test.js`：`buildTargetEvidence` 传 `backup` 优先 / `conflicts` + 确认走门禁。
- [x] `test/real-samples.test.js`：三个真实样本 describe 显式超时（满载并行下读 ~1GB 中央目录超默认 5s，既有边界）。

## 4. 验证命令（实跑）

- [x] `npx vitest run` ⇒ **759 passed / 2 skipped / 0 failed**（基线 734 ⇒ 净增 25，零回退）。
- [x] 五守卫 + `build` + `build:offline` ⇒ 全绿。
- [x] `node e2e/standalone/run.cjs --rebuild` ⇒ **496/496** 全绿。
- [x] `npm run e2e`（实例）⇒ **288/288 / exit 0**。**如实说明**：实例 E2E 加载的是实例内**已部署副本**
  （index.js 112416B ≠ 工作树 139386B），且恢复对话框**不在其覆盖范围**（M-8 只看恢复入口按钮）⇒
  本次改动**未被实例 E2E 覆盖**；按 `CLAUDE.md` 坑 #2「严禁写本地酒馆实例目录」**未部署**到实例。
  本次改动的证据面 = 单测 + 五守卫 + 独立形态 E2E（对话框为宿主专属，独立形态不可达）。

## 5. 规范与文档

- [x] `frontend/migration-safety-and-evidence.md`：§2 契约清单加 4 个函数 + S3 预检/备份段；§3.1 自动备份状态更新；§3.2 冲突预检实现说明。
- [x] `docs/DEVELOPER-GUIDE.md` §6：自动目标备份 / 目标冲突预检两行更新（判定就绪 · 宿主执行未接入）。

## 6. 收口

- [ ] 提交（显式 pathspec，校验暂存集合）+ 推送 origin。
- [ ] 回填父任务 `10-01` 的 `implement.md` S3 勾选。
- [ ] 归档本子任务。
