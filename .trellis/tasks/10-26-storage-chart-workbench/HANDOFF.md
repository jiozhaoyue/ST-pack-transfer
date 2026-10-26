# 存储图表工作台 · 完整交接（2026-10-27）

> 自包含交接文档：新会话读完这一份即可接手，不需要回溯对话。
> **权威顺序**：`prd.md`（需求与验收）> `design.md`（技术设计）> 本文件（状态与操作指南）。
> 本文件可能落后于 `prd.md`；验收一律以 `prd.md` 为准。

---

## 一、一句话现状

规划与 **UI 定稿 demo** 已完成并推送；**产品代码零改动**；6 个子任务全部处于 `planning`，PRD 已回填，随时可以逐个 `task.py start` 进入实现。

| 项 | 值 |
| --- | --- |
| 父任务 | `10-26-storage-chart-workbench`（planning） |
| 子任务 | `naming-injection` / `storage-chart` / `zones-flow` / `package-cards-vault` / `tutorial-copy` / `ui-demo`（全部 planning） |
| 已推送提交 | `0143b9d`（HEAD = origin/main） |
| 产品代码 | 未改；`npm test` 未跑（无代码变更，上次全绿基线 817 passed / 2 skipped / 81 文件） |
| demo | `deliverables/ui-demo.html`（2026-10-27 评审版） |

---

## 二、任务树与编号

```
10-26-storage-chart-workbench   ← 父任务，持有 R1–R12 与 AC-1~AC-19
├── 10-26-naming-injection      R1 + R6.5 + R10.1        AC-1~AC-5
├── 10-26-storage-chart         R2 + R9 + R12            AC-6~AC-12
├── 10-26-zones-flow            R3 + R11 + R10.2         AC-13~AC-20
├── 10-26-package-cards-vault   R4 + R5                  AC-21~AC-26
├── 10-26-tutorial-copy         R6 + R10.3 + R10.4       AC-27~AC-31
└── 10-26-ui-demo               R8                        AC-32~AC-36
```

每个子任务的 `prd.md` 已按父 PRD 对应章节回填（不再有 TBD），`implement.jsonl` / `check.jsonl` 已各填真实条目（`task.py start` 的校验能过）。

**建议启动顺序**：`naming-injection` → `storage-chart` → `zones-flow` → `package-cards-vault` → `tutorial-copy`。
`ui-demo` 已实质完成（AC-32~36 满足），可在其余子任务启动后直接归档。

---

## 三、demo 结构速查（改产品代码时对着看）

单文件 `deliverables/ui-demo.html`，约 1800 行，段落顺序固定：

| 区域 | 作用 |
| --- | --- |
| `<style>` 顶部 `:root` | **模拟酒馆令牌**，取值来自真机 Luker `public/style.css:71-82`；派生层与项目 `style.css:35-57` 同构 |
| `ICON_LUKER / ICON_TT / ICON_PT / ICON_ST` | 四个本地内置图标（base64），无外链 |
| `HOSTS / TARGETS` | 宿主与目标平台注册表（品牌色变量名也在这里） |
| `backupTree()` | **图表树唯一来源**，按真实备份包结构写成；宿主图表与包图表共用 |
| `chartTargets() / volumesOf() / splitChunks() / buildVolumeTree()` | 目标选择与分卷算法（下钻→装卷→重建祖先） |
| `chartCardHtml() / renderTreeRows() / renderChart()` | 图表卡与树渲染；勾选记忆键 = `scope::nodeId` |
| `pkgSeq() / seqLabel() / seqNum()` | 两区独立序号 |
| `fitPackageNames()` | Canvas 量宽的包名折行判定 |
| `initSplitters()` | 三条拖拽分隔线（含交叉点十字手柄） |
| `doGenerate()` | 按「包 × 卷」产出多个导出包 |

改 UI 的顺序：**先改 demo → 截图校对 → 再改 `src/`**（这是本项目已定纪律）。

---

## 四、这一轮定下的关键决策（含推翻的旧决定）

