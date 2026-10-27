# 交接：回滚后的现状与互传边界（2026-10-28）

> **自包含**：新会话读完这一份即可接手，不需要回溯对话。
> 权威顺序：用户裁定 → 本文件 → `prd.md` → 代码。
> 当前 `HEAD = 9c38374`，工作区干净。

---

## 0. 一句话现状

代码处于 **「三个 AC 补齐 + 合并模式 + 私有配置」那一版（`306e3d1`）**，
外加一次只修 demo 的提交（`9c38374`）。
期间做过的「跨宿主互传矩阵」已被用户叫停并**整体回滚**（`82b237b`），不要再实现。

---

## 1. 时间线（按提交）

| 提交 | 内容 | 现状 |
| --- | --- | --- |
| `306e3d1` | 云端私有件管理界面、分区状态机、文案审查、私有配置容器、合并模式 | ✅ 仍在 |
| `1110f47` | 互传矩阵 + 插件调 Luker 原生 LAN Sync + 收发互换 | ❌ 已回滚 |
| `82b237b` | Revert `1110f47` | ✅ |
| `9c38374` | 只修 demo 的三处致命缺陷（见 §3） | ✅ |

---

## 2. 现在有什么（`306e3d1` 的内容，勿重复实现）

- **合并模式**：多选包时可切成一棵合并图表；生成一个合并包；跨包同名路径**即停**并列冲突清单。
  - `src/core/merge-packages.js`、`test/merge-packages.test.js`、
    `index.js` 的 `generateMerged`、视图批量条与合并徽标。
- **私有配置容器**：`src/core/private-container.js`（`manifest.json` + `_private/` + `nativeRestore`）
  + `test/private-container.test.js`。
- **user/files 传云（仅作为插件自身能力）**：
  `src/ui/host-bridge.js` 的 `uploadUserFile` / `deleteUserFile` / `verifyUserFiles`
  （`/api/files/upload|delete|verify`，文件名白名单、500MB、CSRF）；
  `src/ui/private-files-store.js` 记录已上传清单；
  图表私有一级组头的「云端私有件」入口 → 管理弹窗（列表 / 校验 / 逐条删除）。
- **分区状态机**：`src/core/zone-model.js`（`actionsForZone` / `actionEnabled` /
  `zoneOfOrigin` / `copyBackRecord`）+ `test/zone-model.test.js`（AC-20）。
- **文案审查**：`scripts/copy-audit.js` + `npm run check:copy`（AC-31）；
  规则：面板正文禁括号说明、禁中文分号长句、禁同区域重复长文案；`help.*`/`tutorial.*`/`log.*`/`*Hint` 豁免。
- **已删除**：`src/storage/vault-store.js` 与其单测（用户授权）；`ORIGINS.VAULT` 仅保留读历史。
- **任务树**：`10-26-storage-chart-workbench` 及其 10 个子任务全部归档；
  `10-27-host-chart-settings` / `chart-single-source` / `i18n-tutorial` 已归档。

---

## 3. demo 修复（`9c38374`，只动两个文件）

`src/ui/ui-demo.html` 与 `src/ui/workbench-view.js`：

1. `demoTree` 的 `group:cache` 少一个右括号 → 整段内联脚本语法错误。
2. `renderTargetPicker` / `renderChart` 里 i18n 的 `t` 被 `map`/`forEach` 参数遮蔽 → `t is not a function`。
3. `demoPrivateFiles` 在 `createWorkbenchView` 之后声明 → 动作闭包 TDZ。

> **教训**：这三个缺陷在 `306e3d1` 之前就存在，说明「demo 先行」此前**从未真正渲染过**。
> 今后改 demo 必须用无头浏览器实际加载一次（见 §8）。

---

## 4. 用户新边界（2026-10-27/28 裁定，硬约束）

1. **只做插件对插件**。插件**不得**调用任何宿主原生同步端点、不得写宿主同步目录、
   不得做「插件 × 原生」的任何联动。
2. **不专门造公网 P2P 的轮子**。现有局域网 WebRTC 行为**不删也不扩**，保持原样。
3. **禁止独立弹窗**。新界面只能挂在现有工作台（模板 / 单视图）内，不得新造浮层。
4. 界面**先在 demo 定稿**，确认后再接真实逻辑。
5. 验证偏好：**禁四宿主复验、禁全量测试**；只跑定向小测 + 守卫 + `npm run build`。

---

## 5. 四宿主原生局域网同步：事实与证据（插件不参与）

