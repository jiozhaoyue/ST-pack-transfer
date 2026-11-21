---
title: 形态与控件矩阵
layout: default
---

# 形态与控件矩阵

本文记录每个功能控件在三种运行形态下的可用性目标态，供开发者核对「哪些控件该显示、哪些该灰置、哪些该拦截」：

- **酒馆扩展**：SillyTavern / Luker / TauriTavern / PureTavern 扩展注入态，代码内 `mode !== 'web'`，有宿主后端（`/api/users/*`、扩展端点）。
- **独立 Web**：在线或本地 HTTP 页面，代码内 `mode === 'web'`，无宿主后端。
- **单文件 HTML**：下载的离线 HTML，`file://` 双击运行，同样走 `mode === 'web'` 分支；比独立 Web 更没有任何宿主端点与网络后端。

> 三态口径来自代码的事实分流：宿主检测返回 `st|luker|standalone`，转换器只接受 `st|l|tt|pt`；`mode === 'web'` 即 Web 分支。独立 Web 与单文件 HTML 共用该分支，故下表中二者目标态一致；单文件 HTML 因 `file://` 协议，宿主端点与需要服务端的云端功能一律不可达，标注为「不可用」。

本矩阵的目标态**唯一真源**是 `test-results/audit-gating.md`（勘察蜂群交付、实施蜂群输入）。下表逐条对应其中的门控点，代码行号为勘察时快照，实施时以该文件为准复核当前行号。严禁自行编造门控结论。

## 一、隐藏型门控（目标态：渲染控件 + disabled + 提示，共 10 处）

目标态统一范式：控件**渲染出来**（不再 `hidden` / `display:none`），在 Web 分支置 `disabled` 并给出提示文案；点击若穿透到 actions 层，由守卫拦截并 toast，不得静默走到宿主 API。「提示」指 disabled 的 `title` 与点击 toast 共用文案。

| # | 控件 / 功能 | 门控位置（勘察时行号） | 当前门控表达式 | 酒馆扩展 | 独立 Web（目标态） | 单文件 HTML（目标态） |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 云端私有件上传 `#vol-priv` | `workbench-view.js:262`、`:1860/1863` | `canUpload = mode!=='web' && userFilesSupported(host)`；`if(!userFilesAvailable()) return ''` | 可用（受宿主能力 `userFilesSupported` 约束） | 灰置 disabled + 提示「仅宿主形态可用」；点击走 `/api/files/*` 须在 actions 层拦截提示 | 不可用；同 Web 灰置，且 `/api/files/*` 在 `file://` 下绝不可达 |
| 2 | 宿主存储配额行 | `workbench-view.js:1281` | `(isWeb ? '' : row(t('quota.host'),...))` | 可用，显示真实配额 | 渲染该行，数值显示「未提供」（数据正确性铁律 G-34，禁假 0），disabled + 提示；Web 无 `state.storage.host` | 不可用；同 Web 显示「未提供」，禁假 0 |
| 3 | 存储审查数据源页签（browser / host） | `workbench-view.js:1329` | `tabs.hidden=isWeb` | 可用 | 渲染页签；host 页签 disabled + 提示；触发 `/api/users/storage/inspect` 不可达须拦截 | 不可用；host 页签 disabled，`file://` 下该端点绝不可达 |
| 4 | 从宿主拉取 `#btn-fetch` | `workbench-view.js:2538` | `fetchBtn.hidden = zone!=='import' \|\| mode!=='plugin'` | 可用（import 分区） | 渲染 + disabled + 提示；保留 `index.js:1275` 的 `webNoHost` toast 兜底 | 不可用；同 Web 灰置，点击由 toast 兜底提示 |
| 5 | 扩展安装页脚块（含 `#extmgr-links:3638` 仓库连接输入区、安装按钮、服务端插件区） | `workbench-view.js:3543/3544`、`:3636`、`:3638` | `show=!isWeb && (extTab==='host'\|\|'package') && !extReportOpen; block.hidden=!show` | 可用 | 渲染整块，内部控件全部 disabled + 提示「扩展安装需在宿主插件内操作」；把 `:3636` 的 `webInstallHint` 提到块级可见处；点击安装走 `installExtensionViaHost` → `/api/extensions/install` 等必须拦截 | 不可用；同 Web 整块渲染并禁用，`file://` 下安装端点绝不可达 |
| 6 | 扩展管理「宿主」页签按钮 | `workbench-view.js:5698` | `hostTabBtn.style.display = isWeb ? 'none' : ''` | 可用 | 渲染页签 + disabled + 提示；联动删 `:4988` 的 Web 强切 package 分支；点击会触发 `listHostExtensions` → `/api/extensions/discover`，须拦截 | 不可用；同 Web 渲染并禁用，发现端点 `file://` 下不可达 |
| 7 | Web 强切 package 行为分支 | `workbench-view.js:4988/4989` | `if(isWeb && extTab==='host') extTab='package'; isHost=extTab==='host'&&!isWeb` | 不受影响（isWeb 为假） | 移除强切，改以 disabled 态阻止进入（与 #6 联动） | 不适用（同 Web 逻辑，`file://` 下同样移除强切） |
| 8 | 教程目标卡片（restore / pull 两目标） | `workbench-view.js:7409/7420` | 教程目标 `when:()=>state.mode!=='web'` | 可用 | 渲染目标卡片 + disabled + 提示「该教程仅宿主形态可用」；filter 不再剔除；与 `#btn-fetch` disabled 态一致 | 不可用；同 Web 渲染并禁用 |
| 9 | Web 主题选择器 `themePicker` | `workbench-template.js:15`、`workbench-view.js:1042/1044` | `themePicker.hidden=!isWeb`（反向：插件态隐藏） | **隐藏**（插件态启用会覆盖宿主 `--SmartTheme` 变量，违反 D-02 配色继承铁律） | 可用（Web 态显示） | 可用（同 Web 显示，`file://` 下主题切换为纯本地样式，可保留） |
| 10 | 页头形态图标互斥（`webIco` / `icon`） | `workbench-template.js:15`、`workbench-view.js:1042/1044` | `webIco.hidden=!isWeb` / `icon.hidden=isWeb` | 显示宿主形态图标 | 显示 Web 形态图标 | 显示 Web 形态图标（同 Web） |

