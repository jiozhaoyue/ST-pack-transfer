# PLAN-2026-11-12 · Luker 存储引擎互转（无临时数据库）

> 用户 2026-11-12 指令。**执行中实时更新状态**，不凭记忆补记。
> 口径（用户当轮裁定）：
> ① 目标是「效果」：插件转换后的包，走**宿主原生恢复流程不再连接任何数据库**，直接落文件系统（反之亦然）；
> ② **任何宿主支持的存储形态都要覆盖**，将来新增数据库类型也要能扩；
> ③ 实现路线 = 纯前端文本解析 + 必要处内嵌 WASM 相结合；
> ④ 目标引擎用**下拉显式选择**（默认按源包推断，允许覆盖）。

## 一、事实基础（上游 Luker `funnycups/Luker`，2026-11-12 取证）

| # | 事实 | 证据 |
| --- | --- | --- |
| F1 | `_engine_dump.bin`（PG/MySQL）**不是 pg_dump 二进制，是明文 JSONL**：每行 `{"sql":"INSERT INTO <表> (cols) VALUES ($1,…)","params":[…]}`；MySQL 用 `?` 占位符 | `src/storage/engines/postgres-engine.js:213-240`、`mysql-engine.js:260-285` |
| F2 | SQLite 的 dump 是**原始 `.sqlite` 文件字节**（`db.backup()`） | `sqlite-engine.js:86-95` |
| F3 | dump 只覆盖 **9 张 doc-store 表**，列固定，父表在前 | `postgres-engine.js:23-33` 的 `DUMP_TABLES` |
| F4 | dump 旁的 `_engine_meta.json` = `{engineKind, schemaVersion:1, createdAt, handle}`；`engineKind` 不匹配时宿主**直接报错拒绝** | `migration/backup.js:55-70`、`:147-160` |
| F5 | FS 模式 = 一资源一文件；表↔文件映射见 §四 | `src/storage/README.md`、`fs-engine-transaction.js` |
| F6 | 聊天文件 = 首行 header + 每行一条消息（JSONL）；DB 里 `chats.doc = {header, body:[…]}` | `fs-engine-transaction.js:230-236,319-322`、`chat-repo.js:43` |
| F7 | 状态旁车文件命名 `<base>.luker-state.<namespace>.json` | `sidecar-naming.js:1-3` |
| F8 | 宿主自身的跨模式恢复会起**临时引擎**（`_xrestore_` 前缀的 scratch 库）——这正是用户实测痛点 | `engine-backup-entries.js:22-38`、`migration/cross-mode-restore.js` |
| F9 | 备份 zip 在 db 模式下 = 磁盘文件树 **+** dump；6 类（characters/assets/extensions/globalExtensions/vectors/secrets）**永远只在磁盘** | `src/storage/README.md`、`migration/selection-mapping.js:26-33` |
| F10 | 恢复时 `engine.restoreUser(handle, stream)` **不改写 dump 里的 handle** ⇒ dump 里的 handle 必须等于目标用户 handle | `users-private.js:820-830`、`postgres-engine.js:255-300` |
| F11 | 选择项只过滤磁盘类目；引擎转储是不透明整体回放（跨模式另有 `selection-mapping` 映射） | `users-private.js:391-400,651-690` |
| F12 | **真实样本已取证**（用户 2026-11-12 提供）：`zip/Luker_default-user_part1_2026-11-11_23-57-46.zip`，8391 条目 / 208 MB；`_engine_meta.json` = `{"engineKind":"postgres","schemaVersion":1,"createdAt":"2026-11-11T15:50:44.553Z","handle":"default-user"}`；`_engine_dump.bin` = 125 MB JSONL，首行即 `INSERT INTO settings (handle, doc, updated_at) VALUES ($1, $2, $3)`，`params[1]` 是**序列化后的 doc 字符串**，`params[2]` 是毫秒时间戳 | 包内实读（只读） |
| F13 | 同包内**同时存在完整磁盘树**（`settings.json`、`chats/**`、`worlds/**`、`NovelAI Settings/**` …）——与 F9 一致；说明 db 目标包必须保留磁盘条目 | 包内实读 |
| F14 | 磁盘目录名**不等于** `dir_key`：`novelAI_Settings→"NovelAI Settings"`、`koboldAI_Settings→"KoboldAI Settings"`、`textGen_Settings→"TextGen Settings"`、`quickreplies→"QuickReplies"`，`instruct/context/sysprompt/reasoning` 同名 | `src/constants.js:49-58` |

