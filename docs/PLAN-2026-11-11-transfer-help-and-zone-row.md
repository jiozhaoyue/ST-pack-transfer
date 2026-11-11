# PLAN-2026-11-11 · 迁移教程入口 + 恢复模式归位 + 数据包演示数据与待导出区去除

> 来源：2026-11-11 用户第五轮裁定（口头，逐条）。只改 UI 结构与演示数据，不动转换核心。

## 一、用户裁定

1. **迁移与备份面板头也要 `?` 教程**（与图表 / 扩展管理 / 数据包一致）。
2. **所有数据包教程全部更新**（导入 / 导出 / 多宿主多包 / 恢复模式）。
3. **演示数据**：导入区含**所有宿主**的包，同宿主可多个、排列组合，合计 **6–10 个**，
   体积 **16 MB – 4 GB**；导出区也放**多条**。
4. **删除「本次待导出」两列区块**（`#pending-exports`：本次待导出 / 清空 / 文件名 / 大小 / 下载 / 存入工作区 / 移除）。
5. `从宿主拉取` 与 `数据包模式`→**改名「恢复模式」** 这一行，移到 `导入 / 导出` 页签**右侧**，仍随模式切换。

## 二、判据

### K1 迁移教程入口

- `#transfer-view .panel-actions` 内存在 `<button class="help-btn" data-help="transfer">?</button>`。
- 点击打开帮助视图，标题为 `HELP.transfer`，含局域网 / 云端仓库 / 恢复模式三段说明与链接。
- 头内切换行与两个页签不变；**仍然没有任何 ×**。

### K2 教程与演示数据

- `state.tutorialMode` 下导入区包数在 6–10 之间，宿主覆盖 `st / luker / tt / pt`，同宿主至少一个重复；
  体积分布覆盖 16 MB 与 4 GB 两端。
- 导出区条数 ≥ 3（含多条同宿主）。
- 数据包教程（`TUTORIAL_GOALS` 的转换目标）依次覆盖：导入区多包 → 勾选 → 目标平台 →
  生成导出包 → 导出区 → 恢复模式（覆盖/增量）→ 上传/下载。

### K3 恢复模式行归位

- `#zone-tabs` 一行内：左 `导入 / 导出`，右 `从宿主拉取`（仅导入）+ `恢复模式` + `覆盖/增量`。
- `#zone-mode-row` 不存在；`renderZoneModeRow()` 仍按 `state.zone` 控制显隐。
- 窄屏不横向溢出，控件文字不拆行。

### K4 待导出两列去除

- 模板中不存在 `#pending-exports` / `.pending-head` / `.pending-row`。
- 产物仍可下载 / 存入工作区 / 移除：导出区列表中渲染为条目，底部动作栏路由到
  `pendingDownload` / `pendingStash` / `pendingRemove`。
- 对应 CSS、i18n 键、控件守卫声明、模板源登记一并删除，禁止残留死引用。

## 三、改点

| 文件 | 改动 |
| --- | --- |
| `src/ui/workbench-template.js` | 迁移面板头加 `?`；`#zone-mode-row` 内容移入 `#zone-tabs` 右侧；删除 `#pending-exports` |
| `src/ui/workbench-view.js` | `HELP.transfer`；`renderPendingExports` 改为在导出区渲染队列条目；`renderZones` 导出区包含队列；教程目标与步骤更新；`buildDemoPackages()` 重写 |
| `style.css` | 删除 `.pending-*`；`#zone-tabs` 右侧模式组对齐（复用 `.zone-delta-row` 基线） |
| `src/i18n/locales/*.js` | `chart.deltaLabel` → 恢复模式；新增 `help.transfer.*`；删除 `pending.*`；教程文案更新 |
| `README.md`、`docs/DEVELOPER-GUIDE.md`、`.trellis/spec/frontend/workbench-single-view.md` | 同步入口、演示数据与待导出区移除的契约 |
| `scripts/control-consumer-guard.js`、`scripts/single-template-source.js` | 删除 `pending-*` 登记，新增 `help.transfer` 不涉及控件 |

## 四、验证

- 六条静态守卫 → `npm run build` → 全量 `npm test`。
- 无头截图：迁移面板 `?`、演示导入区 6–10 包（宿主/体积）、导出区多条、恢复模式行在页签右侧、
  导出区无两列待导出块。

## 五、状态

- [ ] 计划落盘
- [ ] 迁移 `?` 教程
- [ ] 恢复模式改名与行归位
- [ ] 演示数据与教程更新
- [ ] 待导出两列去除
- [ ] 文档同步 / 守卫 / 构建 / 测试 / 截图
