# 存储引擎互转（engine-bridge）契约

> 来源：2026-11-12 实现任务（用户裁定「全部任何支持的形态都要能互转，且不存在任何临时数据库」）。
> 上游事实取证：`funnycups/Luker`（Dev 实例，2026-11-12）。

## 1. 不可违反的判据

1. **产物必须能被宿主原生恢复**：目标 `fs` 的包**不含** `_engine_dump.bin`/`_engine_meta.json`；
   目标 db/sqlite 的包必须带 `_engine_meta.json`（`engineKind` 正确、`schemaVersion: 1`）。
2. **全程零临时数据库**：只做文本解析与文件生成；SQLite 用内联 WASM（`src/vendor/sqljs/`）。
3. **读不到就报告**：`schemaVersion ≠ 1` 拒绝；未知表/桶/目录**显式告警**；坏 JSONL 中止；
   行数对账不符抛错 —— 任何情况下都不产出「看着成功」的残缺包。
4. **handle 必须正确**：上游恢复不改写 dump 里的 handle（`users-private.js:820-830`），
   所以写 db/sqlite 目标时必须把 handle 落到 meta 与每一行；拿不到 handle 就拒绝，不猜。
5. **FS 目标以数据库为真值**：源包里的引擎管理磁盘文件视为陈旧，一律由行重建。

## 2. 数据结构（与上游逐一对应）

- 9 张表（父表在前）：`settings, stats, groups_table, named_docs, worlds, presets, preset_states, chats, chat_states`
  （`postgres-engine.js:23-33`）。`doc` 是 JSON 文档；dump 里为**序列化字符串**，SQLite 里为 TEXT。
- `is_group` 在 PG 是 **SMALLINT**、MySQL 是 **TINYINT**（上游 DDL 注明与 MySQL 对齐），
  **不是布尔列** ⇒ 转储必须写 `0/1`，写 `true/false` 会被 PG 拒绝（2026-11-12 实测发现并修正）。
- 磁盘映射（`src/storage/README.md`）：
  - `settings.json` / `stats.json` / `worlds/<name>.json` / `groups/<id>.json`
  - 预设：`<dir_key 的磁盘名>/<name>.json`；旁车 `<name>.luker-state.<ns>.json`
  - 命名文档桶：`themes/`、`movingUI/`、`QuickReplies/`
  - 聊天：`chats/<char_dir>/<name>.jsonl`；群聊 `group chats/<chatId>.jsonl`（行里 `char_dir=''`、`group_id=chatId`）
  - 旁车：同名 `<base>.luker-state.<ns>.json`
- 目录名与 `dir_key` **不同名**：`NovelAI Settings` / `KoboldAI Settings` / `OpenAI Settings` /
  `TextGen Settings` / `QuickReplies`（`constants.js:47-58`）。
- 预设名不安全或过长时走 `.luker-preset-records/v1/<hex>/value.json`（`preset-paths.js`），
  本实现双向支持。

## 3. 精度上限（如实登记，不是缺陷）

- FS 没有独立的 `created_at`：与上游一致取文件时间；zip 里只有 mtime，故 `created_at ≈ updated_at`。
- 聊天 header 若含 `create_date`，优先用它。

## 4. 扩展方式

新增存储形态 = 在 `src/core/engine-adapters/` 加一个适配器 + 在 `src/core/engine-registry.js` 的
`TARGET_ENGINES` 登记一项。UI 下拉从注册表生成，**不得**在界面里硬编码选项。

## 5. 验证入口

- 单测：`test/engine-bridge.test.js`（本地专属，不入库）。
- 真实样本：`node scripts/verify-engine-bridge.mjs <包> <目标引擎>`（本地专属，不入库）。
- 宿主侧判据：「无临时库」= 恢复后宿主日志**不出现** `_xrestore_` scratch handle。
