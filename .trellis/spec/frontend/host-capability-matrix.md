# 宿主能力矩阵与原生复用判据

> 本页自包含。用途：回答「某功能该用宿主原生、还是插件自建」，并登记四宿主能力差异。
> 取证时点 2026-11-10；来源为各宿主仓库 `docs/**`、实例源码与本仓实现，逐条标注。
> 相关但不在此：宿主 DOM 注入与样式作用域 → `component-guidelines.md`；
> 备份入口 DOM 锚点与端点 → `host-backup-entries.md`。

---

## 1. 四宿主 × 传输/备份能力矩阵

| 能力 | SillyTavern | Luker | TauriTavern | PureTavern | 取证依据 |
| --- | --- | --- | --- | --- | --- |
| 全量备份导出 | ✅ `POST /api/users/backup`（忽略 selection） | ✅ 同端点，**支持 10 键 selection**（fork 另有 `backups` 键） | ✅ `POST /api/extensions/data-migration/export`（job 轮询）；`/api/users/backup` 为兼容层 | ✅ `POST /api/backups/archive/export`（versioned/hashed ZIP） | 实例源码 2026-11-10 |
| 写回恢复 | ✅ `/api/users/restore` | ✅ `/api/users/restore-backup` + **8 MiB 分片协议** | ✅ `POST /api/extensions/data-migration/import`（multipart；ZIP/tar/tar.gz/tgz，**可直接导入 ST 包**） | ✅ `POST /api/backups/archive/import` + `import/preview`（4 策略 + 恢复点） | 实例源码 2026-11-10 |
| 包内布局 | `data/<handle>/` 树 | 同 ST | `data/default-user/` 树（ST 兼容） | `manifest.json` + 模块记录 | 同上 |
| 本地备份库 / 恢复点 | ❌ / ❌ | ❌ / ❌ | ❌ / ❌ | ✅ 本地库（默认留 5 份）/ ✅ 导入前自动恢复点 | PT `features/import-export/README.md` |
| 跨宿主互操作 | ❌ | ❌ | ✅ 导入端兼容 ST 布局 | ✅ 内置 TT 互操作（模块记录 ↔ `data/default-user` 语义转换） | 同上 |
| 存储面板 / 配额 | ❌ | ✅ `storage-inspector.js` + `/api/users/storage/inspect` | ❌ | ❌ | `host-capabilities.md` §决策树 |
| 扩展清单 / 安装 | ✅ `discover` / `getExtensionManifest` | ✅ 同左 + `openThirdPartyExtensionMenu` | ✅ 自有 `data-migration` 扩展 | ⚠ `/api/extensions` 返回 501（迁移未完成） | 同上 |
| 局域网互传 | ❌ 无 | ✅ `/api/sync/v1/*`（服务端 peer 协议） | ✅ **Rust 后端** `/v2/*` + LAN HTTPS peer | ❌ 无 | Luker `src/server-main.js:491`；TT `docs/CurrentState/Sync.md` |
| 云端对象存储同步 | ❌ | ✅ S3 Sync（加密桶、条件写、冲突决策、Undo） | ✅ TT-Sync v2（远端 hub） | ❌ | `docs/improvements/s3-sync.md`；TT `Sync.md` §5.1 |
| WebDAV | ❌ | ❌ | ❌ | ❌ | 四宿主均无 |
| 增量写盘 | ❌ | ✅ append / patch / patch-metadata + integrity hash | ⚠ 未取证 | ⚠ 未取证 | `docs/improvements/incremental-sync.md` |
| 格式互转（四酒馆间） | ❌ | ❌ | ❌ | ❌ | 四宿主均无 |
| 用户可暂停的断点续传任务 | ❌ | ❌（sync 是后台自动重试） | ❌（自然续传，无手动暂停） | ❌ | TT `Sync.md` §7 |

**矩阵读法**：✅ 原生有且插件可用；⚠ 存在但未取证或不可用；❌ 原生无。

---

## 2. 插件能力落点（谁提供这一格）

