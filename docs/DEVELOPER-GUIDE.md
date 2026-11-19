---
title: 开发者指南
layout: default
translation: pending
---

# 开发者指南

本页面向想阅读源码、构建或参与改进的开发者。普通用户请从 [安装与部署](install.md) 开始。

## 一、运行形态

同一份核心逻辑支持五种入口：

| 形态 | 入口 | 适合场景 | 主要限制 |
| --- | --- | --- | --- |
| SillyTavern 扩展 | 仓库根目录装进扩展管理器 | 在酒馆内直接拉取、恢复、管理扩展 | 依赖 ST 的 `/api/users/*` 与扩展端点 |
| Luker 扩展 | 仓库根目录装进扩展管理器 | 同上，并额外支持 Luker 账户窗口与存储页 | 账户窗口 / 存储页需要 Luker 2.9+ |
| TauriTavern 扩展 | 仓库根目录装进扩展管理器 | 在 TauriTavern 内转换与迁移 | 宿主能力按公开端点探测 |
| PureTavern 扩展 | 仓库根目录装进扩展管理器 | 在 PureTavern 内转换与迁移 | 宿主能力按公开端点探测 |
| 独立 Web / 单文件 HTML | 根目录 `index.html`（HTTP）或下载的单文件 HTML（`file://`） | 纯本地转换、分析、分卷、清单化 | 无法直接读写酒馆后端；云功能受 CORS 限制 |

### 单文件 HTML 的确切下载位置

- **从 GitHub Release 下载**：`https://github.com/jiozhaoyue/ST-pack-transfer/releases/latest/download/ST-pack-transfer-offline.html`
- **在线 HTML（无需下载）**：`https://jiozhaoyue.github.io/ST-pack-transfer/`
- 说明：offline HTML 不再提交进版本控制，每次打 tag 时由 `release.yml` 构建并附到 Release。

根目录的 `index.html` 是开发骨架，**不能单独下载后双击运行**；它需要 Vite 开发服务器或构建后的静态服务器。单文件 HTML 才是双击即用的形态。

## 二、宿主与浏览器兼容性

### 宿主版本

| 宿主 | 已实测版本 | 最低要求 | 说明 |
| --- | --- | --- | --- |
| SillyTavern | 1.19.0 | 1.19.0 级别端点 | 更早版本未验证；缺少端点时会明确降级并提示 |
| Luker | 2.7.0 / 2.9.0 级别 | 2.7.0 级别基础功能；2.9+ 账户窗口 | 2.9+ 才提供自绘账户窗口、图形化存储页与备份选择 |
| TauriTavern | 当前公开桌面构建 | 按宿主公开版本 | 扩展注入与迁移端点按能力探测，不锁定内部版本 |
| PureTavern | 当前公开版本 | 按宿主公开版本 | 部分迁移端点在宿主侧可能返回 501，插件会如实提示 |
| 独立 Web | 不适用 | 现代浏览器 | 无宿主后端，宿主相关功能明确禁用 |

“已实测”表示在当前开发环境的真实宿主中完成过注入、转换、拉取或恢复验证；“最低要求”表示低于该版本不承诺对应端点存在。插件不会猜测宿主版本，而是按能力探测并降级。

### 浏览器 / WebView

| 内核 | 建议版本 | 已验证 | 降级行为 |
| --- | --- | --- | --- |
| Chromium（Chrome / Edge / 其他 Chromium 浏览器） | 120+ | Chromium 151 实测 | 支持文件选择保存与拖拽下载；旧内核回退为普通下载 |
| Firefox | 120+ | 未单独实测 | 不支持 `showSaveFilePicker` / 拖拽下载时回退为浏览器下载 |
| Safari / iOS WebView | 17+ | 未单独实测 | `color-mix` 不支持时使用普通 rgba 边框；文件保存回退为下载 |
| Tauri WebView | 随宿主 | 按宿主实测 | Windows 使用 WebView2，macOS 使用 WKWebView；以宿主实际能力为准 |

移动端按 390×844 视口做布局验收；桌面端按 1440×900 做布局验收。手机浏览器与酒馆内置 WebView 都走同一套响应式规则。

## 三、目录结构

