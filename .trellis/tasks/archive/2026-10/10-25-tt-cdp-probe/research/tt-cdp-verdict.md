# TT CDP 注入自动化取证结论（R-C1 / D-11 · 2026-10-25）

> 任务 `10-25-tt-cdp-probe`。结论分支：**① 全通 → 并入 `e2e:instances` 矩阵（tag `tt-cdp`）**。
> 环境：Dev TT 实例仓（`Instance/Dev/TauriTavern` @ 3a8c5401，git 干净——P-16 残缺状态已不存在）
> × 旧 debug 产物 `src-tauri/target/debug/tauritavern.exe`（9/28 构建）
> + 仓内静态 dev server（`node scripts/tauri-dev-server.mjs`，1430，纯静态无编译）。

## 结论速览

| 环节 | 结果 | 证据 |
| --- | --- | --- |
| R1 CDP 口开启 | **✅** | `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9223` 后启动 exe，`netstat` 9223 LISTENING |
| R2 `/json/version` | **✅** | WebView2 `Edg/155.0.4283.62`，Protocol 1.3 |
| R3 `connectOverCDP` | **✅** | 枚举 1 context / 1 page（`http://localhost:1430/`），evaluate 读写全通 |
| R4 冒烟链 | **✅** | 插件发现→启用→工作台挂载 `hasAppContainer=true`，视觉正常（双栏、无渲染异常）；页面错误全部为 TT 自身扩展更新检查的 GitHub 网络失败，与本插件无关 |
| **判定** | **并入 `e2e:instances`（tag `tt-cdp`）** | 下游 `e2e-instances-runner` 矩阵加 `tt-cdp` 行 |

## 复现命令序列（完整链）

```bash
# 1. 起 TT 前端静态服务（无编译；TT 仓根）
cd Instance/Dev/TauriTavern && node scripts/tauri-dev-server.mjs &     # 1430

# 2. 带 CDP 口启动 TT（直接跑既有 debug 产物，绕过 tauri dev 全量编译）
WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS="--remote-debugging-port=9223" \
  ./src-tauri/target/debug/tauritavern.exe &

# 3. 验证调试口
curl http://127.0.0.1:9223/json/version    # Edg/155, Protocol 1.3

# 4. Playwright 连入（见 research/cdp-smoke.cjs / cdp-workbench.cjs）
chromium.connectOverCDP('http://127.0.0.1:9223')
```

- 端口登记：**9223**（CDP 控制面，本机环回；不属实例段 8001-8004，不撞 L0-16 已登记段位）。
- 纪律对照：浏览器**目标**仍是 `localhost:1430`（TT 前端，devUrl 写死于 TT 自身配置）；D-12 约束的是**实例命名式域名**（8001/8003/8899 族）——TT 是桌面 WebView，无 DNS 域名形态，`e2e-instances` 矩阵里 TT 行按「CDP 目标」单列（guard 白名单需为 9223+1430 开 CD 例外，见下游任务）。

## 附带取证收获（三条，均进 spec/下游任务）

1. **TT 扩展发现跳过 junction/symlink 目录**：junction 安装⇒发现列表无本插件（后端
   `Discovering extensions` 无相关行）；**真实目录拷贝⇒立即发现并自动启用**。
   ⇒ `restart-instances.cjs` 的 junction 模式**不适用 TT**；TT 侧同步 = robocopy/cp 拷贝。
   （删除 junction 必须用 `cmd /c rmdir`——`rm -rf` 会穿透删工作区，P-19 同形。）
2. **TT 数据根在 `AppData\Roaming\com.tauritavern.client\data`**（非实例仓内），且**有真实
   使用数据**（chats 671MB / 41 扩展 / access.log 9 月）——**TT 无 Dev/Real 之分，属 P-11
   高敏区**：对 TT 的一切自动化写操作（装插件等）必须纯增量、先快照、事后可整删。
3. **TT 同时暴露 `SillyTavern` 与 `__TAURITAVERN__` 全局**（实测）——印证 `detectHost()`
   两级判定「顺序不可颠倒」的设计（A 线 R-A4 判据 `__TAURITAVERN__` 优先于
   `SillyTavern`）。TT 上 `detectHost` 判 `tt` 的判据实测有效。

## 产物清单

- `research/tt-boot.log`（tauri dev 编译失败记录：mingw 链接 `ld returned 37`——**绕过路径**
  即本报告「旧 exe + 静态 server」，无需修复编译）
- `research/tt-exe*.log`（TT 运行日志）
- `research/cdp-smoke.cjs` / `cdp-manage-ext.cjs` / `cdp-find-plugin.cjs` / `cdp-workbench.cjs`
- `research/tt-smoke*.png` / `tt-manage-panel.png` / `tt-workbench.png`（视觉证据）
- TT 侧安装物：`…/extensions/st-zip-converter/`（真实目录拷贝，2MB；**保留**供
  e2e-instances 矩阵使用，卸载=整目录删除）
