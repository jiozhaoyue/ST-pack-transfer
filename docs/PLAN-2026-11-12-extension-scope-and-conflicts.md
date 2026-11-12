# PLAN-2026-11-12 · 四宿主扩展作用域与同名去重

> 用户 2026-11-12 指令：完全探明四宿主插件存放路径；绝对区分宿主自带插件与三方插件；
> 正确转换并平铺 third-party；绝不出现「同时平铺 + third-party 各复制一份」；
> 插件内直接提示并引导修复（在宿主里删哪份、包中不勾哪项、转出正确的包）。
>
> 状态：**已按用户 2026-11-12 确认的推荐项实施**（Q1 保留用户级 / Q2 丢弃自带插件 /
> Q3 保留作用域 / Q4 区内汇总条 + 行内标注）。验收见 §六。

## 一、旧实现的缺陷（先修认知，再动代码）

| # | 缺陷 | 证据 |
| --- | --- | --- |
| D1 | `routeSource` 不识别 `public/scripts/extensions/third-party/<n>`（**ST/Luker 全局扩展的真实包内路径**）⇒ 转 TT/PT 时写成 `data/default-user/public/scripts/...` 垃圾路径 | `src/core/transform.js:939-946`；宿主常量 `SillyTavern/src/constants.js:6`、`Luker/src/constants.js:10` 均为 `globalExtensions: 'public/scripts/extensions/third-party'` |
| D2 | `thirdPartyFolderOf` 同样不认该前缀 ⇒ PT 目标预扫拿不到全局扩展名 | `src/core/transform.js:1000-1011` |
| D3 | `thirdPartyFolders` 预扫**只在 PT 目标执行** ⇒ TT 目标的同名冲突判定恒失效，同名时 local 与 global 各写一条、目标路径相同 ⇒ **zip 同路径重复** | `src/core/transform.js:495-511` 的 `if (target === TARGETS.PT)` |
| D4 | ST/L 目标**完全没有同名判定** ⇒ `extensions/<n>` 与 `public/scripts/extensions/third-party/<n>` 同名时两条都成 `extensions/<n>` ⇒ 同路径重复 | `src/core/transform.js:706-725` 只对 `PT/TT` 分支判定 |
| D5 | 宿主自带插件（`public/scripts/extensions/<builtin>`，无 `third-party` 段）无分类：落 `kind:'user'`，hub 路径原样 ⇒ 转 TT/PT 写进 `data/default-user/public/scripts/extensions/<builtin>` | `routeSource` 无对应分支 |
| D6 | 同名保留方向与宿主**相反**：现实现丢弃用户级、保留第三方（`userExtensionCollisions`），而 ST/Luker/TT 的实际加载语义是**用户级优先** | `transform.js:717-723` vs `SillyTavern/src/endpoints/extensions.js:520-529`、`Luker/src/endpoints/extensions.js:1148-1153`（注释原文 `In case of a conflict, the extension will be loaded from the user folder`）、TT `docs/CurrentState/ThirdPartyExtensions.md` |
| D7 | 冲突只在 `report.warn` 文字日志，用户无从知道去哪修 | `transform.js:1123-1141` |

## 二、四宿主插件落点（实机取证，2026-11-12）

| 宿主 | 宿主自带 | 全局三方 | 用户级（local） | 来源记录 |
| --- | --- | --- | --- | --- |
| SillyTavern | `public/scripts/extensions/<内置>/`（regex/expressions/gallery…） | `public/scripts/extensions/third-party/<n>/` | `data/<user>/extensions/<n>/` | — |
| Luker | 同上（另有 card-app / memory-graph / orchestrator 等内置） | 同上 | 同上（**主位置**，平铺） | — |
| TauriTavern | 前端内置，不在数据根 | `data/extensions/third-party/<n>/`（global） | `data/default-user/extensions/<n>/`（local，**同名 local 优先**） | `data/_tauritavern/extension-sources/{global,local}/<n>.json` |
| PureTavern | 前端内置 | `data/extensions/third-party/<n>/` + 来源记录（**唯一可用落点**） | 无（目录表不含 `extensions/`） | `data/_tauritavern/extension-sources/<scope>/<n>.json` |

**同名重复在真实数据里确实存在**（本机只读取证）：

- Dev Luker：`ST-BgLoader`、`st-chatu8` 同时位于 `data/default-user/extensions/` 与 `public/scripts/extensions/third-party/`；
- Dev TauriTavern：`JS-Slash-Runner`、`ST-Prompt-Template` 同时位于 `data/default-user/extensions/` 与 `data/extensions/third-party/`。

⇒ 这不是理论边界，是把宿主导出包直接丢进转换器就会命中的路径。

## 三、目标

1. 每个扩展名在**同一份产物**里只出现一次（同路径不重复、不双份安装）。
2. 保留方向与宿主语义一致：**同名 → 用户级优先**（TT/ST/Luker 均如此）。
3. 宿主自带插件与三方插件在**分类层**分开：自带不冒充扩展、不进三方目录。
4. 平铺/嵌套按目标宿主规范：ST/L 目标 `extensions/<n>/`；TT 目标 local→`data/default-user/extensions/<n>/`、global→`data/extensions/third-party/<n>/`；PT 目标一律 `data/extensions/third-party/<n>/` + 来源记录。
5. 用户可见的修复引导：指出哪一组同名、在宿主删哪份、包中不勾哪项。

