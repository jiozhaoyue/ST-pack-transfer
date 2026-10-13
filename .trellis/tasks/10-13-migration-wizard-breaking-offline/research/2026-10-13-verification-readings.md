# 验收读数：迁移向导 · 强制不兼容 · 离线单文件（2026-10-13）

> 本文件是**读数台账**，不是规范。规范条文已落 `.trellis/spec/frontend/migration-*.md`。

## 一、基线对照（零回退判据）

| 项 | 基线（2026-10-13 12:07，实施前） | 实施后（12:48） | 结论 |
| --- | --- | --- | --- |
| `npm test` | 669 passed / 2 skipped / 71 文件 | **718 passed / 2 skipped / 71 文件** | +49 全绿，零回退 |

> 已知 flaky：`test/real-samples.test.js` 在**全量并发**下偶发 5000ms 超时（读真实大 zip）。
> 本次 12:19 那一轮命中过一次（1 failed）；**单独复跑 6/6 绿（2.29s）**，实施后全量轮次未再命中。
> 非回归，判据与处置见 `.trellis/tasks/10-01-.../research/2026-10-13-handoff.md` §5。

## 二、五守卫 + 构建

| 命令 | 读数 |
| --- | --- |
| `npm run check:css-scope` | 通过（`style.css`） |
| `npm run check:dom-injection` | 通过（19 个文件，零未转义 `innerHTML` 插值） |
| `npm run check:template-source` | 通过（`index.html` 为骨架，**53** 个业务节点均定义于模板） |
| `npm run check:dom-scope` | 通过（19 个文件，零未声明宿主写入） |
| `npm run check:control-consumer` | 通过（**54** 个交互控件全部有消费点声明 / 43 条声明） |
| `npm run build` | 通过（`dist/index.html` + assets） |
| `npm run build:offline` | 通过 → `dist-offline/st-zip-converter-offline.html` |

## 三、离线单文件产物读数

```
体积：1693.5 KB（CSS 1338.0 KB / JS 354.9 KB）
外部资源引用：0（自包含）
内联字体：10 处（data: URI）
其它引用（超链接，不发请求）：1（GitHub 页脚）
```

## 四、E2E 读数

| 套件 | 读数 |
| --- | --- |
| `npm run e2e:web`（独立 Web / 云子路径 / file://） | **400 项断言：通过 400 / 失败 0** |
| ├ `wizard.e2e.cjs`（新增） | 默认入口 = 向导、六步披露、键盘导航、切回高级 |
| └ `offline-single-file.e2e.cjs`（新增） | **28 项断言全绿**：`file://` 下渲染 + 六步导航 + 真实转换 + 产物读回 + **零外部 http(s) 请求** |

实施前该套件为 185 项断言 / 171 通过 / **14 失败**（默认入口切向导后，14 个测高级工作台的 spec 点到被隐藏的控件）。
处置：给这些 spec 显式加 `common.useAdvancedView(page)`（并各自新增一条 `*b 切到高级视图` 断言），
另新增 `wizard.e2e.cjs` 保证「向导真的是默认」这条契约仍被测到。

## 五、实施过程中实测到的两个坑（已修 + 已加回归防线）

1. **步骤条被自己的披露规则隐藏**：披露选择器原写 `[data-wb-step]:not([data-wb-step="X"])`（裸后代），
   而步骤条按钮**自己**也带 `data-wb-step` ⇒ 6 个按钮全 `display:none`，向导无法导航。
   修：选择器限定 `.wb-block [data-wb-step]…`；回归防线 = `test/migration-wizard.test.js`
   的「向导外壳必须落在 `.wb-block` 之外」。
2. **「自包含」口径错**：初版用夹具的 `rec.crossOrigin` 计数，其基准 origin 取自运行器传入的
   **HTTP 站点**（本 spec 自己导航到 `file://`）⇒ 文档本身与 7 条 `blob:` 下载 URL 被误记为"跨源"。
   修：改为直接数 `^https?:` 请求，并在挂监听前先 `goto('about:blank')` 离开运行器的 HTTP 页面
   （否则它懒加载的字体请求会被算进来）。

## 六、未做（如实登记，不声称已完成）

- 目标侧自动读回核对、自动目标备份、自动重发重试。
- 各异步阶段超时数值与测量。
- 四宿主 12 条有向迁移路径的逐条证据；外部用户试用。
- 实例侧 `npm run e2e`（本轮未连任何实例；只跑独立 Web 形态）。
