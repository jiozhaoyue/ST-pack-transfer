# 宿主拉取性能：根因、修复与 Luker 上游解耦方案

**日期**：2026-11-03
**适用**：Luker 本地部署（Dev 8003 实测）；ST / TT / PT 的拉取路径不变。

## 1. 现象与读数

| 项目 | 读数 |
| --- | --- |
| 用户数据（Dev Luker `data/default-user`） | 约 **4.7 GB** |
| `backups/` | **2.5 GB**，308 个文件（其中大量 22 MB 的 `settings_default-user_*.json`） |
| `chats/` | 671 MB |
| `extensions/` | 640 MB |
| `characters/` | 110 MB |
| `settings.json` | 22 MB |
| 插件传输日志 | 约 **1 MB/s** |
| 用户对比 | 比 Luker 原生「下载备份」慢约 **20 倍** |

## 2. 根因（三条，按影响排序）

### 2.1 Luker 的 `settings` 隐式包含 `backups/` 历史快照（主因）

`src/users.js:1364` 的 `getUserBackupTargets()`：

```js
if (selection.settings) {
    selectedFiles.add(path.join(directories.root, SETTINGS_FILE));
    selectedDirectories.add(directories.backups);   // ← 只要勾 settings，就打包全部历史快照
}
```

插件原先固定传 10 个标准类目全 `true`（`src/ui/host-bridge.js` 的 `FULL_SELECTION`），
于是每次拉取都请求 4.7 GB；其中 2.5 GB 是插件转换流程默认**不会**保留的历史快照。
旧版界面曾识破这一点（`.history/index_20260924000959.js:747` 有明确警示），
2026-10-27 工作台重写时这条警示与「按勾选透传」一起丢失。

> 原生按钮的默认勾选同样是 `settings: true`（`public/scripts/user.js:40`
> `BACKUP_DEFAULT_SELECTION`），因此原生也会带上 `backups/`。若对比时原生未勾
> 「系统设置」，两者拉取量根本不同，「20 倍」里包含的是数据量差，不只是实现差。

### 2.2 OPFS 逐块 `await write()`（客户端主因）

`src/ui/host-bridge.js` 原实现：

```js
const { done, value } = await readStreamChunkBounded(...);
if (writable) {
  await writable.write(value);   // 16–64 KB 一次，Windows/Chromium 固定开销极高
}
```

本地 HTTP 的分块通常是 16–64 KB；每次 OPFS 写入都要跨进程/落盘，
在 Windows 上实测可把吞吐压到 1 MB/s 量级。这是「网络没问题但就是慢」的直接来源。

### 2.3 拉取完成后整包再写 IndexedDB

原 `fetchHostBackup()` 返回 OPFS 句柄描述 `{kind:'opfs', ...}`，但 `index.js` 直接把它
交给 `namedBlob()` → `new File([descriptor], name)`，并且整包写进 IndexedDB。
GB 级包会多一次全量拷贝（刷新后仍要占双份空间）。

### 2.4 进度回调未合帧

`onPhase` 每个分块调用一次 `view.setProgress()`，后者同步写 3 个 DOM 节点；
高速传输时会把主线程压满，反过来拖慢读取循环（L1-MR-9 的同类问题）。

### 2.5 为什么「抢占原生下载」

插件与原生下载打的是**同一个** `/api/users/backup`。插件拉取按 1 MB/s 跑几十分钟，
服务端 archiver 的 deflate/目录遍历与连接一直占用，原生请求排队等待。
插件拉得越快，占用窗口越短；这不是两个按钮互相加锁。

## 3. 本次客户端修复

