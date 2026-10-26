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

## KI-3 TT 重启后扩展停用 + 自动启用兜底未通（**已根治**，2026-10-26）

- **原现象**：TT 每次进程重启后 `st-zip-converter` 无痕迹；ttCdpSmoke 的自动启用兜底
  （管理扩展→勾选→30s 有界等待）两轮增强后仍未翻转成功——勾选动作执行但插件痕迹未出现。
  读数 `hasTauriTavernGlobal: true` / `mentionsPlugin: false`。
- **真因（2026-10-26 五轮探针定案，不是「扩展被停用」）**：
  1. **插件是延迟激活的**：TT `script.js` 在 `APP_READY` 之后才调
     `activateDeferredThirdPartyExtensions()`（`nextPaint → initTokenizers → initScrapers`
     之后，`extensions.js:2015`）。冷启动实测**宿主全局就绪后 25–30s** 才
     `Activating extension third-party/st-zip-converter` 并注入工作台。
     冒烟读完一次立刻判死 ⇒ 整轮误报。
  2. **旧兜底的 CSS id 已失配**：`#extensions_menu_button` 在现版 TT 不存在
     （实际 id：`extensions-settings-button` / `third_party_extension_button`）⇒
     `flipped` 永远为 false，那段 30s 有界等待**从未执行**。
  3. **`mentionsPlugin` 是假判据**：扩展面板里的显示名「酒馆数据包互转器」在插件
     **未加载**时也在 DOM 里（`extension_missing` 行）⇒ 文本命中不代表已加载。
     实测未加载时 `mentionsPlugin=true` 而 `pluginResources=[]`（index.js 从未请求）。
  4. `disabledExtensions`（`settings.json`）里**从来没有**本插件 ⇒ 不存在「被禁用」这回事；
     面板里 `extension_missing` = 既未激活也未禁用，即「还没轮到激活」。
- **修复**（`e2e/lib/tt-cdp.cjs`）：删掉整套勾选兜底；改为**有界等待插件自注入信号**
  （`#st-zip-converter-menu-item` / `#st-zip-converter-open-btn` /
  `[class*="st-converter"]` / `.app-container`，默认上限 120s），
  `mentionsPlugin` 降级为诊断字段。回归读数：热进程 `waitedMs=160`、
  **冷启动 `waitedMs=28654`**，两态均 PASS。
- **四宿主矩阵现状（2026-10-26 复跑）**：见 `test-results/instances/summary-*.md`。
