# 跨会话续跑必读（session continuity）

> 本文件已入库（`.trellis/spec/guides/`）。只放跨会话可复用的技术事实与基线，不放个人操作流水与隐私。
> 完整会话流水与逐条指令见 `.trellis/research/handoff-2026-11-19-full-session.md` 与 `.trellis/research/handoff-2026-11-20-full-session.md`（research 已 gitignore，仅存本地）。
> 更新于 2026-11-20。

## 1. 测试与守卫基线（续跑前先对齐）

- 全量：`1600+ passed / 14 skipped`（168+ 测试文件；本次新增脱敏、门禁、双通道测试 100% 通过）。
- `npm run verify:rules`：全部 MUST 通过。
- 五道 UI 守卫全过：`npm run check:css-scope` / `check:dom-injection` / `check:template-source` / `check:dom-scope` / `check:control-consumer`。
- 规则引用可达：`node tooling/rules/run.mjs --only=rule-paths-resolve`（扫描 29 文件，97 引用 0 断联）。
- 铁律 42~44 正式入库：脱敏明示告知禁静默丢弃、纯内容级硬扫描门禁（废弃外挂 watermark 信任）、双通道动态识别零硬编码。
- `npm run docs:verify` 通过；`npm run docs:update` 刷新基线。
- `npm run check:rule-paths`（rule-paths-resolve，94 引用 0 断联）、`npm run check:tavern-block`（tavern-block-integrity）。
- 一条命令复跑：`npm test && npm run verify:rules && npm run docs:verify && npm run check:rule-paths && npm run check:tavern-block`。

## 2. TT 环境备忘

```bash
# TT 前端静态服务（后台独立进程）
cd <TT_ROOT> && nohup node scripts/tauri-dev-server.mjs &

# TT exe + CDP（最小化，不抢前台）
WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS="--remote-debugging-port=9223" \
  <TT_ROOT>/src-tauri/target/debug/tauritavern.exe

# 同步插件到 TT（必须整份 src，缺文件会导致插件静默不激活）
TT_DIR="$APPDATA/com.tauritavern.client/data/default-user/extensions/ST-pack-transfer"
rm -rf "$TT_DIR/src" && cp -r src "$TT_DIR/src"
cp -f index.js style.css manifest.json README.md "$TT_DIR/"
```

- CDP 端口 `9223`，TT 前端根 `http://tauri.localhost/`。
- **插件安装 = 四件（index.js/style.css/manifest.json/README.md）+ 完整 `src/`**。只同步改动文件会导致 `src/core/` 缺 13 个依赖 → `workbench-view.js` import 链断 → `index.js` 加载失败 → 插件**静默不激活**。
- **就绪判据**：`document.querySelector('#st-pack-transfer-open-btn') !== null`。**禁止**用 `__TAURITAVERN__` 判断（TT 侧该全局恒为真，不能证明本插件激活）。
- 会话记录脚本：`.trellis/scripts/add_session.py`（`session_auto_commit: false`，不自动提交；workspace/research 均 gitignore，见规则 21）。

## 3. 已确证的反直觉事实（不要再走弯路）

1. **TT 无 `/api/users/me`**：TT 是单用户桌面应用，该端点返回 404（`Unsupported endpoint`），`/api/users/list`、`/api/settings/get` 同样 404。身份必须同步读 `SillyTavern.getContext().name1`（零网络 0ms），管理员只认宿主 `admin` 布尔。出处 `src/ui/host-bridge.js:797-836`。
2. **`.bin` 有三种互斥语义**：向量库 / DB dump / 图片双扩展名；扩展名不承载语义。分类一律按路径前缀，不按扩展名。`.bin` 归 `other-binary`，不归 `model`/`image`。
3. **包卡体积真源是 `chart-model.fmtMB`**（`src/core/chart-model.js`），不是 `src/ui/workbench-view.js` 的同名函数（后者只服务图表/统计）。旧 `<1KB` 取整会把 462 B 显示成 0 KB；现改为字节单位。
4. **GitHub Push Protection 拦截测试令牌格式串**：测试里不得出现真实形态 token 字面量，必须用拼接构造。
5. **`assets` 语义 = 附件（attachment）**，不是图片、不是素材；图表显示必须标附件组。
6. **`tavern-harness` ≠ 基石**：前者是规则同步器（分发中枢），基石是 `ST-Delegation-of-authority`（Authority 后端插件，八项能力 + 权限治理）。本仓 Authority 唯一接入点 `src/storage/authority-store.js`（仅 storage.kv/blob）。

## 4. 关键真源路径

- 规则四件套（本仓本地规范）：`.trellis/spec/guides/iron-rules.md`、`.trellis/spec/guides/rule-catalog.md`、`.trellis/spec/guides/rule-details.md`、`.trellis/spec/guides/subagent-collaboration.md`。
- 离线包体检（五层 A+B+C+D+E）：`src/core/inspect.js` + UI `src/ui/inspect-view.js`；测试 `test/inspect.test.js`。设计依据 `.trellis/research/inspect-design.md`。
- 问题报告模块：`src/ui/issue-report.js`；测试 `test/issue-report.test.js`；隐私底座 `.trellis/research/issue-report-privacy-redteam.md`、设计 `.trellis/research/issue-report-design.md`。
- 日志统一脱敏：`src/core/logger.js`（`redact()` 8 类 + `safeDetail()`）。
- 规则守卫：`tooling/rules/checks.mjs`、`tooling/rules/run.mjs`。

## 5. 待办清单（含命令）

| 事项 | 阻塞点 | 下一步命令 |
| --- | --- | --- |
| 问题报告 UI 接线 | 模块已完成，template/view/i18n 与设置登记表待补 | 补 `SETTINGS_DEFAULTS`/`SETTING_KEYS`/`normalizeSettings`/`buildSettingsHtml`/`readSettings` 后 `npm test && npm run check:i18n && npm run check:dom-injection` |
| 其余 13 个 tavern-harness 目标仓 hash drift | 规则已改、目标仓未同步 | `cd <tavern-harness> && python scripts/harness.py rules --dry-run` → 逐仓 review → `--apply` → `--verify` |
| `tavern-harness/rules/generated/` 未重渲染 | 注入块声明哈希与正文曾静默漂移 | `python scripts/harness.py rules --render` 后重跑 `--verify`；勿手改注入块 |
| 11 条规则上流 | contributions 三步回流未走（须 PR，不能直接 push 基石仓） | `tavern-harness/registry/contributions.json` 追加 U-01~U-11 status=proposed，PR 标题前缀 `[contribution]` |
| 教程态导入真实包提示（D2） | 演示态导入真实包无提示；退出入口 `#tutorial-banner-exit` | 教学态导入真实包时给明确提示 |
| docs 截图重拍 | 改根 `style.css` 后 24 图触发 docs-sync 漂移 | `npm run docs:shots && npm run docs:update && npm run docs:verify` |
| 日志桥接/UI 导出收尾 | 两套日志单向桥接丢 detail，导出是三字段降级版 | 统一数据源或桥接保留全字段；`exportText()` 接入生产 |
| chart-model assets→images 显示复核 | 分类审计结束快照 `:37,55` 仍 `assets:'images'`（并发改动中，行号可能漂移） | 复核 `src/core/chart-model.js`；若为 images 则改附件组并重跑 `test/category-classification.test.js` |
