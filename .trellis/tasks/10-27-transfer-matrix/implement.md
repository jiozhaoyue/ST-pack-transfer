# 执行计划：跨宿主互传矩阵

> 顺序执行；每一步完成后跑对应验证，绿了再进下一步。
> 用户指令：界面**先在 demo 做**；不做四宿主复验与全量测试。

## 0. 前置

- [x] `implement.jsonl` / `check.jsonl` 至少各一条真实条目。
- [x] `python ./.trellis/scripts/task.py start 10-27-transfer-matrix`

## 1. 纯逻辑与适配器

- [x] `src/core/transfer-matrix.js`：`channelsFor` / `swapDirection`。
- [x] `src/ui/host-bridge.js`：`isLanSyncAvailable` / `listLanSyncPeers` / `triggerLanSyncPull`。
- [x] 单测：`transfer-matrix`（适配器以真实端点契约与降级返回值约束，未 mock 网络）。

## 2. demo 先行

- [x] `ui-demo.html`：互传矩阵弹窗（模拟 Luker/TT 已配对设备 + WebRTC 行）。
- [x] 「交换收发」在 demo 里可见地改变方向。
- [x] 自检：Playwright 截图，控制台零错误（另修复 demo 两处既有缺陷：`node(...)` 少括号、`t` 被参数遮蔽）。

## 3. WebRTC 侧

- [x] `lan-transfer-panel.js` 增加 `swap()`：关闭会话、方向互换、旧码作废。
- [x] 视图执行区的「交换收发」按钮接到 `swap()`。
- [ ] 公网失败提示补一句「当前网络需要中继」。

## 4. 原生通道

- [x] Luker：调 `peers/:id/sync` 拉取（`triggerLanSyncPull`）。
- [x] Luker：未配对/端点缺失 → 行内原因 + WebRTC 入口。
- [x] TT：只提示「在原生 Sync 面板完成」，不伪称直连。
- [ ] 接收侧：能列目录的宿主扫描 `user/files/*.zip`；不能列则提示手动导入。

## 5. 收口

- [x] 六守卫 + `check:copy` 全绿。
- [x] `npm run build` 通过。
- [x] spec 更新：`.trellis/spec/frontend/` 记录通道矩阵与降级契约。
- [x] 显式 pathspec 提交并推送 `origin main`。
- [ ] `task.py archive 10-27-transfer-matrix`。
