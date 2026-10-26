# 存储图表工作台 · 交接（2026-10-27 全面重构后）

> 自包含：新会话读完这一份即可接手，不需要回溯对话。
> 权威顺序：`prd.md` > `design.md` > 本文件（状态与操作指南）。

---

## 一、一句话现状

**UI 已按 `deliverables/ui-demo.html` 原样重写并落地**：旧 UI 层（布局 / 组件 / 兼容容器 / 旧测试）已全部删除，
`src/ui/workbench-view.js` 是 demo 渲染脚本的逐行搬运，只在「数据来源 / 动作」两处接真实管线。
`npm test` **859 passed / 2 skipped**，五个静态守卫全绿，`npm run build` 通过，独立 Web 的上传→图表→转换链路已实测。

---

## 二、本轮改了什么（文件级）

### 新增

| 文件 | 作用 |
| --- | --- |
| `src/core/chart-model.js` | 真实计划 → demo 同款树；三态、勾选汇总、分卷下钻、序号、折行判定（纯逻辑） |
| `src/ui/workbench-view.js` | **demo 的 `<script>` 原样搬运**：渲染 / 事件 / 教程 / 帮助 / 日志 / 分隔条；只注入 `actions.*` 与 `setPackages/setHost/setActivePackage` |
| `src/app/task-runtime.js` | 从旧控制器抽出的**任务运行时**（批次 / 断点 / 半成品 / 调试探针），非 UI |
| `.trellis/spec/guides/instance-testing-discipline.md` | 实例测试硬纪律（最多 2 个实例、只准 Dev、禁自动开浏览器） |

### 重写

| 文件 | 说明 |
| --- | --- |
| `src/ui/workbench-template.js` | 由 demo 的面板 HTML **逐字生成**（构建脚本 `test-results/mktemplate.cjs`，不手改） |
| `style.css` | 由 demo 的 `<style>` **逐条搬运 + 容器作用域**（`test-results/mkstyle.cjs`）；固定深色令牌；独立页底色深色 |
| `index.js` | 全新控制器：宿主探测 / 包仓库 / 计划 / 转换 / 恢复 / 局域网 / 设置，全部通过视图 API |

### 删除（不再保留任何旧 UI）

`workbench-shell.js`、`workbench-layout.js`、`view.js`、`category-filter.js`、`category-detail-panel.js`、
`file-tree-picker.js`、`stash-list.js`、`usage-dashboard.js`、`vault-panel.js`、`log-console.js`、
`onboarding-guide.js`、`help-topics.js`、`action-colors.js`、`task-controls.js`、`file-drop.js`，
以及只服务它们的测试（`workbench-shell/layout`、`category-filter-render`、`stash-list*`、`ui-verb-table`、`vault-panel-render`、`help-topics`）。

---

## 三、主题与配色（已定稿）

- **架构**：颜色仍走宿主令牌体系；`style.css` 只读取 `--SmartTheme*` 并提供回退。
- **当前**：容器内**固定深色令牌**（用户 2026-10-27 裁定「现在只用深色」），不再跟随宿主浅色。
- **独立页**：`index.html` 内联 `html,body{background:#0b0b0d}`，面板不再白底。
- 品牌色只出现在标识（包卡图标环 / 宿主角标 / 下拉图标）。

---

## 四、已实测读数

| 项 | 结果 |
| --- | --- |
| `npm test` | 859 passed / 2 skipped（80 文件通过） |
| `check:css-scope` / `dom-injection` / `template-source` / `dom-scope` / `control-consumer` | 全 PASS |
| `npm run build` | 通过（dist 正常产出） |
| 独立 Web 上传→扫描→图表 | `e2e-sample-st.zip` → 3 个分组 / 3 个文件；展开 4 行；勾选 3 项 |
| 生成导出包 | 导出区出现 1 个只读副本，进度「导出包已就绪」 |
| 局域网 / 设置 / 日志面板 | 均可打开；局域网已主题化卡片，不再白底浮框 |

---

## 五、未完成 / 已知问题（按优先级）

1. **实例侧旧矩阵/仓规格仍按旧 UI 写**：`e2e/specs/matrix.e2e.cjs`、`vault.e2e.cjs` 仍引用已删除节点。
   **运行器已改用 `e2e/specs/newui.e2e.cjs`**（真实路径打开 → 上传 → 图表 → 四目标切换 → 生成导出包），
   `smoke` 也已改为新节点。旧矩阵文件保留在仓库里待归档，**不要再用它判定回归**。
2. **局域网面板已按 Luker / TT 结构重写**（peer row / 角色切换 / 阶段+进度条 / 能力徽标），
   并用两个浏览器上下文实测：offer/answer 交换成功、双方 100%、接收端得到同名包、零报错。
   仍需在**两台真实设备**（不同机器）复验 mDNS 与扫码形态。
3. **宿主自动开浏览器**：Dev ST / Luker 的 `config.yaml` 已设 `browserLaunch.enabled: false`，
   但历史上实例已在运行时仍会开标签；需在**重启后**确认。禁止与其它自动开浏览器的工具同时运行。
4. **设置弹窗是动态渲染**：`#set-*` 控件不在模板里，静态守卫不覆盖；改设置项时同步改
   `index.js` 的 `openSettings()`。
5. **旧任务链**：`10-26-storage-chart / zones-flow / package-cards-vault / tutorial-copy` 的 PRD 仍按旧结构写，
   其中「单一图表 / 分区流转 / 包卡 / 教程」已由本轮 demo 搬运实现；**收口时需要按新实现回填验收**。

---

## 六、下一步怎么做

1. 先读 `instance-testing-discipline.md`，**最多起 2 个实例**，默认只起 1 个：
   ```bash
   node scripts/run-e2e-instances.cjs --only dev-st
   ```
2. 重写 `e2e/specs/matrix.e2e.cjs` 与 `vault.e2e.cjs` 到新 UI（选择器见模板 id）。
3. 重写局域网面板结构，对标 Luker / TT；协议层保持现有 WebRTC 取件码。
4. 每步：`npm test` + 五守卫 → 提交（显式 pathspec）→ 推送 → `task.py archive`。

---

## 七、关键文件地图

| 区域 | 文件 |
| --- | --- |
| 模板（唯一来源） | `src/ui/workbench-template.js`（由 demo 生成，勿手改） |
| 视图（demo 渲染） | `src/ui/workbench-view.js`（勿改渲染逻辑，只接 `actions`） |
| 控制器 | `index.js` |
| 图表模型 | `src/core/chart-model.js` |
| 任务运行时 | `src/app/task-runtime.js` |
| 样式 | `style.css`（demo 样式 + 容器作用域；固定深色） |
| 生成脚本 | `test-results/mktemplate.cjs`、`test-results/mkstyle.cjs`（改了 demo 后重新生成） |
| 实例纪律 | `.trellis/spec/guides/instance-testing-discipline.md` |

---

## 八、雷区

1. **CSS 双前缀**：`style.css` 每条规则的主体必须是 `#app.app-container`（或自有浮层 id）；裸选择器会污染宿主。
2. **`[hidden]` 压不过同特异度 `display`**：默认隐藏容器若写了 `display`，必须另写 `[hidden]{display:none}`。
3. **实例并发**：**最多 2 个**，默认 1 个；PT/TT 必须单独跑。
4. **禁止与其它自动开浏览器的工具并行**；`browserLaunch.enabled` 必须为 `false`。
5. 改 demo 后必须重新跑生成脚本，否则模板/样式与 demo 漂移。
