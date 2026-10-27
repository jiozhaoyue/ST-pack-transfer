# 局域网互传 · 实施清单

## A. 纯逻辑核心（`src/core/lan-transfer.js`）

- [x] A1 `formatBytes` / `formatRate` / `formatDuration`（纯函数，中文单位）
- [x] A2 `buildSignalPayload` / `readSignalPayload`（v2 负载 + v1 兼容）
- [x] A3 `fileIdentity(name,size,lastModified)` 稳定短 id
- [x] A4 `verifyTransfer` 增加 `digest` 比对（缺省退回字节数）
- [x] A5 `withTimeout` 不进核心（属装配层），核心只留纯函数

## B. 面板装配（`src/ui/lan-transfer-panel.js`）

- [x] B1 骨架：标题行 / 能力徽标 / 发送-接收分段 / peer 卡片 / 字段 / 进度 / 状态
- [x] B2 SVG 图表改用 `createElementNS` 构建（**消除 `innerHTML`**，过 DOM 注入守卫）
- [x] B3 发送端：选包 / 拖放 / 生成取件码 / 一次性失效 / 重试
- [x] B4 接收端：粘贴取件码 / 生成应答码 / 续传偏移 / 落盘 sink
- [x] B5 传输：背压（`bufferedAmountLowThreshold`）、ACK、进度 + 速率 + ETA
- [x] B6 核对：SHA-256 + 字节数；失败分因
- [x] B7 生命週期：`connectionstate` 监听、取消、`pagehide` 清理、Esc 关闭
- [x] B8 非安全上下文：按钮禁用 + 降级说明
- [x] B9 交互细节：复制反馈、关闭即重置、重开无脏状态

## C. 样式（`style.css` 的 `.wb-lan-*` 段）

- [x] C1 双前缀铁律（`#app.app-container`）
- [x] C2 只用 `--SmartTheme*` / 主题变量，不硬编码颜色
- [x] C3 进度条 / 速率 / 状态行在窄屏不换行崩坏

## D. 测试

- [x] D1 更新 `test/lan-transfer.test.js`（新增格式化 / 信号 v2 / 摘要核对 / 续传 id）
- [x] D2 新增 `e2e/standalone/specs/lan-transfer.e2e.cjs`：两上下文真实互传 + 坏码 + 一次性
- [x] D3 压缩测试量：只跑基础 + 本次改动相关用例（`npm run test:focus` 之类）
- [x] D4 五个守卫全绿

## E. 四实例

- [x] E1 Dev ST / Dev Luker / PT / TT 打开工作台，`#btn-lan-send` 存在且能开面板
- [x] E2 非安全上下文（TT/PT 若为 http 非 localhost）显示不可直连且按钮禁用（`probeDirectCapability` 单测覆盖；本轮四实例均为 localhost 安全上下文，未真机复现）
- [x] E3 截图留证（独立 Web 生产页 / demo 页 / TT 矩阵截图）

## F. 收口

- [x] F1 更新 `.trellis/spec/frontend/workbench-single-view.md §7`（含 7.1 实现与落盘硬规则、§9 UI 单一源）
- [x] F2 PRD 的 R-06/AC-04 按「未实现」改写
- [x] F3 显式 pathspec 提交 + 推送 origin
- [x] F4 完整报告