| 路径 | 职责 |
| --- | --- |
| `index.html` | 独立 Web 的空骨架，只提供 `#app` 容器 |
| `index.js` | 根控制器：宿主嗅探、动作绑定、启动 |
| `src/core/` | 纯逻辑核心：转换、检测、计划、分卷、差量、体积模型、引擎桥 |
| `src/ui/` | 有 DOM 的界面层：模板、视图、宿主桥、待导出区、设置、传输面板 |
| `src/storage/` | IndexedDB 封装 |
| `src/data/` | 目标平台、UI 令牌、演示数据等可读配置 |
| `src/vendor/` | 本地依赖副本，勿升级改动 |
| `docs/` | 公开文档站（纯 Markdown） |
| `download/` | 可下载的单文件 HTML 产物 |
| `test/` | 单元测试 |
| `tooling/` | 构建、文档同步、静态守卫 |
| `scripts/` | 本地实例探针与调试脚本（不随公开仓库分发） |

核心层不得依赖 DOM；界面层不得反向持有宿主判断。平台差异集中在宿主桥接层。

## 四、构建与测试

```bash
npm install
npm test                 # 单元测试
npm run build            # 生产构建，输出 dist/
npm run preview          # 预览 dist/，固定使用本地唯一端口 3040
npm run dev              # 本地开发服务器，同样使用 3040
npm run build:offline    # 生成单文件 HTML
npm run qa:static        # 静态守卫串跑
```

**本地端口只有一个**：`vite.config.js` 的 `LOCAL_PORT`（默认 `3040`），`dev` / `preview` / 本地静态服务共用；也可用环境变量 `PORT` 覆盖。不要再为预览另开端口，也不要占用 `5173`（env-sync 桌面应用的 Tauri `devUrl`）。

`npm run build:offline` 会生成：

- `dist-offline/ST-pack-transfer-offline.html`（本地构建产物，不入库）
- `download/ST-pack-transfer-offline.html`（本地副本，同样不入库，仅 Release 分发）

单文件 HTML 必须保持 `file://` 可双击运行：脚本为 IIFE、Worker 强制主线程降级、字体与样式内联、零外部资源。

### 视觉与响应式约定

- **禁止整块实色填充**：按钮/胶囊/徽章条/注入入口一律「浅染底（`*-soft`）+ 1px 品牌描边（`*-ring`）+ 品牌色文字」；
  实色只用于 ≤16px 圆点、勾选标记、进度条、图表色块。目标平台按钮同理，选中项再加左侧 2px 色条。
  例外（用户裁定）：包卡宿主角标（`.pkg-host-tag`）用品牌**实心**小圆角块 + 深色文字，
  尺寸收紧到角标级；`ui-solid-fill-guard` 守卫不覆盖该形态（不拦截亦不断言），以本条裁定为准。
- **页头控件等高**：触屏断点下 `.icon-btn` 32px，`.header-theme-select` 同步
  32px（line-height 30px），并允许 `flex-shrink` 收缩——窄屏折行时不把相邻按钮挤出屏。
- **对比度**：强调控件文字与底色实测 ≥ 4.5:1；不要白字压品牌实色底。
- **手机滚动**：唯一纵向滚动容器是 `.app-main`；只有自带内滚的视图（传输/扩展）才禁外滚，
  禁止把 `overflow-y:hidden` 写成全局手机规则。
- **触屏桌面布局**：`@media (pointer: coarse)` 下折叠箭头 ≥24px、紧凑文字按钮 ≥28px。
- 自动守卫：`npm test -- ui-solid-fill-guard`。
- 改动 UI 后跑 13 视口矩阵：`node tooling/ui-audit/matrix.cjs`（需本地开发服务），
  产物在 `test-results/audit/<stamp>/`，含截图、`probe.json`、`summary.md`。

### 更新记录弹窗与身份徽标（术语与契约）

- **术语统一**：「更新记录」「提交记录」「更新日志」指同一处弹窗（`openChangelog()`），
  与 Git 可视化泳道图（`#zone-side-git`）无关。代码、文档、注释、回复不得混用。
- **三列恒在**：`.changelog-row` 是 `74px / 58px / minmax(0,1fr)` 三列（日期 / 短 SHA / 说明）。
  `index.js` 渲染时**无论 `entry.sha` 是否存在都必须输出三个单元**；无 SHA 时放
  `<span class="changelog-sha is-empty">` 占位。少一列会让说明串进 58px 列、
  被 `overflow-wrap:anywhere` 逐字折成竖排，右侧空出一大块（实测行高可达 145px）。
- **身份徽标**：四个宿主都有登录态，**禁止匿名态文案**。用户名取 `readHostIdentity()` 的
  `handle`，为空再取 `name`；三处赋值（页头 / 启动刷新 / 扩展管理）必须一致。
  读不到时显示「正在读取」并定时重试，不得回退成宿主名或匿名态。
