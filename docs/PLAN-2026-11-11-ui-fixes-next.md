# PLAN-2026-11-11 · 下一轮 UI 修复（用户实测反馈）

> 来源：2026-11-11 用户实测反馈六条。**本轮只写文档与交接，不实现**；下一轮按本文件逐条执行。
> 口径：只改 UI 与读数，不动 P2 的 Git/账号逻辑；每条都要在 4173 静态预览里取证（多宽度）。
>
> **2026-11-11 执行更新**：U1–U6 已全部实现，并按同日追加反馈重写教程（见 §四）。

## 执行状态

- [x] U1 徽标始终有文字（移动端去掉 `#host-badge-text{display:none}`）
- [x] U2 手机页头只留徽标 + 按钮（标题隐藏；按钮 `flex:0 0 auto`；窄态徽标只显示宿主名）
- [x] U3 浏览器配额完整显示（浏览器行可直接展开占用明细，数据只来自浏览器、不经宿主；quota=0 时显示已用 + 「配额不限/未知」）
- [x] U4 包名按钮可辨识（✎ + 「包名」+ 展开箭头旋转；`aria-expanded` 同步）
- [x] U5 包名输入与预览分行（`.filename-row` 列布局；预览 `pre-wrap` 独占一行）
- [x] U6 偏好按钮二次点击退出（有改动弹「放弃修改」；设置项 `confirmDiscardChartPrefs` 默认开）
- [x] 目标测试：settings-panel / settings-store / plugin / tutorial-anchor / copy-audit / host-chart-settings-guard 共 29 项通过
- [x] 六个守卫全绿（css-scope / dom-injection / template-source / dom-scope / control-consumer / i18n）
- [x] 4173 静态预览多宽度取证（构建完成后执行；读数见 §五）

## 一、问题清单与判据

### U1. Web 徽标没有文字

- **现状**：`renderHeader()` 写 `#host-badge-text` 为 `header.web`（`zh-CN.js` = `Web`）或
  `header.plugin`（`{host} 插件`）。而 `style.css:796` 的
  `[data-view="mobile"] #host-badge-text{display:none}` 会把文字隐藏；
  若容器宽度 ≤860（含窄预览面板），就会被判为 mobile ⇒ 徽标只剩图标。
- **根因**：移动端藏字策略与「徽标必须有字」的新要求冲突。
- **判据**：任何形态、任何宽度，徽标内都有可读文字（`Web` 或宿主名），不出现空徽标。
- **改点**：`style.css` 移动端段去掉 `#host-badge-text` 的 `display:none`；
  空间不足时改用短文本（见 U2），而不是隐藏。

### U2. 手机版页头：只留徽标 + 按钮，按钮绝不被压缩

- **现状**：移动端 `.app-title h1` 仍显示（`style.css:795` 只把字号缩到 14px）；
  徽标文字被隐藏；`header-actions` 有 4 个 icon-btn（帮助 / 语言 / 设置 / 关闭）。
- **要求**：手机版不显示「数据包转运」等标题文字；保留徽标 + 全部功能按钮；
  按钮**不得压缩、不得换行**（必要时隐藏「插件」二字，插件态徽标只显示宿主名）。
- **判据**：380 / 500 / 700 / 800px 下：标题文字不存在；四个按钮宽高完整、单行；
  徽标有字（Web 或宿主名）。
- **改点**：`style.css` 移动端段（隐藏 `.app-title`，`header-actions` 保持 `flex:0 0 auto;nowrap`）；
  `renderHeader()` 在窄态使用短文本（新增 i18n `header.hostOnly` = 宿主名，或直接 `h.full`）。

### U3. 浏览器配额必须在所有平台完整显示，并可展开占用明细

> **2026-11-11 追加纠正：内联展开作废。** 用户裁定：明细必须**占满插件容器 `#app.app-container`**，
> UI 与逻辑照抄 Luker storage inspector；宿主行与浏览器行同一套面板，只换数据源。
> 实施契约见 [`HANDOFF-2026-11-11-storage-inspector.md`](./HANDOFF-2026-11-11-storage-inspector.md)；
> 下文仅保留当时的内联设计记录。

