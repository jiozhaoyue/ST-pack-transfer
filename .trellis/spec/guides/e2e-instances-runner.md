# e2e:instances 统一入口（多实例冒烟矩阵）

> 任务 `10-25-e2e-instances-runner` 落地（2026-10-25）。跑/改多实例 E2E 前先读本页。
> D-12 域名强制与 Dev 白名单的完整纪律在 `instance-e2e-and-data-sync.md`（本页不重复）。

## 一键入口

```bash
npm run e2e:instances                          # 重启三 Dev HTTP 宿主 + PT 重装 + guard + 四宿主矩阵
node scripts/run-e2e-instances.cjs --skip-restart   # 实例已在跑，直接进矩阵
node scripts/run-e2e-instances.cjs --only dev-st,tt-cdp
```

矩阵行：`dev-st(8001, smoke+matrix+vault)`、`dev-luker(8003, smoke+matrix+vault)`、
`dev-pt(8899, pt-load+vault，persistent context 天然 headed)`、`tt-cdp(9223, CDP 加载冒烟+仓冒烟)`。
产物：`test-results/instances/<host>-<date>.md` + `summary-*.md` + tt 截图。

## 仓（vault）行：判据与三条前置

仓 spec（`e2e/specs/vault.e2e.cjs`；TT 走 `e2e/lib/tt-cdp.cjs` 的 `ttVaultSmoke`）验的是
**双后端全链路**：仓模块可见 → 后端徽标 → 存入 → **UI 恰好 1 行且后端真值恰好 1 条** →
导出字节一致 → 删除后 UI 与后端双归零 → 零本插件报错。

1. **主判据是后端真值，不是 DOM 行数**：页内 `import()` 插件自身的 `vault-store.js`
   读 `vaultList/vaultBackend/vaultDelete`。理由见 `quality-guidelines.md` 禁止模式 #11——
   曾出现「后端 1 条、DOM 4 行」，看 DOM 会得出错误结论。
2. **徽标只断言「与 `vaultBackend()` 一致」，不写死宿主预期**（Authority 装/卸都不误判；
   「徽标撒谎」仍会被抓）。实测：dev-luker `authority`/「服务端」；dev-st / pt-web / tt-cdp
   均 `indexeddb`/「本地」。
3. **仓只在 idle / done 可见** ⇒ 先清场再断言：`pt-load`/`matrix` 会留下夹具源包把阶段推到
   scanned。spec 内先按名（`pruneFixtures`）+ 按前缀（`fixture-`，兜住 `fixture-web-*`）
   删源包记录，再重载；仍不可见时再清一次并重载一次。

**TT 侧两个专属坑（2026-10-26 实测）**：

- **已装副本必须刷成当前 HEAD**：`ensureInstalled()` 早先「manifest 在即跳过」⇒ TT 里是
  10-25 的旧拷贝，缺 `src/storage/vault-store.js` ⇒ 插件 import 404、**整插件加载失败**
  （`mentionsPlugin:false`）。现改为每次同步四件 + `src/`。
- **冷启动期间页面会自行导航** ⇒ `evaluate` 抛 `Execution context was destroyed`，
  整轮因此异常退出。所有 CDP 取值包一层 `retryOnNav`（只重试导航类错误，不吞真断言失败）。

**截图纪律**：TT 的模态不铺满全屏，整页截图会带进**真实聊天内容**（P-11 高敏）⇒
`ttVaultSmoke` 用元素截图（`#st-converter-modal-overlay`）；截图前先点掉宿主自己的浮层
（「后端错误」toast 是扩展版本检查走 GitHub 失败的背景噪声；ChatFilesys「不入库」提示）。

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
7. **TT 第三方扩展是「延迟激活」，冷启动后约 25–30s 才注入本插件痕迹**（2026-10-26 定案）：
   TT 在 `APP_READY` 之后才走 `activateDeferredThirdPartyExtensions`
   （`nextPaint → initTokenizers → initScrapers → 激活 local/global 扩展`）。
   ⇒ 冒烟**必须先有界等待插件自注入信号**（`#ST-pack-transfer-menu-item` /
   `[class*="st-converter"]` / `.app-container`），**不能读完一次就判 FAIL**；
   实测冷启动 `waitedMs≈28.6s`、热进程 160ms。默认上限 120s。
   旧兜底「点 `#extensions_menu_button` → 管理扩展 → 勾启用」**整套已废**：该 id 在现版
   TT 不存在（现为 `extensions-settings-button` / `third_party_extension_button`），
   且插件本就会自动激活，不需要也不该由测试去勾选。
   **`mentionsPlugin`（HTML 文本命中）不可作主判据**：扩展面板列表里的显示名「数据包转运」
   未加载时也能命中（假绿），只作诊断留档。

## 判定口径

- 本插件错误**只算可归因条目**（`harness.isPluginRef`）；PT 的「一次性安装源重试」
  （`http://127.0.0.1:<port>/ST-pack-transfer.zip` ERR_CONNECTION_REFUSED）是安装通道
  噪音，pt-load P15 判定前剔除。
- M-3 计划摘要计数口径=**OQ-1「默认完整迁移」13 键全 true**（直通 10/合成 1/丢弃 1/
  产物 11，夹具 11 条）；core 直调路径（include* 默认 false）是另一参数面——
  `test/convert.test.js` st→l 丢弃用例锁定，两条面各自自洽。

## 已知问题（不阻塞）

见 `tasks/10-25-e2e-instances-runner/research/known-issues.md`：KI-1 st 目标产物命名
前缀 `l_`（显示层疑点）、KI-2 PT 安装挂载竞态（重试已吸收）。