- **三段式物理滚动隔离**：`.confirm-dialog .view-body.is-scroll-isolated` 必须强制 `overflow: hidden !important`，工具栏必须为 `flex: 0 0 auto; overflow: hidden;`，滚动条**仅且必须**出现在列表容器 `.changelog-list` 内部，工具栏右侧绝对不得延伸贯穿出现滚动条滑块与箭头；底部的「不再自动显示」复选框必须死死固定在 actions 操作栏，严禁塞入可滚动正文。
- **局域网无身份单框对等互联**：面板彻底消灭上下堆叠与双列收发卡片，采用单一通用互联盒（`lan-peer-box`），长连接建立后常驻保持不重连（Ping/Pong 心跳与 RTT 测速），双向任务进入连续队列交替调度，互不抢占信道；保留传统单次模式作为降级方案。
- **对等状态唯一通道 `setLan`**：`view.setLan()` 是视图状态的唯一写入口，支持 `open` / `send` / `recv` / `peer` / `scanError` 五个分支，全部按 `Object.assign` 合并（不得整体替换，否则后续只带部分字段的 patch 会清掉其它字段）。`lan-transfer-panel` 的所有对等状态都经 `setPeer → setLan({ peer })`。**新增任何 `setLan({ xxx })` 调用方时，必须同时在 `setLan` 加分支并在 `test/ui-lan-state-contract.test.js` 补用例**，否则 patch 会被静默丢弃（此前曾因漏 `peer` 分支导致整个对等模式点按钮零反应）。
- **对等发送源契约**：`getSendTargets()` 是 `async`，返回 `File[]`（`index.js`）。`peerSend` 必须 `await` 后以 `File` 为准取 `.name` / `.size`，不得假设存在 `sizeBytes` / `blob` 包装字段。
- **对等通道等待必须有界**：`bufferedAmount` 排空循环必须同时检查 `readyState`、取消标志与超时（`HIGH_WATER_TIMEOUT_MS`），禁止纯 `sleep` 轮询；`waitIceComplete` 到点未收全时须在提示与日志中如实标注，不得让用户拿到缺候选的码却毫无提示。
- **待导出卡复用唯一卡范式**：待导出项走 `pkgCard(pkg, { pendingId, pendingActions })` 渲染，与真实数据包卡同一套 DOM 与素材；**禁止为待导出另造图标、伪宿主角标或自造徽标文案**（已在一次修复中删除 `pkg-check-spacer`、`data-host="file"`、手写 ZIP 角标与 `pending.badge`）。体积计算须兼容 `blob.size` 与演示态 `size/mb`。
- **Luker 包与分卷包全特征识别**：`detect.js` 扩展识别 Luker 各类 manifest、`_convert/split-manifest.json` 分卷清单、平铺目录特征（`chats/`、`worlds/`、`groups/`、`user/`、`backgrounds/`、`extensions/`）与文件名强特征启发，杜绝 Luker 分卷包误判为「未识别包」。
- 回归守卫：`npm test -- header-badge.test.js changelog.test.js ui-viewport-guard.test.js`。

### 本地云与实例自动化

- 本机 S3 兼容服务器：`npm run cloud:serve:s3`（端口 0 自动分配，仅测试、无鉴权）。
- 本机 WebDAV 服务器：`npm run cloud:serve:webdav`（同上）。
- 客户端契约测试：`npm run test:local-cloud`（真实 HTTP + Range/multipart/PROPFIND）。
- 核心云全流程：`npm run e2e:cloud-core`（真实数据包 → 上传 → 下载 → sha256）。
- 实例成对启动：`npm run e2e:instance-pair -- dev-st dev-luker`；
  **同一时刻最多两个实例**，退出时校验端口释放。
- Luker ↔ TT 保真回归：`npm run test:luker-tt`（固定夹具）、`npm run e2e:luker-tt`（含真实大包）；
  判定口径：关键项零丢失、计数不减少、同输入两次产物清单一致；预期丢弃与同名扩展去重单独记录。
- 说明与限制：本机测试服务器说明与仓内审计记录（不随站点发布）。

### 两个云端 Page 与部署

- “两个 page”只指 GitHub Pages 的**插件 Web 根页**与 **`/docs/` 文档站**，两者由同一
  `Deploy to GitHub Pages` 工作流部署；本地开发服务与酒馆实例页面不属于该词。