- **现状**：`index.js:1611` 的 `readBrowserQuota()` 在 `quota<=0` 时返回 `null`
  ⇒ `renderQuota()` 显示「未提供」；且浏览器行被错误挂上「宿主未提供」尾巴、点击跳宿主存储页。
- **要求**：浏览器行**只读浏览器**、与宿主无关；点击就地展开占用明细（像 Luker 的 storage-inspector）；
  四宿主 + Web 形态一致；读不到 quota 显示「配额不限/未知」，不显示假 0。
- **判据**：浏览器行内无任何宿主字样；展开后列出 IndexedDB / Cache Storage / localStorage /
  sessionStorage / 本插件 IndexedDB 与 OPFS 等（浏览器不提供的分项如实注明）；宿主行行为不变。

### U4. 包名按钮图标/字样不明

- **现状**：`#filename-toggle`（`workbench-template.js:66`）固定是一个右向 chevron，
  只切换 `#filename-row` 的 `hidden`；没有文字，也没有「展开/收起」图标差异。
  用户误以为它是「展开」而不是「编辑包名」。
- **要求**：换成能表明「编辑包名」的图标或加文字；展开/收起有可区分状态
  （例如 ✎ → ▲，或文字「包名」+ 箭头方向变化）。
- **判据**：收起状态下用户能看出它是「包名编辑」；点击后图标/文字变化；
  `aria-expanded` 与可见状态一致。
- **改点**：`workbench-template.js` 的按钮内容与 `data-i18n-title`；
  `workbench-view.js:2932` 的切换逻辑（同步图标/文案）。

### U5. 包名输入框与预览换行

- **现状**：`.filename-row{display:flex;flex-direction:row}`（`style.css:159`），
  textarea 与 `.filename-preview` 同一行，preview 被限到 `max-width:38%`，
  长模板与预览互相挤压。
- **要求**：输入框一行、预览另起一行；窄屏（380px）也不挤压、不截断到不可读。
- **判据**：预览位于输入框下方且独占一行；380px 下仍完整可读（允许换行）；
  收起/展开后布局不抖动。
- **改点**：`style.css` 的 `.filename-row` 改列布局（或 `flex-wrap:wrap` +
  `.filename-preview{flex:1 1 100%}`）；必要时 `workbench-template.js` 加一层容器。

### U6. 数据包偏好按钮再次点击应退出

- **现状**：`#chart-pref-btn` 只绑定 `openChartPrefs`（`workbench-view.js:3114`）；
  `openChartPrefs()` 在 `state.prefMode` 为真时直接 `return`（`:1170`）；
  `cancelChartPrefs()` 已存在但没有「再次点击」入口。
- **要求**：再点一次 ⇒ 若草稿有改动，弹「是否放弃修改」；确认后回到正常图表。
  提供「不再提示」（设置项，默认提醒）；无改动时直接退出，不打扰。
- **判据**：
  - 二次点击（有改动）⇒ 弹窗；选「放弃」⇒ `prefMode=false`、控件回滚、图表恢复；
  - 选「继续编辑」⇒ 留在偏好态；
  - 设置里关掉提示后，二次点击直接丢弃并退出；
  - 无改动时二次点击直接退出。
- **改点**：`workbench-view.js` 的 `#chart-pref-btn` 绑定（改成 toggle 语义）、
  `cancelChartPrefs()` 复用；`settings-panel.js` 新增 `confirmDiscardChartPrefs`
  （默认 `true`）；`settings-store.js` 白名单 + `i18n` 文案。

## 二、执行顺序与验证

1. U1 + U2（页头/徽标，一起改，同一份 CSS 与 `renderHeader`）。
2. U3（配额读数与文案）。
3. U4 + U5（包名行，同一块模板与 CSS）。
4. U6（偏好二次点击 + 设置项）。
5. 每步跑：`npm run build`、六守卫、`node scripts/ui-verify-responsive.cjs`；
   新增/更新 `scripts/ui-verify-ui-fixes.cjs`（本地专属）覆盖六条判据。
6. 完成后按项目规则提交并推送 `origin`。

## 三、不要做的事

