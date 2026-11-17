# UI/视觉审计报告 · ST-pack-transfer（2026-11-17）

- 审计人：UI/视觉审计子代理（只读，未改任何产品代码/样式/测试/配置）
- 输入：`test-results/audit/2026-11-17T13-18-15/`（13 视口 × 13~14 状态截图 + probe.json + summary.md，采集于 13:18/13:20）
- 采集后代码漂移声明：矩阵采集后，工作区已落一批未提交修复（`style.css`、`src/ui/workbench-view.js`：`.btn.accent`/`.picker-btn[data-host]`/`.picker-item[aria-selected]` 改浅染、`.pkg-host-tag` 7.5px→8.5px、教程主按钮改 `accent-soft`）。本报告对每个相关条目区分「截图（修复前）」与「现行代码（复核）」；对 :3040 served CSS 做了只读抓取比对，确认线上即工作区版本（8.5px 与 accent-soft 均已生效）。
- 对比度均为本审计独立计算（WCAG 2.x 相对亮度公式，standalone 回退主题 panel=rgb(23,23,23)/panel-3=rgb(48,48,46)），非沿用 probe 旧值。

## 摘要

| 严重度 | 数量 | 编号 |
| --- | --- | --- |
| **P0** | **1** | UI-01 |
| **P1** | **4** | UI-02、UI-03、UI-04、UI-05 |
| P2 | 11 | UI-06 ~ UI-17 |
| 复核通过（非缺陷） | 3 | UI-08、UI-A、UI-B |

一句话结论：实色填充专项（用户明令）在现行代码已基本清零，截图中的红/橙整块按钮全部是修复前残留影像；当前真正的问题是**极窄视口（≤540，尤其 280）的页头溢出与遮挡**、**360/320/280 底部统计行不可达**、**设置入口在全部 13 视口截图里无可见响应**，以及一批对比度/触控/字号长尾。

---

## 发现清单

