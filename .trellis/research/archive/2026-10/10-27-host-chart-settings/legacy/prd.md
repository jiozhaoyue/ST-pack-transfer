# 宿主图表置灰与设置收敛

## Goal

删除宿主图表说明文案并真实置灰；设置页只保留 3 个开关，设置按钮改齿轮，3 项真正接线并持久化；demo 先行。

## Requirements

- R1 **删除宿主图表说明文案**：删除 `src/ui/workbench-view.js:417` 的整条 notice
  （「当前形态没有存储清单端点 / 宿主图表置灰；下方仍可查看插件自身数据 / 不新增该宿主专用后端」）。
  面板正文不得再出现说明性整句（R10.3）。
- R2 **宿主图表真实置灰**：当宿主无存储清单能力（ST、独立 Web、或没有 `hostTree`）时，
  图表卡视觉灰化、树不可勾选/展开、带 `aria-disabled`；**不得**为了显示图表新增任何宿主专用后端或端点。
- R3 **下方仍可查看插件自身数据**：`navigator.storage.estimate()` 的「浏览器配额」行照常显示。
- R4 **设置页只保留 3 项开关**：导出区保留、后端上下传流量提示、基础教程自动打开。
  删除其余 8 项：压缩、扩展包、Git 历史、保留构建配置、backups 快照、派生缓存、私有配置、清理原生资产。
- R5 **设置按钮改齿轮**：`src/ui/workbench-template.js:21` 的太阳能 SVG 换成齿轮。
- R6 **共享设置面板**：抽出 `src/ui/settings-panel.js`，`index.js` 与 `src/ui/ui-demo.html` 共用；
  demo 必须先能看到 3 项设置。
- R7 **3 项真正接线**：
  - `keepExport`：控制生成后是否在导出区保留只读副本（关闭时不保留，需在实施设计里定义下载/删除行为）。
  - `trafficPrompt`：控制 `fetchFromHost` / `restoreToHost` 前是否弹流量确认；关闭即不再提示。
  - `autoTutorial`：控制首次进入是否自动打开基础教程。
- R8 **持久化**：设置写入 `localStorage`（键 `st-pack-transfer:settings`），启动读取；非法/缺省回默认。
- R9 **demo 先行**：`npm run dev` → `http://127.0.0.1:3040/src/ui/ui-demo.html` 可验证全部行为。
- R10 **规则深化**：本任务结论写回 `.trellis/spec/frontend/`（设置承载边界、宿主图表降级）。

## Constraints

- CSS 双前缀：所有新规则带 `#app.app-container`；禁止裸 `.menu_button` / `.checkbox_label`。
- 不新增宿主后端；不改 `src/vendor/`；不改宿主源码。
- 修改现有文件用块级 `Edit`；提交用显式 pathspec。

## Acceptance Criteria

- [ ] AC-1 宿主图表不再显示那条说明文案；降级时图表卡灰化且不可交互；浏览器配额行仍可见。
- [ ] AC-2 设置弹窗恰好 3 行开关，无 Git/压缩/扩展包/构建/backups/缓存/私有/清理。
- [ ] AC-3 设置按钮为齿轮图标（非太阳）。
- [ ] AC-4 刷新页面后 3 项设置保持；清除 localStorage 后回默认。
- [ ] AC-5 `trafficPrompt` 开/关分别有无流量确认弹窗；`autoTutorial` 开/关分别自动打开/不打开；
  `keepExport` 开/关分别保留/不保留导出副本。
- [ ] AC-6 demo 截图（设置 3 项、齿轮、宿主置灰、浏览器配额）+ `npm test` + 五守卫全绿。

## Notes

- 本任务只做 P1+P2；图表虚拟节点与 i18n 在兄弟任务。
- 交接证据：`10-26-storage-chart-workbench/HANDOFF-2026-10-27-UI-TRACE.md` §0 / §3 / §4。