- 不要动 P2 的 `git-url / git-accounts / git-site / git-remote` 与安装流程。
- 不要为「按钮不被压缩」引入横向滚动条；正确做法是隐藏标题/缩写徽标文字。
- 不要把配额读不到的情况显示成 0 或「不限」以外的假值。

## 四、教程重写（同日追加反馈）

用户反馈：**点「下一步」教程直接消失**；并要求教程改为「打开先选目标 → 开始演示」，
不再区分基础/高级，且按平台（手机/电脑/宿主/Web）与当前 UI 状态各自适配。

- **根因**：旧 `renderTutorial()` 在目标元素不存在时执行 `card.style.display='none'`。
  第二步锚定 `#chart-stack .vol-card`，未载入数据包时该节点不存在 ⇒ 卡片消失。
- **修法**：
  - `TUTORIAL_GOALS`（转换 / 上传宿主 / 从宿主拉取 / 扩展管理 / 迁移备份），按 `state.mode` 过滤；
  - `tutorialPrepareStep()` 在每步前切主视图、数据包分区或分区 tab；手机变窄时自动跟到对应页；
  - 目标结构缺失时卡片**居中保留**并如实说明，绝不隐藏；
  - 「换个操作」随时回到目标菜单；设置项 `autoTutorial` 行为不变。
- **判据**：点下一步不再消失；桌面/手机、Web/宿主下目标列表与步骤各不相同；
  未载入数据包时第二/后续步骤卡片仍在。

## 五、取证结果（2026-11-11 · 4173 静态预览 + Playwright）

- 宽度 1280 / 800 / 500 / 380：徽标文字均非空（`Web`）；≤800 标题隐藏；页头可见按钮同排、28×28 不压缩；
  `#app` 与页头横向溢出均为 0。
- 包名行：展开后可见，按钮文字「包名」、`aria-expanded=true`；预览位于输入框下方且宽度 ≥ 输入框 90%。
- 浏览器配额：行内无任何「宿主未提供」字样；点击展开明细，读数来自
  `navigator.storage.estimate()`（IndexedDB / Cache Storage / Service Worker / 文件系统，浏览器提供时）
  + localStorage / sessionStorage 自算 + 本插件 IndexedDB/OPFS 占用；quota=0 时显示「配额不限/未知」。
- 教程：Web 形态目标菜单 3 项（转换 / 扩展 / 迁移备份，正确过滤宿主项）；
  选「数据包转换」连续 6 步，每步卡片均可见（`cardW=330`），第 7 次点击才「完成」关闭。
- 教程中把视口从 1280 缩到 380：`data-view=mobile`，自动切到数据包页，`#delta-toggle` 可见，卡片与高亮环仍在。
- 偏好二次点击：无改动直接退出；改动后二次点击弹出「放弃数据包偏好修改？」，按钮为「继续编辑 / 放弃修改」。
- 扩展管理：4 个页签（安装 / 打包 / 已装 / 报告），打包页在无包时如实提示。

## 六、教程演示模式（同日追加）

- **模式切换**：顶部教程按钮 / 教程菜单 = 演示模式开关；进入后整站换成 3 个占位数据包与占位宿主树，
  页头下方出现「教程演示模式」横幅与「退出教程」。
- **可操作**：教程蒙层 `pointer-events:none`（仅卡片可交互），演示页面可直接点按；
  勾选、切区、生成（本地追加一条模拟产物）、删除、复制回导出区、展开配额明细都可用；
  其余外部动作（拉取 / 上传 / 安装 / 云 / 局域网 / 设置保存）只提示，不触达真实通道。
- **零影响**：进入时深拷贝整个 state，退出时整体还原；`localStorage`（日志 / 图表布局 / 偏好 / 云配置）
  在演示期间全部禁写；IndexedDB / OPFS / 宿主完全不动。
- **取证**：进入后有横幅、3 个占位包（导入区 2）、图表有占位卡、动作条「已选 1 项」；
  退出后横幅关闭、包与产物归零；演示中模拟生成后待导出项 +1、删除后占位包 -1；
  演示前后与演示期间 `localStorage` 全部逐键相同，页面零错误。
