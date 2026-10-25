# TT CDP 注入自动化取证

## Goal

WebView2 远程调试口 + Playwright `connectOverCDP` 冒烟取证，结论三选一：并入 e2e 矩阵 /
转 tauri-driver 评估 / 登记不可行（父任务 R-C1 / D-11 / design §6.1）。

## 背景

- TT（TauriTavern）= Tauri 桌面壳 + WebView2，无浏览器端口 ⇒ 既有 Playwright HTTP 连法失效。
- 三条候选路（L0-3 检索结论）：官方 tauri-driver（要 WebDriver）、tauri-plugin-playwright（要给 TT 加插件）、
  **WebView2 CDP 注入**（`WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=<N>` 开口，
  Playwright `connectOverCDP` 连入，**无需改 TT**）——按 D-11 先验此路。
- TT 实例属 Dev 侧（无真实数据）；新调试端口按 L0-16 申请段位（禁 8000/3000；父 design 示例 9223）。

## Requirements（取证步骤，父 design §6.1）

| # | 要求 |
| --- | --- |
| R1 | 设 `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9223` 启动本机 Dev TT（启动方式以 `scripts/` 既有实例脚本/实际安装形态为准，先取证再动） |
| R2 | `GET http://127.0.0.1:9223/json/version` 验证调试口开（注：CDP 端口本身只在本机环回探活，浏览器目标仍守 D-12 域名纪律） |
| R3 | Playwright `chromium.connectOverCDP` 枚举页面，定位 TT 前端上下文 |
| R4 | 冒烟链：扩展设置页 ⇒ 本插件挂载 ⇒ 扩展行「打开」⇒ 工作台零异常（对齐既有 E2E 断言） |
| R5 | 结论三分支落 `research/tt-cdp-verdict.md`：全通→并入 `e2e:instances`（tag `tt-cdp`）；部分通→登记 tauri-driver 备选评估；不通→替证策略（TT 走「构建产物静态断言 + 手测清单」）落 spec |

## Acceptance Criteria

- [ ] AC-1 CDP 口开启与连接的完整命令序列可复现（含环境变量、启动、验证三步）。
- [ ] AC-2 冒烟链结果记录（通/不通 + 阻塞点 file:line / 报错原文）。
- [ ] AC-3 结论三分支之一明确落 `research/tt-cdp-verdict.md`，并同步父任务 AC-7 勾结。
- [ ] AC-4 若结论=并入矩阵：向 `e2e-instances-runner` 交付矩阵约定（目标/端口/tag）；若=不可行：替证策略落 `.trellis/spec/`。
- [ ] AC-5 全程不动 TT 源码、不碰 Real 侧；端口登记不撞 L0-16 段位。

## 范围外

- 不给 TT 装 tauri-plugin-playwright（除非 CDP 路不通且用户裁定换路）。
- 不在 `e2e-instances-runner` 之外预改 `e2e:instances` 主入口（那是下游任务的事）。

## 依赖与关联

- 下游：`10-25-e2e-instances-runner`（矩阵是否含 TT 由本任务定）。
- 父任务：`10-24-ui-orchestration-r2`（AC-7）。