## 四、改动落点

| 文件 | 改动 |
| --- | --- |
| `src/core/ext-pack.js` | 扩展单元带 `scope: 'builtin'|'global'|'user'`；`UNIT_PATTERNS` 补 `public/scripts/extensions/third-party/`，并**显式排除**自带插件路径 |
| `src/core/transform.js` | ① `routeSource` 认 `public/scripts/extensions/third-party/`（→ `extension-pkg`，hub 去 `third-party`）；② 自带插件单独分类（`kind:'builtin-ext'`）；③ `thirdPartyFolders` 预扫对 **ST/L/TT/PT 全目标**执行；④ 同名判定统一为「保留用户级」并覆盖四目标；⑤ 报告新增冲突条目 |
| `src/ui/workbench-view.js` | 扩展选择区顶部汇总条 + 冲突扩展行内标注与修复指引 |
| `src/i18n/locales/{zh-CN,en-US}.js` | 新增提示文案 |
| `docs/DEVELOPER-GUIDE.md` / `README.md` | 同提交更新（铁律 22） |

## 五、决策（用户 2026-11-12 确认）

| # | 决策 | 采纳 |
| --- | --- | --- |
| Q1 | 同名保留哪份 | **保留用户级**（= ST/Luker/TT 实际加载语义） |
| Q2 | 宿主自带插件怎么处理 | **丢弃并在报告/UI 列出** |
| Q3 | TT/PT 目标的用户级落点 | **保留作用域**：TT → `data/default-user/extensions/`，PT → third-party + 来源记录 |
| Q4 | 提示形态 | **扩展选择区顶部汇总条 + 行内标注** |

## 五之二、实施记录（2026-11-12）

| 文件 | 实际改动 |
| --- | --- |
| `src/core/transform.js` | 新增 `PUBLIC_THIRD_PARTY_PREFIX` / `PUBLIC_EXTENSIONS_PREFIX`；`routeSource` 认 ST/Luker 全局路径并返回 `extScope`，自带插件判 `builtin-ext`，TT local 扩展改判 `extension-pkg/user`；新增 `extensionScopeOf()` 与 `scanExtensionScopes()`（四目标共用预扫）；主循环按 scope 落点、同名跳过全局副本、剥离自带插件；`targetEntryPath(hub, target, extScope)`；`buildExtensionSources(..., target)` 按作用域写 `extension-sources/{local,global}`；`selection.globalExtensions` 改为按 `extScope` 判类目 |
| `src/core/plan-preview.js` | 同步预扫与同名/自带判定；`classifyItemCategory(hub, kind, extScope)` 保留 `globalExtensions` 分类；planItem 带 `extScope`/`extName`；返回 `extensionScopes{user,global,builtin,shadowed}` |
| `index.js` | `live.extensionScopes = plan.extensionScopes` |
| `src/ui/workbench-view.js` | `mergedExtensionUnits()` 合并「扩展 + 全局扩展」并按名去重、剔除 DROP 副本；`extScopeNotesHtml()` 汇总条；`packRowHtml` 行内「全局副本已跳过」标注 |
| `src/i18n/locales/{zh-CN,en-US}.js` | 新增 5 条作用域文案 |
| `style.css` | `.ext-scope-notes` / `.ext-scope-note` / `.ext-scope-tag`（全部挂 `#app.app-container`） |
| `test/extension-scope.test.js`、`test/extension-scope-e2e.test.js` | 新增 19 条（本地目录，按铁律 21 不入库） |
| 既有用例 | `convert.test.js` 3 条、`plan.test.js` 1 条按新语义更新 |

## 六、验收判据

1. `npm test` 全绿；新增用例：四宿主 × 四目标的扩展路径矩阵、同名去重、自带插件剥离。
2. 同一扩展名在同一产物里**路径唯一**（逐条扫描产物中央目录断言）。
3. Dev 实例真实包（Luker / TT）转换后：产物中 `ST-BgLoader` / `JS-Slash-Runner` 各只有一条根路径。
4. UI：冲突时选择区出现汇总条与行内指引；`npm run check:dom-scope` 等五项守卫通过。

## 七、验收结果（2026-11-12）

| # | 结果 |
| --- | --- |
| 1 | 目标测试全绿：`extension-scope`(15) + `extension-scope-e2e`(4) + `convert`(31) + `plan`/`migration-plan`(10) + `real-samples`/`host-extensions`(10) + `mirror`/`target-inventory`(32) + `convert-*`/`batch`/`web`(54) |
| 2 | 端到端用例逐目标断言：`DupExt/index.js` 在 ST/L 只出现 `extensions/DupExt/…` 一次、TT 只出现 `data/default-user/extensions/DupExt/…` 一次、PT 只出现 `data/extensions/third-party/DupExt/…` 一次 |
| 3 | 计划预检 `generatePlan` 实测输出 `extensionScopes = {user:[DupExt], global:[DupExt,OnlyGlobal], builtin:[regular-js], shadowed:[DupExt]}` |
| 4 | 五个 UI 守卫通过；**无头 Playwright 实测通过**（`e2e/standalone/verify-ext-scope.cjs`）：打包页列出 `["DupExt","OnlyGlobal"]`、行内标注 `全局副本已跳过`、汇总条点名 `DupExt` 与 `regular-js`，非预期错误 0；截图 `e2e/standalone/out/ext-scope.png` |
