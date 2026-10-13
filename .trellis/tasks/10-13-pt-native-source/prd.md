# PT 原生归档作为源：校验与重建为 hub 布局（`D-23` / R-11）

> 父任务：`10-01-safe-migration-productization`。本任务把 PT 官方原生归档从「识别但拒绝转换」
> 升级为「校验 + 重建为 hub（ST 摊平）布局」，补齐 `R-11` 与 `AC-12` 的 3 条 PT 出边。

## Goal（目标）

用户拿到一个 **PureTavern 官方原生归档**（`.zip`，根 `manifest.json` 带
`format:'pure-tavern-archive'` 与 per-file `moduleId/sha256`）后，能像对待 ST/L/TT 包一样，
直接把它作为**源**转换到 ST / L / TT / PT 任一目标，且**聊天与角色卡条目一条不少**。

## 背景与事实（取证）

- PT 原生归档条目是 **PT 内部模块模型**：`modules/<moduleId>/{records,blobs}/<collection>/<id>.{json,bin}`
  〔PT 源 `import-export/application/archive-participant-registry.ts` 的 `archivePath()`〕
  —— **不是**用户目录路径 ⇒ 必须按模块语义**反向重建**。
- 映射的权威证据是 PT 自己的迁移导入器
  `features/import-export/tauri-tavern/application/tauri-tavern-import.ts`
  （ST/TT 文件 → PT 记录/blob），本任务实现其逆映射。逐条落位见
  `.trellis/spec/guides/tavern-datapack-formats.md` §「PT 原生归档重建」。
- 现状：`detect.js` 能识别 `pt-native`，但 `transform.js` 的 `convert()` **直接抛错**
  要求改导 TT 迁移包；`cross-host.e2e.cjs` 只有 3 源 × 4 目标 = 12 条。

## Requirements（需求）

| 编号 | 要求 |
| --- | --- |
| R1 | 识别 + 校验：manifest 的 `format` / `schemaVersion` / 结构 / 路径安全 / 条目唯一性；逐条目 `sha256` 校验，不符即**抛错**（绝不产出残缺包）。 |
| R2 | 重建为 hub（ST 摊平）：`characters`（avatars blob 即带卡 PNG → `characters/<名>.png`）、`chats`（sessions+messages → jsonl）、`world-books`、`presets`、`settings`/`secrets`/`stats`、`assets`（按 `legacyPath` 落位）、扩展包（→ `extensions/third-party/<名>/…`）、`image-metadata.json`（背景分组）。 |
| R3 | 有损点显式登记：角色卡用自带卡的 avatars blob（运行期 PT 头像可能已被重编码）；聊天 jsonl 重序列化丢空白；预设 metadata 不重建；**PT 原生源不支持断点续传**。 |
| R4 | 接入管线：`convert()` 与 `generatePlan()` 对 `pt-native` 源走「先重建、再按 ST 视角路由」；`migration-plan` 接受 `pt-native` 作为**源**布局（仍不可作目标）。 |
| R5 | 证据面：单测（含 sha256 负例、端到端 pt→st/l/tt）+ 夹具 `fixture-pt.zip` + 跨宿主 E2E 增 4 条出边（3 源×4 目标 → 4 源×4 目标 = 16 条）。 |
| R6 | 规范与文档同步：`tavern-datapack-formats.md` / `plugin-driven-pack-and-write-guards.md` / `standalone-web-and-cloud-e2e.md` / `backend/error-handling.md` / `backend/database-guidelines.md` / 目录结构 / `docs/DEVELOPER-GUIDE.md`。 |

## Acceptance Criteria（验收标准）

- [x] AC-1（R1）：非 PT / 版本不符 / sha256 不符分别给出明确错误；sha256 不符**不产出残缺包**。
- [x] AC-2（R2）：夹具 PT 归档重建出 8 类 hub 条目（角色卡 / 聊天 jsonl / 世界书 / 预设 / settings / secrets / 头像），且 PT 内部条目（`modules/…`、`manifest.json`）**不泄漏**进 hub。
- [x] AC-3（R2/R4）：`pt→st` / `pt→l` / `pt→tt` / `pt→pt` 四目标产物含重建后的用户数据，**聊天条目数（header+2 消息）与角色卡条目数与源一条不差**。
- [x] AC-4（R4）：`createMigrationPlan` 接受 `source.layout='pt-native'`，拒绝其作 `target.layout`。
- [x] AC-5（R5）：`npm test` 零回退；五守卫 + `build` + `build:offline` 全绿；独立形态 E2E 全绿（跨宿主矩阵 **16/16**）。
- [x] AC-6（R6）：六处规范 + 开发者文档与实现同步，且**如实登记有损点**。

## 范围外

- 不改 PT 源码、不新增依赖（`L1-MR-11`）。
- 不做「目标侧写入」（ST 404 / TT 无端口 / PT 人工导入）——仍靠实例与人工证据。
- PT 原生源**不实现断点续传**（重建条目无源 crc32）——安全降级为完整重做。
