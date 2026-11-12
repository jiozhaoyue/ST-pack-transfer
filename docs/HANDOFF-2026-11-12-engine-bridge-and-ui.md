# HANDOFF 2026-11-12 · 存储引擎互转 + 图表/教程/响应式 + Playwright 无头实测

> 本会话（2026-11-12）全部改动已提交并推送：`990eddf` → `f4d84c0` → `ec394aa` → `d2bbbf6` → `48d4556`。
> 交接对象：下一个会话。读完本文件即可继续，不必重读源码。

## 一、交付了什么

### 1. Luker 存储引擎互转（零临时数据库）

- 新增：`src/core/engine-model.js`、`engine-registry.js`、`engine-bridge.js`、`sqlite-init.js`、
  `src/core/engine-adapters/{fs,jsonl-dump,sqlite}.js`、`src/vendor/sqljs/`（sql.js 1.16.0 内联 WASM + `package.json` type=commonjs）。
- `transform.js` 新增选项：`engine`（`fs|postgres|mysql|sqlite`）、`engineHandle`、`sqliteInit`。
- UI：Luker 目标时图表出现「存储引擎」下拉（`#target-engine`）。
- **跨宿主**：非 L 目标自动以 `targetEngine='fs'` 中转，生成文件后走同一个 `targetEntryPath()`。
- 契约：`.trellis/spec/frontend/engine-bridge.md`。

**实测读数（真实样本 `zip/Luker_default-user_part1_2026-11-11_23-57-46.zip`，208 MB / 8391 条目）**
- PG→FS：5.7 s，256 行；逐表与独立 Python 统计一致，坏行 0。
- PG→FS→PG：9 表 `doc` 哈希逐行比对 **IDENTICAL**。
- PG→SQLite：用宿主 `better-sqlite3` 实读通过（`user_version=1`、9 表行数一致、`integrity` 生成列有值）。
- PG→TauriTavern：`data/default-user/settings.json` 值来自数据库行，无 dump。

### 2. UI（2026-11-12 用户中途追加）

| 需求 | 实现 |
| --- | --- |
| 多图表十字交界可拖 | `.chart-split-x[data-split="both"]`，一次改列宽+该行高度 |
| 空间不足优先隐藏占用可视化 | `.vol-card.is-tight .vol-chart{display:none}` + `initChartTight()`（高<190/宽<300） |
| 教程每次打开进入（默认勾选） | `autoTutorial` 默认 true；去掉 sessionStorage 拦截；浮层新增 `#tutorial-never`「不再弹出」→ 持久化 false |
| 视图切换绝不换行、宽度不够只留图标 | `.view-switch{flex-wrap:nowrap}` + `applySwitchDensity()` + `.is-icon-only` |
| 响应式美观优先 | `.trellis/spec/frontend/responsive-and-aesthetics.md`；修正教程按钮行/手机切换条/手机空态文案/手机下拉四处硬塞 |

### 3. 规则（铁律）

`iron-rules.md`（真源）新增：
- 第 23 条：Dev 实例实测一律 **Playwright 无头 · 后台**（走 `e2e/` 库 API，不新装包），不弹前台窗口。
- 第 24 条：响应式美观铁律（不压扁、不裁切、不显示不全）。
同步到 `CLAUDE.md` 项目覆盖 9/10 条、`docs/DEVELOPER-GUIDE.md`（新增 Q 节）、`README.md`（3.7/3.8）。

## 二、Playwright 无头实测状态（Dev Luker 8003）

- **冒烟：16/16 全绿**（`node e2e/run.cjs --only smoke --instance dev-luker`）
  - 资源 200、模态按需打开、五个面板渲染、本插件 **0 报错 / 0 失败请求**、无孤儿注入。
- **完整流程 newui**：首轮失败＝测试基建问题（宿主动态渲染下固定 1.5s 取不到打开按钮），已在
  `e2e/lib/workbench-entry.cjs` 改为「有界等待按钮出现 → 页内 click」。重跑在交接时**仍在后台**，
  结果未取回；继续时先重跑该命令确认。

## 三、必须知道的坑（都已在代码/规范里，但交接要口径一致）

1. `_engine_dump.bin` 是 **JSONL 明文**，不是 pg_dump；SQLite 的 dump 才是 `.sqlite` 文件。
2. `chats.is_group` 在上游是 **SMALLINT/TINYINT**：转储必须写 `0/1`，写 `true/false` 会被 PG 拒绝。
3. SQLite 产物必须落 **L 包用户根扁平** `luker-storage.sqlite`（带 `handle/` 前缀宿主会静默找不到）。
4. `src/vendor/sqljs/package.json` 声明 `"type":"commonjs"`——仓库根是 ESM，缺它 Node 运行时报错。
5. Dev Luker 里 `data/default-user/extensions/ST-pack-transfer` 是**指向本仓的 junction**（P-19）：
   只读可以，**绝不写穿**。
6. Playwright 复用 `.pw-profile-dev`；首次若 `dev-luker.localhost` 无会话 cookie，
   `/scripts/extensions/third-party/*` 会 **403**（不是插件问题）。跑一次
   `node scripts/probe-dev-luker.cjs` 建立会话即可。
7. `e2e/` `test/` `scripts/` `fixtures/` **永不入库**（铁律 21），交接里的 E2E 修正只在本机。

## 四、未完成 / 下一步

| 项 | 判据 | 怎么做 |
| --- | --- | --- |
| newui 完整流程 | 全绿 | `node e2e/run.cjs --only newui --instance dev-luker` |
| 宿主侧「无临时库」取证 | 恢复后宿主日志**无** `_xrestore_` | 需要一个 db/sqlite 模式的 Dev 实例（当前 Dev Luker 是 fs 模式；切 `mode: sqlite` 需用户批准） |
| 浏览器观感 | 十字拖动/图标退化/`is-tight` 视觉 | 已被第 23 条取代：用 Playwright 截图落盘，不用前台浏览器面板 |

## 五、关键命令

```bash
npm run build && npm run preview      # 本地 4173 静态验收（非 Playwright 路径）
node e2e/run.cjs --only smoke --instance dev-luker
node e2e/run.cjs --only newui --instance dev-luker
node scripts/verify-engine-bridge.mjs <包> <目标引擎>   # 引擎互转实测（本地专属脚本）
python -I scripts/compare-dumps.py <a.zip> <b.zip>      # 两份转储的 doc 逐行比对
npm run check:css-scope | check:template-source | check:control-consumer | check:dom-injection | check:dom-scope
```
