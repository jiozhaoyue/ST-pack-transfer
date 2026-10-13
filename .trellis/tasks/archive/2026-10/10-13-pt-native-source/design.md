# 设计：PT 原生归档 → hub 重建

## 1. 分层边界

- **新增 `src/core/pt-archive.js`**（纯逻辑，禁 DOM / `src/ui/**`，IO 只经注入的 `io.openReader`）。
  导出：`PT_ARCHIVE_FORMAT` / `PT_ARCHIVE_SCHEMA_VERSION` / `PT_PRESET_DIRECTORIES` /
  `PT_ASSET_DIRECTORIES` / `parsePtManifest` / `classifyPtEntry` / `assertSafeArchivePath` /
  `createPtNativeHubReader` / `PtArchiveError`。
- **`src/core/transform.js`**：`convert()` 对 `PT_NATIVE` 源改「抛错」为「重建 + 按 ST 路由」。
- **`src/core/plan-preview.js`**：`generatePlan()` 同源处理，供 UI 预览。
- **`src/core/migration-plan.js`**：源/目标布局白名单拆分，源加 `pt-native`。

## 2. 关键契约

**`createPtNativeHubReader({io, sourcePath, onWarning, verifyIntegrity=true, readBlobs=true})`**
返回 `{entries(): AsyncGenerator, close(), totalEntries, thirdPartyFolders:Set, manifest}`。
`entries()` 产出与 zip reader 同契约的条目对象（`fileName/isDirectory/crc32=null/uncompressedSize/skip()/read()/openStream()`）。

**两趟读取**（zip 读游标不可倒回，`tavern-datapack-formats.md` 环境教训）：

1. **记录趟**：读 `manifest.json` + 全部 `records`（JSON，语义索引）→ 内存 Map；
   `chats/messages` 只登记不驻留；`blobs` 只登记条目名。→ 由记录直接产出
   world-books / presets / settings / secrets / stats / image-metadata 条目 + 第三方扩展目录名。
2. **大块趟**：重开 reader，逐条读 `blobs`（→ characters/avatars 与 assets 落位）与
   `messages`（与缓存的 `sessions` 合成 jsonl），`read()` 后**立即 yield** ⇒ 峰值 ≈ 单条目。

**重建后条目已是 hub 视角** ⇒ `convert()` 用 `routingLayout = ST` 调 `routeSource`，
`report` 仍记 `pt-native`。这样目标适配、扩展迁移、过滤、合成条目**全部复用既有管线**，零分叉。

## 3. 落位映射（逆 `tauri-tavern-import.ts`）

| PT 模块 / collection | hub 落位 |
| --- | --- |
| `characters/avatars`(blob, id=`<名>.png`) | `characters/<名>.png`（blob 自带卡，直接落位） |
| `chats/sessions`+`messages` | `chats/<ownerAlias 去 .png>/<legacyFileName>`（`[header,...messages].join('\n')`） |
| `world-books/books` | `worlds/<legacyFileId>.json` |
| `presets/documents` | `<PT_PRESET_DIRECTORIES[type]>/<name>.json` |
| `settings`/`secrets`/`stats`（id=`current`） | `settings.json` / `secrets.json` / `stats.json` |
| `assets/index`+blob | `<legacyPath 去前导斜杠>`；扩展包 → `extensions/third-party/<名>/…` |
| `assets/background-folders` | 合入 `image-metadata.json` |

## 4. 取舍与降级

- **角色卡 PNG 合成**：不合成。PT 的 `avatars` blob 本身带卡（TT 导入存原图；运行期
  `writePngCard` 已嵌卡）⇒ 直接落位。仅当记录有卡而 blob 缺失时 `onWarning` 登记。
- **断点续传**：不支持。重建条目 `crc32=null`，且半成品无法按源条目做同源校验
  ⇒ `convert()` 显式 `onDiscardPartial()` 并完整重做（安全降级，留日志）。
- **校验强度**：默认逐条目 `sha256` 校验；不符即抛错（安全优先于「拿到大部分数据」）。
- **dryRun**：`readBlobs=false` ⇒ 大块条目以空数据 + 声明尺寸产出（预览快、不读全量）。
- **有损点**（如实登记）：见 prd R3 与 `docs/DEVELOPER-GUIDE.md` §6。

## 5. 兼容性

- 既有 `st|l|tt` 源零行为变化（仅新增一个分支；`routingLayout` 对非 PT 等于 `detection.layout`）。
- `migration-plan` 的 `VALID_TARGET_LAYOUTS` 不含 `pt-native` ⇒ PT 原生**只能作源**。
- 零新增依赖；离线单文件构建自动纳入新模块。
