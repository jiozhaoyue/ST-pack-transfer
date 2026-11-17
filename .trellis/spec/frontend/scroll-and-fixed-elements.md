# 全域滚动 / 固定元素清单（桌面 + 手机，持续维护）

> 单一事实源：**哪些元素随滚动条动、哪些绝对不动**。任何新增/修改 `overflow`、`position:sticky|fixed`、`max-height` 的改动，必须先读本文件，改完必须更新本文件并双端实测。
> 依据用户裁定：「列出全域能随滑动条动、不能随滑动条动的清单，全部都要，持续维护；每一次必须完全检查桌面和移动双端的滑动条规范；任何和滑动条相关的必须完全显式报告做法、改动、怎么做。」

## 0. 三条判定铁律（违反即返工）

1. **滚动容器唯一化**：一个视图里**只有一个**纵向滚动容器；内部面板 `overflow:visible`，禁止"第二个滚动条"（例外见下表已登记项）。
2. **头/状态行/动作行固定**：列表的标题行、统计行（"共 N 项 / 已选 N/N"）、全选/反选/清空、动作按钮行，必须 `position:sticky; top:0` 或移出滚动容器，**绝不随列表滚动**。它们必须有不透明背景 + `z-index`，防止行穿透叠字。
3. **固定行不换行、按钮不缩**：固定行内控件 `flex:0 0 auto`、`flex-wrap:nowrap`；溢出用纯图标降级或整行横向滚动，绝不把文字折行、绝不省略号裁功能文案（详见 `responsive-and-aesthetics.md`）。

## 1. 桌面端 (`data-view="desktop"`) 清单

### 1.1 真正的纵向滚动容器（随滑动条动）

| 容器 | 位置（style.css） | 说明 |
| --- | --- | --- |
| `.app-main` | 外层 | 桌面整窗口 `overflow:hidden`（约 2055），主区由内部面板各自滚动 |
| `.extension-body` | 841 | **扩展管理正文唯一滚动容器**；列表头 sticky 于其顶部 |
| `.ext-report-panel` | 843 | 安装报告展开后独占正文、独立滚动 |
| `.ext-auto-policy` | 963 | 自动更新策略子视图，替换列表滚动区 |
| `.ext-footer .ext-install-area` | 897 | 服务端安装区，`max-height:46vh; overflow:auto` |
| `.ext-footer .ext-server-body` | 904 | 服务端块展开，`max-height:38vh; overflow-y:auto` |
| `.chart-tree` / `.vol-card .chart-tree` | 410 / 562 / 574 | 图表文件树 |
| `.chart-stack` | 485 | 图表堆叠卡片区 |
| `.zone-body > .card-list` | 737 | 数据包卡片列表 |
| `.si-list` | 293 / 316 | 存储审查条目列表 |
| `.git-viz-body` | 1115 | Git 可视化正文 |
| `.git-viz-patch` | 1189 | Git 补丁，`max-height:40vh` |
| `.ext-log` | 1272 | 日志，`max-height:220px` |
| `.lq-list` | 1307 | 任务队列列表 |
| `.view-card` / `.view-body` | 1391 / 1399 | 通用视图卡 / 视图正文（设置、云端等） |
| `#view-settings .view-body` | 1458 | 设置页正文 |
| `.lan-body` | 1977 | 局域网面板 |
| `.transfer-body` | 1915 | 传输面板 |
| `.cloud-view` | 1920 | 云端面板 |
| `.pref-list` | 516 | 偏好列表 |
| `.priv-files` | 467 | 私有文件，`max-height:50vh` |
| `.rep-sec pre` | 2037 | 报告代码块，`max-height:180px` |
| 模态 `.view-body` | 1410 | 确认弹窗正文，`flex:0 1 auto` |

### 1.2 绝对固定 / 吸顶（不随滚动）

| 元素 | 位置 | 机制 |
| --- | --- | --- |
| `.ext-list-head`（含"共 N 项/已选 N/N/全选/按钮行"） | 946-948 | **`position:sticky; top:0; z-index:3`**，吸在 `.extension-body` 顶部 |
| `.ext-footer` | 895 | `flex:0 0 auto`，钉在扩展面板底 |
| `.ext-report-bar` | 844 | `flex:0 0 auto`，报告条常驻底 |
| `.confirm-dialog` | 1403-1406 | `position:fixed; inset:0; max-height:min(72vh,560px)` |
| 全屏 overlay | 1514 / 1889 | `position:fixed; inset:0; overflow:auto` |

### 1.3 横向滚动（登记例外）

| 元素 | 位置 | 说明 |
| --- | --- | --- |
| `.ext-unified-actions` | 997 | 扩展动作按钮行 `overflow-x:auto; scrollbar-width:none` |
| `.si-crumb-wrap` | 272 | 存储面包屑 `overflow-x:auto` |
| `.chart-controls` 等 | 382 | 图表工具行 `overflow-x:auto` |

