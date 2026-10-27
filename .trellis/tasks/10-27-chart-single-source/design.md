# 设计：图表唯一选择面与扩展清单模式

## 1. 数据流（消除双源）

```
源包 → generatePlan(permissive) → plan.categories + plan.extensions
     → buildChartTree(plan, {extensionMode}) → 图表树（唯一选择面）
     → 用户勾选 + 虚拟控件 → chartOptionsOf(tree, uiState)
     → transform(options) + excludedPaths → 产物
```

- `generatePlan` 已返回 `extensions: [{name, manifest, gitMeta, sourceRecord}]`
  （`plan-preview.js:429-439`），仅清单子树直接复用。
- 扫描用 permissive options：
  ```js
  { includeCache:true, includeBackups:true, includeAppPrivate:true,
    keepDevFiles:true, pruneBuiltinAssets:false,
    extensionMode:'full', gitMode:'keep' }
  ```
  仍保留 `isJunkOrDevFile` 的系统垃圾过滤（不传 `keepAll`）。
- `planCache` key 只含 `pkgId + target`；permissive 扫描结果稳定，UI 切换不重扫。

## 2. 图表节点模型

### 2.1 一级组

`CHART_GROUPS` 增加：
```js
{ key:'native', label:'原生资产', icon:'shield', suggest:SUGGEST.DROP }
```
`groupKeyOf()` 在私有件判定之后、普通类目之前：
```js
if (isTavernBuiltinAsset(path)) return 'native';
```
（`isTavernBuiltinAsset` 来自 `src/core/builtin-assets.js`，纯函数可导入。）

### 2.2 虚拟控件（扩展组）

- `virtual:extension-mode`：`full | manifest`（segmented，位于扩展组头）。
- `virtual:git-mode`：`keep | minimal | strip`（select，仅 `full` 时渲染）。
- `virtual:keep-dev`：正向复选框（`keepDevFiles`）。
- 扩展组默认勾选；`full` 默认 `keep`（用户裁定的「非选择就包含」例外）。

### 2.3 仅清单子树

`buildChartTree(plan, { extensionMode })`：
- `full`：现有真实文件树。
- `manifest`：把 `group:extensions` 的 children 替换为：
  ```js
  { id:'ext:<name>', label:displayName||name, badge:urlHost,
    suggest: installable?'keep':'unknown', children:[], mb:0,
    url, availability }
  ```
  `availability` 来自 `deriveExtensionEntry`（`extension-manifest.js`）。
- 仅清单时 Git 控件不渲染；扩展文件树不出现。

### 2.4 派生 options

`chartOptionsOf(tree, ui)`（`chart-model.js`，纯函数）：
```js
{
  compressionLevel,
  extensionMode,
  gitMode,
  keepDevFiles: checked('virtual:keep-dev'),
  includeBackups: anyChecked('group:backups'),
  includeCache: anyChecked('group:cache'),
  includeAppPrivate: anyChecked('group:private'),
  pruneBuiltinAssets: !checked('group:native'),
}
```
- `anyChecked(group)` = 组内任一叶子 checked（部分勾选时全局 flag 为 true，未勾的由 `excludedPaths` 排除）。
- `native` 组默认不勾；勾了 = 保留原生资产（`pruneBuiltinAssets=false`）。

## 3. 逐级全选

- 现有 `setChecked(node, scope, val)` 已能递归子树（`workbench-view.js:134`）。
- 新增 `applyTreeAll(scope, mode, rootNode)`：
  - `all` / `none` / `invert`（invert 对子树每个叶子取反）。
- 入口：
  - 根：`#batch-bar`（现有）+ 每张卷卡 `tree-tools`。
  - 一级分类：组头 `data-suball` 三按钮。
  - 子目录：父行 hover 显示 `data-suball` 三按钮（或行尾紧凑菜单）。
  - 卷卡：现有 `tree-tools`。
- 父级三态继续由 `syncAncestors` 计算。

## 4. 导入/导出标签进图表 DOM

- `chartCardHtml` 增加 `pkgLabel`（`导入05` / `导出01` / `宿主数据`）与 `tools`。
- 每张包卡都渲染 `.vol-head`（不再 `hideHead: !multi`）：左侧 `pkgLabel`，多卷时加 `卷 i/n`，
  右侧全选/全不选/反选 + 关闭。
- 删除 `.chart-group-head`；`chart-group` 只保留 `.vol-grid`。

## 5. 压缩控件

- `workbench-template.js` 的 `.chart-controls` 增加：
  ```html
  <label class="field">压缩
    <select id="compression-select" class="text_pole">…</select>
  </label>
  ```
- 视图 state 增加 `compression:'5'`；`actions.generate` 载荷增加 `compression`。
- `index.js` 的 `generate()` 用载荷值，不再读 `settings.compression`。

## 6. 官方扩展索引修正

### 官方格式（已实测）

- `index.json` 顶层必须是**数组**；扩展条目键为 `id / type / name / description / url`（可选 `tool`）。
- ST 的 `downloadAssetsList(url)` 明确 `if (!Array.isArray(json)) throw new Error('Assets list is not an array')`
  （`public/scripts/extensions/assets/index.js:289-300`）。

### 修正

- `buildOfficialIndex()` 返回扁平数组：
  ```js
  return usable.map(({ id, displayName, name, description, url }) => ({
    id, type:'extension', name: displayName || name, description, url,
  }));
  ```
- `transform.js` 的写出路径保持 `extensions-index.json`（包根或 `_convert/`，实施时按宿主可服务性定）；
  `extensions-manifest.json` 不变。
- 单测：读取官方 `index.json` 的 schema 键集合，断言产物键为其子集；
  断言顶层是数组、`type==='extension'`。

### 无插件捷径（ST 已核实）

- ST 的 `src/users.js` 定义：
  ```js
  router.use('/user/files/*', createRouteHandler(req => req.user.directories.files));
  ```
  `src/server-startup.js` 以 `app.use('/', userDataRouter)` 挂载。
- 因此 `data/<user>/files/index.json` → `http://localhost:<port>/user/files/index.json`
  （Dev ST 常用 8001，Real ST 8002；端口以实例为准）。
- 唯一插件-free 最短路径：
  1. 把包内 `index.json` 放进 `data/<user>/files/`；
  2. Extensions → Download Extensions & Assets → Asset URL 填
     `http://localhost:<port>/user/files/index.json` → Load Asset List；
  3. 逐个点 Download。
- **`file://` 不可用**：页面是 `http://localhost`，浏览器禁止 fetch `file://`；
  `isValidUrl` 只是 `new URL()` 解析，不代表可 fetch。
- 包内安装说明必须写 `/user/files/...` 的 http 地址，不得写 `file://`。
- Luker 是否同样暴露 `/user/files/*` 在实施 P4 时核实；PT/TT 另行标注。

### 插件代装

- 恢复端继续读 `_convert/extensions-manifest.json`；`shouldAutoOpenInstaller` 逻辑不变。


## 7. 演示数据

- `ui-demo.html` 的 `demoTree()` 增加 `native` 组与扩展组的 `url` 元数据；
  harness 提供 `view.setExtensionMode()` / `setGitMode()` 的演示入口（若视图 API 需要）。

## 8. 测试

- `test/chart-model-options.test.js`：正向派生、anyChecked、native 反向映射。
- `test/chart-model-manifest.test.js`：仅清单子树。
- `test/extension-index.test.js`：官方扁平数组 schema。
- `test/chart-level-select.test.js`：逐级全选/三态。
- demo 截图：完整/仅清单、Git 显隐、原生资产、逐级全选、压缩顶部、导入导出标签。
