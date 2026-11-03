# 执行计划：迁移向导默认入口 · 强制不兼容 · 离线单文件

> 每片共同步骤：先补失败测试 → 确认失败原因正确 → 最小实现 → 定向测试 → 相关全量回归 → diff → 规范同步。
> 复选框**随执行实时勾选**。

## 0. 前置

- [x] 建子任务 `10-13-migration-wizard-breaking-offline`（父 `10-01-safe-migration-productization`）
- [x] 回填 `prd.md`（Requirements / AC 非 TBD）
- [x] 写 `design.md`
- [x] 记录基线：`npm test` = **669 passed / 2 skipped / 71 files**（2026-10-13 12:07）

## 1. B1 强制不兼容（破坏性变更）

- [x] 1.1 改写 `test/migration-legacy.test.js` 为先失败的**新契约**用例（v1 被拒 / v2 放行 / 结构相同仍拒 v1）
- [x] 1.2 实现 `src/core/migration-session.js`：`SESSION_SCHEMA_VERSION` / `classifySessionCompatibility` / `readSessionRecord`，`isResumableSession` 先过兼容门
- [x] 1.3 移除 `normalizeLegacySession` 并确认无生产调用者（`grep`）
- [x] 1.4 `src/storage/db.js`：`saveWorkspaceState` 写 `schemaVersion: 2`；`loadWorkspaceState` 原样返回（不删不迁移）
- [x] 1.5 定向测试 + `test/db-origin.test.js` 回归
- [ ] 验证：`npx vitest run test/migration-legacy.test.js`

## 2. B2 向导（S5 第二步）

- [x] 2.1 新增 `src/ui/migration-wizard.js`（纯导出 + DOM 装配分离）
- [x] 2.2 新增 `test/migration-wizard.test.js`（纯状态机 / 步骤邻接 / 不兼容门判据 / 六步覆盖模板区块）
- [x] 2.3 `src/ui/workbench-template.js`：加向导骨架（步骤条 / 视图开关 / 不兼容门）+ 既有区块 `data-wb-step`
- [x] 2.4 `scripts/control-consumer-guard.js`：登记新控件消费点
- [x] 2.5 `scripts/single-template-source.js`：`REQUIRED_TEMPLATE_IDS` 加入新节点
- [x] 2.6 `style.css`：向导样式（双前缀 + `--SmartTheme*`）
- [x] 2.7 `index.js`：装配 `mountMigrationWizard`，默认入口 = 向导；消费不兼容门
- [ ] 验证：`npx vitest run test/migration-wizard.test.js`、`npm run check:control-consumer`、`npm run check:template-source`、`npm run check:css-scope`、`npm run check:dom-injection`、`npm run check:dom-scope`

## 3. B3 file:// 单文件离线产物（S7）

- [x] 3.1 `src/core/worker-client.js`：识别 `window.__ST_ZIP_OFFLINE__` 直接主线程降级
- [x] 3.2 `scripts/build-offline.mjs`：Vite IIFE 构建 + 内联 HTML/CSS 为单文件
- [x] 3.3 `package.json`：新增 `build:offline` 脚本（**不改** `build`）
- [x] 3.4 `e2e/standalone/` 增加 file:// 单文件用例（无外部请求 + 完成一次真实转换）
- [ ] 验证：`npm run build:offline` + 该 E2E

## 4. B4 开发者文档

- [x] 4.1 新增 `docs/DEVELOPER-GUIDE.md`（功能清单 → 源码落点 / 三形态 / 质量门槛 / 破坏性变更登记）
- [x] 4.2 逐条核对文档功能与源码一致（无"文档有、代码无"）

## 5. B5 质量门槛（S6）

- [x] 5.1 `npm test` 全绿且 ≥ 基线零回退
- [x] 5.2 五守卫 + `npm run build` 全绿
- [x] 5.3 记录读数到本任务 `research/`

## 6. 规范同步（Phase 3.3）

- [x] 6.1 `migration-compatibility-and-release.md`：§3.1 / §4 按 U-1 改写为**硬拒绝**
- [x] 6.2 `migration-user-journey.md`：向导与默认入口落条
- [x] 6.3 新增离线交付条文（file:// 单文件）

## 7. 提交与推送（Phase 3.4）

- [x] 7.1 `git status --short` 核对范围，显式 pathspec 暂存
- [x] 7.2 `git diff --staged --name-only` 恰等于本片集合
- [ ] 7.3 commit + `git push origin main`

## 回退点

| 片 | 回退方式 | 回退**不**能做什么 |
| --- | --- | --- |
| B1 | revert `migration-session.js` / `db.js` | 不能把已按新契约作废的旧会话"复活" |
| B2 | 默认 `data-wb-view="advanced"` | 不能当作用户数据的回滚 |
| B3 | 不发布 `dist-offline` | 既有 `npm run build` 形态不受影响 |
