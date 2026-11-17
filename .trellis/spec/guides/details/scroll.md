# H2 · 滑动条 / 滚动条 / 滚动容器 / 拖拽分隔条 专项审计

> 审计范围：`.private/rules-audit/claude-user-messages.md`、`_zcode_user_msgs.json`、`_agy_user_msgs.json`、
> `.trellis/spec/**`、`AGENTS.md`、`CLAUDE.md`、`RULES.md`、`RULES-DETAILS.md`、`docs/**`、`src/ui/**`、`style.css`。
> 关键词：滑动条 / 滚动条 / 滚动 / scroll / overflow / 拖拽条 / 拖拽分隔 / 竖屏 / 横向 / resize / scrollbar。
> 结论：证据 17 条（其中 8 条铁律级），可判定细则 16 条，现状偏差 10 处（代码 6 / 规范冲突 3 / 结构风险 1）。

---

## 用户原话证据

### 证据 1 — 图表卡「贴边＋可拖宽高＋宽屏最多 4 并排」
- 来源：`claude-user-messages.md:144`
- 时间 / session：<DATE> / `8a39f8de:581`
- 原文（≤200 字）：
  > 现在取消独立的执行dom，现在存储图表的上方和数据包列表的底部联动，保持并行，下方全部作为放图表的dom，每个图表本身的dom的边相互贴着，可以拖拽改变高度和宽度，并自适应一行有几个，宽屏最多可达4个并排

### 证据 2 — 进度条常驻底部、不随滑动条
- 来源：`claude-user-messages.md:145`
- 时间 / session：<DATE> / `8a39f8de:581`
- 原文：
  > 进度条放在最下，且手机端保持始终显示，不会随滑动条，且点击进度条，是显示日志，不用独立的日志按钮……需要显式提示进度条可以打开日志

### 证据 3 — 竖屏必须有能拉全部图表的滑动条
- 来源：`claude-user-messages.md:180`
- 时间 / session：<DATE> / `8a39f8de:1994`
- 原文：
  > 应当使滑动条策略绝对智能，需要使用户不用频繁调整多个滑动条，并且现在竖屏没有能拉所有图表的滑动条，根本没法显示全，下面的数据包列表就只有头……

### 证据 4 — 滑动条绝对保守（能不显示就不显示）
- 来源：`claude-user-messages.md:181-182`
- 时间 / session：<DATE> / `8a39f8de:1994`
- 原文：
  > 且滑动条需要绝对保守，能不显示就不显示，要让界面绝对在画面内，能压缩空白的地方就压缩 / 现在是绝对错误的

### 证据 5 — 图表尺寸是动态调整，不是随意拖拽
- 来源：`claude-user-messages.md:324-327`
- 时间 / session：<DATE> / `ac48d8e7:7`（同文在 `8ceccac2` 15:09、15:21 重复两次）
- 原文：
  > 图表dom绝对不是随意拖拽大小的，是动态调整的 / 如只有一个，则占满放图表的区域，两个则平分区域，三个就4宫格，留空的一格 / 所有图表之间都存在拖拽条……/ 最多4宫格占满放图表区域，多了就加放图表区域的整体滑动条，向下

### 证据 6 — 「安装扩展」与列表动作行不随滑动条动、改为向上挤压
- 来源：`_zcode_user_msgs.json`（`修复宿主标记空白与压缩模式间距`）
- 时间 / session：<DATE> / `sess_f1ea8d74-d379-4905-855b-f1da4575c97f`
- 原文：
  > 而且他妈的安装扩展这个东西应当始终在他妈的底部显示，不随滑动条动 / 以后……绝对禁止……这种他妈的功能……随真列表（列表是动态的数量）动的……绝对禁止 / 并且……安装扩展这个应当是向上挤压列表

### 证据 7 — 双端一律向上挤压，禁止「安装扩展随滚动条」
- 来源：`_zcode_user_msgs.json`（同上会话）
- 时间 / session：<DATE> / `sess_f1ea8d74-…`
- 原文：
  > 还有他妈的现在傻逼安装扩展还是他妈的随滚动条你个傻逼，是他妈的向上挤压 / 所有端全部他妈的都是 / 还有……服务端扩展……需要在安装扩展上面，也是向上挤压，默认收起

