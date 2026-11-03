# 实施快照 · 各酒馆私有格式仓（host-vault）

> 落盘时间 2026-10-26（任务 `10-26-host-vault`）。本文件是**完成态快照**：做了什么、
> 证据是什么、哪些没做。PRD 的 Requirements/Acceptance 以本文件的读数为准。

## 交付物

| 文件 | 作用 |
| --- | --- |
| `src/storage/vault-store.js`（248 行） | 双后端仓 API：`vaultPut/Get/List/Delete/Backend`；Authority blob 分块（4MB）+ KV 索引优先，IndexedDB（`ORIGINS.VAULT`）降级 |
| `src/storage/authority-store.js` | 新增 KV 公开接缝 `authorityKvSet/Get/Delete` |
| `src/ui/vault-panel.js` | 仓面板：后端徽标（服务端/本地/不可用）、行渲染（名称/格式徽标/体积/日期）、导出/删除/条件恢复 |
| `src/ui/workbench-template.js` | `data-wb-module="vault"` 区块（存入文件 / 列表） |
| `src/ui/workbench-layout.js` | 布局登记：`MODULE_IDS` / `SHARED_CORE_MODULES` / `visibleModules`（idle+done） |
| `src/ui/stash-list.js` / `index.js` | 存入三入口：任意文件、暂存区行内「存入仓」、（宿主拉取包经暂存区行内） |
| `test/vault-store.test.js`（12 例） | 双后端、互不覆盖、删除不误伤、roundtrip 字节精确（含 >4MB 跨块） |
| `test/vault-panel-render.test.js`（11 例） | 渲染契约 + **并发渲染竞态守护** |
| `.trellis/tasks/10-26-host-vault/research/verify-vault-runtime.cjs` | 真实宿主运行时验证（截图 + 后端真值断言） |

## 关键决定

1. **索引顺序 = 先条目后索引**：中断只留「有数据无索引」的孤儿（可对账清理），
   不会出现「索引指向空条目」的悬空。
2. **格式标签五值** `st|l|tt|pt|raw`，猜不中即 `raw`——仓的本义就是「不兼容也原样存」。
3. **恢复入口按宿主布局条件渲染**（`canRestoreEntry`），不兼容时按钮根本不出现。
4. **`visibleModules` 限定 idle/done**（PRD R7 的既有裁定）；`scanned` 阶段仍可从
   暂存区行内「存入仓」入库。

## 验证读数（2026-10-26）

- `npm test`：**924 passed / 2 skipped**（88 文件；基线 900 → +24）。
- 五守卫全绿：css-scope / dom-injection / template-source / dom-scope / control-consumer。
- 真实宿主运行时（`verify-vault-runtime.cjs`，截图落 `test-results/instances/`，不入库）：
  - **Dev Luker 8003（装了 Authority）**：徽标「服务端」，`backend=authority`；
    存入 1 条 → UI 1 行 **且后端真值恰好 1 条** → 导出 **字节一致 2782B** → 删除后 UI 空
    **且后端归零**；插件侧错误 **0**。
  - **Dev ST 8001（无 Authority）**：徽标「本地」，`backend=indexeddb`；同链路全过，字节一致，错误 0。
  - 截图：`vault-dev-luker-{panel,stored,deleted}-2026-10-26.png`、
    `vault-dev-st-{panel,stored,deleted}-2026-10-26.png`；读数 `vault-runtime-<host>-2026-10-26.md`。

## 实施中发现并修复的缺陷（本任务范围内）

- **仓面板并发渲染重复行**（2026-10-26 实测）：`renderVaultPanel` 在两次 `await` 之间被
  并发调用 ⇒ 1 条后端记录渲染成 4 行。修法：渲染序号 + 所有 DOM 写入集中到最后一个
  `await` 之后；守护用例 `test/vault-panel-render.test.js`「并发渲染」节。
  规则已进 `.trellis/spec/frontend/quality-guidelines.md` 禁止模式 #11。

## 未做 / 边界

- **TT / PT 的仓 UI 未做运行时验证**：TT 无 Authority（降级路径与 ST 同构），PT 是浏览器
  纯前端；两宿主的仓面板尚未截图取证。
- **checksum 指纹**未做：v1 以 `size` 校验 + roundtrip 单测锁定（PRD 已列范围外）。
- **Authority 整包恢复端点**：恢复动作复用既有恢复链，服务端整包恢复端点属父任务 AC-6 的
  治理待定项，本任务未触碰。

## 回滚

单提交可回滚：`vault-*` 两个新文件 + 布局/模板/stash 三处接线 + 两处测试。
IndexedDB 侧数据落 `origin='vault'`，回滚后可经 `clearAll` 清理；Authority 侧落
`vault:<id>:<name>` blob 与 `vault-index` KV，可按前缀删。