## 二、目标与判据

| # | 目标 | 判据（可验证） |
| --- | --- | --- |
| 1 | PG/MySQL 包 → FS 包 | 产物不含 `_engine_dump.bin`/`_engine_meta.json`，含等价 `settings.json`、`chats/**`、`worlds/**`、`presets/**`、`groups/**`、`themes|movingUI|quickreplies/**`；FS 模式实例原生恢复**无临时库**成功 |
| 2 | FS 包 → PG/MySQL 包 | 产物含 `_engine_meta.json`（`engineKind` 正确、`schemaVersion:1`）+ JSONL dump；db 模式实例原生恢复**不创建 scratch 库**成功 |
| 3 | PG ⇄ MySQL | 仅占位符方言与 JSON 列类型差异；行数、doc 逐字节一致 |
| 4 | SQLite 双向 | 读写 `luker-storage.sqlite`；与文本路线共用同一行模型 |
| 5 | 未来新引擎可扩 | 新增一个 adapter 文件即可；未知引擎**如实报「不支持」**，绝不静默降级 |
| 6 | 零临时数据库 | 转换全程只读文本/文件；产物恢复时宿主也不起临时引擎（判据：宿主日志无 `_xrestore_`） |
| 7 | 数据正确性 | 双向 round-trip：`rows → 目标形态 → rows` 行数与 `doc` 完全相同；对账不符即失败，不产出半成品 |

## 三、架构：canonical 行模型 + 引擎适配器注册表

```
源包 ──detect──▶ engine adapter.read()  ──▶ CanonicalRows(9 表)  ──▶ 目标 adapter.write() ──▶ 目标包
                       ▲                                                      ▲
                       └── fs / postgres / mysql / sqlite / (未来) ────────────┘
```

- **CanonicalRows**：`{ settings, stats, groups_table, named_docs, worlds, presets, preset_states, chats, chat_states }`，
  每行即上游列名 + 原始 `doc`（JSON 值，不做语义改写）。
- **adapter 契约**（`src/core/engine-adapters/` 每个文件导出一份）：
  ```js
  { kind: 'fs'|'postgres'|'mysql'|'sqlite'|<future>,
    dumpEntries: ['_engine_dump.bin', …],        // 本引擎在包内的承载物
    detect(entries, meta) -> boolean,
    readPackage(io, ctx) -> CanonicalRows,       // 包 → 行
    writePackage(rows, io, ctx) -> void,         // 行 → 包（与其它 FS 类目条目合并）
    supportsWrite: boolean }
  ```
- **新引擎扩展点**：注册表 `src/core/engine-registry.js`；新增数据库只加 adapter + 一行注册，
  UI 下拉从注册表生成，**不硬编码三选项**。
- 现有 `engine-sanitize.js` 保持"剔除转储"的旧语义用于**无法识别**的包；识别到可转换引擎时改走本桥。

## 四、表 ↔ 文件映射（FS adapter 的唯一真源）

| 表 / 列 | FS 落点 |
| --- | --- |
| `settings`（`doc`） | `<root>/settings.json` |
| `stats`（`doc`） | `<root>/stats.json` |
| `worlds`（`name`,`doc`） | `worlds/<name>.json` |
| `presets`（`dir_key`,`name`,`doc`） | `presets/<dir_key>/<name>.json` |
| `groups_table`（`id`,`doc`） | `groups/<id>.json` |
| `named_docs`（`bucket`,`name`,`doc`） | `themes/`、`movingUI/`、`quickreplies/` 下 `<name>.json`（`BUCKET_TO_DIR`） |
| `chats`（`char_dir`,`name`,`is_group`,`group_id`,`doc`） | 普通：`chats/<char_dir>/<name>.jsonl`；群聊：`group chats/<group_id｜name>.jsonl` |
| `chat_states`（…,`namespace`,`doc`） | 同目录 `<base>.luker-state.<namespace>.json` |
| `preset_states`（`dir_key`,`name`,`namespace`,`doc`） | `presets/<dir_key>/` 下同名旁车 |