### 证据 8 — 铁律：整个扩展管理 DOM 外面禁止滑动条、禁止双重滑动条
- 来源：`_zcode_user_msgs.json`（同上会话）
- 时间 / session：<DATE> / `sess_f1ea8d74-…`
- 原文：
  > 还有他妈的我说了他妈的整个他妈的扩展管理的他妈的dom禁止有在外面有他妈的滑动条，他妈的违反铁律，绝对禁止他妈的双重滑动条你个死妈……全部必须他妈的在屏幕内

### 证据 9 — 铁律：最外层绝对没有任何滑动条
- 来源：`_zcode_user_msgs.json`（同上会话）
- 时间 / session：<DATE> / `sess_f1ea8d74-…`
- 原文：
  > 而且他妈的绝对禁止他妈的在外面的滑动条，最外面的他妈的滑动条绝对没有这个东西，里面的dom绝对不会有滑动条来滑动，绝对他妈的禁止有任何最外部滑动条

### 证据 10 — 该有滑动条的地方却没有
- 来源：`_zcode_user_msgs.json`（同上会话）
- 时间 / session：<DATE> / `sess_f1ea8d74-…`
- 原文：
  > 而且他妈的现在迁移与备份里根本没有滑动条，操你妈逼

### 证据 11 — 必须维护「随/不随滑动条动」全域清单，逐次显式报告
- 来源：`_zcode_user_msgs.json`（`手机版包内仍然存在……`）
- 时间 / session：<DATE> / `sess_dccc0935-c2b0-49cb-9bfe-e1c91692ef88`
- 原文：
  > 这一行绝对不能动，绝对不随滑动条动 / ……必须列出来全域能随滑动条动，不能随滑动条动的列表清单，全部都要，持续维护……每一次都必须完全检查桌面和移动双端的滑动条规范……任何和滑动条相关的必须完全显式报告做法，改动，怎么做

### 证据 12 — 扩展列表顶部操作按钮不随滑动条动
- 来源：`_agy_user_msgs.json`（`Extension UI Refactoring And Bug Fixes`）
- 时间 / conv：<DATE> / `c926c0e2-4f34-43a1-b8ce-55b61c53f09b`
- 原文：
  > 并且扩展列表的顶部的操作按钮应当他妈的不随滑动条动

### 证据 13 — 服务端插件区「绝对不动」
- 来源：`_agy_user_msgs.json`（`服务端插件 UI 界面异常`）
- 时间 / conv：<DATE> / `3a4410be-ebf3-4459-8d7c-e0fdb7ca66e6`
- 原文：
  > 还有这里他妈的绝对不动，绝对禁止他妈的臭逼的随滑动条动你个傻逼

### 证据 14 — 内容显示不全时必须给滑动条（正面要求，非禁）
- 来源：`_agy_user_msgs.json`（`Release Version 0.5.0 Process`）
- 时间 / conv：<DATE> / `6d8e2180-8ab6-4f9b-95d9-2ab8e64b169d`
- 原文：
  > 还有他妈的你妈了个臭逼，他妈的云端仓库他妈的显示不全，你他妈的不会加滑动条吗，你个低能，操你妈

### 证据 15 — 图表整块渲染全貌，唯一滚动条在图表容器内（<DATE> 铁律）
- 来源：`style.css:1647` 注释 + `.trellis/spec/frontend/scroll-and-fixed-elements.md:4` + `README.md:31`
- 时间：<DATE>
- 原文：
  > <DATE> 用户铁律：图表必须整块渲染全貌，唯一滚动条在图表外、图表容器内
  > （README）手机端图表整块滚动：图表容器是唯一滚动条（图表外、容器内），卡片与树行内部不再出现第二个滚动条

### 证据 16 — 响应式不得显示不全（上位约束）
- 来源：`.trellis/spec/frontend/responsive-and-aesthetics.md:3-4`
- 时间：<DATE>（该文件首行标注）
- 原文：
  > 任何响应式的绝对不允许任何不美观的响应，绝对优先保持美观，不为任何屏幕要塞下而硬做，也不能显示不全

### 证据 17 — 「不允许出现滚动条」与「显示不全」同源裁定
- 来源：`.trellis/spec/frontend/workbench-single-view.md:486-494`（<DATE> 用户裁定段）
- 时间：<DATE>
- 原文：
  > 滚动绝对保守：竖屏只有一个滚动条……滚动只发生在内容列自己的容器内，且 `overflow-y:auto` —— 不溢出就不出现滚动条……一律 `overflow:visible`、`max-height:none`，保证一次滚到底看完全部图表与整张数据包列表