| 主题 | 决策 | 理由 / 旧状态 |
| --- | --- | --- |
| 面板配色 | 全部继承 `--SmartTheme*` | 2026-10-27 用户明确要求「不是独立的，随酒馆主题」 |
| 面板轮廓 | 由 BodyColor 派生 `--outline` | 真机 `--SmartThemeBorderColor` 是 `rgba(0,0,0,.5)`，深底不可见 |
| 平台品牌色 | 四色从官方图标取色，**只做标识** | 这是**对 2026-10-14「不再自造四个品牌色」的定向推翻**，但限制在标识用途，不染面板 |
| Luker 图标 | 用 `apple-icon-512x512.png`（纯黑剪影） | `logo.svg` 至今仍是 ST 那份（fork 未换）；提交 `d44656a6b` 换的是 app icon |
| 顶栏徽标 | 插件 = 宿主 icon + 英文全名 + 「插件」；Web = GitHub 图标 + 「Web」 | 宿主名只此一处，图表区内不得再写 |
| 图表身份 | 组头只写 `导入05` / `导出01`，包卡只显示两位数字压图标角 | 取消「包·」前缀，示例信息不重复 |
| 包卡按钮 | 删除「在图表中查看」 | 与点卡切换图表重复 |
| 分卷 | 32–2048 MB，单位 MB，可下钻装卷，每卷一张标准图表卡 | 只在顶层切会撑破卷（实测「聊天记录」大于单卷上限） |
| 导出 | 按「包 × 卷」产出 N 个独立可导入的包 | R7.3「每卷独立可导入」 |
| 日志 | 移入顶栏弹窗，WARN/ERROR 显红点 | 常驻右栏会挤压「执行」导致显示不全 |
| 布局 | 左右 8px + 右栏上下分隔条，交叉点十字手柄 | 用户要求桌面可调；执行面板必须贴底 |
| 移动端 | 分隔条隐藏；多卷单列折叠、默认只展开第一卷；无吸底条 | 吸底条会覆盖列表（被判为「组件交错」） |
| 文案 | 面板内禁止说明性整句，说明只进「?」与教程 | 用户多次要求去重、去「落单的字」 |

---

## 五、取证事实（实现时要照抄，别重新猜）

### 5.1 四平台品牌色

| 平台 | 取色 | 来源文件 |
| --- | --- | --- |
| SillyTavern | `#a11b1b` | `Instance/Dev/SillyTavern/public/img/logo.svg`（`fill="#a11b1b"` + 白字） |
| Luker | 纯黑 `#000` 剪影 | `Instance/Dev/Luker/public/img/apple-icon-512x512.png` |
| TauriTavern | 浅黄 `#f8c034`（词标 Tavern 段） | 官方词标 PNG；青 `#00a0b0` 是 Tauri 段 |
| PureTavern | 紫 `#584078`（词标） | `Instance/Dev/PureTavern/apps/vscode-extension/media/icon.png` |

> TT 的 `src/img/logo.svg` 与 ST 同源（占位），**不能**当 TT 品牌依据。

### 5.2 真实备份包结构

来源 `data-zip/default-user-2026-08-25-172056.zip`（1.0 GB / 5560 文件）：

| 目录 | 文件数 | 体积 |
| --- | --- | --- |
| `backups/` | 101 | 1274.7 MB |
| `extensions/` | 3769 | 502.3 MB |
| `user/`（`images/` 178、`files/` 10、`workflows/` 2） | 186 | 152.8 MB |
| `chats/`（按角色分目录） | 93 | 108.5 MB |
| `characters/` | 5 | 6.7 MB |
| `worlds/` | 6 | 1.6 MB |

- 聊天文件旁有 Luker 私有边车：`*.luker-state.chat_sync.json`、`*.luker-state.memory_graph__meta.json` 等。
- `user/files/` 放插件数据（`LittleWhiteBox_*.json`、`TavernDB_*_snapshot`）。
- 根上有 `settings.json`（19.9 MB）、`secrets.json`、`manifest.json`、`movingUI/Default.json`。

### 5.3 酒馆主题令牌真值（Luker 默认主题）

```
--SmartThemeBodyColor        rgb(220,220,210)   ← 文字色（深色主题里是浅色）
--SmartThemeEmColor          rgb(145,145,145)
--SmartThemeUnderlineColor   rgb(188,231,207)
--SmartThemeQuoteColor       rgb(225,138,36)    ← 插件唯一可用的强调来源
--SmartThemeBlurTintColor    rgba(23,23,23,1)   ← 面板底色
--SmartThemeChatTintColor    rgba(23,23,23,1)
--SmartThemeBorderColor      rgba(0,0,0,.5)     ← 深底不可见，别拿它画轮廓
```

---

## 六、怎么验证（照抄即可）

```bash
cd D:/Repo/Tavern-repo/My-repo/ST-zip-converter

# 1) 产品代码质量门（改 src/ 之后必跑）
npm test

# 2) demo 截图校对（改 demo 之后必跑）
node .trellis/tasks/10-26-storage-chart-workbench/deliverables/shot-demo.cjs
# 脚本随任务一起入库，自己解析仓库根与 playwright（先找本仓 e2e 解析器，再找全局安装）
# 截图输出到 test-results/ui4/*.png（gitignored）
# 覆盖：教程基础/进阶、四宿主、分卷、多包、目标平台下拉、浅色主题、Web 模式、导出区、日志弹窗+帮助、两条分隔条拖拽、批量导出
```

