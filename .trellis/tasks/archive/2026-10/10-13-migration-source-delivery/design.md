# S2 技术设计：源端三类交付

> 对应 `prd.md`（R1–R8 / AC1–AC7）。

## 1. 现状缺口（改动理由）

`index.js` 的 `handleHostExport`（1493-1835）在 `needsTransform` 时把 `finalBlob = resultBlob`（转换后），
随后只 `exportQueue.enqueue({ name: finalFilename, blob: finalBlob, ... })`（1791-1800）——
**`rawBackupBlob`（未转换源包）就此丢失**。分卷分支（1754-1789）与增量分支（1739-1751）同样只交转换产物。
⇒ 用户**拿不到保底文件**（`R-04` / `AC-03`）。

## 2. `buildSourceDeliveries(input) -> DeliveryItem[]`（纯函数）

### 2.1 输入

```js
{
  source: { blob, name, layout },        // 未转换的源备份（rawBackupBlob）
  target: { blob, name, layout } | null, // 转换后的目标包（无转换时 null）
  report: { text, name } | null,         // 报告文本（Report.toHuman()）
  hasTransform: boolean,                 // 是否发生了转换
}
```

### 2.2 输出（每项供 `exportQueue.enqueue` 直接消费）

```js
{ name: string, blob: Blob, origin: string, targetLayout: string }
```

### 2.3 规则

| 条件 | 产出 |
| --- | --- |
| `hasTransform=true` | `[ 源备份(origin=source-backup, layout=''), 目标包(origin=converted, layout=target.layout), 报告(origin=report, layout='') ]` |
| `hasTransform=false` | `[ 宿主导出(origin=host-export, layout=source.layout), 报告(origin=report, layout='') ]` —— **不重复**源/目标 |
| `report=null` | 省略报告项 |

### 2.4 命名（`AC-03` 用途不混淆）

- 源备份：`<sourceBase>_源备份.zip`（`sourceBase` = `source.name` 去 `.zip`）
- 目标包：保持 `target.name`（由 `resolveFilename` 产出，是**主产物**，不改名）
- 报告：`<sourceBase>_报告.txt`

报告 `blob` = `new Blob([report.text], { type: 'text/plain;charset=utf-8' })`。

## 3. 来源枚举扩展

`src/storage/db.js`：

```js
export const ORIGINS = Object.freeze({
  UPLOAD: 'upload',
  HOST_EXPORT: 'host-export',
  CONVERTED: 'converted',
  DELTA: 'delta',
  SPLIT_PART: 'split-part',
  SOURCE_BACKUP: 'source-backup',   // 新增：未转换的源备份（保底）
  REPORT: 'report',                 // 新增：迁移报告
});
```

`src/ui/export-queue.js` 的 `ORIGIN_LABELS`（80-84）同步加：
`[ORIGINS.SOURCE_BACKUP]: { text: '源备份', cls: 'origin-source-backup' }`、
`[ORIGINS.REPORT]: { text: '迁移报告', cls: 'origin-report' }`。

⚠️ 加性改动：既有消费者只读自己认识的 origin，新增枚举值不影响存量记录（`db.js:54-60` 的归一化对未知 origin 原样保留）。

## 4. `index.js` 接入点（三处，保守）

| 分支 | 现状入队 | 接入后 |
| --- | --- | --- |
| 分卷（1754-1789） | 分卷 parts | 分卷 parts **+ 源备份 + 报告** |
| 单包（1791-1800） | `finalBlob` | `buildSourceDeliveries(...)` 的三项（源备份 + 目标包 + 报告） |
| 增量（1739-1751） | delta | delta **+ 源备份 + 报告**（delta 是目标包位） |

接入方式：**只替换/追加 `enqueue` 调用**，不动 `fetchHostBackup` / `runConversionTask` / 分卷 / 增量本身。
源备份项在三种分支**共用**（`rawBackupBlob` 在函数内始终可得）。

`hasTransform` 判定：沿用现有 `needsTransform` 变量（1695-1699）。

## 5. 不变量与回退

- **目标包字节不变**：`buildSourceDeliveries` 只**引用** `target.blob`，不复制、不重打包（`AC-05`）。
- **回退点**：本片未接按钮委托、未改转换逻辑；撤回 `buildSourceDeliveries` 与三处 `enqueue` 改动即完全回退。
- **未引入第二执行者**（`R7`）：`btnHostFetch` 仍指向 `handleHostExport`。

## 6. 测试落点

`test/migration-journey.test.js`（源端部分）：
- `buildSourceDeliveries` 三种组合（有转换 / 无转换 / 无报告）的项数与 origin；
- 命名后缀可区分；
- 目标包 blob **同一引用**（不被复制）；
- `ORIGINS.SOURCE_BACKUP` / `REPORT` 存在于枚举。
