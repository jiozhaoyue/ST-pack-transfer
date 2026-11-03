# 目标清单读取与自动保底备份（宿主侧执行层）

## Goal

把 S3/S4 已经就绪的**纯判定层**接到**宿主执行层**：读当前宿主的用户备份（只读中央目录）得到**真实目标清单**，
据此产出**真实冲突预检**与**readback-verified 备份证据**，并把该备份**留存**为保底产物。

一句话：把恢复对话框里那句写死的「无法读取目标清单」变成「真读到了」。

## 背景（现场取证，2026-10-14）

- `index.js:2135` 附近的 `buildRestoreGateContext()` 目前**写死** `assessTargetConflicts({ targetManifest: null })`
  ⇒ 冲突**永远** `unknown`，用户每次都要勾「冲突未知」确认框。
- `src/core/migration-target.js` 的判定与呈现**已完整**（`known`/`unknown` 两态、`readback-verified` 三条件），
  缺的只是**喂给它一份真清单**。
- `src/ui/host-bridge.js` 的 `fetchHostBackup()`（`POST /api/users/backup`）**已存在**且已处理 OPFS 流式直写、
  进度、断点续传；`src/core/zip-io.js` 的 `readZipEntryManifest()` **只读中央目录**（不解压、不读数据流）。
  ⇒ 两段拼起来即可得到目标清单，**无需新增依赖、无需新端点**。
- `migration-safety-and-evidence.md` §3.2 已写明「**目标侧自动读取清单**（如宿主提供）仍待接入」——本片即该接入。

## Requirements

- **R1 纯判定模块**：新增 `src/core/target-inventory.js`（无 DOM、无网络、无宿主依赖，Node/Vitest 可直接测）。
  导出 `buildTargetManifest` / `alignInventories` / `assessInventoryConflicts` / `INVENTORY_ALIGNMENT`。
- **R2 对齐守卫（本片最关键的不变量）**：目标清单与「本次将写入的条目」只有在**顶层段结构可比**时才允许比较；
  无法对齐一律 `state:'unknown'`。**伪报「0 冲突」比报 unknown 更糟**——它会诱使用户跳过风险确认。
- **R3 宿主接缝**：`src/ui/host-bridge.js` 新增 `fetchHostInventory({ signal, onPhase })`，
  复用 `fetchHostBackup` + `readZipEntryManifest`，返回 `{ manifest, artifact }`；宿主不可用/失败一律
  返回 `{ manifest: null }`（调用方无需分支，`L0-11` 静默降级）。
- **R4 对话框接线**：恢复对话框新增「自动备份并预检」按钮。触发后：
  ① 真实冲突替换写死的 `unknown`；② 备份证据按 `buildTargetBackupEvidence({mode:'auto'})` 判定
  （三条件齐备才 `readback-verified`，否则**降级 `none`**，**不得**退回 `user-attested`）。
- **R5 留存**：自动备份须作为**保底产物**入待导出区（新 `ORIGINS` 值），用户可领取；
  **仅内存 Blob / 仅触发下载不算留存**（`migration-safety-and-evidence.md` §3.1）。
- **R6 文档同步**：`migration-safety-and-evidence.md` §3.2/§3.3 的「待接入」改为「已接入」并写明边界。

## Constraints

- **不新增依赖**；只用 `src/vendor/` 已有能力（`zip-io.js` 的 `readZipEntryManifest`）。
- **分层铁律**：`src/core/` 禁 DOM（`L1-MR-6`）；宿主差异只许进 `src/ui/host-bridge.js`（`L0-9`）。
- **单一模板源**：新增 DOM 只许写 `src/ui/workbench-template.js`；`index.html` 保持骨架（`check:template-source`）。
- **控件消费守卫**：新按钮必须进 `CONTROL_CONSUMERS`，并同步 `REQUIRED_TEMPLATE_IDS`（`check:control-consumer`）。
- **CSS 双前缀**：新样式（若有）必须带 `.app-container` / `.st-converter-drawer-app` 前缀（`check:css-scope`）。
- **不写本地酒馆实例目录**（`CLAUDE.md` 坑 #2）；不连 Real 实例（`P-11`）。
- 本片**不碰**写入路径本身：写入仍走既有 `guardedRestore`，本片只把**输入证据**换真。

## Acceptance Criteria

- [x] **AC-1 对齐失败 ⇒ unknown**：目标清单与待写入清单顶层段结构不可比时，`assessInventoryConflicts`
      返回 `state:'unknown'`、`conflictCount:null`；有**判别力负例**（把该守卫去掉后用例必须变红）。
      —— *`test/target-inventory.test.js`：`【判别力】…⇒ unknown，绝不报 0 冲突` 与
      `【判别力】去掉守卫就会变红：同一输入若绕过对齐直接比较，会得到「0 冲突 / 1 新增」` 两条用例
      显式钉住「守卫前 vs 守卫后」的读数差。*
