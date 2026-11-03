# 实施清单

## A. demo 改为消费者

- [x] A1 用正式三件套替换 demo 的三个内联区：`<link ../../style.css>` + `getWorkbenchHtml()` + `import createWorkbenchView`。
- [x] A2 保留 demo 外壳 CSS 与演示 harness（数据/动作/工具条），改为模块内直接调用。
- [x] A3 删除 demo 内的 `SZC:UI:CSS/HTML/JS` 标记区。
- [x] A4 修正 `workbench-template.js` 头注释（不再写「由 sync 生成」）。

## B. 正式代码零引用 demo

- [x] B1 删除 `scripts/sync-ui-from-demo.cjs`（用户已批准）。
- [x] B2 `package.json` 删除 `sync:ui` / `check:ui-sync`。
- [x] B3 删除 `test/ui-demo-source.test.js`（用户已批准），新增 `test/ui-demo-isolation.test.js`。

## C. 内边距对齐

- [x] C1 `.lan-block` 水平 padding 4px → 9px。
- [x] C2 `.lan-toggle` 水平 padding 2px → 0，左边缘与 `.action-row` 对齐。
- [x] C3 截图核对收起/展开两态。

## D. 文档与验证

- [x] D1 改写 `.trellis/spec/frontend/workbench-single-view.md §9`。
- [x] D2 `npm test` 全绿。
- [x] D3 五个静态守卫全绿。
- [x] D4 `npm run build` 通过。
- [x] D5 3040 打开 demo 截图 + 控制台零错误。

## 验证命令

```bash
npm test
npm run check:css-scope
npm run check:dom-injection
npm run check:template-source
npm run check:dom-scope
npm run check:control-consumer
npm run build
```

## 回滚点

- A/B 完成后若 demo 无法在 Vite 运行：恢复旧 `ui-demo.html`（git 可回滚），正式代码不受影响。
- C 为单行 CSS，可单独回滚。