| 宿主 | 原生互传 | 证据 |
| --- | --- | --- |
| Luker | 有：局域网同步 | `src/sync/categories.js` 的 `user-files` 类别 `syncDefault:'on'`；端点 `/api/sync/v1/{health,peers,categories,availability,pair/start,pair/accept,peers/:id/sync,pull,undo}`，挂载 `src/server-main.js:491` |
| TauriTavern | 有：LAN Sync v2 | `docs/CurrentState/Sync.md`：本机 HTTPS peer + SPKI pin + 配对 URI/二维码；`/v2/*` 协议族 |
| SillyTavern | 无 | 实例源码检索 `局域网/LAN Sync/WebRTC/RTCPeerConnection/PeerJS/mDNS` = 0 |
| PureTavern | 无传输 | README 的「局域网」只指把 Provider/代理指向局域网地址 |

**关键限制（供以后避免误判）**：
- Luker `POST /peers/:id/sync` **只有本机拉取**语义，没有远端直推端点。
- TT 扩展不能 invoke Tauri 命令。
- 因此「插件调原生实现互传」在两端都做不成完整闭环——这也是用户叫停的原因之一。

---

## 6. 两两实况（只列插件对插件）

插件对插件在四宿主之间**全部**走现有的局域网 WebRTC（取件码 + 扫码），与宿主类型无关；
`ST / Luker / TT / PT` 的 4×4 组合没有「某两个不能传」的情况。
原生局域网同步由宿主自己完成（同宿主设备之间），**插件不参与、不显示、不触发**。

> 收发角色互换（swap）**已被回滚**，当前没有这个按钮；如需要，按新边界重做（不得独立弹窗）。

---

## 7. 关键文件地图

| 区域 | 文件 |
| --- | --- |
| 工作台视图 | `src/ui/workbench-view.js`（模板渲染、图表、私有件弹窗、弹窗体系 `openModal`） |
| 模板唯一源 | `src/ui/workbench-template.js` |
| 控制器 | `index.js`（`main()` 内装配 actions；`generate` / `generateMerged` / `uploadPrivate`） |
| 图表模型 | `src/core/chart-model.js` |
| 合并 | `src/core/merge-packages.js` |
| 分区 | `src/core/zone-model.js` |
| 私有容器 | `src/core/private-container.js` |
| 宿主适配 | `src/ui/host-bridge.js`（探测、备份、恢复、`/api/files/*`） |
| i18n | `src/i18n/index.js`、`locales/{zh-CN,en-US}.js` |
| 文案审查 | `scripts/copy-audit.js` |
| demo | `src/ui/ui-demo.html`（只消费正式代码） |
| 规范 | `.trellis/spec/frontend/{host-capabilities,i18n-and-settings}.md` |

---

## 8. 验证读数（`9c38374`）

- `npm run build`：通过。
- `npm run check:i18n`：通过（UI 零中文字面量）。
- `npm run check:dom-injection`：通过（17 文件，豁免 1）。
- 定向小测：`i18n` / `workbench-session` / `chart-model-options` = 33 passed。
- demo 无头加载：`#app` 9 个子块、5 张包卡、11 行树节点，**console / pageerror 均为空**。
- **未做**：四宿主复验、全量测试、截图入库（按用户指令）。

复现 demo 渲染（一次性脚本，不入库）：

```bash
npx vite --port 3041 --strictPort &
node -e "const{loadPlaywright}=require('./e2e/lib/resolve-playwright.cjs');(async()=>{const{chromium}=loadPlaywright();const b=await chromium.launch();const p=await b.newPage();p.on('pageerror',e=>console.log('ERR',String(e)));await p.goto('http://localhost:3041/src/ui/ui-demo.html',{waitUntil:'load'});await p.waitForTimeout(1200);console.log(await p.evaluate(()=>({cards:document.querySelectorAll('.pkg-card').length,rows:document.querySelectorAll('.tree-row').length})));await b.close()})()"
```

---

## 9. 未完成 / 待裁定

1. **私有件管理弹窗与「禁止独立弹窗」冲突**：该弹窗是 `306e3d1` 加的，属于现有弹窗体系
   （`openModal`，与设置/日志同款），但用户新规要求禁止独立弹窗——**需要用户裁定**是保留、
   改成内嵌面板，还是并入现有区块。**未改动**。
2. `package-cards-vault` AC-26 仍部分满足：容器与登记表有单测，**序号分配 / 包名折行判定无单测**。
3. 生产 `index.js` 仍未调用 `setHostTree`，宿主真实树未接线（需单独立项）。
4. `scripts/install-pt-extension.cjs` 保留旧目录名作清理兼容分支（非违规）。

---

## 10. 给接手会话的第一句话

**先读 §4 与 §5**：只做插件对插件；插件不碰宿主原生同步；不造公网 P2P；禁止独立弹窗；
demo 先行。互传矩阵的代码已被整体回滚（`82b237b`），**不要再实现**。
§9-1 的私有件弹窗待用户裁定，别擅自动它。
