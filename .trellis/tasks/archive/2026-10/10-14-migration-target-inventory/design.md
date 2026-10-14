# 设计：目标清单读取与自动保底备份

## 1. 边界与分层

```
        ┌──────────────────────────────────────────────┐
        │ index.js（编排）                              │
        │  · 对话框按钮 → handleTargetPreflight()       │
        │  · 把三份输入拼进 buildRestoreGateContext()   │
        └───────┬───────────────────┬──────────────────┘
                │                   │
     ┌──────────▼────────┐   ┌──────▼─────────────────────┐
     │ src/core/         │   │ src/ui/host-bridge.js      │
     │ target-inventory  │   │  fetchHostInventory()      │
     │ 纯判定（无 IO/DOM）│   │  = fetchHostBackup +       │
     │                   │   │    readZipEntryManifest    │
     └───────────────────┘   └────────────────────────────┘
              ▲                          │
              │  hub 路径字符串           │ 原始条目名 → hub（routeSource）
              └──────────────────────────┘
```

- **纯判定**（`src/core/target-inventory.js`）：只做归一、对齐、集合比较。**不 import host-bridge、不 import transform**。
- **宿主 IO**（`src/ui/host-bridge.js`）：唯一新增的宿主调用点（`L0-9`）。
- **比较口径：原始条目名（不经布局归一）**。目标清单来自**当前宿主自己的备份**，待写入条目会被宿主按
  **字面路径**落盘 —— 故「宿主将写什么」与「宿主已有什么」本就在同一套词汇里，不需要再经
  `routeSource` 归一。**刻意不归一**：`routeSource` 会把 `extensions/third-party/X` 与 `extensions/X`
  抹成同一条 hub 路径，从而**藏掉真实的路径差异**（而宿主确实会写到不同位置）。
  两侧仍共用 `target-inventory.js` 的同一套字符串归一（NFKC + 分隔符 + 小写 + 去目录条目）。

## 2. 契约：`src/core/target-inventory.js`

```js
export const ALIGNMENT = Object.freeze({
  ALIGNED: 'aligned',      // 可比较 ⇒ 允许给出真实冲突数
  PARTIAL: 'partial',      // 目标清单明显不完整（缺标准根标记）⇒ unknown
  MISMATCH: 'mismatch',    // 本次将写入的顶层段不在目标清单里 ⇒ unknown
  TRUNCATED: 'truncated',  // 清单被上限截断 ⇒ unknown
  EMPTY: 'empty',          // 目标清单为空 ⇒ unknown
});

export function buildTargetManifest(entries, { maxPaths = 100_000 } = {})
  // → { paths: string[], count: number, truncated: boolean }
  // 归一：NFKC + `\`→`/` + 去前导 `./` + 去目录条目（尾 `/`）+ 去重

export function alignInventories({ targetPaths, incomingPaths, truncated = false })
  // → { state: ALIGNMENT, reason: string }

export function assessInventoryConflicts({ targetManifest, incomingPaths } = {})
  // → assessTargetConflicts 的结果 + { alignment, alignmentReason }
  // state !== 'aligned' ⇒ 强制 { state:'unknown', conflictCount:null, newCount:null, conflicts:[] }
```

### 2.1 对齐判据（本片最关键的不变量）

**为什么必须有这道守卫**：`assessTargetConflicts` 拿到的是一份**路径集合**。若这份集合与待写入集合
**词汇不一致**（例如目标备份是按选择过滤导出的、或来自另一个 handle），比较结果会是「0 冲突 / 全部新增」——
**这比 `unknown` 更危险**，因为它会诱使用户跳过「同名可能被更新」的风险确认（PRD AC-1 的存在理由）。

判据（按序）：

| 顺序 | 条件 | 结论 |
| --- | --- | --- |
| 1 | `truncated === true` | `truncated` ⇒ unknown |
| 2 | 目标清单为空（去重后 0 条） | `empty` ⇒ unknown |
| 3 | 目标清单**缺标准根标记**（`settings.json`、`secrets.json`、`characters`、`chats` 四者**全无**） | `partial` ⇒ unknown |
| 4 | 待写入的顶层段 ∉ 目标顶层段集合 | `mismatch` ⇒ unknown（`reason` 列出缺哪几段） |
| 5 | 其余 | `aligned` ⇒ 允许真实比较 |