| 改动 | 落点 |
| --- | --- |
| 拉取改为 `settings:false`，下载后单独取 `/api/settings/get` 的 `settings` 字段 | `index.js` 的 `fetchFromHostConfirmed()`、`host-bridge.js` 的 `fetchHostSettingsJson()` |
| 用 ZIP 追加把 `settings.json` 拼回包内，**不重写 2 GB 旧字节** | `src/core/zip-append.js` |
| OPFS 写合并为 8 MB 大块 | `host-bridge.js` 的 `flushPending()` / `writeBlockBytes` |
| 宿主导出包改为 **OPFS 索引**：IndexedDB 只存文件名/大小，读取时按需打开 | `src/storage/opfs-files.js`、`src/storage/db.js`、`index.js` |
| 进度条 rAF 合帧 | `src/ui/workbench-view.js` 的 `setProgress()` |
| 分段耗时/吞吐写入审计日志 | `fetchHostBackup()` 的 `传输完成 · ...` 行 |
| 日志可审计：导出 `.txt` + localStorage 持久化 | `workbench-view.js` 的 `exportLog()` / `persistLog()` |

### 3.1 审计日志能回答的问题

日志视图 → 「导出」会得到 `ST-pack-transfer-log_<时间>.txt`。关键行：

```
宿主拉取开始 [luker] · 用户 default-user · 选择 9 类: ... · 凭证 12ms
宿主已响应 · HTTP 200 · TTFB(打包) 3.42s · 包体 812.5 MB
传输完成 · 812.5 MB · 9.21s · 88.2 MB/s · 块 15320（首块 65536B）
  · 读等待 7.90s · OPFS写 1.31s/102块 · close 0.18s · 累计 14.2s
settings.json 已拼入包内 · 22.01 MB · 183ms
包已入库 · OPFS packages/pkg-...zip · 1ms
宿主拉取完成 · 总耗时 14.6s · 包 834.5 MB
```

- **TTFB 大** → 服务端打包慢（数据量 / 磁盘 / CPU），客户端无能为力；
- **传输慢但 OPFS写 很小** → 网络或宿主流生成慢；
- **OPFS写 占比大** → 写块仍需调大或磁盘/杀软问题；
- **settings 拼入耗时大** → OPFS `createWritable({keepExistingData:true})` 的复制开销。

## 4. 关于「本地 10 秒内完成」

能否 10 秒取决于三段的**乘积**，不是单一客户端优化能保证的：

1. 宿主读取 + deflate 4.7 GB / 2.2 GB：受服务端 CPU 与磁盘限制；
2. ZIP 传输：本地回环可到数百 MB/s；
3. 客户端落盘：修复后由 8 MB 合并写决定。

按本机数据，即使排除 `backups/`，仍有约 2.2 GB 需要宿主读取并压缩；
「10 秒」只有在**数据量进一步缩小**（例如不拉 640 MB 扩展、或宿主改为不压缩/复用已有包）
时才现实。本次修复的目标是：**先让插件不再比原生慢**，并用审计日志把真实瓶颈量化；
是否需要进一步减量（类目勾选 / 复用宿主已有备份）应依据日志读数再定。

## 5. 上游 Luker 解耦方案（待提 PR）

> 仓库：`https://github.com/funnycups/Luker`（本地实例的 `luker` remote）。
> 规则：不在实例目录改源码；补丁另开分支提交。
>
> **PR 已提交**：<https://github.com/funnycups/Luker/pull/54>
> 分支：`jiozhaoyue:feat/backups-decouple`（单次提交 `97e47da`）。

目标：让「系统设置」与「历史设置快照（`backups/`）」成为两个独立开关，
默认保持旧行为（`settingsBackups: true`），插件可显式传 `false` 只拿 `settings.json`。

### 5.1 `src/users.js`

```diff
 export const USER_BACKUP_SELECTION_DEFAULTS = Object.freeze({
     settings: true,
+    settingsBackups: true,
     secrets: true,
@@
     if (selection.settings) {
         selectedFiles.add(path.join(directories.root, SETTINGS_FILE));
-        selectedDirectories.add(directories.backups);
+    }
+
+    if (selection.settingsBackups) {
+        selectedDirectories.add(directories.backups);
     }
```

### 5.2 `public/scripts/user.js`

```diff
 const BACKUP_CATEGORY_KEYS = Object.freeze([
     'settings',
+    'settingsBackups',
@@
 const BACKUP_DEFAULT_SELECTION = Object.freeze({
     settings: true,
+    settingsBackups: true,
```

### 5.3 `public/scripts/templates/userBackupManager.html`

在 `value="settings"` 复选框后新增：

