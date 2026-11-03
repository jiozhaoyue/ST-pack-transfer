# 设计：迁移向导默认入口 · 强制不兼容 · 离线单文件

> 目标规范：`.trellis/spec/frontend/migration-user-journey.md`、`migration-safety-and-evidence.md`、
> `migration-compatibility-and-release.md`。本文件只写**本片怎么落地**，不重复既有契约。

## 1. 边界与分层

| 层 | 文件 | 允许依赖 | 本片新增 |
| --- | --- | --- | --- |
| 纯逻辑 | `src/core/migration-session.js` | 无 DOM / 无 window / 无 fetch | `SESSION_SCHEMA_VERSION`、`classifySessionCompatibility`、`readSessionRecord` |
| 纯逻辑 | `src/ui/migration-wizard.js` 的**纯导出** | 无 DOM（模块内 DOM 部分集中在 `mountMigrationWizard`） | `WIZARD_STEPS`、`createWizardMachine`、`nextStepId` / `prevStepId`、`buildSessionGateVerdict` |
| DOM | `src/ui/migration-wizard.js` 的 `mountMigrationWizard` | DOM | 步骤切换、视图切换、键盘导航、`rAF` 进度合帧 |
| 模板 | `src/ui/workbench-template.js` | 无 | 向导骨架（步骤条 + 视图开关 + 不兼容门）、既有区块加 `data-wb-step` |
| 编排 | `index.js` | 全部 | 装配向导、默认入口、不兼容门的消费 |
| 样式 | `style.css` | 无 | 向导样式（双前缀） |
| 构建 | `scripts/build-offline.mjs` | Node | 单文件离线产物 |

**为什么把向导放进 `src/ui/` 而不是 `src/core/`**：向导必须改 DOM；但它的**状态机与判据**抽成纯函数放在同模块顶部，Vitest 默认 `environment: 'node'`（本仓无 jsdom），故可测面必须是无 DOM 的导出。

## 2. 强制不兼容（B1）

### 2.1 契约

```text
SESSION_SCHEMA_VERSION = 2

classifySessionCompatibility(record) -> {
  compatible: boolean,
  action: 'continue-supported' | 'reject-incompatible',
  reason: string          // 中文，可执行
}
```

判定：**只有** `record` 是对象且 `record.schemaVersion === 2` 才 `continue-supported`。
其余一律 `reject-incompatible`，且**区分原因**：

| 输入 | reason |
| --- | --- |
| 非对象（null / 字符串 / 数组） | `会话记录无效（不是对象）` |
| 缺 `schemaVersion` | `旧记录未带版本签名，已按不兼容作废` |
| `schemaVersion === 1` | `旧会话版本 1 已作废（当前 2），须从源重开` |
| 其它数字 | `未知会话版本 N，须从源重开` |

### 2.2 与旧实现的差异（本片的破坏性核心）

旧实现 `normalizeLegacySession` 缺字段**补 1** 并标 `legacy`，`KNOWN_SESSION_SCHEMAS=[1]`
⇒ **v1 记录被判为「可续跑」**。本片：

- **删除** `normalizeLegacySession`（无生产调用者后）；
- 新增 `readSessionRecord`：**只读解释**（原字段原样带出 + 兼容结论），**不写回、不补默认**；
- `isResumableSession` **先过兼容判定**——不兼容即返回 `{resumable:false, reason}`，
  连断点都不看（避免"断点齐全就放行"的隐式兼容）。

**为什么连结构未变的 v1 也拒**（用户 U-1 原话："任何即使没改也要强制不兼容"）：
"看起来一样" 是**推断**，不是**证据**；只要版本签名不同就必须走安全重开，避免
"字段恰好没变 ⇒ 静默沿用旧授权/旧断点" 这一类不可解释的续跑。

### 2.3 `db.js` 侧

- `saveWorkspaceState` 写入 `schemaVersion: SESSION_SCHEMA_VERSION`；
- `loadWorkspaceState` **原样返回**（不删、不迁移、不覆盖）——判定权在上层；
- `active_session_prev` 备份保留（**不丢用户数据 ≠ 兼容旧格式**）。

## 3. 向导与默认入口（B2）

### 3.1 六步与 DOM 归属（**不复制模板**）

向导是既有工作台 DOM 的**渐进披露外壳**，不是第二份 UI：

| 步 | id | 复用既有区块 |
| --- | --- | --- |
| ① 来源 | `source` | `.wb-block-status` 的暂存区（dropzone / stash-list） |
| ② 目标 | `target` | `.output-row` + 包名折叠 |
| ③ 范围 | `scope` | `#category-panel` + 垃圾清理 / 扩展打包 / 增量折叠 |
| ④ 检查 | `check` | `#plan-summary-bar` + 排除/风险读数 |
| ⑤ 执行 | `run` | `.action-row` + `#progress-container` + `#task-controls` |
| ⑥ 核对 | `verify` | `#report-panel` + `#export-queue-panel` |

