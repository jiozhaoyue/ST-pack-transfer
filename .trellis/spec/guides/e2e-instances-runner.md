# e2e:instances 统一入口（多实例冒烟矩阵）

> 任务 `10-25-e2e-instances-runner` 落地（2026-10-25）。跑/改多实例 E2E 前先读本页。
> D-12 域名强制与 Dev 白名单的完整纪律在 `instance-e2e-and-data-sync.md`（本页不重复）。

## 一键入口

```bash
npm run e2e:instances                          # 重启三 Dev HTTP 宿主 + PT 重装 + guard + 四宿主矩阵
node scripts/run-e2e-instances.cjs --skip-restart   # 实例已在跑，直接进矩阵
node scripts/run-e2e-instances.cjs --only dev-st,tt-cdp
```

矩阵行：`dev-st(8001, smoke+matrix)`、`dev-luker(8003, smoke+matrix)`、
`dev-pt(8899, pt-load，persistent context 天然 headed)`、`tt-cdp(9223, CDP 冒烟)`。
产物：`test-results/instances/<host>-<date>.md` + `summary-*.md` + tt 截图。

## 七条实测铁律（2026-10-25 全部踩过）

0. **错峰执行（用户 2026-10-25 裁定，规则级）**：矩阵同一时刻**只保被测宿主在线**——
   轮到谁才起谁、其余停机；收尾默认全停（`--keep-up` 保留）。宿主服务常驻 ×4 +
   Playwright 叠加是 dev-luker 偶发挂载失败与单测超时 flake 的实测负载根源。
   **时刻注意 CPU 与内存余量**；跨宿主连跑前先错峰，不在高负载下并行验证。
1. **冷启动等待 ≥300s**：Dev Luker 冷启动实测 163s（服务端插件自动更新逐个 SSL 超时
   拖住监听）——`restart-instances.cjs --wait-secs`（默认 300），90s 旧默认会误报超时。
2. **PT 安装三件套**：`--replace`（旧快照清单含已删文件 ⇒ raw 404 ⇒ 502）+
   **本地 zip 源**（`git archive HEAD` + 临时 http 服务 + `PT_EXT_URL`；zip 名=扩展目录名）+
   **持久档案安装**（`launchPersistentContext(PROFILES.dev)`——临时 context 装完即丢，
   e2e 看不到；10-15 的绿靠早期人工装的旧记录）。
3. **编排器内禁 `execFileSync` 起装着本进程 http 服务的子流程**：同步调用阻塞事件循环
   ⇒ PT 拉 zip 时 server 无法响应 ⇒ 死锁挂死。用 `spawn` 异步 + 收集输出。
4. **click 前通用预处理**（matrix `clickConvert` / pt-load `preClickConvert`）：
   宿主系 `dialog[open]` 弹窗中途叠上来拦截 pointer events（30s 超时主因）+
   全屏模态 dialog 滚动容器内按钮需原生 `scrollIntoView`（Playwright 自动滚动不生效）。
5. **日志面板 id 已改版**：折叠头是 `#log-bar-header`（旧 `#btn-toggle-log` 不存在）；
   折叠态读日志=占位符「暂无日志记录」（假红根源），读前必须展开。
6. **一键连跑的时序脆弱**：dev-luker 轮偶发「插件未挂载」（单跑恒绿，宿主扩展加载
   竞态）——编排器对失败 spec 自动重试一次再判死。

## 判定口径

- 本插件错误**只算可归因条目**（`harness.isPluginRef`）；PT 的「一次性安装源重试」
  （`http://127.0.0.1:<port>/st-zip-converter.zip` ERR_CONNECTION_REFUSED）是安装通道
  噪音，pt-load P15 判定前剔除。
- M-3 计划摘要计数口径=**OQ-1「默认完整迁移」13 键全 true**（直通 10/合成 1/丢弃 1/
  产物 11，夹具 11 条）；core 直调路径（include* 默认 false）是另一参数面——
  `test/convert.test.js` st→l 丢弃用例锁定，两条面各自自洽。

## 已知问题（不阻塞）

见 `tasks/10-25-e2e-instances-runner/research/known-issues.md`：KI-1 st 目标产物命名
前缀 `l_`（显示层疑点）、KI-2 PT 安装挂载竞态（重试已吸收）。
