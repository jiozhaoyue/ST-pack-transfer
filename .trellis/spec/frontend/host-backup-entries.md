# 四宿主「原生数据导出 / 备份」入口事实表

> 本页自包含，2026-11-10 从 `host-capabilities.md` 拆出（原文件超过
> `context_injection.max_file_bytes` 会被静默截断）。
> 触发：任何要**打开宿主原生导出界面 / 在原生界面注入按钮 / 调原生导出端点**的改动。
> 取证顺序（MUST）：宿主仓库 `docs/**`（含全部子目录）→ 官方/一方扩展的 `manifest.json` 与
> `settings.html` → 最后在运行实例上核对 DOM 锚点。**禁止用 grep 源码代替调研**，
> 也**禁止**因「ST 派生宿主」就假设入口同构。
> 能力归属判定见 [`host-capability-matrix.md`](./host-capability-matrix.md)；
> Luker 2.9 账户窗口完整契约见 [`luker-2.9-account-window.md`](./luker-2.9-account-window.md)。

---

## 入口表（2026-11-04 文档 + DOM 双取证）

| 宿主 | 用户可见路径 | DOM 锚点 | 导出端点 |
| --- | --- | --- | --- |
| ST | 账户面板 → Account Actions → Download Backup | `#account_button` → `.userBackupButton` | `POST /api/users/backup`（`{handle, selection}`；**忽略 selection**，全量） |
| Luker | 账户面板 → 备份按钮 → 「Backup & Restore」弹层 | `#account_button` → `.userBackupButton` → `.userBackupManager .backupActionRow` | 同上（**支持** 10 键 selection；fork 版另有 `backups` 独立键） |
| TauriTavern | **扩展列表 → Data Migration → 导出当前数据** | `#extensions-settings-button` → `#data_migration_settings` → `#data_migration_export_button` | `POST /api/extensions/data-migration/export`（返回 job_id，轮询 `/job?id=`）；`/api/users/backup` 仍存在（兼容层） |
| PureTavern | **扩展 → PureTavern 数据管理 → 导出 ZIP** | `#pure-tavern-data-management-entry` → `dialog#pure-tavern-data-management-dialog` → `#ptdm-export` | `POST /api/backups/archive/export`（`{moduleIds, includeSecrets}`） |

### 导入 / 恢复端点（2026-11-10 补证，来源为实例源码）

| 宿主 | 端点 | 备注 |
| --- | --- | --- |
| ST | ❌ 无 | ST 1.19 无整包恢复端点 |
| Luker | `POST /api/users/restore-backup`（+ 8 MiB 分片协议） | 分片细节见 `large-pack-upload.md` §2 |
| TT | `POST /api/extensions/data-migration/import`（multipart `archive`） | 接受 ZIP / tar / tar.gz / tgz，**可直接导入 ST 数据包**；返回 job_id，轮询 `/job?id=`；另有 `/import/android`、`/import/ios` |
| PT | `POST /api/backups/archive/import` + `/api/backups/archive/import/preview` | 冲突预览 + merge/skip/replace-module/replace-all 四策略 + 导入前恢复点；可导入 TT 包 |

> PT 另有原生本地备份库 `/api/backups/archive/local/{create,list,download,restore,delete}`
> （默认保留 5 份），以及 TT 互操作端点 `/api/backups/tauritavern/*`。

### 文档依据（逐个核过，勿再重复调研）

| 宿主 | 有 / 无 | 依据 |
| --- | --- | --- |
| ST | **无** `docs/` 目录 | 仓库根只有 `CONTRIBUTING.md`/`SECURITY.md`；入口以 UI 实测为准 |
| Luker | 有 `docs/`，但**无备份面板文档** | `docs/development/frontend-plugin.md`（插件与 `settings.html`/`inline-drawer`/`callGenericPopup`）、`docs/development/extension-api/`；备份管理器属宿主功能，未文档化 |
| TT | 有 `docs/API|Agent|CurrentState/**`，但**无数据迁移文档** | ⚠ `docs/API/Migration.md` 是**「从 SillyTavern 扩展适配到 TauriTavern」**，不是数据迁移；迁移扩展只有 `src/scripts/extensions/data-migration/{manifest.json,settings.html}` |
| PT | 有 `docs/architecture/**` | `legacy-ui-strategy.md`（原版 UI 由上游页面负责、扩展挂 `#extensions_settings2`）、`feature-module-structure.md`（feature/legacy 路由）、`migration/module-inventory.md` |

### 各宿主开发者文档清单（2026-11-04 实际盘点，避免重复调研）