补充常量：
- `PRESET_FOLDER_BY_API_ID`（`preset-repo.js:3-13`）：`kobold|koboldhorde→koboldAI_Settings`、`novel→novelAI_Settings`、
  `textgenerationwebui→textGen_Settings`、`openai→openAI_Settings`、`instruct/context/sysprompt/reasoning` 同名。
- 聊天 JSONL 序列化：`header` 一行 + `body` 每元素一行，行尾 `\n`（`fs-engine-transaction.js:319-322`）。
- 文件名安全：与宿主一致走 `sanitizeFilename`；名字含 `/ \ NUL` 时**报错不猜**。

## 五、打包规则（决定"原生流程无需临时库"）

1. **FS 目标**：输出磁盘文件树；**不含** `_engine_dump.bin` / `_engine_meta.json`（若源包有，转换后丢弃并记日志）。
2. **DB 目标（pg/mysql）**：输出 `_engine_meta.json`（`engineKind`=目标、`schemaVersion:1`、`handle`=目标 handle）
   + `_engine_dump.bin`（JSONL，目标方言占位符），并**保留源包全部磁盘类目条目**（F9）。
3. **SQLite 目标**：输出 `<handle>/luker-storage.sqlite`（与磁盘树同包）。
4. **handle 纪律**（F10）：默认取源包 handle（`_engine_meta.handle` 或 `data/<handle>/` 推断或 L 包 `manifest.handle`），
   UI 可覆盖并在报告里显式显示；handle 为空时**拒绝生成 DB 目标包**（不猜）。
5. **选择项**：DB 目标按 Luker 自己的 `selection-mapping` 语义裁剪行（`chats` 连带 `groups`+`stats`，`presets` 连带 named-docs），
   与磁盘类目过滤一致；不相关行不写入。
6. **溯源**：原始 dump 若被转换掉，另存 `_convert/original/_engine_dump.bin`（宿主不识别该路径），便于核对与回滚。

## 六、改点（文件级）

### 新增（全部 `src/core/`，零 DOM）
- `src/core/engine-model.js` — CanonicalRows 结构、表/列常量、行数对账。
- `src/core/engine-adapters/fs.js` — 包条目 ↔ 行（§四映射）。
- `src/core/engine-adapters/jsonl-dump.js` — PG/MySQL 共用：JSONL 解析/生成、占位符方言、meta 读写。
- `src/core/engine-adapters/sqlite.js` — `.sqlite` ↔ 行（**依赖待批准**，见 §十）。
- `src/core/engine-registry.js` — 注册表、按源包推断、目标枚举。
- `src/core/engine-bridge.js` — 编排：读源 → CanonicalRows → 写目标；守卫与对账。

### 修改
- `src/core/transform.js` — 目标为 L 且包内识别到引擎承载物时，先过 `engine-bridge` 再走既有管线；
  `ENGINE_DUMP_ENTRIES` 的"一律丢弃"改为"识别到引擎则由 bridge 处理，否则维持丢弃 + 警告"。
- `src/ui/workbench-template.js` — 目标区新增「Luker 存储引擎」下拉（`#target-engine`），仅目标宿主为 Luker 时可用；
  同步 `REQUIRED_TEMPLATE_IDS` 与 `CONTROL_CONSUMERS`（铁律 8/11）。
- `src/ui/workbench-view.js` — 下拉渲染由 `engine-registry` 驱动；无 handle 时禁用 DB 目标并说明原因。
- `src/core/inspect.js` / `zone-model.js` — 卡面显示源/目标引擎与「转换后可原生恢复」。
- `docs/DEVELOPER-GUIDE.md` + `README.md` — 同一次提交内同步（铁律 22）。

### 不改
- `src/core/engine-sanitize.js` 的纯剔除语义（对不可识别包仍是正确行为）。
- `src/vendor/` 现有库。

## 七、守卫（违反即返工）

1. `meta.schemaVersion !== 1` → 拒绝转换，如实提示版本不兼容（不猜、不尝试）。
2. 未知表 / 未知 bucket / 未知 `dir_key` → 保留原始条目并**显式警告**；绝不静默丢弃。
3. JSONL 任一行解析失败 → **中止**，不产出半成品包。
4. 转换前后行数/条目数对账不符 → 失败并给出差异明细。
5. handle 缺失或与包内路径冲突 → 拒绝 DB 目标，不猜。
6. 输出包内绝不同时存在"旧 engineKind 的 dump"与"新 engineKind 的 meta"（会造成宿主拒绝恢复）。