```html
<label class="checkbox_label backupCategoryItem">
    <input type="checkbox" name="backupCategory" value="settingsBackups" checked>
    <span data-i18n="Settings History (backups/)">Settings History (backups/)</span>
</label>
```

### 5.4 兼容性

- `normalizeUserBackupSelection()` 以 `USER_BACKUP_SELECTION_DEFAULTS` 的键为准；
  旧客户端不传新键 → 取默认 `true`，行为完全不变。
- `sanitizeBackupSelectionForUser()` 无需改动（已走 normalize）。
- 新客户端传 `{ settings: true, settingsBackups: false }` 即得到「设置 + 其余类目，但不含历史快照」。
- 建议补一条服务端单测：同一用户数据下，`settingsBackups:false` 的归档不含 `backups/`，
  但含根 `settings.json`。

### 5.5 插件侧的后续动作（等 PR 合并后）

`index.js` 可把 `settings:false + 单独取设置 + 客户端拼包` 换成：

```js
const selection = { ...FULL_SELECTION, settingsBackups: false };
```

从而省掉一次 `/api/settings/get` 与 ZIP 追加。在此之前，当前实现是兼容降级路径。

## 6. 验证清单

- [x] `npm test`：926 passed / 2 skipped。
- [x] 七项守卫：CSS 作用域 / DOM 注入 / 模板源 / DOM 作用域 / 控件消费 / i18n / 文案审查。
- [x] `npm run build`。
- [x] 独立 Web：确认框为原生 `dialog` 顶层（440×140 居中，遮罩正常）。
- [x] 日志：刷新后仍保留，导出按钮可用。
- [x] Luker 8003 实机（2026-11-04，见 §7）。

## 7. 2026-11-04 实机复验（Dev Luker 8003）

环境：`Instance/Dev/Luker` 2.7.0，`data/default-user` 全量；插件走 9 类目 `settings:false`。

| 场景 | 包体 | 耗时 | 吞吐 | 备注 |
| --- | --- | --- | --- | --- |
| 插件整包拉取（空闲态） | 974.9 MB | 70.9s（传输 63.42s） | **15.4 MB/s** | 读等待 49.62s · OPFS写 6.95s/122块 |
| 同端点原生 `fetch`（同选择、不落盘） | 975 MB | 53.4s | **18.3 MB/s** | 上限基线 |
| 插件首次测量（上一次中断请求仍在服务端打包） | 974.9 MB | 251.2s | 4.0 MB/s | **受污染读数，勿引用** |
| 循环拆解 raw / 8MB 拷贝 / 拷贝+OPFS 写（各 25s） | — | — | 18.2 / 20.6 / 22.1 MB/s | 证明客户端循环不是瓶颈 |

结论：

1. **客户端已不是瓶颈**：拷贝 152ms/25s、OPFS 写 2.7s/25s；插件与原生基线的差距（70.9s vs 53.4s）
   主要来自 settings 单独拉取+拼包与形状校验，而非传输循环。
2. **上限在宿主 `/api/users/backup` 的流式打包**：同一端点整包只有 15–18 MB/s，`TTFB` 仅 0.2s
   （chunked，边打包边发），所以慢在**逐文件 deflate + 读盘**，不在等待首字节。
3. **10 秒目标在当前链路上不可达**：975 MB ÷ 18 MB/s ≈ 54s 已是宿主上限；
   要 10s 需 ≈100 MB/s，或把包体压到 ≈180 MB 以内（见下方减量/换通道两条路）。
4. **测量纪律**：被中断的拉取会让服务端继续打包，此后所有测量都会变慢（本轮 4.0 vs 15.4 MB/s）。
   复测前必须确认宿主空闲。

已知问题（待修）：

- **settings.json 拼入失败（OPFS 配额）**：975 MB 包写入后追加 21.5 MB 的 `settings.json` 时抛
  `The operation failed because it would cause the application to exceed its storage quota.`，
  包内最终**不含 settings.json**，仅留 WARN 继续。`navigator.storage.estimate()` 显示配额 6 GB、
  用量 0，理论上足够 ⇒ 需进一步定位（`createWritable({keepExistingData:true})` 的复制开销/配额计量）。

