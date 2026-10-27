# 图表唯一选择面与扩展清单模式

## Goal

图表成为唯一选择面：正向节点、扩展/清单切换、Git 仅完整扩展时显示、逐级全选、导入/导出进图表、压缩顶部；修正官方 extensions-index.json 为扁平数组并支持插件代装。

## Requirements

### 节点语义（用户 2026-10-27 裁定）

- R1 **所有图表节点正向**：勾选 = 包含进包；不勾 = 不包含。**禁止**「清理/删除」反向开关
  （如「清理原生重复资产」）。删除该反向语义，改为正向「原生资产」节点。
- R2 **只有 Git 与扩展例外**：扩展组默认包含；Git 默认「保留历史」（完整扩展时）。
  其余节点沿用「建议保留」默认勾选。
- R3 **扩展组双模式**：`完整扩展包` / `仅清单` 切换；**只有完整扩展时 Git 三档才显现**；
  仅清单时 Git 控件隐藏。
- R4 完整扩展：扩展文件树可勾；Git 三档「保留历史 / 只留更新所需 / 不含」；「保留构建配置」正向勾选。
- R5 仅清单：扩展子树改为**扩展条目列表**（名称 + 来源 URL 可用性），正向勾选；不显示文件树与 Git。
- R6 原生资产：新增一级组「原生资产」（正向，勾选=包含），删除「清理原生重复资产」。
- R7 backups / 派生缓存 / 私有配置：复用现有真实节点作正向开关源。

### 唯一选择面

- R8 图表是唯一选择面：`generate()` 与 `ensurePlan()` 不再读全局 8 项设置
  （compression/extensionMode/gitMode/keepDev/includeBackups/includeCache/includePrivate/pruneBuiltin）；
  改为从图表节点派生 `transform` options。
- R9 扫描改为**完整清单**（keepDevFiles/includeCache/includeBackups/includeAppPrivate=true，
  pruneBuiltinAssets=false，extensionMode=FULL，gitMode=KEEP），使树稳定；虚拟节点只在导出时生效，
  杜绝「勾了不生效」。
- R10 压缩：移到图表顶部控制条（与目标平台 / 差量 / 分卷同排）。
- R11 逐级全选 / 全不选 / 反选：根、一级分类、子目录、卷卡每一级都有入口；父级三态与 `syncAncestors` 一致。
- R12 `导入01 / 导出01` 移进图表卡 DOM，并在该处补全选/全不选/反选；删除外层独立组头。
- R13 删除「大类折叠到文件」文案（`workbench-view.js:380`）。

### 扩展清单模式（用户裁定 A）

- R14 修正 `buildOfficialIndex()`：输出**官方扁平数组**
  `[{ id, type:"extension", name, description, url }]`，不是 `{ extension: [...] }`；
  与 `https://raw.githubusercontent.com/SillyTavern/SillyTavern-Content/main/index.json` 同形。
- R15 仅清单包同时产出：
  - `extensions-index.json`（官方扁平数组，供 ST 原生 Download Extensions & Assets → Load Asset List）；
  - `_convert/extensions-manifest.json`（本插件代装/状态）。
- R16 原生安装事实必须如实标注：stock ST 无「导入 zip 自动装扩展」；原生路径是
  **URL + 手动 Download**。本插件在场时代装。说明只进「?」/教程/包内说明，不进面板正文。
- R17 **无插件捷径（已核实）**：ST 把 `data/<user>/files/` 映射为同源 `/user/files/*`
  （`src/users.js` 的 `router.use('/user/files/*', ...)`，`src/server-startup.js` 的 `app.use('/', userDataRouter)`）。
  因此把 `index.json` 放进 `data/<user>/files/` 后，可直接用
  `http://localhost:<端口>/user/files/index.json` 作为资产列表 URL，**不需要额外本地 HTTP 服务或远程托管**。
- R18 **`file://` 不可用**：ST 资产列表由浏览器 `fetch(url)` 加载
  （`public/scripts/extensions/assets/index.js` 的 `downloadAssetsList`），
  `http://localhost` 页面无法 fetch `file://`；`isValidUrl` 虽接受任意可解析 URL，但实际 fetch 会被浏览器拦截。
  包内说明必须写「用 `/user/files/...` 的 http 地址」，不得写 `file://`。
- R19 Luker/PT/TT 各自能力在实施时核实并标注；不得宣称宿主不支持的能力。
- R20 demo 先行：3040 `/src/ui/ui-demo.html` 可验证节点、模式切换、逐级全选、压缩位置。

## Constraints

- `transform.js` 的 options 契约保持不变；只改调用方与图表派生层。
- 正向语义：不得出现「取消勾选即删除/清理」的文案或行为。
- CSS 双前缀；不改 `src/vendor/`；不改宿主源码；不新增宿主后端。
- 修改现有文件用块级 `Edit`；提交用显式 pathspec。

## Acceptance Criteria

- [ ] AC-1 图表所有节点正向；不存在「清理/删除」反向开关或文案。
- [ ] AC-2 扩展组可切「完整扩展包 / 仅清单」；仅清单时 Git 控件消失。
- [ ] AC-3 完整扩展时 Git 三档可用，默认保留历史。
- [ ] AC-4 仅清单时扩展子树显示条目列表（名称 + URL 可用性），不是文件树。
- [ ] AC-5 勾/不勾 backups、派生缓存、构建配置、Git、扩展、原生资产，产物随之变化（测试断言）。
- [ ] AC-6 根 / 一级分类 / 子目录 / 卷卡每一级都能全选、全不选、反选，父级三态正确。
- [ ] AC-7 `导入01 / 导出01` 在图表 DOM 内且有全选；无外层独立组头。
- [ ] AC-8 全仓无「大类折叠到文件」。
- [ ] AC-9 `extensions-index.json` 为官方扁平数组；单测对比官方 schema。
- [ ] AC-10 demo 截图 + `npm test` + 五守卫 + `npm run build` 全绿。

## Notes

- 依赖：建议在 `10-27-host-chart-settings` 之后再开始（共享 `workbench-view.js` / `style.css`）。
- 证据：`HANDOFF-2026-10-27-UI-TRACE.md` §3 P0-2 / P0-3 / P0-5 / P1-6；
  `src/core/extension-manifest.js:200-212`（官方索引形状错误）。