- 影响插件或 `docs/` 的改动必须重新部署：`gh workflow run "Deploy to GitHub Pages" --ref main`，
  或打 `v*` tag；部署后验证两个 URL 均 200。
- 细则：仓内规范「两个云端 Page 与部署」。

## 五、体积与分卷模型

体积预测集中在 `src/core/size-model.js`，输入选中条目与导出选项，输出：

- `predictedBytes`：已知条目的压缩后预测；
- `breakdown`：按类目拆分的未压缩 / 压缩字节；
- `range`：未知项导致的区间；
- `confidence`：`high` / `medium` / `low`；
- `unknowns`：读不到体积的条目，界面必须显示 `?` 或区间。

界面不得再散落压缩比常量；新增类目、分卷、扩展模式或引擎载体时，只扩展模型与测试。

#### 体积显示口径（唯一真源）

- **包卡体积**统一由 `src/core/chart-model.js` 的 `fmtMB` 生成：`index.js` 导入后写入 `p.size`，
  卡片直接渲染该字符串。`src/ui/workbench-view.js` 内的同名 `fmtMB` 只服务图表与统计，
  **改包卡显示必须改 `chart-model.js`**（2026-11-19 实测事故：只改前者真机仍是 `0 KB`）。
- 小于 1 KB 一律用字节单位：`0 → 0 B`、`462 字节 → 462 B`；`>= 1 KB` 才用 KB/MB/GB。
  禁止把非零字节取整成 `0 KB`——那会与真正 0 字节的空文件无法区分（铁律 5 禁假 0）。
- 回归守卫：`npx vitest run test/ui-fmt-size.test.js`（同时覆盖两份实现）。

### 分卷判定口径（同源化）

- `splitArchiveEntries` 按**实测产物字节**判卷：`zipIo.createWriter().getWritten()`
  返回已写目的地字节（与最终 `blob.size` 精确锁步，BlobWriter 计数包装见 `zip-io.js`），
  预算 = 实测已写 + 下一条目贡献估计（未压缩 × 观测膨胀系数，系数随写入自校正，
  窗口 `[0.05, 1.05]`）+ 中央目录预留。
- 判定先于读取：调用方传懒描述符 `{path, size, read}`，splitter 决策后才 `read()`，
  reader 由调用方保持打开、finally 关闭 ⇒ 分卷路径不再整包解压驻留内存。
- 回退：`getWritten()` 返回 -1 的形态（文件路径等）按旧未压缩估算判卷，
  manifest 里 `judgedBy` 字段如实标注 `written-bytes` / `uncompressed-estimate`。
- 单文件独占成卷按**实测字节**判定（不再按未压缩预判）；封卷后守卫若发现
  `blob.size` 超阈值且卷内 >1 条目 ⇒ 该卷 `isOversized: true` 如实标注。

### 品牌色联动与 UI 交互规范

- **品牌色统一管理与禁止屎黄色回退**：唯一真源收口在 `src/data/target-ui.js`（`brandTokensOf`）与 `src/data/ui-tokens.js`（`UI_TOKENS.brand`）；严禁各模块手写散落的颜色映射字典；彻底杜绝 `rgb(225, 138, 36)` 屎黄色回退，所有强调与高亮统一采用目标平台品牌色或标准转运色（`#8a5cf6`）。
- **教程演示模式全面品牌色化**：教程「查看文档」按钮采用中性次要按钮样式（去除黄色边框与高亮），引导卡片、高亮环与横幅全站统一采用品牌色，杜绝刺眼黄色。示例扩展列表严格仅限收录用户 `jiozhaoyue` 的公开 `ST-` 开头扩展，支持运行时动态从 GitHub 仓库同步最新变更，且条目支持直接在新标签页中打开仓库。
- **教程演示态零落盘与跳过即退出（数据丢失修复）**：
  - `persistCloudConfig` / `persistWebdavConfig` 在 `state.tutorialMode` 下必须返回 `false`，禁止返回 `true` 制造「已保存」假成功；`cloudSave()` 仅在实际落盘成功后才写内存配置；
  - 云端保存按钮在演示态给出 `cloud.demoNoSave`（「演示模式不保存配置」）状态与 toast，不静默；
  - 教程浮层「跳过」必须调用 `exitTutorialMode()` 还原 state 快照并真正退出演示态，不得只关浮层（`tutorialMode` 残留会让后续保存全部静默失效）；
  - `CLOUD_KEY` / `WEBDAV_KEY` 必须声明在 `const state` 之前：`state` 初始化即调用 `loadCloudConfig()`，常量后置会落进 TDZ 并被 `catch` 吞成 `null`，导致写入成功也永远读不回。
