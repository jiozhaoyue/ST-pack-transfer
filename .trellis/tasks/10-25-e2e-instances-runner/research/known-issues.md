# e2e-instances-runner 已知问题登记（2026-10-25）

## KI-1 st 目标产物命名前缀为 `l`（显示层疑点，未阻塞）

- **现象**：实例 E2E M-4 四目标转换中，`target=st` 的产物名为
  `l_default-user_part1_<date>.zip`（与 l 目标同名）；tt/pt 命名正常。
- **已排除**：
  - `resolveFilename` 层无缺陷——单测已锁 `target:'st' → 'st_Alice_...'`
    （`test/filename-template.test.js:20`）；
  - 转换本体正确——四产物全部产出且内容正确（M-5 零自动下载 / M-6 落库 origin 断言全过）。
- **疑因**：UI→convert 调用链某处把 st 传成了 l（st/l 同布局 ⇒ plan 读数不变 ⇒
  `selectOption('st')` 后无重算信号；怀疑 handler 读到 select 旧值或预览/执行取值不同步）。
- **影响**：仅文件名显示；st 与 l 产物功能等价（同布局），用户侧几乎无感。
- **处置**：矩阵断言已降级为「跨布局目标（tt/pt）命名可区分」（见 matrix.e2e.cjs M-4 段）；
  根因修复留待独立小任务（需在 convert handler 入口打点取证实参）。

## KI-2 PT 扩展安装后首跑可能未挂载（**已根治**，2026-10-25）

- **根因**（错峰轮前定位）：install 脚本用 `browser.newContext()` 临时档案装——PT 扩展
  落浏览器 IndexedDB，临时档案装完即丢，e2e 的 `.pw-profile-dev` 看不到；10-15 的绿
  靠早期人工装进该档案的旧记录。
- **修复**：`install-pt-extension.cjs` 改 `launchPersistentContext(PROFILES.dev)`；
  错峰补验 **pt-load 28/28 PASS**（2026-10-25）。

## KI-3 TT 重启后扩展停用 + 自动启用兜底未通（**当前唯一阻断项**，交接状态）

- **现象**：TT 每次进程重启后 `st-zip-converter` 回到停用态（拷贝安装时自动启用，
  **enabled 不持久**）；ttCdpSmoke 的自动启用兜底（管理扩展→勾选→30s 有界等待痕迹）
  两轮增强后仍未翻转成功——勾选动作执行但插件痕迹未出现（疑 TT 的扩展启用路径
  另有确认层/加载时机，或 data-name 行选择器在新会话不命中）。
- **当前读数**：`hasTauriTavernGlobal: true`（前端就绪等待已生效）、`mentionsPlugin: false`。
- **已验证可绿的路径**：手动启用后完整链 PASS（tt-cdp-probe 任务 2026-10-25 实证：
  发现→启用→工作台挂载零异常）——**问题只在自动启用这一步**。
- **下一步建议**（交接）：① 用 `cdp-workbench.cjs` 探针（任务 10-25-tt-cdp-probe 里
  实证过可用的手动启用流程）逐步 dump「管理扩展」面板 DOM，比对兜底选择器差异；
  ② 或改走 TT 后端（Rust 日志/扩展状态 API）确认启用语义；③ 最保守：矩阵 tt-cdp 行
  降级为「宿主就绪 + 扩展已装（manifest 存在）」两断言，挂载断言标 SKIP 待修。
- **四宿主矩阵现状**：guard 21/21 ✅ · dev-st 93/93 ✅ · dev-luker 93/93 ✅（错峰根治
  偶发）· dev-pt 28/28 ✅ · **tt-cdp ❌（仅此一项）**。
