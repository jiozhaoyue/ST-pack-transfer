# demo 实时预览与 UI 对齐

## Goal

把 `src/ui/ui-demo.html` 从「正式 UI 的唯一源」降级为「只消费正式代码的预览页」：
demo 可以 `import` 正式的视图与模板、`link` 正式样式，但正式代码、构建、测试、CI
都**不得引用 demo**。同时修正局域网区块水平内边距与同卡片其他区块不一致的问题，
并让 demo 在 `npm run dev`（3040）下可实时预览。

## Requirements

| 编号 | 要求 |
| --- | --- |
| R-01 | `ui-demo.html` 只通过 `<link href="../../style.css">` 与 `import` 引用正式三件套（`style.css` / `workbench-template.js` / `workbench-view.js`），不得再内联它们的副本。 |
| R-02 | 正式代码零引用 demo：`index.js`、`index.html`、`src/**`、`scripts/**`、`.github/**` 不得出现 `ui-demo` 路径或 import；旧同步器 `scripts/sync-ui-from-demo.cjs` 与其 npm 命令删除。 |
| R-03 | `npm run dev` 后打开 `http://localhost:3040/src/ui/ui-demo.html` 即可看到 demo；修改正式三件套或 demo 后刷新即生效（Vite dev 服务，非 `file://`）。 |
| R-04 | demo 专属物（演示数据 `demoTree` / `DEMO_PACKAGES` / `DEMO_QUOTA`、演示工具条、入口预览、演示动作）继续只存在于 demo，不得进入正式三件套。 |
| R-05 | 局域网区块（`.lan-block`）收起与展开时，水平内边距与同卡片其他区块一致（9px），不再贴边。 |
| R-06 | 新增自动守卫：正式源码出现 `ui-demo` 引用、或 demo 重新内联三件套内容时，`npm test` 失败。 |
| R-07 | `.trellis/spec/frontend/workbench-single-view.md §9` 改写为「demo 是消费者」的新规则，并写明 `file://` 不再支持的原因。 |

## 约束

- demo 的用途是**开发期实时预览**，不是交付物；正式产品不依赖它。
- 不新增运行时依赖；不引入构建步骤。
- 不改正式 UI 的视觉设计，仅修内边距一致性。

## Acceptance Criteria

- [x] AC-01（R-01）：`src/ui/ui-demo.html` 内不再出现 `SZC:UI:CSS/HTML/JS` 标记区，改为引用正式三件套。
- [x] AC-02（R-02）：`grep -rn "ui-demo"` 在正式源码目录零命中；`package.json` 不再有 `sync:ui` / `check:ui-sync`。
- [x] AC-03（R-03）：3040 打开 demo 页面，桌面宽度下渲染与正式工作台一致；控制台零错误。
- [x] AC-04（R-04）：正式三件套 `grep` 无 demo/演示/DEMO_ 字样。
- [x] AC-05（R-05）：展开局域网区块，取件码输入框与按钮左边缘与「从宿主拉取」按钮对齐（9px）。
- [x] AC-06（R-06）：守卫用测试在人为制造「正式代码引用 demo」时变红。
- [x] AC-07（R-07）：规范文档与新方向一致，不再指示 `npm run sync:ui`。
- [x] AC-08：`npm test` 全绿、五个静态守卫全绿、`npm run build` 通过。
