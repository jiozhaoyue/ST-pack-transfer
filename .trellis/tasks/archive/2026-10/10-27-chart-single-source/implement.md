# 执行计划：图表唯一选择面与扩展清单模式

## 执行状态（2026-10-27 收口）

- [x] 代码主体完成（提交 `f5c02c2`）。
- [x] 新增 `chart-model` 选项/清单测试；六守卫通过。
- [x] `task.py archive`（本文件勾选后执行）。
- [ ] 浏览器截图 / 四宿主复验 —— **用户 2026-10-27 指令明确跳过**。
- 详见 [`HANDOFF-2026-10-27-I18N.md`](../10-26-storage-chart-workbench/HANDOFF-2026-10-27-I18N.md)。


> 依赖：建议在 `10-27-host-chart-settings` 之后执行（共享视图与样式）。
> 每步完成跑验证，绿了再进下一步。

## 0. 前置

- [x] 检索先行记录（本任务已做：官方 index.json schema、ST 原生 Load Asset List）。
- [x] `implement.jsonl` / `check.jsonl` 至少各一条真实条目。
- [x] `python ./.trellis/scripts/task.py start 10-27-chart-single-source`

## 1. 模型与派生

- [x] `chart-model.js` 加 `native` 组与 `isTavernBuiltinAsset` 路由。
- [x] 加 `virtual:extension-mode` / `virtual:git-mode` / `virtual:keep-dev` 节点模型。
- [x] 加派生纯函数（实现名 `deriveExportOptions({nodes,isChecked,ui})`，非 `chartOptionsOf`）。
- [x] 单测：`chart-model-options`（正向、anyChecked、prune 反向映射）。

## 2. 仅清单子树

- [x] `buildChartTree(plan, { extensionMode })` 支持 manifest 子树（用 `plan.extensions`）。
- [x] 单测：`chart-model-manifest`。
- [x] demo 数据提供扩展 URL 元数据。

## 3. 视图

- [x] 扩展组头：完整/仅清单 segmented；Git 仅完整显示。
- [x] `virtual:keep-dev` 正向复选框；`native` 组正常渲染。
- [x] 每张包卡渲染 `pkgLabel`（导入/导出/宿主）+ 全选/全不选/反选；删除外层组头。
- [x] 逐级全选：根 / 一级分类 / 子目录 / 卷卡；父级三态。
- [x] 删除「大类折叠到文件」。
- [x] 图表顶部加压缩 select。
- [x] 验证：DOM 断言走单测；demo 截图按用户指令跳过。

## 4. 控制器与转换器

- [x] `index.js` 扫描改 permissive options（R9）。
- [x] `generate()` 用图表派生 options + 压缩载荷；删除全局 8 项读取。
- [x] `ensurePlan` 的 `planCache` key 保持 `pkgId+target`（permissive 稳定）。
- [x] `extension-manifest.js` 的 `buildOfficialIndex` 改扁平数组。
- [x] 单测：`extension-manifest.test.js` 覆盖官方扁平 schema（无独立 `extension-index` 文件）。
- [x] 验证：勾/不勾各维度 → 派生 options 断言（`chart-model-options`）。

## 5. 收口

- [x] `npm test` 全绿。
- [x] 五守卫全绿。
- [x] `npm run build` 通过。
- [ ] demo 截图：完整/仅清单、Git 显隐、原生资产、逐级全选、压缩顶部、导入导出标签 —— **用户指令跳过**。
- [x] spec 更新：`.trellis/spec/frontend/` 记录「图表即唯一选择面」「正向节点语义」「官方扩展索引契约」。
- [x] 显式 pathspec 提交并推送 `origin main`。
- [x] `task.py archive 10-27-chart-single-source`。