---

## 可判定细则候选

> 每条一句话 + 判据。标 ✅ 表示当前实现已满足（可写入规则当"现状基线"），⚠ 表示需要新规则或整改。

| ID | 细则（一句话） | 判据（可执行断言） |
| --- | --- | --- |
| S-01 ⚠ | 插件根容器永不是滚动容器 | `#app.app-container` 计算 `overflow` ∉ {auto,scroll}；桌面已满足（`style.css:2058`），手机端未声明（`1577`）需补 |
| S-02 ⚠ | 任一视图激活时，纵向滚动容器**恰好 1 个** | 视口内 `scrollHeight > clientHeight + 1 && overflow-y ∈ {auto,scroll}` 的元素计数 = 1（基准 1280×800 与 390×844 各测一次） |
| S-03 ✅ | 只允许 `auto`，禁止 `overflow:scroll` | 全库 `grep -E "overflow(-[xy])?:\s*scroll"` 命中 0（当前已为 0） |
| S-04 ⚠ | 未溢出时不得出现滚动条 | 空态/内容不足时上述元素计数为 0；即 `overflow:auto` 而非 `scroll`，且不得用固定 `height` 制造溢出 |
| S-05 ⚠ | 横向滚动条仅限白名单，且必须不可见 | `overflow-x:auto` 只允许出现在 `.ext-unified-actions` / `.si-crumb-wrap` / `.chart-controls`，且同类必须 `scrollbar-width:none` + `::-webkit-scrollbar{display:none}` |
| S-06 ⚠ | 所有纵向滚动容器滚动条必须细化 | 每个滚容器必须有 `scrollbar-width:thin` 且被 `::-webkit-scrollbar{width:6px}` 规则覆盖（不得落到系统默认 ~15px） |
| S-07 ✅ | 表头/统计行/动作行不随滚动条动 | `.ext-list-head` 计算 `position:sticky`、`top:0`、`z-index ≥ 1`、背景不透明；滚动前后 `getBoundingClientRect().top` 差值 = 0 |
| S-08 ✅ | 底部动作区在滚动容器之外、向上挤压而非跟随 | `.ext-footer{flex:0 0 auto}` 且其祖先链上无 `overflow:auto/scroll` 的滚容器；展开区在按钮上方 |
| S-09 ✅ | 进度条常驻底部且不在任何滚容器内 | `#workbench-progress` 是 `.app-body` 最后一个 flex 子项、`flex:0 0 auto`，`.app-main` 之外 |
| S-10 ⚠ | 图表尺寸由数量决定，不允许用户任意改尺寸 | 布局规则：1 满 / 2 平分 / 3 四宫格留空 / 宽屏 ≤4 列；`.vol-card` 不得声明 `resize`（手机已 `resize:none`） |
| S-11 ✅ | 分隔条是唯一拖拽入口，且带可访问语义 | 每个分隔条 `role="separator"` + `aria-orientation` + `touch-action:none`；仅 `.splitter-v` / `.chart-split-v|h|x` / `.vol-chart-resize` 存在 |
| S-12 ⚠ | 手机端不得出现任何拖拽分隔条 | `[data-view="mobile"]` 下所有分隔/手柄选择器 `display:none`（含 `.chart-split-x`） |
| S-13 ✅ | 固定行控件不换行、不被压扁 | 固定行容器 `flex-wrap:nowrap`，子项 `flex:0 0 auto` 或 `min-width:max-content`；溢出转纯图标 |
| S-14 ✅ | 数据包列表不得只露头 | 抽屉展开时 `.zone-body` 有高度上限（`max-height:72vh`）且可 `scrollTop` 到底见最后一项 |
| S-15 ⚠ | 端别判定只认 `data-view`，不用 `@media` | 除 reduced-motion / LAN 两处例外，全库 `@media` 不得参与布局；滚动规则必须写 `[data-view="mobile"]` |
| S-16 ⚠ | 滚动相关改动必须登记并双视口落读数 | 改动须同步 `.trellis/spec/frontend/scroll-and-fixed-elements.md`，并在 1280×800 / 390×844 各记录一次 `getBoundingClientRect().top` / `scrollHeight` |

