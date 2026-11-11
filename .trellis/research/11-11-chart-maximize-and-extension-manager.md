# 11-11 图表放大 / 引擎转储 / 扩展管理交接

> 来源：2026-11-11 会话（提交 `b9719a8`）。以下区分**用户确认的边界**、**实测事实**与**未完成的验证**；实现细节如未确认则标为推断。

## 1. 图表放大（用户确认）

- 「整个 UI 都去还原 Luker 的」只指**图表放大**这一处，**不是整站重写**工作台 UI。
- 放大必须占满插件容器 `#app.app-container`，不是浏览器视口全屏。
- 实现：`style.css` 的 `.vol-card.is-max` 用 `position:absolute;inset:0`（包含块由 `#app.app-container{position:relative}` 提供），并放开 `.chart-stack.has-max`、`.chart-card:has(.vol-card.is-max)`、`.app-body:has(.vol-card.is-max)` 的 `overflow`。
- 证据：`src/ui/workbench-view.js` 的 `chartCardHtml()` / `volScopedNodes()` / `volBreadcrumbHtml()`。
- **拒绝的方案**：`position:fixed;inset:0`（会覆盖宿主页面，用户 2026-11-11 实测否决）。

## 2. 跨引擎恢复必须净化引擎转储（用户确认 + 实测事故）

- Luker 数据库模式的备份含 `_engine_dump.bin` + `_engine_meta.json`：裸 SQL、硬编码源句柄（如 `default-user`）、无冲突处理的 `INSERT INTO settings`。
- 跨实例 / 跨引擎恢复会让宿主直接执行裸 SQL，撞目标主键 `duplicate key value violates unique constraint "settings_pkey"`，整体失败。
- 用户要求：**PG→文件系统、文件系统→PG、PG→PG 但不兼容，三种方向都绝不能失败**。
- 做法：`src/core/engine-sanitize.js` 的 `sanitizeEngineDumpForRestore()` 在恢复前剔除这两类条目，走宿主官方标准便携恢复；包内**还有标准便携文件**才剔除，纯引擎转储且无便携文件时如实提示并跳过（不静默丢弃、不让宿主撞主键）。
- 转换路径 `src/core/transform.js` 的 `ENGINE_DUMP_ENTRIES` 也已丢弃这两类条目。
- **拒绝的方案**：把原生包原样上传给宿主（等于让宿主执行源实例的裸 SQL）。

## 3. 「从宿主拉取」只注入宿主原生备份区（用户确认 + 实测事故）

- 四宿主只允许注入各自的备份动作区：
  - ST/TT：`.userBackupButton`
  - Luker ≤2.8：**含 `.backupDownloadButton` 的** `.userBackupManager .backupActionRow`
  - Luker 2.9+：含 `[data-act="backup-go"]` 的 `.dw-foot`
  - TT：`#data_migration_export_button` 同级
  - PT：`#ptdm-export` 同级
- **拒绝**：任何「取首个 `.backupActionRow`」的回退——Luker 日志查看器同用该类名，2026-11-11 实测把「从宿主拉取」注进了日志。
- 证据：`src/ui/host-bridge.js` 的 `mountNativeBackupButton()` / `mountLukerBackupManagerButton()` / `mountTtDataMigrationButton()` / `mountPtDataManagementButton()`。

## 4. 内联扩展管理 P1（本轮实现；P1 范围由用户 2026-11-11 选定）

- 入口：顶栏下 `#view-switch`（桌面 2 个：存储图表/扩展管理；手机 3 个：存储图表/数据包/扩展管理；桌面数据包列常显）。
- 内联面板 `#extension-view`：安装 / 已装 / 报告三页，不是浮层。
- 批量安装：多行链接、`.txt` / `.json` 上传、剪贴板；`url | 分支`、`url#分支/标签`；执行端 `src/ui/host-bridge.js` 的 `installExtensionBatch()`。
- 导出：安装日志、失败链接 txt（一行一个 https）、安装报告 JSON。
- 宿主扩展清单导出收束到「已装」页；图表卡 `[data-extmanifest]` 改为打开扩展管理并预填。
- 安装页提醒：Luker 关闭 `extensions.enabled` 或启用扩展白名单/黑名单时，宿主会拦截安装；清单安装同样不可用（所有扩展端点被拦），插件原样显示宿主提示。
- **待续**：P2（URL 归一 / 站点分支列举 / 仓库摘要 / 更新检查）、P3（凭据多账号 / 更新冲突修复 / 停用治理 / 去重 / 备份恢复）。参考 `ST-git-improve/extension/index.js`（2338 行，56 个函数）。

## 5. 验证与未完成

- 目标测试：14 文件 / 119 项通过；注入相关 4 文件 / 50 项通过。
- 六个守卫（css-scope / template-source / control-consumer / dom-injection / dom-scope / i18n）全绿；`npm run build` exit 0。
- **未完成**：浏览器预览取证。`preview_start` 连续返回「claude-sonnet-5[1m] 暂时不可用（server error）」，缩放边界、手机布局、扩展管理面板的实际观感尚未在预览中人工确认。