- **扩展管理包内六态状态机与假死根除**：
  - 严格区分 `NO_PACKAGE`（未选包）、`UNSCANNED`（选包未扫描，带一键扫描通道）、`SCANNING`（扫描中）、`READY`（已扫描有扩展）、`EMPTY`（已扫描无扩展）、`ERROR`（扫描失败重试）六态；
  - 彻底修复 `ensurePlan` 异步完成未回传与切页才刷新的缺陷：`actions.onActivePackage` 返回 Promise，扫描完成自动就地触发 `renderExtensionView()` 响应式刷新。
- **列表行响应式与 CDP 物理断言守卫（彻底消灭 3 行折裂）**：
  - 桌面端（`> 860px`）：严格单行（`nowrap`），超长文本省略，复制按钮单行尾随；
  - 移动端（`<= 860px`）：严格两行（第一行：复选框 + 仓库与复制按钮同行；第二行：版本与模式标签），绝对禁止出现第 3 行；
  - 守卫命令：`npm run check:ext-responsive`（`scripts/ui-verify-ext-responsive-cdp.cjs`），自动遍历 390px、439px、768px、1200px 测量垂直阶梯数，若出现 3 行换行则测试立即非零失败。
- **数据包侧栏单行合流与勾选语义纯化**：
  - 面板头左侧使用「[图标] 数据包 | Git」切页分段，删除重复的纯文字大标题；右侧紧跟「导入 N | 导出 N」，两层并一层消除空白死带；
  - 彻底删除 `勾选操作·外框显示` 占位横栏；全选、反选、清空等批量控件纯粹用于控制卡片复选框；
  - 彻底废除分页栏，所有卡片平铺滑动到底；重设列表时保留容器 `scrollTop`，点击卡片绝不强制回顶。
- **扫码硬件流即时释放**：扫码窗口关闭或中途取消时立即物理终止所有 MediaStream tracks 并解绑 video.srcObject，支持 AbortSignal、遮罩背景点击与 ESC 按键退出，严格保证仅在扫码时启动摄像头。
- **文案与出口规范**：绝对禁止裸字段拼接（如 `zones.allPrefix`）；云端仓库顶部统一采用纯文字指引，移除直接跳转设置按钮。
- **弹窗与报告界面自适应重构规范（用户明令）**：
  - 打包扩展弹窗：彻底废除 120px 窄网格，采用自适应 `.pack-modal-card` 卡片流（`minmax(250px, 1fr)`）；头部展示单行省略扩展名与状态胶囊标签，底部独占一行放置完整/清单分段切换按钮，杜绝文字与按钮穿模碰撞；弹窗限制最大高度并强制 `overflow-x: hidden`，彻底消除横向滚动条；
  - 按钮文案严守短名规范（G-16）：绝对禁止长名按钮，操作文案精简为「拉取清单」（4 字以内），辅助说明收敛至 tooltip；
  - 上传/恢复宿主报告：顶部必须提供 KPI 色差胶囊栏（`restore-summary-bar`，直观汇总成功、跳过、失败数），消除生硬黑边框，逐包项采用轻微阴影与色差分层。

## 六、质量门槛

提交前至少通过：

```bash
npm test
npm run build
npm run qa:static
npm run docs:verify
```

文档站的中文页、英文页、教程截图与基线哈希必须同步；源页改动但译文或截图未更新会被 CI 拒绝。

- **临时验证守卫**：为触发守卫反例而临时加的测试行，只写在新建临时文件里，或用 `Edit` 精确撤销那一处，或先复制到 `tmp/` 备份再动；禁止用 `git checkout -- <file>` / `git restore` / `git reset --hard` / `git clean` 回收，否则会抹掉会话开始时已有的未提交改动（铁律 40）。

## 七、参与与安全

- 贡献方式与测试矩阵见 [CONTRIBUTING.md](https://github.com/jiozhaoyue/ST-pack-transfer/blob/main/CONTRIBUTING.md)。
- 安全问题请按 [SECURITY.md](https://github.com/jiozhaoyue/ST-pack-transfer/blob/main/SECURITY.md) 的私密渠道报告，不要公开提交可利用细节。
- 许可证：AGPL-3.0-or-later，详见 [LICENSE](https://github.com/jiozhaoyue/ST-pack-transfer/blob/main/LICENSE)。