第 3 条针对**「备份被选择过滤」**这一最常见的假阴性来源：一次全量备份必然至少含
`characters/` 或 `chats/` 或 `settings.json` 之一；全无 ⇒ 这份清单不可信。
第 4 条对**新类目**（目标确实没有）也会保守降级——**刻意选择保守**：无法区分「目标没有」与「清单不全」时，
宁可 unknown（用户仍可显式确认风险），不可伪报无冲突。

### 2.2 与既有判定的关系

`assessInventoryConflicts` **不重写**比较逻辑，只在 `aligned` 时转调
`assessTargetConflicts({ targetManifest:{paths}, incomingPaths })`（`src/core/migration-target.js:57`），
`unknown` 分支直接复用其 `targetManifest:null` 返回值。⇒ 冲突语义与呈现**单一来源**。

## 3. 契约：`src/ui/host-bridge.js`

```js
export async function fetchHostInventory({ platform, signal = null, onPhase = null, taskId = null } = {})
  // → { manifest: {paths, count, truncated}|null, file: File|Blob|null, reason: string }
```

- 复用 `fetchHostBackup(platform, /* selection */ null, { signal, onPhase, taskId })`（`host-bridge.js:725`）——
  `selection = null` 走 `FULL_SELECTION`，保证清单尽量完整（对齐判据第 3 条成立的前提）。
- `kind:'opfs'` ⇒ `opfsHandleToFile(handle)` 归一为 `File`（`host-bridge.js:696`，既有归一）。
- `readZipEntryManifest(file)`（`zip-io.js:104`）**只读中央目录**，不解压、不读数据流。
- **失败/取消/宿主不支持 ⇒ 返回 `{ manifest:null, file:null, reason }`，不抛**（`L0-11` 静默降级）。
  唯一的例外：`AbortError`（用户主动取消）也归一为 `manifest:null` + `reason:'cancelled'`——调用方零分支。

## 4. 编排：`index.js`

### 4.1 新增控件

模板（`src/ui/workbench-template.js` 恢复对话框内）：

```html
<button type="button" class="menu_button" id="btn-target-preflight">自动备份并预检目标</button>
<div class="modal-desc" id="restore-preflight-status"></div>
```

- `REQUIRED_TEMPLATE_IDS`（`scripts/single-template-source.js`）同步加 `btn-target-preflight`、`restore-preflight-status`。
- `CONTROL_CONSUMERS`（`scripts/control-consumer-guard.js`）同步加 `'btn-target-preflight'`。
- **不加新 CSS**（复用 `.menu_button` / `.modal-desc`）⇒ 不触碰双前缀铁律。

### 4.2 `handleTargetPreflight()`

```
① 读待恢复包条目（pendingRestoreFile / pendingRestoreBatch）→ readZipEntryManifest → incomingEntries
② fetchHostInventory({ platform: host.platform })
③ manifest 有 ⇒ assessInventoryConflicts({targetManifest, incomingPaths: incomingEntries})
   manifest 无 ⇒ 保持既有 unknown，状态行写明原因
④ 把 file 入待导出区（origin: TARGET_BACKUP）**并**落 IndexedDB 工作区（留存）
⑤ 组装 artifact { readable:true, scope:'matches-write', retained:<落盘成功> }
   → buildTargetBackupEvidence({mode:'auto', targetRef, artifact})
⑥ 存进模块级 pendingTargetPreflight = { conflicts, backup, targetRef, sourceKey }
⑦ 刷新对话框文案：describeConflictState(conflicts) / describeBackupEvidence(backup)
```

### 4.3 `buildRestoreGateContext()` 改动

```js
const conflicts = pendingTargetPreflight?.conflicts
  ?? assessTargetConflicts({ targetManifest: null });      // 未预检 ⇒ 既有 unknown 行为
const backup = pendingTargetPreflight?.backup
  ?? buildTargetBackupEvidence({ mode:'manual', targetRef, userConfirmed: backupEl?.checked });
```