- [x] **AC-2 对齐成功 ⇒ 真读数**：结构可比时返回真实 `conflictCount` / `newCount` / `conflicts`；
      且**不得**由「源包 N 条」推出「新增 N 条」（不同路径集必须给出不同 newCount）。
      —— *同文件 `对齐成功 ⇒ 真实冲突数与新增数，且新增数不随「源包条数」机械推导`：同样 1 条待写入，
      `chats/a.jsonl` ⇒ `conflict 1 / new 0`，`chats/c.jsonl` ⇒ `conflict 0 / new 1`。*
- [x] **AC-3 只读中央目录**：清单构造路径只经 `readZipEntryManifest`（不解压数据流）；
      对超大条目数有上限截断且**截断即降级 unknown**（截断清单比较出的冲突数不完整）。
      —— *`host-bridge.js fetchHostInventory` 唯一读取入口是 `readZipEntryManifest`（`zip-io.js:104`，
      只开 `ZipReader` 读中央目录）；`buildTargetManifest({maxPaths})` 截断置 `truncated`，
      `alignInventories` 判据 ① 据此降级。用例 `超出上限 ⇒ 截断且 truncated=true` +
      `截断清单 ⇒ unknown（不完整的比较结果不可用）`。*
- [x] **AC-4 备份证据不冒充**：自动路径三条件（可读 / 范围覆盖 / 已留存）缺一 ⇒ `level:'none'`；
      **绝不**回落成 `user-attested`。手动路径**永不**升级为 `readback-verified`。
      —— *沿用 `migration-target.js` 既有实现（本片未改其判定）；本片的接线只构造
      `artifact:{readable:true, scope:'matches-write', retained:<IndexedDB 落盘成功>}`，
      落盘失败即 `retained:false` ⇒ 降级 `none`（`index.js handleTargetPreflight` 的 catch 分支）。*
- [x] **AC-5 静默降级**：宿主不支持 / 请求失败 / 用户取消 ⇒ `fetchHostInventory` 返回 `{manifest:null}`，
      恢复对话框退回既有 `unknown` 行为，**零抛错、零阻塞**（`L0-11`）。
      —— *`test/host-inventory.test.js` 四条降级用例：平台为空（且**零 fetch 调用**）、非 2xx(500)、
      网络异常、`AbortError ⇒ reason:'cancelled'`。*
- [x] **AC-6 质量门零回退**：`npm test` 相对基线（768 passed / 2 skipped）**只增不减、0 failed**；
      五守卫 + `build` + `build:offline` 全绿；独立形态 E2E `npm run e2e:web -- --rebuild` 全绿。
      —— *`npm test` 768 → **790 passed / 2 skipped / 0 failed**（净增 22，77 文件）；
      五守卫 + `build` + `build:offline` 全绿；`e2e:web -- --rebuild` **496/496 断言通过**（exit 0）。*
- [x] **AC-7 文档同步**：`migration-safety-and-evidence.md` 中「目标侧自动读取清单仍待接入」已改写为
      已接入 + 明确边界（哪些宿主、失败如何降级、留存判据）。
      —— *§3.2 新增「已接入（2026-10-14…）」段（含对齐判据六条与归一口径）；§3.1 补留存判据
      「`retained===true` 当且仅当已落 IndexedDB 工作区」；§3.3 更正「无端点」为「能力已具备、
      写入后读回编排未接」；`docs/DEVELOPER-GUIDE.md` §6 三行同步改写。*

## 未覆盖边界（如实登记）

- **恢复对话框的 UI 接线无自动化覆盖**：独立形态 E2E 到不了该路径（`openRestoreModal` 在
  `!host.isPlugin` 时直接返回）；按 `CLAUDE.md` 坑 #2 **未部署到实例**。故 496/496 覆盖的是
  **本片未触碰**的既有路径；本片的自动化证据面 = `test/target-inventory.test.js`（16 条，
  纯判定）+ `test/host-inventory.test.js`（6 条，宿主接缝降级与成功路径）。
- **未在真实宿主上跑过**：`fetchHostInventory` 的成功路径用**流式响应替身 + 真 zip 字节**验证
  （真 `readZipEntryManifest`、真 `buildTargetManifest`），**未**对真实 ST/Luker 发起过
  `/api/users/backup`。真实宿主的清单规模、`Content-Length` 形态、权限态仍是未知。
- **写入后读回核对**仍未接线（见 Out of Scope）。

## Out of Scope（明确不做，避免范围漂移）

- **写入后读回核对**（`method:'automatic'` / `coverage:'full'`）：同为「读目标清单」机制，但属 S4 另一条
  （写入后再次拉清单比对）。本片只做**写入前**预检 + 保底。留作后续独立子任务。
- **自动重发执行**：无部分重试 UI，仍不做。
- 任何对**目标数据的写入**改动；本片全部是**只读**宿主操作 + 本地产物留存。
