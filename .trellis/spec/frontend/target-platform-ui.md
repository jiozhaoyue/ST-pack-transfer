# 目标平台统一 UI（2026-11-17）

> **状态：✅ 就位。** 用户裁定：目标平台所有按钮/区域统一鲜艳色，文字永远白色，不随主题或目标平台切换；颜色/文案/配置集中在可读文件，禁止散落硬编码。

## 1. 唯一真源

| 内容 | 文件 | 说明 |
| --- | --- | --- |
| 平台 code / host / name / 顺序 | `src/data/target-platforms.js` | `TARGET_PLATFORMS` 四项；`code` 是布局码，`host` 是 UI/图标码，`name` 是显示名与状态值 |
| 目标平台配色 | `src/data/target-ui.js` | `accent #6c5ce7`、`accentStrong #5a4bd1`、`ink #ffffff`、`inkSoft`、`border` |

派生：
- `src/core/naming.js` 的 `HOST_DISPLAY_NAMES` / `TARGET_PLATFORMS` 从 `target-platforms.js` 派生，不再手写第二份。
- `src/ui/workbench-view.js` 的 `renderTargetPicker()` 读取 `TARGET_PLATFORMS` 与 `TARGET_UI`，并在 `#app` 上注入 `--target-accent` / `--target-accent-strong` / `--target-accent-soft` / `--target-ink` / `--target-ink-soft` / `--target-border`。

## 2. 视觉契约

- 目标平台按钮（`#target-btn`）与下拉项统一使用 `--target-accent` 背景、`--target-ink` 文字；**文字永远白色**，不跟随亮/暗主题。
- 下拉项选中态 / 当前宿主项使用同一鲜艳色；hover 用 `--target-accent-strong`。
- 按钮内图标保留各平台品牌图标，但外环统一 `--target-ink-soft`，不再逐平台改按钮背景/文字。
- 目标平台切换**不再改全站 `--accent`**；全站 accent 继续继承宿主/主题令牌。
- 桌面与手机使用同一 DOM 顺序与同一套变量。

## 3. 禁止项（回归守卫）

- 禁止重新引入 `#app.app-container[data-target-host="st|luker|tt|pt"] { --accent: ... }`。
- 禁止在 CSS 里写逐平台的 `.picker-btn[data-host="..."]` 背景/文字色。
- 禁止在 `workbench-view.js` 重新写本地 `const TARGETS=[...]`。
- 禁止把 `TARGET_UI.ink` 改成非白色；目标平台文字必须始终白色。

## 4. 验证

- `npx vitest run test/target-ui.test.js`（4 例）：
  - 四项 code/host/name 唯一且顺序固定；
  - `naming.js` 与数据文件派生一致；
  - `ink === '#ffffff'`，accent 为合法 hex；
  - CSS 不得出现 per-target `--accent` 覆盖，view 不得出现本地 `const TARGETS=[`。
- 人工/截图：亮/暗主题下目标按钮均为统一紫色 + 白字；桌面/手机一致。

## 5. 文件地图

- `src/data/target-platforms.js`
- `src/data/target-ui.js`
- `src/core/naming.js`
- `src/ui/workbench-view.js`：`renderTargetPicker()`、`targetHostCode()`、`targetForHost()`、`targetCodeOf()`、`targetValueOfCode()`
- `style.css`：`.picker-btn[data-host]`、`.picker-item`、`.picker-pop`、`.picker-ico`