## 2. 手机端 (`data-view="mobile"`) 清单

> 手机形态由 `#app[data-view="mobile"]` 属性选择器驱动（`workbench-view.js:674 MOBILE_MAX_WIDTH=860`，`syncMainView()` 写 `dataset.view`），**不是 `@media`**（`@media` 只有 reduced-motion 与 LAN 两处例外）。改手机布局优先用属性选择器，保证与 JS 判定同步。

### 2.1 滚动容器（随滑动条动）

| 容器 | 位置 | 说明 |
| --- | --- | --- |
| `.app-main` | 1589 | **默认唯一外层滚动**（`overflow:auto`） |
| `…:has(#extension-view:not([hidden])) .app-main` | 1603 | 扩展视图激活时改为 `overflow:hidden`，滚动下放到 `.extension-body` |
| `.extension-body` | 841（同桌面） | 扩展正文滚动；`.ext-list-head` sticky 于顶部 |
| `.zone-body` | 1620 | 手机数据包抽屉 `overflow-y:auto; max-height:72vh` |
| `.chart-stack` | 1647 | 手机图表区 `overflow:auto; overscroll-behavior:contain`（`.chart-tree` 在手机改 `visible`） |
| `.si-list` | 316 | 存储审查 `overflow-y:auto; max-height:none` |
| `.transfer-body` | 1731 | 传输面板 `overflow-y:auto` |
| `.lq-list` / `.git-viz-patch` / `.ext-log` | 同桌面 | 任务队列 / Git 补丁 / 日志 |

### 2.2 绝对固定 / 吸顶（不随滚动）

| 元素 | 位置 | 机制 |
| --- | --- | --- |
| `.mobile-switch` | 1582-1583 | **`position:sticky; top:0; z-index:6`**，手机视图切换行常驻，**绝不换行**（`flex-wrap:nowrap`） |
| `.ext-list-head` | 946-948 | 同桌面，sticky 于 `.extension-body` 顶部 |
| `.zone-mobile-collapse-bar` | 1774-1778 | `flex:0 0 auto`，数据包抽屉"收起"条常驻，滚到底也可见 |
| `.ext-footer` / `.ext-report-bar` | 895 / 844 | `flex:0 0 auto` |

## 3. 不滚动的"裁切"（`text-overflow`，与滚动条无关）

以下用单行省略号但**必须能通过 `title` / 详情读到完整值**（`responsive-and-aesthetics.md` 例外）：
`.pkg-name-txt`(782)、`.ext-pkg-current`(1033)、`.ext-url`(1016)、`.ext-repo-slug`(1048)、`.ext-last-scan-text`(1798)、`.si-row-label`(302)、`.lq-label`(1325)、`.tree-label`(428) 等。
手机端**功能文案禁止**用省略号裁切（1697-1698、1719-1720 要求完整换行）。

## 4. 本次修复登记（2026-11-17）

| 改动 | 文件:行 | 前 → 后 | 双端实测 |
| --- | --- | --- | --- |
| 状态行固定 | `style.css:946-948` `.ext-list-head` | `position:static`（随 `.extension-body` 滚走）→ `position:sticky; top:0; z-index:3` | 桌面 1280：滚动 0→781px，`headTop` 恒 117、`countTop` 恒 155，**未移动** ✅ |
| 手机包内只读 | `style.css:974-980` | 手机 `current:none`+下拉显示 → 双端 `picker:none !important`+`current:inline-flex` | 手机 390：`picker:none`、`current:flex` 只读包名；桌面同 ✅ |
| 选包补扫描 | `workbench-view.js:551` `selectPackageForExtension` | 只同步 state → 追加 `actions.onActivePackage(id)` 补扫描并重绘 | 桌面：共 31 项、31 行清单正常显示 ✅ |
| 手机包内按钮行（限定 `--pkg`，隔离宿主页） | `style.css` `.ext-list-head--pkg .ext-head-action-row` | 左块占 191px→右块仅 93px，4 按钮被 `flex-wrap` 挤成竖列 → 左块 `flex:1 1 auto`、右块 `flex:1 1 100%` 独占整行后换行 | 390：4 按钮 y≈253 全横排、无裁切；320：整齐两行、无半截；均 `clipped:[]` ✅。仍 `overflow-x:visible`（不引入无暗示横滚，保持 UI-05） |

## 5. 变更纪律（每次滚动相关改动必做）

1. 改前：在本文件找到该元素，确认它属于"滚动 / 固定 / 裁切"哪一类。
2. 改时：块级编辑（`Edit`），注释写清原因与前后差异。
3. 改后：更新本文件对应行；跑 `npm run check:css-scope`；用无头 Playwright 在 **1280×800 与 390×844 两个视口**分别实测"滚动前后固定元素的 `getBoundingClientRect().top` 是否一致"，读数落盘。
4. 显式在回复里报告：改了哪个选择器、属于哪一类、双端读数。