### 第 10 处特别说明

该处是**展示型图标语义切换，非功能控件**。勘察清单记录「未确认是否纳入一致化——保持现状待主人后续裁定」，纯展示、低风险。本矩阵如实保留现状，不擅自改变。

### 第 9 处特别说明

该处是**反向门控**：Web 态显示、插件态隐藏。勘察结论为「保持隐藏——插件态启用会覆盖宿主 `--SmartTheme` 变量违反 D-02；改 disabled 也不启用（宁可 disabled 不启用，最终以 D-02 为准）」。故酒馆扩展列标注为「隐藏（不启用）」，不按其他行的「渲染 + disabled」范式处理。

## 二、行为守卫 / 分流型（目标态：保留现状，已是正确做法）

以下位置仅保留现有行为守卫，不改为 disabled 渲染范式。对应 UI 改成 disabled 后，若点击仍穿透，由这些守卫拦截并提示，不静默、不整体中断。

| 位置 | 机制 | 三态说明 |
| --- | --- | --- |
| `index.js:1154/1275/1567` | `if(!host.isPlugin){ view.toast(...); return; }`，覆盖恢复 / 拉取 / 自动备份 | 酒馆扩展可用；独立 Web 与单文件 HTML 由 toast 拦截提示（渲染 + toast 拦截的正确范式） |
| `host-bridge.js:845/875/1252` | API 守卫 `return {ok:false,reason:'standalone-web'}`（`readHostIdentity` / `listServerPlugins` / `getCsrfToken`） | 酒馆扩展返回真实结果；独立 Web 与单文件 HTML 返回失败原因，不假装成功 |
| `workbench-view.js:4402/8685` | `loadServerPlugins` / `refreshHostIdentity` 行为守卫 | 保留；对应 UI 改 disabled 后点击走此拦截提示 |
| `workbench-view.js:3832/3841` | 安装成功处理行为分流 | 保留；disabled 后 Web 分支可能成死代码，勘察清单标注「待复核」 |

## 三、i18n 需新增词条（提示文案）

disabled 的 `title` 与点击 toast 共用同一词条，需补 zh / en-US 对应（见 `test-results/audit-gating.md`「i18n 需新增词条」节）：

| 词条 | 中文 | 用途 |
| --- | --- | --- |
| 仅宿主形态可用 | 仅宿主形态可用 | 门控 #1/#2/#3/#4/#6/#8 的 disabled title 与点击 toast |
| 该教程仅宿主形态可用 | 该教程仅宿主形态可用 | 门控 #8 教程目标卡片提示 |
| 扩展安装需在宿主插件内操作 | 扩展安装需在宿主插件内操作 | 门控 #5 扩展安装页脚块提示 |

> 以上为勘察清单列出的三条待新增词条；每个都需补 en-US 对应。本文只记录清单事实，不代替实施。

## 四、分辨率与形态的交叉说明

形态（酒馆扩展 / 独立 Web / 单文件 HTML）决定**功能可用性**，分辨率决定**布局呈现**，两者正交：

- 分辨率只有**一个产品断点 860px**：`style.css:2344` 的 `@media (max-width:860px)` 与 `src/ui/workbench-view.js:788` 的 `MOBILE_MAX_WIDTH = 860` 同源，860 以下数据包区改为切页按钮而非侧栏。
- 390 / 439 / 768 / 1200 是**守卫仿真视口**（`DEVELOPER-GUIDE.md:221` 的 `npm run check:ext-responsive`），用于测量列表行是否折裂，不是产品断点。
- 各分辨率下的面板显示与用户视角说明见 [安装与部署](install.md) 的「分辨率行为对照」节。

## 五、真源与复核

- 门控目标态真源：`test-results/audit-gating.md`（25 门控点现状 + 目标态）。
- 本文档为文档站呈现层；实施落地以审计清单与对应源码为准，二者冲突时以源码事实与清单共同复核后更新本文。
- 规则判据真源：内部规范 `rule-catalog.md`；配色继承见 D-02，数据正确性见 G-34。