| 功能 | 来源 | 判定 |
| --- | --- | --- |
| 从宿主拉取数据包 | 原生端点（`/api/users/backup` 等） | **用原生**，不重写 |
| 写回 / 恢复宿主 | 原生端点 + 原生分片协议 | **用原生**，分片照搬 Luker 协议 |
| 扩展清单与批量安装 | 原生 `discover` + `getExtensionManifest`，安装走 `install` 端点 | **用原生 + 增强**（原生只有单 URL 语义） |
| 存储面板 / 配额 | 原生 `storage-inspector`，兜底 `/api/users/storage/inspect` | **原生优先，自建兜底** |
| 确认 / 提示弹窗 | 原生 `Popup.show.confirm/text` | **用原生** |
| 宿主进出的落盘位置 | 宿主数据目录（原生写入路径） | **必须叠层**，不得自建写入 |
| 四酒馆格式互转 | 插件 `transform.js` / `zip-io.js` | **必须自建**（四宿主都没有） |
| 局域网互传 | 插件 WebRTC `lan-transfer.js` | **必须自建**（原生接不了，见 §3） |
| 云端包仓库（S3/WebDAV） | 插件 `s3-client.js` / `webdav-client.js` | **自建**；Luker 原生 S3 见 §4 的适用范围 |
| 条目级差量导出 | 插件 `delta.js` | **必须自建**（原生增量是写盘 patch，不是导出格式） |
| 暂停 / 续传 / 中止 | 插件 `task-manager.js` | **必须自建**（原生无手动暂停语义） |
| 本地库（IndexedDB / OPFS） | 插件 `db.js` / `opfs-files.js` | **必须自建**（纯前端形态） |

---

## 3. 原生 LAN Sync 为什么接不了（决定性事实）

改「局域网互传」相关代码前先读本节。

### 3.1 原生同步的输入单位是「类目下的文件路径」，不是「一个 zip 包」

- Luker：`src/sync/categories.js` 定义 `SyncCategory { id, paths[], conflictMode, syncDefault }`，
  每项映射到**用户数据目录内的真实路径**（`chats/`、`characters/`、`lorebooks/`…）。
  协议是 manifest → plan → 文件传输 → commit，**没有「包」这一层**。
- TT：`docs/CurrentState/Sync.md` 同样以 `DatasetPolicy` / `DatasetSelection` 为范围单位，
  transfer 是 per-file 或 bundle，`bundle` 是「N 个文件合成一条流」，**仍不是外部 zip**。

⇒ 插件产物是一个 zip；原生同步要的是「目录里的文件」。两者语义不匹配，
**不能把包直接塞进原生同步**。唯一可行的接法是「先把包解到宿主数据目录再触发同步」，
但那会写宿主数据、破坏跨宿主通用性，且把搬运工具变成同步引擎。

### 3.2 TT 的 LAN Sync 对扩展根本不可调用

TT 的 LAN Sync 是 **Rust 后端命令**（`lan_sync_*` / `tt_sync_*`），前端只能经 Tauri invoke；
而 **TT 扩展不能 invoke Tauri 命令**（`host-capabilities.md` §TT 事实，2026-10-25 取证）。
⇒ 即便方向对，TT 侧也没有可调用的原生通道。

### 3.3 Luker 的 `/api/sync/v1/*` 是服务端对服务端

配对链接、peer 回调可达性、Basic auth 都建立在「两端各跑一个 Luker 服务器」之上。
浏览器不能监听端口，插件也没有登录态以外的 peer 身份。

---

## 4. 叠层还是抄过来：三类分别裁定

> **2026-11-10 用户裁定：三层分层**——既非「全叠层」，也非「整体抄过来再做四宿主适配」。
> 理由是 §3 的语义事实（原生同步的单位是类目文件，不是包）与 §4.1–4.3 的分层归属。

**不是二选一。** 按能力类型分三层：

### 4.1 宿主数据进出 → 叠层（接口适配，绝不自建写入）

- 拉取、写回、扩展管理、存储读数一律调原生端点。
- 宿主端点负责索引、缓存、迁移、配额、审计；自建写入等于绕过宿主，升级即碎。
- 这层不追求「能力更强」，只追求「和原生一致」。

### 4.2 原生有但形态不匹配的通道 → 自建（不接原生）

- 局域网互传、云端包仓库属于此层。
- 原因是 §3 的语义不匹配：原生传「类目文件」，插件传「包」。
- 但**协议形态可以借鉴**：TT 的配对 URI/二维码、SPKI pin、bundle 打包、原子写入、
  mtime 保留、自然续传；Luker 的一次性配对码（10 分钟）、按条目核对、连不上与认证失败分开报错。
  **抄设计与交互，用浏览器能做到的技术重写**（WebRTC DataChannel 替代监听端口）。

**TT 侧值得抄的具体项（2026-11-10 用户裁定：TT 有局域网互传，应当抄、增强插件能力）**：