**判据**：末行打印 `CONSOLE ERRORS: none`；桌面/移动截图无贴边、无交错；分卷每卷 ≤ 上限且无 0 MB 空卷。

### 6.1 推送（本机特有，必看）

`git config http.proxy` 指向**已失效**的 `127.0.0.1:7891`。直接 `git push` 会失败；
`-c http.proxy=` 是「禁用代理」而不是「回落到环境变量」，也会失败（直连不通）。

```bash
env | grep -i proxy            # 看当前 $HTTPS_PROXY（本次是 127.0.0.1:12334）
git -c http.proxy="$HTTPS_PROXY" -c https.proxy="$HTTPS_PROXY" push origin main
git rev-parse HEAD origin/main  # 两行必须相等
```

---

## 七、下一步怎么做

1. `python ./.trellis/scripts/task.py current` 确认当前任务。
2. 按顺序 `task.py start 10-26-naming-injection`，实现 `src/core/naming.js` + `src/ui/host-bridge.js` 入口改造。
3. 每完成一个子任务：跑 `npm test` → 提交（显式 pathspec）→ 推送 → `task.py archive`。
4. 实现期以 demo 为唯一 UI 基准；若发现 demo 与 PRD 冲突，**先改 PRD，再改 demo，最后改代码**。
5. 收口时把规范落 `.trellis/spec/`（任务目录不是持久载体）。

### 各阶段入口文件

| 子任务 | 主要落点 |
| --- | --- |
| naming-injection | `src/core/naming.js`（新）、`src/ui/host-bridge.js`、`manifest.json`、`package.json` |
| storage-chart | `src/core/format-registry.js`（新）、`storage-inventory.js`（新）、`src/ui/storage-chart.js`（新） |
| zones-flow | `src/ui/zone-panel.js`（新）、`export-queue.js`、`workbench-template.js` |
| package-cards-vault | `src/ui/package-card.js`（新）、`src/core/package-container.js`（新）、`src/storage/db.js` |
| tutorial-copy | `src/ui/tutorial.js`（新）、`help-topics.js`、全仓文案 |
| ui-demo | 已完成，可归档 |

---

## 八、雷区（本任务专属）

1. **CSS 双前缀铁律**：`style.css` 每条规则必须带 `.app-container` 或 `.st-converter-drawer-app` 前缀；裸酒馆类名会污染全站（2026-09 真实事故）。品牌色只能出现在自定义类上。
2. **`[hidden]` 压不过同特异度 `display`**：`select`/`div` 写了 `display:flex` 就必须另写 `[hidden]{display:none}`。demo 里 `.batch-bar[hidden]`、`.picker-pop[hidden]` 都是为此而写。
3. **`display:contents` 只改布局树不改 DOM 树**：选择器要按 DOM 写（`.col-side > *` 而不是 `.app-main > *`），否则移动端面板会被压成 2px。
4. **分卷只在顶层切会撑破卷**：必须下钻到子项；单文件超上限要显式标记，不能静默。
5. **`-c http.proxy=` 不是回落**：见 §6.1。
6. **销毁/重建 Worker 后必须置空引用**（`034b7ab` 教训），本次不涉及但改 worker 时要记住。
7. **不要改 `src/vendor/`**；不要写本地酒馆实例目录。

---

## 九、未决 / 待验

| 项 | 状态 | 怎么验 |
| --- | --- | --- |
| TT `fs` scope 是否覆盖 `$APPDATA/data` | 未验 | 在 Dev TT 实例实测 `window.__TAURI__.fs.readDir`；被拒则降级「整包备份反推」并标注低精度 |
| `user/files/` 上行 500 MB 上限对分卷的影响 | 未定 | 分卷上限 2048 MB 可能超过上传接口 body 上限，实现时需按目标宿主能力取 min |
| Luker `storage/inspect` 的分页与深度 | 未验 | 对 Dev Luker 实测钻取层级与响应大小 |
| 大包性能阈值（虚拟滚动触发点） | 未定 | 用真实 3769 文件扩展目录压测后定 |

---

## 十、与旧任务的关系

- `10-14-workbench-overhaul`（planning，0/3）、`10-24-ui-orchestration-r2`（planning，4/4）未动，本计划不依赖它们。
- `10-01-safe-migration-productization`（planning，12/12）仍是上一阶段总任务。
- 上一阶段背景见记忆 `st-zip-converter-safe-migration-initiative`。
