# PLAN-2026-11-08 · UI 全面异常热修（最小侵入）

## 背景

- 用户报告：**UI 全部异常**（2026-11-08）。要求：本地 dev 运行测试，完全修复。
- 上游变更：Session 64（`1533ac3`）接回四项能力——断点续传（`src/app/conversion-runner.js`）、
  暂停/继续/中止、转换报告（`view.showReport`）、待导出区（`ExportQueue` + `#pending-exports`），
  且交接明记**未做真实浏览器实测**。单测 961 passed / 2 skipped 全绿 ⇒ 错误在浏览器运行时层。

## 约束

- 最小侵入：只修导致异常的最小集合，不顺手重构；块级 Edit，禁整文件覆盖。
- dev 端口避开保留段与被占的 3040（用 5173 显式端口）。
- 完全修复 = 真机（浏览器）复验通过 + `npm test` 全绿 + 三守卫 + `npm run build` 通过。

## 步骤

- [x] 1. 起 dev server（5173），browser 打开独立页，采集：截图 + console 报错 + DOM 缺口
- [x] 2. 定位根因（见下）
- [x] 3. 最小侵入修复（Edit 块级，共 2 行），逐项复验 UI
- [x] 4. 回归：npm test + check:css-scope / check:dom-injection / check:template-source + build
- [x] 5. 提交推送（显式 pathspec），更新本计划勾选，mini-trellis 记录会话

## 结论（已验证）

**根因（唯一、系统性）**：`index.js:992` 向 `createWorkbenchView` 传入的 actions 对象里，
待导出区两个动作写成简写属性 `pendingDownload,` / `pendingStash,`，而控制器内这两个函数
实际名为 `downloadPending` / `stashPending` → 构造对象时抛
`ReferenceError: pendingDownload is not defined` → `main()` 在视图构造后当场死亡 →
其后全部接线未执行：宿主徽标 / 文件监听 / `syncPackages` / 动作行按钮（生成·拉取·合并）/ LAN / 配额 / 日志订阅全灭。
单测全绿（961 passed）不拦它：`index.js` 的 DOM 接线层无单测覆盖。

**修复**：`index.js:992-993` 改为 `pendingDownload: downloadPending,` / `pendingStash: stashPending,`（2 行）。

**真机验证（localhost:5173，IAB）**：
- 初始化零未捕获异常；`count-import/export` 由模板占位 4/1 变为真实 0/0；
- 动作行按钮齐全（从宿主拉取 / 生成导出包[无勾选时正确禁用] / 合并上传 / 局域网互传 / 云端仓库）；
- 配额条真实读数（0.0 GB / 220.1 GB · 0%）、宿主配额「未提供」、Web 徽标、ST 图标正常；
- 冒烟：导入↔导出页签切换 ✓、设置视图打开 ✓、日志视图「工作台已就绪 · Web」✓。

**回归**：`npm test` 961 passed / 2 skipped；三守卫全过；`npm run build` ✓。

**附注**：排查中 fullPage 截图出现「工作台 4 份平铺」为 IAB 截图对 fixed 元素的伪影，非产品 bug（DOM 仅 1 份、命中测试干净）。
**教训**：新增接线引用既有函数时必须先确认函数名；actions 简写属性是这类 ReferenceError 的高发位，且会以「整页半残」形态出现。
