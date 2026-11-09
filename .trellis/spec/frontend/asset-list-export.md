# 资产列表导出（下载扩展和资源菜单可加载）

> 2026-11-09 用户裁定：导出物**不是 Markdown 表格**。只允许输出酒馆原生
> 「下载扩展和资源菜单 → Asset URL → 加载资产列表」可接受的官方扁平数组。
> 本页自包含，改导出物或入口只读本页。

---

## 1. 文件契约

- 顶层必须是 **数组**：宿主 `downloadAssetsList()` 明确 `if (!Array.isArray(json)) throw`。
- 每个条目只允许五键：`id / type / name / description / url`。
- `type` 当前固定为 `extension`；`url` 必须是 `http(s)`。
- 只保留可下载条目；**没有任何可下载条目时不得生成空文件冒充成功**。

## 2. 数据来源

### 2.1 包内

`plan-preview` 已缓存的 `pkg.extensions`（`{name, manifest, gitMeta, sourceRecord}`）
经 `deriveExtensionEntry({...ext, mode:'manifest'})` 派生 URL，再交给
`buildAssetList()`。不二次扫描 zip。

### 2.2 宿主

1. `GET /api/extensions/discover`（权威；ST / Luker 客户端自己使用该端点）；
2. 根 `GET /api/extensions` 仅作兼容兜底；
3. 逐条 `GET /scripts/extensions/<name>/manifest.json`，取
   `display_name / description / version / author / homePage`；
4. `homePage` 缺失 ⇒ 条目保留但 `url:''`，导出时被过滤；
5. 端点形状不认识或全部失败 ⇒ `{ok:false}`，UI 显示「当前宿主未提供扩展清单」；
6. 端点成功但数组为空 ⇒ `ok:true, total:0`（真实空清单，与「不支持」区分）。

能力声明：`src/core/host-capabilities.js` 的 `assetList` 表；`pt:false`，`tt` 未取证（探测）。

## 3. 入口（只允许两处）

| 位置 | DOM | 行为 |
| --- | --- | --- |
| 每张图表卡 | `[data-assetlist]` + `data-assetpkgs` | 导出该包/合并包的扩展资产列表 |
| 从宿主拉取空态卡 | `#btn-assetlist-host` | 调宿主 discover + manifest 导出 |

设置「诊断」里的导出按钮**已删除**（用户裁定：不要第三处）。

## 4. 实现落点

| 事项 | 位置 |
| --- | --- |
| 官方形状 / 去重 / 统计 | `src/core/asset-list.js` |
| 宿主 discover + manifest | `src/ui/host-bridge.js` 的 `listHostExtensions(platform)` |
| 包内派生 | `index.js` 的 `exportPackageAssetList()` |
| 宿主导出 | `index.js` 的 `exportHostAssetList()` |
| 图表卡按钮 | `src/ui/workbench-view.js` 的 `chartCardHtml()` |
| 空态按钮 | `src/ui/workbench-view.js` 的 `renderChart()` 空态 `guide-fetch` |
| 下载 | `index.js` 的 `saveJsonDownload()`（`application/json`） |

## 5. 验收

1. 下载文件 `JSON.parse` 后是数组，条目键集合 ⊆ `{id,type,name,description,url}`。
2. 宿主不支持 ⇒ 提示「当前宿主未提供扩展清单」，**不产生文件**。
3. 有扩展但无 `homePage` ⇒ 提示「没有可导入的下载地址（共 N 个扩展）」，不产生文件。
4. 同一宿主重复导出，条目按 `name` 稳定排序、按 `id` 去重。
5. 单测：`test/asset-list.test.js`（官方形状、discover 两种形状、URL 过滤、清单解析）。