`pendingTargetPreflight` 在 `resetRestoreBackupCheck()` 中**清空**（每次开对话框从零开始，
防止上一轮的真清单被静默复用到一个不同的包/目标上）。读取时经 `activeTargetPreflight()` 校验。

### 4.4 失效判据

`activeTargetPreflight()` 返回 `null`（⇒ 回到 `unknown`）当且仅当：

1. **目标身份变化**：`pendingTargetPreflight.targetRef !== `${host.platform}@${currentHostHandle}``
   —— 切账户 / 切宿主后不得复用上一身份的清单（`migration-safety-and-evidence.md` §3.1）。
2. **待写入载荷变化**：`sourceKey` 指纹（单包 = `file:名字:字节数`；批量 = 逐项 `名字:字节数` 拼接）
   不一致 —— 换了包/换了批，上一轮的清单不再对应当前待写入集合。

**不用 plan `revision` 做判据**：`createMigrationPlan` 每次调用都递增 revision（`migration-plan.js:59,183`），
而 `buildRestoreGateContext()` 每次现造计划 ⇒ revision 恒不相等，拿它当判据只会**永远失效**。

## 5. 数据与留存

- 新增 `ORIGINS.TARGET_BACKUP = 'target-backup'`（`src/storage/db.js`）+ `ORIGIN_LABELS` 一项
  （`src/ui/export-queue.js:80` 附近）「目标保底备份」。
- **留存判据**：`retained = 已成功写入 IndexedDB 工作区`。仅入待导出区（内存）**不算**
  （§3.1「仅在内存生成…不能自动标 confirmed」）。
- 大包走既有 `saveFile` 的大 blob 串行队列（`db.js:209`），不新开写路径。

## 6. 错误矩阵

| 条件 | 行为 |
| --- | --- |
| 宿主非插件态 / 未登录 | 按钮不显示（与恢复入口同门）；调用直接返回 |
| `/api/users/backup` 非 2xx | `manifest:null` + `reason`；对话框退回 unknown，状态行显示原因 |
| 用户取消（`AbortError`） | 同「失败」，但状态行写「已取消」；**不**改 conflicts |
| 中央目录读失败（非 zip / 截断） | `manifest:null`；同上 |
| 清单截断（> maxPaths） | `truncated:true` ⇒ 对齐判据 1 ⇒ unknown |
| IndexedDB 写失败 | `retained:false` ⇒ 证据降级 `none`（**不**回落 user-attested），状态行写明 |
| 用户随后改目标 / 切账户 | `pendingTargetPreflight` 弃用 ⇒ 回到 unknown + 手动确认 |

## 7. 测试计划

| 层 | 文件 | 覆盖 |
| --- | --- | --- |
| 纯模块 | `test/target-inventory.test.js`（新增） | 归一去重/上限截断；**对齐四态判别力**（去掉守卫即变红）；真读数不因「源 N 条」推「新增 N 条」 |
| 组合 | 同上 | `assessInventoryConflicts` 在 `unknown` 分支与 `assessTargetConflicts(null)` **逐字段相等** |
| 守卫 | 既有 `check:template-source` / `check:control-consumer` | 新 id 已登记 |
| 回归 | `npm test` / 五守卫 / `build` / `build:offline` / `e2e:web` | 零回退 |

## 8. 风险与回退

- **风险**：把「0 冲突」伪报出去 ⇒ 用户跳过风险确认。**缓解**：对齐守卫 + 判别力负例（AC-1）。
- **风险**：自动备份体量大（GB 级）导致按钮卡顿。**缓解**：复用既有 OPFS 流式路径 + 进度回调；
  按钮期间 `disabled` + 状态行；失败/取消零阻塞。
- **回退点**：本片**不改写入路径**。撤回 = 删掉按钮与 `pendingTargetPreflight` 分支，
  `buildRestoreGateContext()` 自动回到既有 `unknown` 行为（默认路径零变化）。
