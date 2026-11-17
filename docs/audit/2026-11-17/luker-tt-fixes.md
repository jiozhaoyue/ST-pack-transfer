# Luker ↔ TauriTavern 契约缺陷修复报告（D1 / D3）

> 日期：2026-11-17 ｜ 实施：核心转换修复工程师（opencode/hy4-flash-free）
> 授权裁决：D3 = TT 源 `tauritavern-settings.json` 保留并写入 `_compat/tt/` 沙箱；D1 = 同名扩展全局副本被去重时必须显式提醒。
> 范围：仅改 `src/core/transform.js`；新增 `test/luker-tt-contract-fixes.test.js` 与本报告。未装依赖、未启动实例、未提交 Git、未派生子代理。

---

## 1. 改动点

### 1.1 D3 — TT 应用私有设置落沙箱

文件：`src/core/transform.js`，主循环 `tt-app-private` 分支（原 654-665 行）。

- 新增前置分支：当 `target !== TARGETS.TT` 且 `routed.hubPath === 'tauritavern-settings.json'` 时，一律调用既有 `targetEntryPath(routed.hubPath, target)` 求落点并写出，不再因 `keepAll` / `includeAppPrivate` 缺省而丢弃。
- 其余 `tt-app-private` 条目（window-state / mcp / skills / extension-store / lan-sync）保持原处理逻辑不变。
- TT 目标走原有「原位保留」分支，行为不变。
- `targetEntryPath` 已有 `_compat/tt/` 分支（`transform.js:1025-1034`），本次直接复用，**未改该函数**：L/ST 得 `_compat/tt/tauritavern-settings.json`，PT 得 `data/default-user/_compat/tt/tauritavern-settings.json`（PT 根约定）。

### 1.2 D1 — 去重跳过升级为显式警告

文件：`src/core/transform.js`。

- 上下文新增 `globalShadowedEntries: 0`（`transform.js:494`），在同名去重命中处递增（`transform.js:742`），精确统计被跳过的**全局副本源条目数**。
- 尾部汇总警告（`emitSynthesized` 内，`transform.js:1321-1331`）改写文案：逐扩展点名 `同名扩展 "<名>" 的全局副本已跳过（用户级优先）`，并汇总 `共 N 个扩展、M 个源条目未写入产物`。
- 说明：HEAD 中原已有一条汇总警告（旧文案「检测到 N 组同名扩展…」），本次是**在原通道上升级**，不是新造报告机制；警告仍走 `Report#warn` → `toJSON().warnings` / `totals.warnings`，转换报告 UI 直接可读。警告条数保持 1 条，未改变既有测试的计数预期。
- 去重语义未动：仍为「用户级优先、全局副本不写」，四目标统一。

---

## 2. 前 / 后行为对照

| 场景 | 修复前 | 修复后 |
| --- | --- | --- |
| TT→L 默认 | `tauritavern-settings.json` 丢弃，列入 `dropped` | 写出 `_compat/tt/tauritavern-settings.json`，字节一致，不再进 `dropped` |
| TT→ST 默认 | 同上丢弃 | 写出 `_compat/tt/tauritavern-settings.json` |
| TT→PT 默认 | 同上丢弃 | 写出 `data/default-user/_compat/tt/tauritavern-settings.json` |
| TT→ST `--keep-all` | 写 hub 根 `tauritavern-settings.json` | 写 `_compat/tt/tauritavern-settings.json`（D3 要求沙箱化） |
| TT→TT | 原位 `data/default-user/tauritavern-settings.json` | **不变** |
| TT→L→TT | 该文件不可回带 | 沙箱条目被拆包还原为 `data/default-user/tauritavern-settings.json`，字节一致 |
| L→TT 同名 user+global | 全局副本静默跳过（仅 1 条笼统警告） | 跳过语义不变；警告逐扩展点名 + 汇总扩展数/条目数，UI 数据可读 |

---

## 3. 测试证据

新增 `test/luker-tt-contract-fixes.test.js`（7 个用例，使用内存构造 zip，无网络/实例依赖）：

```text
npx vitest run test/luker-tt-contract-fixes.test.js
→ Test Files 1 passed (1); Tests 7 passed (7)
```

覆盖：TT→L / ST / PT 沙箱落点与字节一致；TT→TT 行为不变；TT→L→TT 拆包还原；L→TT 同名扩展仅留用户级 + 警告逐扩展点名 + 计数（1 组/2 条、2 组/4 条）。

不回归命令：

```text
npx vitest run test/luker-tt-roundtrip.test.js
→ Test Files 1 passed (1); Tests 14 passed (14)
```

追加排查（均通过）：`test/extension-scope-e2e.test.js` 4/4、`test/real-samples.test.js` 6/6。

D1 警告字段位置：转换报告 `warnings: string[]`（`src/core/report.js:164`），计数在 `totals.warnings`（`report.js:175`）；主线程 Worker 回传的 `toJSON()` 纯对象同样携带该字段。

---

## 4. 未覆盖项 / 需父会话裁决

1. **既有测试断言与新契约冲突（授权外，未改）**：`test/convert.test.js` 有 2 条断言编码 D3 前行为，本次实测失败：
   - `test/convert.test.js:262`：`tt→l:应用私有设置与派生缓存默认丢弃` 断言 `dropped` 含 `tauritavern-settings.json` —— 现该文件改为沙箱保留，不再进 `dropped`。
   - `test/convert.test.js:275`：`tt→st --keep-all:全部保留在 hub 根` 断言 hub 根存在 `tauritavern-settings.json` —— 现落 `_compat/tt/`。
   本次授权仅限「改 transform.js + 新增测试与报告」，故未修改该既有测试文件。建议父会话同步更新这 2 条断言为 D3 新契约（对应位置换成 `_compat/tt/tauritavern-settings.json`），以恢复全量测试绿。该测试其余 29 条均通过。
2. **真实大样本未复跑**：审计用 `data-zip/tauritavern-data-20260825-100035.zip`（705 条）未重新生成产物，条数/计数变化未实测；本次证据来自夹具与内存构造包。
3. **实机行为未验证**：TT / L 宿主是否按规范真正消费 `_compat/tt/` 内容、以及同名扩展加载优先级，仍需 Dev 实例验证（继承原审计「待验证」项）。
4. **D1 警告文案为单条汇总**：为满足逐扩展可读 + 汇总条数且不改变警告条数，采用「一条警告内拼接多扩展」形式；若 UI 需要逐条独立警告条目，需另行产品裁决（会改变 `totals.warnings`）。