| TT 的设计 | 为什么值得抄 | 插件侧怎么落 |
| --- | --- | --- |
| 配对 URI / 二维码 + SPKI pin | 一次性码易用，pin 防中间人 | 取件码已有，补二维码与指纹核对 |
| 阶段 + 进度事件（`phase` / files / bytes） | 用户可见、可诊断；插件已对齐 `TRANSFER_PHASES` | 保持现有阶段语义，补字节级进度 |
| 能力协商（`GET /v2/status` 的 `features`） | 版本不匹配时 fail-fast，不静默降级 | 取件码里带协议版本与能力位 |
| bundle：N 个文件合成一条流 | 减少往返与握手开销 | 一次传输打包成单流，而不是逐文件建通道 |
| **push = 通知对端 pull** | 写入方向永远由目标端执行，避免双端并发写 | 宿主写回同样只由「持有数据的一端」发起 |
| 原子写入 + 保留 mtime | 断线不留半截文件；增量判定靠 mtime | 写宿主目录时 tmp → rename，保留时间戳 |
| 自然续传（重扫后已匹配项自动跳过） | 不维护断点表，失败重试天然幂等 | 复用 `(size, mtime)` 或 crc 判定，与现有续传合一 |
| 全局串行写入许可 | 避免与其他写入者竞争宿主文件 | 插件写宿主时串行化，不与宿主自身写入并发 |

**不要抄的**：Rust 命令面、`/v2/*` 端点形状、DatasetPolicy 类目模型——这些与浏览器形态无关。

### 4.3 四宿主都没有 → 自建（这是插件存在的理由）

- 格式互转、zip 拼装、条目级差量、暂停续传、本地库。
- 这层不存在「用原生」的选项，只有实现质量。

### 4.4 判定口诀

> 数据进出宿主 → 用原生；原生没有 → 自建；原生有但单位对不上 → 自建通道、抄形态。

**禁止**的两种做法：
1. 为了「统一」而自建一套宿主数据写入（绕过宿主端点）；
2. 为了「复用」而把插件塞进原生同步的类目模型（改宿主数据、跨宿主失效）。

---

## 5. 与 Luker 原生 S3 Sync 的边界

- Luker S3 Sync 面向 **Luker ↔ Luker**：加密桶、条件写、冲突决策卡、分支、Undo、定时。
- 插件 S3 面向 **跨宿主或跨形态的一次性搬运**：把导出包上传/下载，目标可以是 ST/PT/TT/云。
- 两者重叠部分是「S3 凭据 + 加密 + 分片」，但语义不同（同步引擎 vs 包仓库）。
- UI 必须如实说明适用范围，避免用户在两套体系里重复配置同一桶凭据。
- 该边界来自 2026-10-27/28 用户裁定「插件只做插件对插件，不代理原生同步」，
  以及 2026-11-05 裁定「Luker↔Luker 用原生」的定位不冲突。

---

## 6. 取证依据与自查

| 结论 | 依据 |
| --- | --- |
| Luker sync 类目模型 | `Instance/Dev/Luker/src/sync/categories.js:41-57` |
| Luker sync 路由挂载 | `Instance/Dev/Luker/src/server-main.js:491`（`app.use('/api/sync/v1', syncRouter)`） |
| TT LAN Sync 为 Rust 命令 | `Instance/Dev/TauriTavern/docs/CurrentState/Sync.md` §5.3、§8 |
| TT 导出 / 导入端点 | `Instance/Dev/TauriTavern/src/tauri/main/routes/extensions-routes.js:175`（import）、`:227`（export） |
| TT 迁移扩展前端（job 轮询） | `Instance/Dev/TauriTavern/src/scripts/extensions/data-migration/index.js:77`、`:303` |
| PT 档案端点族（含本地库） | `Instance/Dev/PureTavern/apps/web/src/features/import-export/legacy/contract.json` |
| PT 包语义与 TT 互操作 | `Instance/Dev/PureTavern/apps/web/src/features/import-export/README.md` |
| TT 扩展不能 invoke Tauri | `host-capabilities.md` §「四宿主原生局域网同步」 |
| ST / PT 无互传 | `host-capabilities.md` §「四宿主原生局域网同步」 |
| 分片协议 | `large-pack-upload.md` §2 |
| 插件未调用 `/api/sync` | `grep -rn "/api/sync" src/` 零命中 |

**升级/新增宿主后必须重核**：§1 的 ✅/⚠/❌ 与 §3 的语义判断都依赖宿主版本。
