# 计划 · 宿主原生化修复与扩展管理联动（2026-11-11）

> 触发：用户报「数据包转运 加载失败：Failed to fetch dynamically imported module」，
> 并要求与原生扩展管理完全联动（管理员可在全局 / 用户作用域间移动扩展）、
> 探明扩展加载顺序是否可手动调整、删除无包时空态的「导出宿主扩展列表」按钮。

## 1. 需求（可验收）

| # | 需求 | 验收判据 |
| --- | --- | --- |
| R1 | 修复宿主内扩展加载失败 | 纯静态（无打包器）浏览器加载 `index.js` 无 `Failed to fetch dynamically imported module`；`#app` 正常渲染 |
| R2 | 与原生扩展管理联动：作用域互转 | 管理员在扩展行可「移至全局 / 移至用户」；非管理员不渲染；失败按 403/404/409 如实回显 |
| R3 | 原生能力覆盖：安装到全局 | 管理员安装区可勾选「安装到全局」，默认仍是用户作用域 |
| R4 | 探明加载顺序 | 文档与 UI 给出 `loading_order` 事实；明确「能否手动调整」与调整方式 |
| R5 | 删除空态导出按钮 | 无包空态不再出现「导出宿主扩展列表」；其余两处入口保留 |
| R6 | 防回归 | 新增静态守卫拦截「只能在打包器里成立」的写法 |

## 2. 根因与证据（R1）

- 宿主为 Luker 桌面版（`https://127.0.0.1:8060`），`/scripts/extensions/third-party/*`
  映射到 `%APPDATA%\Luker\data\default-user\extensions\` 的 git clone（**不经打包器**）。
- 事故代码：`src/ui/workbench-view.js` 的
  `import demoExtensionsData from '../data/demo-extensions.json'`。
- 浏览器不支持无导入属性的 JSON 模块静态导入 ⇒ 整张依赖图实例化失败 ⇒ 宿主显示
  `Failed to fetch dynamically imported module`（Vite 开发/打包会转换 JSON，所以独立态看不出来）。
- 取证：对该扩展 80 个模块逐个 HTTP 拉取，全部 200；唯一非 JS 模块即
  `src/data/demo-extensions.json`。
- 修复：数据迁到 `src/data/demo-extensions.js`（ESM），删除 JSON。
- 复验：`tmp/static-server.cjs`（纯静态、无打包器）+ Playwright 打开 `index.html`：
  200 加载、`#app` 6 个子节点、控制台无模块加载失败。

## 3. 实现（R2–R6）

- **作用域互转**：`src/ui/host-bridge.js` 新增 `moveExtensionViaHost(name, source, destination)`
  → `POST /api/extensions/move`（`{extensionName, source, destination}`，`global|local`，管理员专属）。
  `index.js` 暴露 `actions.moveExtension`；`workbench-view.js` 的
  `moveScopeWithConfirm()` / `moveInstalledExtension()` 负责二次确认、失败原因回显、成功后刷新列表。
- **管理员判据**：`readHostIdentity().admin === true`（不改判据、不按昵称猜）。宿主页进入即
  调用 `loadServerPlugins()`，避免“只有去过开发者页才认识管理员”。
- **安装到全局**：`installExtensionViaHost({global})`、`installExtensionBatch()` 透传 `entry.global`；
  视图仅在管理员时渲染复选框。
- **加载顺序**：`manifestToExtension()` 保留 `loadingOrder`；列表显示 `#N` 并新增「加载顺序」排序。
  **只读**：宿主没有写回 manifest 的端点，插件不提供伪编辑。
- **空态按钮**：删除 `#btn-assetlist-host` 及其事件分支、i18n 键；入口只剩图表卡与扩展管理工具条。
- **防回归**：`tooling/no-bundler-only.js`（入库）+ `npm run check:no-bundler-only`，
  拦截 JSON 静态导入、`node:` 静态导入、裸包名、Vite 专有语法（`?raw` / `import.meta.env` 等）。

## 4. 契约与文档

- `.trellis/spec/frontend/extension-git-manager.md` §13（作用域互转）、§14（加载顺序）
- `.trellis/spec/frontend/asset-list-export.md`（入口表与教程文案同步）
- `docs/DEVELOPER-GUIDE.md`（K2 表、质量命令）
- `README.md` §3.4（作用域互转 / 安装到全局 / 加载顺序）

## 5. 验收命令

```bash
npm run check:css-scope check:dom-injection check:template-source check:dom-scope check:control-consumer check:i18n check:no-bundler-only
npx vitest run
npm run build
```

## 6. 已知边界（不假装覆盖）

- 作用域互转**未在真实宿主点过按钮**：端点与权限已核对上游源码；实机按钮需在 Dev 实例取证。
- 加载顺序**不可在插件内修改**（宿主无写端点）；手动调整只能改扩展自身 `manifest.json` 后刷新。
- 原生扩展的「启用 / 禁用」开关未纳入本面板：它写的是宿主 `extension_settings.disabledExtensions`，
  没有独立端点，贸然整包保存设置会覆盖宿主状态，故不做。
