# 执行计划：默认选择口径统一

> 提交用显式 pathspec，校验暂存区恰等于本片集合（`L0-7(2)`）；推 `origin`。

## 0. 前置

- [x] 复核三张表的现状默认（`category-filter.js:22-36` / `host-bridge.js:258-269` / 模板 177,181,185）。
- [x] 回填 `prd.md` / `design.md`；`task.py start`。

## 1. 单一源

- [x] 新建 `src/core/selection-defaults.js`：`STANDARD_SELECTION_KEYS` / `SPECIAL_SELECTION_KEYS` /
      `SPECIAL_SELECTION_FLAGS` / `DEFAULT_SELECTION` / `describeSelectionDefaults`。
- [x] 先写 `test/selection-defaults.test.js`：13 键齐全、10+3 划分不重不漏、
      `SPECIAL_SELECTION_FLAGS` 与 `plan-preview.js` 的实际参数名一致（**防漂移**）。

## 2. 三处派生

- [x] `category-filter.js`：`currentSelection` 初值 ← `{ ...DEFAULT_SELECTION }`。
- [x] `host-bridge.js`：`FULL_SELECTION` ← 由 `STANDARD_SELECTION_KEYS` 派生（形状不变）。
- [x] `workbench-template.js`：三个特殊类目复选框 `checked` ← `DEFAULT_SELECTION`。
- [x] 测试：`test/selection-defaults.test.js` 断言「三处默认一致」（读模板字符串 + 读
      `FULL_SELECTION` + 读 `DEFAULT_SELECTION`），即 AC-2 的判别力。

## 3. 检查页按类目汇总

- [x] `index.js` 的 `syncWizardCheckPanel`：补「本次不含：<类目>（`<flag>=false>`，原因）」汇总。
- [x] 测试：把汇总构造抽为可测函数并覆盖「无排除 ⇒ 空串」。

## 4. 全量验证

- [x] `npm test`（基线 801 / 2 skipped）。
- [x] 五守卫 + `build` + `build:offline` + `e2e:web -- --rebuild`。

## 5. 收口

- [x] 回填 `prd.md` AC；`10-01/implement.md` S0 第二项勾选 + 写明裁决原文与日期；
      `selection-semantics.md` §6 更正。
- [x] `journal-1.md` 追加；`task.py archive --skip-branch-validation`；提交 + 推送。