---

## 现状偏差

### 代码偏差

| # | 位置 | 偏差 | 违反 |
| --- | --- | --- | --- |
| B-1 | `style.css:1732` `[data-view="mobile"] .app-main{overflow-y:hidden;overflow-x:hidden}` | 覆盖了 `1591` 的 `overflow:auto`，手机端 `.app-main` 已不再是滚动容器；三份规范仍写「手机唯一滚动容器 = `.app-main`」（`workbench-single-view.md:491-493`、`responsive-and-aesthetics.md:17`、`scroll-and-fixed-elements.md:68`）。语义必须二选一收敛，否则任何"没有自带内滚器"的移动端区块会变成不可达内容（正是 <DATE>「迁移与备份里根本没有滑动条」的成因类别） | S-02 / S-17 |
| B-2 | `style.css:1577` `[data-view="mobile"]{height:100vh}` | 无 `100dvh` 兜底；移动端浏览器动态地址栏下插件高度大于可视区，且 `.app-main` 已 `overflow:hidden`，底部（进度条/最后一张卡）可能不可达。同文件 `1516`、`1535` 对模态已正确使用 `100dvh`，说明该写法是遗漏 | S-04 / 证据 3、16 |
| B-3 | `style.css:841` `.extension-body`、`843` `.ext-report-panel`、`965` `.ext-auto-policy`、`1117` `.git-viz-body`、`1309` `.lq-list`、`1393` `.view-card`、`1401` `.view-body`、`1622` `.zone-body`、`1917` `.transfer-body`、`1922` `.cloud-view`、`1979` `.lan-body` | 全部是纵向滚动容器，但既无 `scrollbar-width:thin`，也不在 `327-342` 的 `::-webkit-scrollbar{width:6px}` 名单里 → 落到系统默认粗滚动条 | S-06（`workbench-single-view.md:490`「滚动条一律细化，不得出现系统粗滚动条」） |
| B-4 | `style.css:1655-1656` | 手机端只隐藏 `.chart-split-v` / `.chart-split-h`，漏了 `.chart-split-x`（定义在 `502`，由 `workbench-view.js:1774` 在 ≥3 图表时生成）→ 手机单列布局下仍渲染十字手柄节点（`cursor:move`、`margin:-8px`） | S-12 |
| B-5 | `style.css:242` `textarea{white-space:nowrap;overflow-x:auto;overflow-y:hidden}` | 单行长文本输入框会出现可见横向滚动条，且未在横向白名单登记 | S-05 |
| B-6 | `style.css:272-273` `.si-crumb-wrap{overflow-x:auto;scrollbar-width:thin}` | 允许横向滚动但滚动条**可见**（thin 而非 none），与「能不显示就不显示」及「禁止横向滚动条」冲突；`997` 的 `.ext-unified-actions` 已用 `scrollbar-width:none`，两处不一致 | S-05 / 证据 4 |

### 规范冲突（文档层偏差）

| # | 位置 | 偏差 |
| --- | --- | --- |
| B-7 | `.trellis/spec/frontend/workbench-single-view.md:491-494` ↔ `scroll-and-fixed-elements.md:72` + `style.css:1649` | 前者（<DATE>）要求竖屏 `.chart-stack` / `.zone-body` 一律 `overflow:visible`、唯一滚 `.app-main`；后者（<DATE>）与代码要求手机 `.chart-stack` 自身滚动。旧条款未标 `[已废弃]`，两条相互矛盾的"铁律"同时生效 |
| B-8 | `.trellis/spec/frontend/storage-inspector.md:68` ↔ `style.css:316-317` | 规范写「手机 `#si-list` 不单独滚动，唯一滚动容器仍是 `.app-main`」；代码给手机 `.si-list{overflow-y:auto}` 且 `.storage-inspector-view{overflow:hidden}`，实际是 si-list 独立滚动 |
| B-9 | `.trellis/spec/frontend/ui-orchestration-rules.md:16` + `workbench-single-view.md:38` | 守卫只断言「idle 态 `.app-main` 无外层滚动」；本次 8 条铁律级要求（双层滚动、横向禁令、滚动条细化、手机端分隔条全隐）无任何自动守卫，全靠人工 → <DATE> 用户点名「每次必须完全检查双端滑动条规范」无法被机器强制 |