## 八、分阶段

| 阶段 | 内容 | 状态 |
| --- | --- | --- |
| P0 | 事实取证 + 本计划 | ✅ 2026-11-12 |
| P1 | `engine-model` + `fs` / `jsonl-dump` adapter + `engine-bridge`（无新依赖） | ✅ 2026-11-12 |
| P2 | `transform` 接线 + 三个 UI 守卫同步 + 文档/README | ✅ 2026-11-12 |
| P3 | `sqlite` adapter（WASM，sql.js 内联构建，已入 vendor） | ✅ 2026-11-12 |
| P4 | 真实样本回归 + 宿主侧「无 scratch 库」取证 | 🟡 样本回归已过（PG→FS 256 行、dump 0 坏行、与独立统计逐表一致）；宿主侧取证待用户配合 |

### 回归读数（2026-11-12）

- 真实样本 `zip/Luker_default-user_part1_2026-11-11_23-57-46.zip`（8391 条目 / 208 MB / dump 125 MB）：
  `plan + emit` → FS 用时 5.7 s，产出 256 个引擎文件；逐表行数
  `settings 1 / stats 1 / groups 0 / named_docs 8 / worlds 6 / presets 197 / preset_states 0 / chats 10 / chat_states 33`，
  与独立 Python 流式统计**逐表相等**，坏行 0。
- 单测 `test/engine-bridge.test.js`：13 项全绿（含 sql.js 写读、双向映射、schemaVersion 守卫、选择项过滤）。
- **回环等价（真实数据）**：真实样本 PG→FS→PG 后，用 `scripts/compare-dumps.py` 按 9 张表逐行比对 `doc`
  哈希 —— `RESULT: IDENTICAL(doc)`，9 张表 0 缺 0 多 0 差异。
- 受影响的既有测试集（7 文件 / 74 项）全绿；五个 UI 守卫全绿；`npm run build` exit 0，
  sql.js 被切成独立 chunk（959.95 kB，只在需要 SQLite 时加载）。
- **修正的缺陷**：`is_group` 在上游是 SMALLINT/TINYINT（**不是布尔列**），最初给 PG 写 `true/false` 会被宿主拒绝，
  已改为两种方言都写 `0/1`（回环差异由此消除）。
- **未完成**：浏览器内人工观感验收（预览工具当时返回 server error）；宿主侧「恢复后日志无 `_xrestore_`」取证待做。

## 九、验证（只跑目标小测试，禁止全量/大内存）

- 合成固件：由映射生成 dump + 期望文件树，断言 `rows → fs → rows`、`rows → dump → rows` 恒等。
- 对账用例：空表、单行、含 CJK/emoji 的 chat、群聊、多命名空间旁车、超长文件名。
- 守卫用例：schemaVersion≠1、未知表、坏 JSONL、handle 缺失。
- 宿主侧：FS 模式 Dev 实例恢复 FS 目标包 → 成功且宿主日志**无 `_xrestore_`**；
  db 模式实例（需用户提供或临时起一次，仅作取证）恢复 DB 目标包 → 成功且无 scratch 库。
- 禁止用 `npm test` 全量（按用户禁令），只跑新增/受影响的测试文件 + 五个 UI 守卫。

## 十、未决 / 待用户批准

1. **SQLite 依赖**：读/写 `.sqlite` 需 WASM（建议 `sql.js`，约 1.2 MB，本地 vendor、无 CDN）。
   引入第三方二进制需用户批准；不批准则 SQLite 目标只做「读」，写侧如实报不支持。
2. **真实样本**：是否有 PG/MySQL 模式的原生备份包可作只读固件（含 `_engine_dump.bin`）？
   没有则先用合成固件，真机取证延后。
3. **db 模式验证实例**：允许临时启动一次 db 模式 Luker 做取证吗（仅读日志、不改数据）？

## 十一、证据与引用

- 上游：`funnycups/Luker`（`Instance/Dev/Luker`，`luker` remote），文件与行号见 §一。
- 本仓：`.trellis/research/11-11-chart-maximize-and-extension-manager.md` §2（既有剔除方案与事故）、
  `src/core/engine-sanitize.js`、`.trellis/spec/guides/tavern-datapack-formats.md`（包布局约定）。
- 记忆：`project_engine_dump_restore.md`（跨引擎恢复先剔除 `_engine_dump.bin`）。