| ID | 严重度 | 视口/状态 | 位置 | 现象 | 证据（实测值 + 截图） | 人类为何不好用 | 建议修法 | 关联规则 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| UI-01 | **P0** | fold-280x653 · 全部 14 状态 | `#app.app-container`（`style.css:112-116` `overflow:hidden`）页头右侧 | 页头图标行溢出：地球图标半裁、**齿轮「设置」按钮整体裁出屏外且无法滚动到** | probe 实测 `appScrollW=295 > vw=280`、`docScrollW=280`（容器 overflow:hidden ⇒ 15px 永久不可达，14/14 状态全部如此）；截图 `fold-280x653/06/07/08/10/13-*.png` 页头右上角 | 折叠屏竖屏用户点不到设置（含主题、语言、数据源入口）；且无任何横向滚动补救 | ≤300px 断点：页头收敛（主题下拉缩为图标+title、图标按钮并入「更多」弹层），或让 `#app` 宽度跟随 `min(vw, max-content)` 不超 vw | R-13、R-27、MR-15（overflow 禁裁功能控件）、MR-18 |
| UI-02 | **P1** | 教程浮层期：390/360/320/540（tutorial-overlay、settings 等）与 820（workbench 等）、280 | 页头居中胶囊「教程演示模式：不会写入真实数据或宿主」（教程浮层 DOM） | 胶囊与页头控件碰撞：390/360/320/540 **盖住 Dark Lite 主题下拉与图标按钮**（Web 徽标被吞）；768 贴住下拉左缘（间距≈0）；820 **盖住 Web 徽标左半**；280 连「重新打开教程」按钮都被盖 | 截图 `phone-390x844/01-00-tutorial-overlay.png`、`13-30-settings.png`；`duo-folded-540x720/01/13`；`tablet-port-820x1180/06/01`；`ipad-port-768x1024/01/13`；`fold-280x653/01` | 教程期间用户改不了主题、看不到 Web 模式徽标；控件被非交互元素遮挡，点击落在胶囊上 | 浮层期胶囊限 `max-width` 并降到 banner 行内（短文案「演示模式」），或 `flex-wrap` 避让页头控件；禁止绝对居中覆盖 | MR-18、R-13（控件不得被盖）、R-28（教程隔离但不得破坏正常控件） |
| UI-03 | **P1** | 360x640、320x568、280x653 · workbench/view-chart/settings | `.app-main` 底部统计行「已选 23 项 · 预计 8.9 MB / 预计压缩包」 | **统计行滚不到**：probe 判 `unreachable-vertical-clip`（high）×9 —— 360: scrollH 489/clientH 471、320: 437/399、280: 498/484；截图中 390 可见该行，360/320/280 整行消失且无法滚动露出 | `probe.json` unreachable-vertical-clip 9 条（phone-360/320、fold-280 各 3 状态）；对比截图 `phone-390x844/06`（可见）vs `phone-360x640/06`、`phone-320x568/06`、`fold-280x653/06`（不可见） | 手机小屏用户看不到自己选了多少、预计多大——读数不可见不可复核，直接违背「读数同源实时可复核」 | 360 以下让统计行参与 `.app-main` 文档流（去 sticky/absolute 底部定位）或压缩 `.vol-card` 高度预算；确保 `scrollHeight==clientHeight` 或可滚动到达 | R-19、R-27、MR-15 |
| UI-04 | **P1（待人工核验根因）** | **全部 13 视口** · `30-settings` / `31-settings-bottom` | 设置入口（页头齿轮 `btn-settings` → `actions.settings()` → `openSettingsView()`，`workbench-view.js:6250/6970`） | **13/13 视口的 settings 截图都没有出现任何设置界面**：桌面端停在扩展管理视图，手机端停在「数据包抽屉 + 扩展」视图；与 `10-view-extension` 视觉一致（MD5 比对 12/13 与 13/14 各为「滚动无变化」重复，非证据）；probe 各 settings 状态 findings 与扩展视图量级一致 | 截图 `*/12-30-settings.png`（桌面系）、`*/13-30-settings.png`（手机系）×13；代码机制存在（`#settings-body`、`state.pane==='settings'`） | 若为产品问题：设置完全打不开（重大）；若为采集问题：本矩阵缺少设置视图证据，验收缺口 | 人工在 :3040 点击齿轮复测；若采集脚本问题修 `matrix.cjs` 等待条件（`waitForTimeout(600)` 可能早于 pane 切换），若产品问题查 `actions.settings` 在演示模式/各 pane 下的短路分支 | R-30（失败不静默）、R-11（验收证据） |
| UI-05 | **P1** | 320（全部状态）、390/360（view-extension） | `.ext-unified-actions`（`style.css:997` 登记例外 `overflow-x:auto; scrollbar-width:none`）扩展动作按钮行 | 320：**「转成清单」按钮被拦腰裁成半截**（不出现半截被违反），「打包/移除所选」整枚在屏外；390/360：「打包/移除所选」不可见，行尾无任何可滚动暗示（scrollbar 被有意隐藏） | 截图 `phone-320x568/10-20-view-extension.png`（右缘半枚图标按钮）、`phone-390x844/10`、`phone-360x640/10` | 触屏用户不知道右边还有按钮；「半个按钮」既难点中又像渲染 bug | 手机端动作行改 `flex-wrap:wrap` 换行，或整行退化为「图标+title」（退让③），禁止无暗示横滚 + 禁止半截 | R-13（不出现半截）、R-27（功能按钮全显示）、MR-15（禁横向滚动） |
| UI-06 | P2 | 全视口（对比度按 standalone 回退主题计算） | `.tree-pill.unknown` / `--muted-2`（`style.css:40,451`；`pkgCard` unknown 徽章 `workbench-view.js:2129-2131`） | 未识别徽章/次要文字对比度不足：muted-2 rgba(176,176,168,.56) on panel = **3.43 < 4.5**（9.5px 小字） | 本审计计算值 3.43（probe 也归入 contrast-below-wcag 147 条的长尾） | 未识别包提示在深色底上发灰，弱视用户读不到 | unknown 徽章文字升到 `--muted`（实算 5.91 ✓）或独立可见色；不要用 0.56 透明度承载功能性文字 | WCAG AA、MR-15 配色可读 |
| UI-07 | P2 | 全视口 hover 态 | `.btn.accent:hover`（`style.css:1303` `background:var(--accent-soft-2)` + `color:var(--accent)`） | 常态橙字/20% 浅染 = **4.86 ✓**（复核通过）；但 hover 32% 浅染 = **3.80 < 4.5**（11.5px 文字） | 本审计计算：accent on soft-2 over panel 3.80 | 悬停瞬间主按钮文字反而变糊，与「反馈更明确」的预期相反 | hover 改为「底色不变、文字升 `--text`（实算 9.39 ✓）」或 soft-2 降到 ~24% | WCAG AA、MR-24 |
| UI-08 | 复核通过（记录） | 全视口 | `.pkg-host-tag`（`style.css:771`） | 截图（13:18，修复前）7.5px、ratio 3.89 不达标；**现行代码 8.5px + ring/soft 实算全部通过**：ST 4.59、TT 8.14、PT 5.03、L 7.44 | probe.json（旧值 3.89/7.5px）vs :3040 served CSS（8.5px 实测确认）+ 本审计计算 | — | ST 4.59 贴线：宿主浅色主题下需复测（本次矩阵全深色主题，无法覆盖） | WCAG AA |
| UI-09 | P2 | 全视口（实色填充专项·残留清点） | ① `style.css` 全文 ② `src/ui/host-bridge.js:2552,2576,2588` | 用户明令「禁止整块填色底」复核：截图中的整块橙底「生成导出包」、红底目标平台按钮、橙底胶囊**全部是修复前影像**；现行代码已改浅染+描边（`.btn.accent:1301`、`.picker-btn[data-host]:669-676`、`.picker-item[aria-selected]:695-706`、教程 primary:1579、`chart-est-zip:487`、`tree-pill 完整/可选:448-449`）。全文仅剩 6 处 `background:var(--accent)` 实色，均为小面积元件：进度条填充、复选框 accent、图例圆点、`lq-bar i`、`vol-priv b`——不构成「整块铺色」 | :3040 served CSS 正则清点（6 处，含选择器名）+ 修复前截图（`desktop-1920x1080/01/06` 橙色实底按钮，probe 实测白字/橙底 2.67） | — | 剩余残留：`host-bridge.js` 注入弹窗硬编码 `#f38ba8`/`#f9e2af`/`#a6e3a1` 与「一键清理残留」实色底（`#f38ba8` 底 + 深字），违反 MR-24 禁硬编码色；建议改 `var(--SmartTheme*, 回退)` | MR-24、R-18（注入宿主规则）、用户 2026-11-17 裁定 |
| UI-10 | P2 | 全视口（触控专项） | 多类控件 | probe：`tap-target-under-32` 2581、`tap-target-under-24` 240、`tap-target-checkbox-small` 826。头部类：`tree-toggle`（147 处 <24）、`pkg-check`/`tree-check` 14px 复选框（826）、`seg-btn`/`zone-tab`/`view-switch-btn`/`group-close`/`vol-max` 27~28px、`extmode-btn` 手机端 `min-height:26px`（`style.css:1745`）、`lan-link` 9 处 <24 | `summary.md` 计数 + `style.css:1745,2028`（lan-link `min-height:28px`） | 手机上勾 14px 复选框、点 26px 分段按钮误触率高 | 逐类抬标：手机端复选框热区 ≥24（padding 扩热区不改视觉）、`extmode-btn` ≥32；桌面 hover 设备可保留 27~28 | 触控 HIG、MR-15 |
| UI-11 | P2 | 全视口 | `lan-link`(10px, `style.css:2028`)、`pkg-badge`/`tree-pill`(9.5px, 798/441)、`pkg-meta`(10px, 796)、`.field .unit`(10px, 642)、`zone .count`(10px, 734)、`pkg-seq`(8px, 721) | 功能性字号 <10.5 共 139 处（probe `functional-font-under-10.5px`），其中 <9.5 仅 9 处（pkg-seq 8px 序号贴角） | probe 计数 + CSS 行号 | 老花/强光下徽章文字难辨（徽章多带 title 兜底，见 UI-B，风险有限） | 优先抬 `lan-link`→11px（它是可点击功能链接，非纯展示）；纯展示徽章可保留但有 title | MR-15、R-27 |
| UI-12 | P2 | 全视口 | 重复可访问名 | `duplicate-button-name` 411 处：「展开管理器」×11、「全选/反选」各面板重复等 | probe 计数 | 读屏用户在同名按钮间无法区分（「展开管理器，展开管理器……」） | 同名按钮补 `aria-label` 上下文（面板名前缀），或视觉文案带范围限定 | WCAG 2.4.9、R-14 反向（不是重复入口而是同名歧义） |
| UI-13 | P2 | 3440/2560 · view-chart/workbench | `.chart-tree` 树行 | 超宽下「行标签 → 右侧徽章/迷你条」之间出现 >1000px 空白带，读数跨度极大；竖直方向下半屏空置 | 截图 `ultrawide-3440x1440/06/07`、`desktop-2560x1440/06/07` | 眼球在行内左右横跳，对不上「徽章属于哪行」 | 树行加 `max-width`（如 1100px 居中）或宽屏双列树；徽章列改为跟随标签的 inline 分组 | R-13 美观、MR-16 |
| UI-14 | P2 | 手机布局全部（390/360/320/540/280/768/820） | LAN 面板（`.lan-body`）移动端堆叠顺序 | 顺序为「接收 → 方向/状态条 → 发送」：方向条被夹在两个功能区中间，逻辑分组断裂（桌面端为 方向条→发送→接收） | 截图 `tablet-port-820x1180/08`、`ipad-port-768x1024/08`、`phone-390x844/08` | 用户要先跳过「接收」才能理解「发送」入口；方向条语义悬空 | 手机端保持「方向/状态条 → 发送 → 接收」原逻辑顺序堆叠 | MR-18、R-27（跨平台一致） |
| UI-15 | P2 | 320x568 · settings/view-zone | `.pkg-name-txt.two-line`（`word-break:break-all`，`style.css:793-794`；`fitPackageNames` 判定） | 包名断行残句：「luker_export_2026-11-16.zi / p」——第二行只剩「p」，正是 CSS 注释里要避免的残句形态 | 截图 `phone-320x568/13-30-settings.png` | 读包名时「.zip」被拆散，易误读为两个文件 | `fitPackageNames` 增加尾段残句检测（末行 ≤3 字符时回退单行省略号 + title） | responsive-and-aesthetics.md §1-3 |
| UI-16 | P2 | 全视口 | 底部胶囊「预计压缩包：~4.6 MB」、体积「≈8.9 MB / ≈428.6 MB」 | R-05 明令「禁止 ~ 前缀」；当前读数虽有「预计/≈」语义，但「预计 + ~」构成双重估算表述，且 `≈` 系列同样属估算符号 | 截图 `desktop-1920x1080/06`（底部右下）、`fold-280x653/06`（≈3.7 MB） | 用户无法区分「精确预估值」与「粗略猜测」 | 统一口径：保留一个估算标记（建议去掉 `~`/`≈`，用「预计」文案承载），由 i18n 统一输出 | R-05（no-estimated-numbers） |
| UI-17 | P2（待核 title） | 540/390/360/320/280 · 全状态 | `.view-switch` 手机退化（`applySwitchDensity()`） | 540 及以下视图切换整行退化为 4 枚纯图标（图表/云/扩展/数据包），无文字；规范登记过该退让（保留可读标签），但截图无法证实 title/aria 是否在 | 截图 `duo-folded-540x720/06`、`phone-390x844/06` 等 | 新用户靠猜图标含义（云=迁移？盒子=数据包？） | 确认每枚按钮带 `aria-label`+`title`；或 540~460 段保留「图标+单字」混合档 | responsive-and-aesthetics.md §2、R-27 |