### 结构风险（需实测确认）

| # | 位置 | 风险 |
| --- | --- | --- |
| B-10 | `style.css:1209` `.ext-list{overflow:auto}` × `843` `.ext-report-panel{overflow:auto}` | 安装报告由 `workbench-view.js:5199` 把 `.ext-list` 渲染进 `.ext-report-panel` 内部，形成「滚容器套滚容器」的潜在双滚动条（`.ext-scroll .ext-list` 已被 `959` 改回 `visible`，报告分支未覆盖）。需在 390×844 实测安装失败报告展开态的元素计数 |

---

## 建议新增规则

现有 `R-13 美观优先于塞下` 只约束「不得压缩/截断」、`R-15 图表布局` 只约束「分格与拖拽条」，**都无法判定**滚动容器数量、滚动条可见性、横向禁令、拖拽条端别禁用。建议新增 2 条：

### R-31 滚动容器唯一且可判定

> **一个视图只允许一个纵向滚动容器；根容器与最外层永不可滚。**
>
> 1. `#app.app-container` 的 `overflow` 必须是 `hidden`（桌面/手机一致），不得出现页面级或最外层滚动条。
> 2. 任一视图激活时，满足 `scrollHeight > clientHeight + 1` 且 `overflow-y ∈ {auto,scroll}` 的元素**恰好 1 个**；内部面板一律 `overflow:visible`。
> 3. 只允许 `overflow:auto`，全库禁止 `overflow:scroll`；内容不溢出时不得出现滚动条。
> 4. 所有纵向滚动容器必须 `scrollbar-width:thin` 并被 `::-webkit-scrollbar{width:6px}` 覆盖；禁止系统粗滚动条。
> 5. 横向滚动只允许 `.ext-unified-actions` / `.si-crumb-wrap` / `.chart-controls` 三处，且必须隐藏滚动条（`scrollbar-width:none`）；其余容器 `overflow-x` 只能 `hidden|visible`。
> 6. 表格/列表的标题行、统计行（"共 N 项 / 已选 N/N"）、动作按钮行必须 `position:sticky;top:0` 或移出滚容器，滚动前后 `getBoundingClientRect().top` 不得变化；底部动作区必须 `flex:0 0 auto` 并位于滚容器之外（向上挤压，不跟随）。
> 7. 移动端根高度必须带 `100dvh` 兜底，禁止只用 `100vh`。
>
> `判据：无头 Playwright 在 1280×800 与 390×844 分别统计滚容器数量、读取每个滚容器的 scrollbar 计算宽度与固定行 top 读数，落盘到 scroll-and-fixed-elements.md §4`

### R-32 拖拽分隔条白名单与端别禁用

> **尺寸只能通过分隔条拖拽，分隔条只允许出现在白名单，手机端一个都不许有。**
>
> 1. 拖拽入口封闭集：`.splitter-v`（主分栏）、`.chart-split-v` / `.chart-split-h` / `.chart-split-x`（图表间）、`.vol-chart-resize`（图表内高度）。新增入口必须先扩本条。
> 2. 每个分隔条必须有 `role="separator"` + `aria-orientation` + `touch-action:none`；不得用 CSS `resize` 手柄代替（`.vol-card` 等不得声明 `resize`）。
> 3. 图表尺寸由数量决定（1 满 / 2 平分 / 3 四宫格留空 / 宽屏 ≤4 列），分隔条只做微调，不得把卡片拖成负空间或压成单条。
> 4. `[data-view="mobile"]` 下所有分隔条（含 `.chart-split-x`）必须 `display:none`，改为单列整块滚动。
> 5. 分隔条必须 `z-index` ≥ 2 且视觉可见（hover / dragging 态高亮），不允许"看不见但能拖"。
>
> `判据：grep 分隔条选择器集合 ⊆ 白名单；390×844 下 `document.querySelectorAll('[role="separator"]')` 的可见元素数 = 0`

---

### 汇报计数

- 证据：**17 条**（claude 5 / zcode 6 / agy 3 / spec·代码注释 3），其中铁律级 8 条。
- 可判定细则：**16 条**（已满足基线 8 条，需整改 8 条）。
- 现状偏差：**10 处**（代码 6：B-1…B-6；规范冲突 3：B-7…B-9；结构风险 1：B-10）。
