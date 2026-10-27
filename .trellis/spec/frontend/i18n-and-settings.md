# 前端规范：设置边界 · 图表选择面 · i18n · 教程锚点

> 2026-10-27 定稿。适用于 `ST-pack-transfer` 工作台 UI。
> 依据：用户裁定 + `.trellis/tasks/10-26-storage-chart-workbench/HANDOFF-2026-10-27-I18N.md` + 代码实测。

---

## 1. 设置承载边界

- 设置页**只允许 3 个行为开关**：导出区保留、后端流量提示、教程自动打开。
- **打包选项不得回到设置页**：压缩、扩展包、Git、保留构建配置、backups、派生缓存、
  私有配置、清理原生资产——全部属于图表。
- 唯一源：`src/ui/settings-panel.js`（HTML + 读取）；持久化：
  `src/ui/settings-store.js`（键 `st-pack-transfer:settings`，只存 3 个布尔）。
- 新增设置项必须同时：加 locale key（zh + en）、更新 `test/settings-panel.test.js`、
  在 `index.js` 与 demo 的共享面板里生效。

## 2. 图表即唯一选择面

- `src/core/chart-model.js` 是节点模型唯一源：
  - 一级组含 `native`（原生资产）；`groupKeyOf` 用 `isTavernBuiltinAsset` 路由。
  - **所有节点正向**：勾选 = 包含；不勾 = 不包含。**禁止**「清理/删除」反向开关。
  - `native` 例外映射：勾选 = 保留 ⇒ `pruneBuiltinAssets=false`。
- `deriveExportOptions({ nodes, isChecked, ui })` 从节点派生转换器 options：
  - `includeBackups` / `includeCache` = 组内任一叶子勾选。
  - `includeAppPrivate` = 目标为 TT 且私有组任一勾选。
  - `keepDevFiles` / `extensionMode` / `gitMode` / `compressionLevel` 来自图表控件。
- **扩展组**：
  - `完整扩展` / `仅清单` 切换；**Git 三档只在完整时渲染**。
  - 完整：真实文件树 + Git 三档 + 保留构建配置。
  - 仅清单：`chartTreeFor` 用 `plan.extensions` 生成一行一个扩展（名称 + URL 可用性），
    不显示文件树/Git。
- **官方扩展索引**：`buildOfficialIndex()` 必须返回**扁平数组**
  `[{ id, type:'extension', name, description, url }]`。
  ST 的 `downloadAssetsList` 明确要求 `Array.isArray(json)`。
- **仅清单无插件捷径**：`data/<user>/files/index.json` 由 ST 暴露为
  `http://localhost:<port>/user/files/index.json`；把它粘进
  `Download Extensions & Assets → Asset URL → Load Asset List`。
  **`file://` 不可用**（浏览器禁止 fetch）。
- 扫描：`ensurePlan` 用完整清单（`include*=true`、`pruneBuiltinAssets:false`、
  `keepDevFiles:true`、FULL/KEEP），树稳定；导出时才派生 options。
- 逐级全选：根（卡头）/ 一级分类 / 子目录（`data-suball`）/ 卷卡。
  `导入01/导出01` 必须在图表卡 DOM 内；禁止「大类折叠到文件」文案。

### 2.1 多包合并模式（2026-10-27 用户裁定，覆盖原 R2.1 / R12.8 冲突）

- **默认仍是多图表**：勾选 N 个包 = N 组图表，各自产出（`generate` 按包循环）。
- 勾选 ≥2 个包时批量条出现「合并模式」开关；开启后：
  - 所有选中包合并成**一棵**图表（`mergeChartTrees`，叶子 id 带来源前缀 `leaf:<pkgId>|<path>`）；
  - 共用一套 勾选 / 分卷 / 压缩 / 目标宿主；
  - 卡头显示 `chart.mergedBadge`（`vol-idx.is-merged`）；
  - 「生成导出包」产出**一个合并包**（分卷则多卷）。
- **同名即停**：合并产物时跨包出现同一路径 → 立即停止，弹窗列出路径与份数
  （`findEntryConflicts` / `mergeConvertedBlobs`），绝不覆盖、也不多留一份。
- 合并上传（数据包区「合并上传」）走同一个原语：原样并条目，冲突同样即停。


## 3. i18n 契约

- 唯一源：`src/i18n/locales/zh-CN.js` 与 `en-US.js`（**扁平 key**，两份键必须完全一致、无空值）。
- `src/i18n/index.js`：`t(key, params)`（`{param}` 插值）、`resolveLocale`
  （`?lang=` > localStorage > navigator > zh-CN）、`setLocale` / `onLocaleChange`。