### 复核通过项（非缺陷，记录在案）

| ID | 项 | 结论 |
| --- | --- | --- |
| UI-A | 手机唯一纵向滚动（刚修 `.app-main`） | probe `scrollers>1` 仅三类：①tablet-land/duo-unfolded 教程期 `chart-tree`+`card-list` 双滚（教程占位数据所致，正常态无双滚）②手机 `extension-body`(18px 视口高)+`zone-body`（抽屉打开时，spec 2.1 已登记例外）③均非「第二个主滚动条」。`.app-main` 修复生效 ✅ |
| UI-B | 树徽章图标模式可读性兜底 | `.tree-pill` 图标退化时 `title=pillText` 仍在（`workbench-view.js:1330`），符合退让③「纯图标带 title」 ✅ |
| UI-C | 图表布局 R-15 | 全部视口图表 1 个占满、贴边无空白、无压成单条；控制行换行正常（tablet-land 下「排序」整行下移属合规退让①） ✅ |

### 触控可操作性补充（对应用户清单第 5 条）

- 拖拽分隔条触屏：本次矩阵未包含拖拽交互截图，`.resizer` 类触屏行为**未验证**（列「无法确认」）；spec 已登记「手机端禁拖拽手柄」，需真机/驱动复测。
- 图标按钮可访问名：复制按钮（`ext-copy-btn` 等）在截图中为纯图标，probe 未报 missing-name（其统计口径不含 aria 检查）——**无法确认**，建议补一轮 aria-name 探针。