机制：容器上写 `data-wb-view="wizard|advanced"` 与 `data-wb-step="<id>"`；
CSS 用 `[data-wb-view="wizard"] [data-wb-step]:not([data-wb-step="<当前>"])` 隐藏非当前步。
**高级视图 = 既有全量展示**（去掉 `data-wb-view` 限定即恢复原状），故旧行为零破坏。

### 3.2 状态机（纯）

```text
createWizardMachine() -> {
  getState() -> { stepId, visited: string[], stale: boolean },
  goTo(id), next(), prev(),
  markStale()      // 关键输入变更 ⇒ ④ 检查及其后的确认失效
}
```

`markStale()` 与 `createMigrationPlan` 的 `revision` 单调递增是**同一件事的两个面**：
向导侧只负责把"旧确认已失效"显性化（`migration-user-journey.md` §7 的三条断言）。

### 3.3 共享状态

向导与高级工作台共用 `createMigrationSession()`（`src/ui/migration-controller.js`）。
视图切换**只改 `data-wb-view`**，不触碰 session，故选择/计划/任务天然不丢。

### 3.4 可访问性

- 步骤条为 `<nav>` + `<button role="tab">` 语义（`aria-current="step"`）；
- 键盘：`←/→/Home/End` 在步骤条内移动焦点，`Enter/Space` 激活；
- 步骤切换后把焦点移到该步的标题（`tabindex="-1"`）；
- 进度更新仍走既有 `rAF` 合帧路径（`L1-MR-9`），本片不改。

### 3.5 不兼容门

向导首屏（步骤 ①）之上叠加 `#wizard-gate`：当 `buildSessionGateVerdict(record)` 判定
`reject-incompatible` 时显示标题 + `reason` + 「从源重开」按钮；此时**执行步禁用**。
门是**显式拒绝**，不是"静默忽略旧记录"。

## 4. file:// 单文件离线产物（B3）

### 4.1 为什么现有构建不行

`npm run build` 产出 `dist/index.html` + `type="module"` 脚本。`file://` 下 module 脚本
被 CORS 拒（`public/file-protocol-notice.js` 就是为此存在的提示）。故离线产物必须：
**单个 HTML + 内联非 module 脚本 + 内联 CSS**。

### 4.2 构建路径（不引新依赖）

用 Vite 既有能力产 IIFE：

```text
vite build --base=./ --outDir dist-offline --lib ...
  → 单 JS（iife）+ 单 CSS
scripts/build-offline.mjs  → 读 dist-offline 产物，内联进 index.html 骨架 → dist-offline/st-zip-converter-offline.html
```

内联纪律：`</script>` 需转义为 `<\/script>`；CSS 直接进 `<style>`；
产物**零** `http(s)://` 引用（字体/图标走本地 `src/vendor/fontawesome`）。

### 4.3 Worker

离线产物里 `new Worker(...)` 在 `file://` 下不可用；`src/core/worker-client.js` 已有
"无 Worker ⇒ 主线程降级"分支，故**只需让 Worker 构造失败即自然降级**——
但为了让降级**确定**而不是"碰运气失败"，离线产物注入 `window.__ST_ZIP_OFFLINE__ = true`，
`worker-client.js` 见到它直接走主线程。

## 5. 兼容与回退

- **回退点 1**：不兼容门是纯增量——`git revert` 该文件即恢复旧归一语义（但**旧数据已按新契约作废**，回退代码≠回滚数据）。
- **回退点 2**：向导默认入口通过 `data-wb-view` 一个属性控制；把默认值改回 `advanced` 即恢复既有工作台为默认。
- **回退点 3**：离线构建是**新增脚本**，不进 `npm run build`，失败不影响既有发布形态。

## 6. 风险

| 风险 | 处置 |
| --- | --- |
| 向导隐藏区块导致控件"看不见但存在"，消费点守卫通过而实际不可达 | 步骤归属写进模板的 `data-wb-step`，并在单测里断言六步覆盖全部 `REQUIRED_TEMPLATE_IDS` 所属区块 |
| 强制不兼容让老用户"东西没了" | 只作废**会话状态**；包/半成品文件不删（C-5），门文案显式说明"文件仍在，需重新选源" |
| 内联产物体积膨胀 | 记录产物体积；字体图标仅内联被引用的 woff2，其余保持引用（同目录相对路径） |