| 宿主 | 文档根与子目录 | 已核对的关键文件 | 结论 |
| --- | --- | --- | --- |
| ST | **无 `docs/`** | 仓库根仅 `CONTRIBUTING.md` / `SECURITY.md` | 入口只能 UI 实测 |
| Luker | `docs/`：`basics/` `development/` `features/` `guide/` `improvements/` `recipes/` `zh-CN/` `zh-TW/` + `index.md` `changelog.md` | `development/frontend-plugin.md`（manifest / `settings.html` / `inline-drawer` / `callGenericPopup` / Extension API）、`development/server-plugin.md`、`development/extension-api/` | 插件 UI 集成有文档；**备份管理器无文档** |
| TT | `docs/`：`API/` `Agent/` `CurrentState/` + `AgentArchitecture.md` `AgentContract.md` `AgentImplementPlan.md` `FrontendGuide.md` **`FrontendHostContract.md`** `BackendStructure.md` `TechStack.md`（根另有 `ExtensionDEV.md`） | `API/Migration.md`（⚠ 是「ST 扩展适配指南」）、`API/Extension.md`（扩展 store API）、`FrontendHostContract.md` | **数据迁移扩展无文档**；入口见其 `src/scripts/extensions/data-migration/settings.html` |
| PT | `docs/architecture/`（`feature-module-structure.md` `legacy-compatibility-contract.md` `legacy-ui-strategy.md`）、`docs/migration/module-inventory.md` | `legacy-ui-strategy.md`（原版 UI 所有权、扩展挂 `#extensions_settings2`、**M21 手动归档是核心数据安全能力**）、`feature-module-structure.md`（feature / legacy 路由分层） | 导入导出是 `features/import-export`，用户侧入口是一方扩展 `pure-tavern-data-management` |

---

## 插件行为边界（2026-11-05 用户裁定，MUST）

1. **只认 Luker 原上游**：任何 fork 只作开发版，不正式使用。不得把 fork 才有的独立 `backups`
   键当成产品事实。
2. **严禁更改宿主任何用户设置**：包括原生备份界面里的复选框、选择记忆、宿主配置。插件对
   原生界面**只读**。
3. **从宿主拉取只打开原生位置**：禁止自动点击注入的「从宿主拉取」按钮；必须弹窗明确提示
   用户自己去原生界面点击。
4. **默认不勾选只在拉下来之后、插件侧生效**：拉取完成后的插件选择树默认取消 `backups/`
   与 `user/`（原生资产），不回写宿主。
5. 上游 `settings ↔ backups/` 绑死导致的体积问题，如实显示，不擅自改 selection 绕过。

## 硬规则

1. **禁止同构假设**（2026-11-04 真实事故）：曾据「TT 是 ST 派生」断言 TT 走 `.userBackupButton`、
   并断言 PT「无同类原生入口」，两者都与事实相反 —— TT **没有** `#account_button`；
   PT 有一方扩展「数据管理」且端点与 ST 完全不同。
2. **PT 没有 `/api/users/backup`**：回退路径必须走 `/api/backups/archive/export`，否则必 404。
3. `BACKUP_SELECTION_SUPPORT` 的值只描述**标准 10 键布尔**是否透传；PT 的 `moduleIds` 选择
   不改变 `pt: false` 的含义（措辞别升级成「PT 支持类目勾选」，那是另一个粒度）。
4. 新增宿主或宿主升级后，必须重跑本表核对（DOM 锚点 + 端点形状）。

## Luker 2.9 账户窗口（2026-11-09 新增事实）

2.9 起账户是自绘窗口（`dialog.dw-layer` → `.dw-win` → `.dw`），备份页动作区 `.dw-foot`、
主按钮 `[data-act="backup-go"]`，存储页切换 `[data-act="storage-kind"][data-kind]`；
旧 `.userBackupButton` / `.userBackupManager` 在 2.9 已不存在。
完整契约（打开方式、注入、勾选读取、存储页跳转、忙态探针）见
[`luker-2.9-account-window.md`](./luker-2.9-account-window.md)。

## 实测状态与已知阻塞（2026-11-04）

- **PT dev（`apps/web`，8899）当前不加载 `scripts/extensions/**` 的扩展脚本**：
  `GET /api/extensions` → **501（"This Legacy endpoint has not been migrated."）**，
  40 秒内 `#pure-tavern-data-management-entry` 与插件容器均未出现；
  `#extensions_settings2` 里只有原版 built-ins 的设置片段。
  ⇒ PT 侧的端到端实测**被平台迁移状态阻塞**，目前只有单测（DOM 桩）覆盖四分支。
- **TT 无 debug 可执行产物**（`src-tauri/target/debug/tauritavern.exe` 不存在），
  无法按 `guides/instance-testing-discipline.md` 的 CDP 方案复验；TT 侧同样只有单测覆盖。

## 对应实现（2026-11-04）

- `openNativeBackupUi(platform)`：四分支；`tt` / `pt` 判定必须排在通用 `.userBackupButton` 之前
- 注入：`mountNativeBackupButton`（ST）/ `mountLukerBackupManagerButton`（Luker）/
  `mountTtDataMigrationButton`（TT）/ `mountPtDataManagementButton`（PT），按 `host.platform` 二选一
- 读取勾选：`readNativeBackupSelection()`（ST/Luker 标准键）/ `readPtExportOptions()`（PT moduleIds）
- 拉取：`fetchHostBackup()`（ST/Luker/TT）/ `fetchPtBackup()`（PT 归档端点，带 500ms 滑窗速度）