---

## 按视口覆盖清单（多模态逐张判读，共 84 张 PNG）

| 视口 | 已判读文件（shots/<视口>/ 下） |
| --- | --- |
| desktop-1920x1080-16x9 | 01-tutorial-overlay、06-workbench、07-view-chart、08-view-transfer、10-view-extension、12-settings |
| desktop-2560x1440-16x9 | 01、06、07、08、10、12（同上六类） |
| ultrawide-3440x1440-21x9 | 01、06、07、08、10、12 |
| laptop-1440x900-16x10 | 01、06、07、08、10、12 |
| tablet-land-1180x820 | 01、06、07、08、10、12 |
| tablet-port-820x1180 | 01、06、07、08、10、12-20-view-zone、13-30-settings（7 张） |
| ipad-port-768x1024 | 01、06、07、08、10、13 |
| duo-unfolded-1114x705 | 01、06、07、08、10、12 |
| duo-folded-540x720 | 01、06、07、08、10、13 |
| phone-390x844 | 01、06、07、08、10、11-22-extension-bottom、12-20-view-zone、13（8 张） |
| phone-360x640 | 01、06、07、08、10、13 |
| phone-320x568 | 01、06、07、08、10、13 |
| fold-280x653 | 01、06、07、08、10、13 |

注：各视口 `nn-settings` 与 `nn-settings-bottom` 为 MD5 相同（列表短，滚动前后无差异），属预期重复，不另计证据。