- 模板静态文案用 `data-i18n` / `data-i18n-title` / `data-i18n-placeholder` / `data-i18n-aria`，
  由 `src/i18n/dom.js` 的 `applyI18n(root)` 填充；**模板里不得保留中文兜底**。
- 动态文案用 `t()`；语言切换后 `applyI18n(root)` + `view.renderAll()`。
- 守卫：`npm run check:i18n`（`scripts/i18n-guard.js`）。`SCAN_FILES` 当前覆盖
  `index.js` / `workbench-template.js` / `workbench-view.js` / `settings-panel.js` /
  `lan-transfer-panel.js` / `export-queue.js` / `qr.js`。
  **新增 UI 文件必须加入 `SCAN_FILES`**；`src/i18n/locales/**` 与注释豁免。
- **技术消息不纳入 UI 守卫**（2026-10-27 定案）：`host-bridge.js` / `chat-store-*.js` /
  `src/app` / `src/storage` 里的错误串面向排障，不进 locale。被守卫文件内的 `dbg()`
  调试串一律写英文，避免与 UI 文案混淆。
- 时间/分隔符等**语言相关格式也走 locale**：`lan.duration.{sec,minSec,min}`、
  `queue.partJoin`、`queue.listSep`。核心 `formatDuration` 保持与 UI 无关的中文实现，
  UI 层用本地 `durationText()` 包装；**不要**让核心层依赖 i18n。
- 同一 key 只允许出现一次：locale 对象字面量里的重复键 `test/i18n.test.js`
  的键一致性用例**看不出来**（对象去重后仍相等），必须用脚本比对行级 key。

## 4. 教程锚点

- `export function tutorialAnchor(targetRect, overlayRect, cardSize)`（`src/ui/workbench-view.js`）：
  - ring/card 坐标 = 目标矩形 − overlay 自身矩形原点（兼容宿主 `transform`）。
  - card 下方空间不足时翻到上方；最终 clamp 在 overlay 内。
- `renderTutorial()` 必须在 `scroll`(capture) / `resize` / `ResizeObserver` 后用
  `requestAnimationFrame` 合帧重算。
- 单测：`test/tutorial-anchor.test.js`（普通视口 / transform / 翻转 / clamp）。

## 5. 宿主图表降级

- 无宿主清单（ST / 独立 Web / 无 `hostTree`）时：
  - 图表卡 `is-disabled` + `aria-disabled`，树不可勾选；
  - **不显示说明文案**（用户 2026-10-27 明确删除）；
  - 「浏览器配额」行照常显示；
  - **不新增宿主专用后端/端点**。

## 6. 私有配置容器与「传云」（2026-10-27）

- 容器格式：`src/core/private-container.js`
  - 根 `manifest.json`：`schemaVersion` / `kind` / `sourceLayout` / `targetLayout` / `nativeRestore` /
    `files[]`（`path` + `type` + `sizeBytes`）。
  - 成员一律在 `_private/<原路径>` 下原样保存。
  - **不复用目标包根 `manifest.json`**（那是 Luker 自己的 schema）；容器是独立 artifact。
- `canNativeRestore(manifest, targetLayout)`：只有 `nativeRestore===true` 且目标一致才可原生还原；
  转换产物内的私有件路由仍由 `transform.js` 的 `targetEntryPath` 决定（匹配原生 / 不匹配 `_compat/<源宿主>/`）。
- 宿主 files 适配器（`src/ui/host-bridge.js`）：
  - `POST /api/files/upload` `{name, data:<原始 base64>}` → `{path}`；`/delete` `{path}`；`/verify` `{urls}`。
  - 文件名白名单 `[a-zA-Z0-9._-]`；请求体上限 500 MB（`USER_FILE_MAX_BYTES`）；必须带 CSRF。
  - 只有 `st` / `luker` 支持；其它宿主直接 `{ok:false, reason:'unsupported-host'}`，不阻塞主路径。
  - 没有列表端点：下载走静态 `/user/files/<name>`；「列出」只能靠本地记录。
- 上传前必须走流量提示（`view.confirmTraffic`），与后端上下传同一套设置开关。

## 7. 验证命令


```bash
npm test
npm run check:css-scope
npm run check:dom-injection
npm run check:template-source
npm run check:dom-scope
npm run check:control-consumer
npm run check:i18n
npm run build
npm run dev   # 3040 → /src/ui/ui-demo.html
```