## 未看完的部分与未确认项（诚实声明）

### 未逐张判读的截图（未看完的部分）

以下截图存在于矩阵中但**本次未逐张多模态判读**，其中未列证据的问题一律视为「未确认」：

1. `02-01-tutorial-step1.png` ~ `05-04-tutorial-step4.png`（教程步骤 1~4，13 视口 × 4 = 约 50 张）——仅判读了 `01-00-tutorial-overlay.png`；教程步骤进行中的遮挡/布局未验证（未确认）。
2. `09-21-transfer-cloud.png` / `09-20-transfer-cloud.png`（云端仓库子页签，各视口）——仅判读了 `08-view-transfer.png`（局域网互传）；云端表单/密钥输入行在手机端的排版未验证（未确认）。
3. `31-settings-bottom.png` / `14-31-settings-bottom.png`——与对应 `30-settings.png` 为 MD5 完全相同（滚动无变化，已用哈希佐证），未再逐张目验。
4. `11-22-extension-bottom.png` / `14-31-…` 其余「-bottom」态——仅 phone-390 抽看一张（与扩展视图一致），其余以 MD5 相等佐证未逐张目验。
5. 手机端 `duo-folded/12-20-view-zone.png`、`phone-360/12-20-view-zone.png`、`phone-320/12-20-view-zone.png` 未逐张判读（view-zone 已由 phone-390 与 tablet-port 两张覆盖，其余未确认）。

### 实测证据缺失、明确「未确认」的问题

1. **UI-04 根因**：设置入口「点不开」还是采集时序问题——矩阵内无法区分，需人工在 :3040 实点。
2. **fold-280「覆盖」分段疑似半字符**：`fold-280x653/13-30-settings.png` 中「覆盖/增量」分段首个字符形似「要盖」（左半被裁），截图分辨率无法定论；若实为半字符，归入 UI-05 同族（不出现半截）。需 DOM 复核。
3. **拖拽分隔条触屏行为**：矩阵无交互证据（见上）。
4. **浅色宿主主题**：本矩阵全部为 Dark Lite 深色主题；`.btn.accent` 4.86、ST ring 4.59 等结论不外推到浅色主题。
5. **注入宿主按钮实机样式**：矩阵为 standalone Web 形态，`mountNativeBackupButton`/`mountLukerBackupManagerButton`（`host-bridge.js`）未在截图中出现；本次仅做了代码只读检查（复用 `menu_button` 类 ✅，但弹窗内含硬编码色，见 UI-09）。
6. **教程浮层可关闭性**：全部视口「跳过」均可见可达（✅），但「查看文档」跳转行为未在矩阵内验证。

## 度量方法备注

- 对比度：独立 WCAG 计算（非沿用 probe），底色按 standalone 回退 token 合成（panel rgb(23,23,23) / panel-3 rgb(48,48,46)，品牌色来自 `src/data/ui-tokens.js` 唯一真源）。
- 溢出/滚动：直接引用 probe.json 实测（`docScrollW/appScrollW/scrollH/clientH`），本审计未重新采集。
- :3040 复核：只读抓取 served `style.css` 与工作区 diff 比对（dev 模式同源），未修改任何文件。
- 本报告为唯一写入文件；审计过程临时脚本写在系统临时目录（`%TEMP%\opencode\contrast-calc.cjs`），不属仓库交付物。
