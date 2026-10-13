# 插件驱动产包 与 写入前三道守卫

> **适用**：把「实例数据」搬进别的实例时的**产包**与**写入前**两段。
> 来源：任务 `09-27-plugin-driven-instance-sync`（2026-10-13 实测收口）。
> 相关页：[Instance E2E And Data Sync](./instance-e2e-and-data-sync.md)（端口/协议纪律、四宿主导出导入通道、覆盖率判定三口径）。

**为什么单开一页**：`instance-e2e-and-data-sync.md` 已 **47 602 字节 > 32 768**（该页顶部自记「会被静默截断」）。
本页承载「插件产包链 + 写入前守卫」，不再往那页加。

---

## 1. 生产链（U-2 的实质改动）

**数据产生由插件承担，搬运由脚本承担。**

| 段 | 装置 | 说明 |
| --- | --- | --- |
| 产包 | `scripts/instance-sync/produce-via-plugin.cjs` | **驱动插件工作台的真实控件**（宿主拉取路径），产物由插件的**待导出区**下载出来 |
| 搬运/灌入 | `restore-luker.cjs` / `import-st.cjs` / `import-pt.cjs` | 复用既有通道，**不改语义** |
| 交叉核对 | `build-packs.cjs`（**不删**） | 一步直出与它的产物做条目级比对（`diff-packs.cjs`） |

**判定依据（AC-A1）**：产物由**实例页面的插件 UI 触发并落盘**。
**不得**用 Node 侧直调 `POST /api/users/backup` 冒充 —— 那是 `export-backups.cjs` 的活儿，两者互为对照组。

### 1.1 一步直出（OQ-2，2026-09-29 采纳）

`--layout st|tt|l` 直接产出目标布局包，`build-packs.cjs` 退为交叉核对装置。

⚠️ **「等价」有前提，必须照抄**：一步直出与 `build-packs` **在取数口径相同时**才字节级等价。
两侧口径由 `selection` 决定 —— 插件**可以**要全局扩展（`globalExtensions:true`），
而宿主原生备份这条路**拿不到**它们。⇒ 别写成「两条链路等价」。

### 1.2 selection 口径：清初态 + 钉死（2026-09-29 修订）

| 步 | 做法 | 为什么 |
| --- | --- | --- |
| **清初态** | 删 `workspace` store 的 `active_session` → **重载页面** | 本工具与 **E2E 共用同一持久化档案**；E2E 留下的夹具源包 + 收窄后的 selection 会被 `index.js` 的 `setSelectionState(savedState.selection)` 恢复，**静默改写产物的 selection 口径** |
| **定口径** | 默认**不喂夹具**；仅当 `--deselect` 非空才喂 | 喂夹具会用**夹具的** `count === 0` 把缺失类目置 false（那是**夹具的**可用性，不是宿主源的） |
| **取证** | 读插件**自报**的 `勾选类目:` 日志行 | 「插件到底发了什么」的直接观测 |

⚠️ **`STANDARD_KEYS` 不含 `backups` / `cache` / `appPrivate`**（它们由 `includeBackups` 旋钮与模块默认各自决定）
⇒ `--deselect backups` **不生效**（2026-10-13 实测：自报 selection 里 `backups` 仍在），
且因为触发了喂夹具而**丢掉 `globalExtensions` / `vectors`**。**别用它**。

---

## 2. 产包器的三条契约（2026-10-13 实测补全）

### 2.1 端口纪律的**分层**（不是两份端口表）

`e2e/lib/instances.cjs` 的登记表是**所有**实例的唯一定义点。
`e2e/lib/guard.cjs` 的白名单 `{8001, 8003, 8899}` 是 **E2E 的**使用限制 —— 产包器是**另一个消费者**，
源是 Real Luker（`:8004`）⇒ 若走守卫会被自己拦下。产包器**继承守卫的三条精神**但不调用它：
`--source` 必填且必须在登记表内（无兜底值）、启动即断言、禁止因端口被占而回退到别的实例、拒绝 `8000`。

### 2.2 R-20 做进产包器（硬门禁，不是提醒）

第 3 步读**实例插件版本** vs **工作区 HEAD**，不一致即**拒绝执行**并提示先 `git pull`。
2026-10-13 实测：工作区 `4cada1f`，四实例 `git pull` 后全部跟上。
**实例插件目录只走 `git pull`**（动的是**代码目录**，不是用户数据）。

### 2.3 产物出口：**按目标布局前缀挑条目**

⚠️ **不能取「待导出区末条」**（2026-10-13 实测回归）：S2 的「源端三类交付」之后，
一次宿主导出会往待导出区放 **3 条** ——
`<宿主平台>-<handle>_源备份.zip`、`<目标布局>_<user>_<part>_<date>.zip`、`<宿主平台>-<user>_报告.txt`。
取末条 ⇒ 拿到**报告 `.txt`** ⇒ 下载后按 zip 读 ⇒ `End of central directory not found`
（**产物明明已经产出，却被判失败**）。
判据：`pickTargetRow(names, prefix)` —— 名字以 `.zip` 结尾**且**以目标布局前缀（`--raw` 时 `raw-`）开头。

### 2.4 OPFS 残留必须每次清（**退化型故障**）

插件把拉取流**直写 OPFS**（`fetch-<ts>.zip`），成功时自删、**中断时不删** ⇒ 残留累积。
2026-10-13 实测 `.pw-profile/Default/File System` 达 **5.2 GB**，现象是**退化的**：
**第一次能跑完，之后每次都在 ~1.3 GB 处停滞**。
⇒ `clearStaleOpfsTemps(page)`：每跑前只删名字匹配 `fetch-*.zip` 的条目（不碰其它 OPFS 内容）。

### 2.5 「浏览器路径停滞」先看机器负载，别先怀疑代码

真源（1.66 GB）的浏览器拉取**会**停滞，但**可恢复**：
同一命令在**机器空闲**时 4 分钟内跑完（拉取 1655.9 MB），在机器被别的会话占满时
可在 `~1.3 GB` 处停顿数十秒乃至 >400 s。
⚠️ **判存活只认页内心跳**（阶段 + 已接收字节 + 速率）—— OPFS 是**惰性落盘**的，**体积不能当进度表**
（曾据 OPFS 体积误杀一个其实在正常推进的进程）。

---

## 3. 写入前三道守卫（**必须在任何写入之前全部生效**）

顺序铁律：**`产包 → 备份 → 只读快照 → 灌入 → 核对`**。**不得**让任何写入跑在备份前面。

装置：`scripts/instance-sync/prewrite-guards.cjs`（读数 → `research/pre-write-guards.json`）。

| 守卫 | 判据 | 失败语义 |
| --- | --- | --- |
| **链接子树** | `lib/link-guard.cjs` 的 `findLinkedRoots` 扫写入根 | **报告**（写入时默认逐条跳过 / 前置拒绝），非中止 |
| **宿主源码禁改** | 写入根下的**子路径探针**必须被实例仓 `.gitignore` 覆盖（`git check-ignore -v` **有输出**） | **中止**（落在源码面 = 改宿主源码，`L0-1` 红线） |
| **`.git/objects` 只读冲突** | 产物内 `extensions/<扩展>/.git/objects/...` 对应的目标文件若**已存在且带 ReadOnly** | **中止**（先决定处置，不得先写再撞 `EPERM`） |

### 3.1 源码面断言**必须用「子路径探针」**

2026-10-13 实测：`git check-ignore -v data/default-user` **命中**（`.gitignore` 的 `/data`），
而 `git check-ignore -v public/scripts/extensions/third-party` **不命中**（该目录自身的规则不返回匹配），
但其**子路径**返回命中。
⇒ 探针取 `<写入根>/__prewrite_guard_probe__` —— 对「根自身命中」与「仅子路径命中」两种形态都成立
（gitignore 语义：忽略目录即忽略其全部内容）。

### 3.2 写入根（覆盖全部落点，别漏）

| 宿主 | 写入根 |
| --- | --- |
| ST | `data/default-user` + `public/scripts/extensions/third-party` |
| Luker | `data/default-user` |

依据：`import-st.cjs` 的 `RAW_WRITE_ROUTES`（`extensions` → `public/scripts/extensions/third-party`，
其余裸落盘类目 → `userDir/<key>`）+ 端点类目（宿主服务端写在 `userDir` 下）+ Luker 原生整包恢复（写在 `userDir` 下）。

### 3.3 链接子树：**门禁必须「产物感知」**

用户 2026-09-26 裁决「默认跳过链接子树」。但**原生整包恢复是服务端一把写完的**，客户端没法逐条跳过
⇒ 只能「发现即拒绝」，除非 `--allow-links`。

⚠️ **「目录下有链接即拒绝」过宽**（2026-10-13 实测踩到）：即使产物里**根本没有**那条子树的条目也拒绝，
把「先按前缀过滤产物、再灌入」这条**安全**路径堵死。
**正确判据**：**只有产物真的会写入该链接子树时才拒绝** —— 存在包内条目以 `<链接相对路径>/` 开头。

配套装置 `filter-pack.cjs`（按前缀剔除条目产出新包，**只改产物、不碰实例**）。

**实例（2026-10-13）**：`dev-luker` 的 `data/default-user/extensions/ST-BgLoader` 是指向工作区仓
`My-repo/ST-BgLoader` 的 **junction**（`P-19` 那条），产物里有 **1090 条** `extensions/ST-BgLoader/**`。
处置：过滤产物（保留 6289 / 剔除 1090）→ 灌入（`restoredCount 6287`）→ **穿透零发生**
（复核：junction 仍在、`git -C My-repo/ST-BgLoader status --short` 为空）。
被剔除的 1090 条按「单列不判」登记。

---

## 4. 可重跑性判据（AC-A2）——**别让它变成假红或假绿**

**同一源连续两次产包**，并**同时记录源的 mtime 快照**（`snapshot-manifest.cjs` 的
`{files: {path: [size, mtimeMs]}}` 形态）：

- 两次快照**一致**而产物不一致 ⇒ **真缺陷**，须修；
- 快照**不一致** ⇒ 读数**标注「源在期间变动」**，**不算失败**。

**可判定的不变量**：**同路径条目 `crc32` 全等** + **差异条目在源快照上同期变动**。

**实例（2026-10-13）**：`l` 连续两次 —— run1 511.7 MB / **7379 条目** / sha256 `8a8bb282…`；
run2 同条目数、体积差 **+294 B**。`diff-packs.cjs` 逐条判：**7375/7379 同路径同 `crc32`**，
4 条内容不同（`settings.json`、`chats/…Branch #8.jsonl`(+3379 B)、`…chat_sync.json`、`usb_global_achievements_*.json`）。
源 mtime 快照 **18 条变动**，**恰好包含那 4 条**，另有新增的宿主自动备份
（`backups/chat_____3_…_20261013-{142026,143154,143934,143944}.jsonl` 等）
⇒ **真源当时正被另一个会话使用**（约每 10 分钟落一份备份）⇒ 判为**「源在期间变动」**。
⚠️ **不得**据此声称「产物完全确定」；**也不得**因 294 B 判为缺陷。

---

## 5. 覆盖率核对的两个**口径陷阱**（2026-10-13 实测）

### 5.1 ST 目标**必须传 `--extra-root`**

`extensions/` 的原生位置在 `userDir` **之外**（`<inst>/public/scripts/extensions/third-party/`）。
`diff-report.cjs --extra-root '<绝对路径>:extensions/'` 才把它并入扫描面。
**漏传时覆盖率会假报 `26.749%`**（1973/7376）—— 补传后并入 6131 / 5650 条、回到 **99.986%**。
⚠️ 路径要写 **Windows 形态**（`D:\...`）；写 `/d/...` 会被判「额外根不存在」而静默跳过。

### 5.2 「这两个数字量的是同一件事吗？」（本仓已栽 5 次）

2026-10-13 本条**当场兑现两次**：源 `chats/<角色>/` **目录 23** vs PT `characters` **25 records**；
源 `chats/` **文件条目 1029** vs PT `chats` **471 records**。**两次都没有强行判等**，而是登记口径差。
（另：`26.749%` 那条假红也是同一族 —— **扫描面**不同，不是内容不同。）

### 5.3 单列不判项**必须显式列出**

合成元数据（`_convert/**`、根 `manifest.json`）、Luker 私有状态（`characters/*.state.*.json`）、
链接子树内条目、宿主自管缓存（Luker `backups/` 轮换、ST `thumbnails/` 失效重建）——
四类都**显式列出、不参与判定**，**不得静默算作已覆盖**。
2026-10-13 四目标**各缺 1 条且都是同一条** `public/scripts/extensions/third-party/.gitkeep` ——
当场查实为**扫描口径伪影**（该文件在四个目标上**都在**），不是真缺失。

---

## 6. 实例侧 E2E 必须**显式切到高级工作台视图**

S5 第二步起，插件**默认入口是迁移向导**（根容器 `data-wb-view="wizard"`），而向导
**一次只披露当前步的区块** ⇒ 非当前步的控件是 `display:none`，`#target-select` 恒 `0×0`
⇒ 直接点它必然以「element is not visible」超时。

- **standalone 运行器**早有 `e2e/standalone/lib/common.cjs` 的 `useAdvancedView(page)`；
- **实例侧规格此前未适配**（`matrix` / `pt-load` / `library-inject`）⇒ 2026-10-13 实测 `npm run e2e` **17 项红**。
- 修法：`e2e/lib/harness.cjs` 新增并导出 `useAdvancedView(page)`，各规格在**打开抽屉之后、可见性验收之前**调用。
  实现用**页内 `btn.click()`**（不做命中测试，免疫 splash / 第三方模态 `<dialog>` 拦截指针事件），
  视图根按 `document.querySelector('[data-wb-view]')` 定位（抽屉态不是 `#app`）。

---

## 7. 批量子项的真增量续传（R6b，2026-10-13 落地）

**不变量与单包路径**逐字同源（见 `frontend/state-management.md` §8）：
> 跳过一个条目的**充分条件** = 半成品里真有它的字节。

此前**批量子项没有接这条路径**：`index.js` 的 `handleBatchConvert` 调 `runConversionTask` 时
**只传了** `signal` / `resumeCrcMap`，缺 `appendFrom` / `finalizeOnAbort` / `onPaused`
⇒ ① 暂停时**不产半成品**；② 续传时**无字节可跳**（台账 `doneEntries` 对新子项恒为空）。
用户可见后果是「批量暂停 → 继续」= **整批重做**（正确但慢），而 `M-10b` 的
「续传真的跳过条目」断言**恒红**。

修法（`index.js`）：

| 位置 | 改动 |
| --- | --- |
| `persistPartial` 签名 | 新增 `buildCheckpoint({name, partialEntries})`（`index.js:197/246`）——**批量必须传它** |
| 批次断点形状 | `buildBatchManifest` 增加 `partialOpfsName` / `partialEntries`（`index.js:904-905`） |
| 子项续传入口 | 仅当 `i === startIndex` 时读断点的半成品（`index.js:952-974`） |
| 子项转换参数 | 补 `appendFrom` + `finalizeOnAbort: true` + `onPaused`（`index.js:997-1016`） |
| 子项完成 | 清掉该子项半成品（否则**下一子项**会误以为可续 ⇒ 缺条目） |

**为什么 `buildCheckpoint` 是必需的（不是可选美化）**：`persistPartial` 的默认形状是
**单包**断点 `{partialOpfsName,target,partialEntries,totalEntries}`。批次断点是
`{kind:'batch',itemIndex,outputs,itemIds,…}`。若让默认形状落盘，批次续传就**读不到
`itemIndex` / `outputs`** ⇒ `batchResumeVerdict` 判「断点作废」⇒ 静默重跑整批。
单测：`test/persist-partial.test.js` 的「buildCheckpoint：批量路径可写自己的断点形状」。

**跨子项复用半成品 = 缺条目**：不同源包几乎必然含同名条目（`settings.json`、`characters/X.png`）。
半成品归属**游标指向的那个子项**，与 `doneEntries` 同域；每个子项开始/结束时重建。

---

## 8. 实例侧 E2E 的「红灯来自别人」——两类，都**必须能被一眼看见**

实例侧 E2E 跑在**别人写的宿主**上，红灯的来源常不在本插件。2026-10-13 一次收口里
两处残留红**都不是本插件缺陷**，且**第一处的归因错了整整几轮**。

### 8.1 宿主/第三方模态弹窗拦全页指针事件

`<dialog open>` 一旦弹出，Playwright 的 `page.click` / `page.check` 会**重试到 30 s 超时**，
报错只有一句 `intercepts pointer events`，**看起来毫无头绪**。

已知两条（`e2e/lib/harness.cjs` 的 `installChatFilesysPromptGuard`，现为**规则表**）：

| 弹窗 | 识别 | 安全按钮 | 首次实测 |
| --- | --- | --- | --- |
| ChatFilesys「入库提醒」 | `.chatfilesys-import-prompt`（**类名会漂** ⇒ 回退按按钮文案认） | 「不入库」 | 2026-09-29 dev-st |
| **Luker「检测到 Luker 有可用更新」** | `dialog[open]` 且文案含「有可用更新」 | 「稍后」 | **2026-10-13 dev-luker** |

**纪律**：只点**唯一不产生副作用**的那个按钮（不入库 / 稍后）；**绝不**点「立即更新」
「不再提醒」这类会改变实例状态的按钮。守卫用 **init script + MutationObserver**——
这些弹窗**晚于 `goto()` 返回**（宿主把内容载进来之后才弹），"goto 之后点一下"抓不到。

**归因教训**：Luker 那条此前被记成「profile 暂存区累积到 58 项」，据此修了两轮都没绿。
真因是 `e2e/run.cjs` 的 **catch 里加了一次 `<dialog>` 转储**（`reportBlockingPopups`）——
**一次定位**。⇒ **凡是点按超时，先转储页面上打开的 `<dialog>`**，再谈归因。

### 8.2 持久化 profile 的夹具累积（清理名单必须按**上传面**列全）

`#file-input` 是「**总是入库**，仅在尚无源包时采纳为当前源」⇒ 同一份夹具**每轮再入一条**
（新 id），`files` store 只增不减。累积到几十条后宿主 UI 变慢、目标行不可点。

**陷阱**：早先的清理只删**大**夹具（`fixture-pause-*` / `fixture-large-*`），
而累积**与夹具大小无关、只与上传次数有关**——实测 dev-st 暂存区 **56 项全是** `fixture-st.zip`。
⇒ 清理名单必须覆盖**所有会被上传的**夹具名（`e2e/lib/fixture-prune.cjs` 的 `FIXTURE_NAMES`），
且 `matrix` / `library-inject` / `pt-load` 三处**共用同一份**。

### 8.3 「瞬时读」在异步收尾窗口里必然偶发假红（**2026-10-13 实测一次**）

`M-7 无活动任务时控制条隐藏` / `M-8 未探测前按钮不禁用` 两条断言曾**偶发转红**（同一代码另跑一轮全绿）。

机理（读 `index.js` 的单包转换收尾段）：

```
exportQueue.enqueue(...)      // ← 队列行出现（rAF 渲染）—— E2E 的 waitForQueue 就是等这个
await taskManager.complete()  // ← 这里是个 await
taskControls.hide()           // ← 控制条隐藏
} finally { workbenchBusy = false; applyActionAvailability(); }  // ← 按钮可用性在这里才重算
```

⇒ **「队列出现新行」不等于「任务已收尾」**：`taskControls.hide()` 与
`applyActionAvailability()` 都在 enqueue **之后**的 await 链里，且**顺序是 hide 先、求值后**
（所以控制条已隐藏时，按钮上可能还挂着上一任务期间的 `disabled=true`）。
瞬时读这两个状态 ⇒ 负载高时偶发假红。

**修法**：两条都改**有界等待**（`page.waitForFunction` 15 s），超时才判失败 ——
**真·有活动任务 / 真被禁用**时照样超时转红，判别力不丢；只是不再惩罚合法的异步收尾窗口。

**通用纪律**：凡是「上一个异步动作的**副作用**」驱动的断言（控制条可见性、按钮可用性、
列表内容），一律**先有界等待目标状态**再读快照，不要读瞬时值（`L1-MR-7` 的 E2E 侧形态）。

### 8.4 暂停类断言：必须等「**真的开始产出**」，不能只等「子项已完成」（2026-10-13）

`M-10b 批次续传真的跳过了条目` 的**时序前提**比看上去窄得多。实测两种反向失败：

| 失败形态 | 触发条件 | 日志特征 |
| --- | --- | --- |
| **太晚** | 点暂停时整批（含大包）已跑完 | `[2/2] …成功` 之后才 `任务已请求暂停` |
| **太早** | 第 1 个子项的 Worker 刚起跑、还没写任何条目 | `已保留半成品 …partial.zip（**0 条**）` ⇒ 续传「跳过 0 项」 |

⇒ 断言只在「子项**中途**」这一个窄窗口成立。修法两步（都已落地）：

1. **加宽窗口**：暂停夹具的窗口宽度 = **条目数 × 每条目耗时**（**不是字节数**），
   故 1500 条 → **6000 条**（字节反而降到 1 KB/条，profile 负担不增）；
   夹具**必须改名**（`fixture-pause-many-st.zip` → `fixture-pause-bulk-st.zip`），
   否则按名缓存会让旧夹具被静默复用（本仓已栽过）。
2. **等对信号**：点暂停前先等 `#status-label` 出现 **`[2/2] `** 前缀
   （批量 `onProgress` 的逐条目进度）—— 它出现才证明第 1 个子项**真的在往产物里写**，
   而不是「子项 0 已完成」这种**代理量**。代理量在两种失败形态下都是真，唯独在被测语义上是假。

**通用纪律**：凡「暂停/中断类」断言，前置条件必须是**被测行为本身的读数**（这里有：进度已推进），
不能是相邻事件的读数（队列多了一行 / 上一个子项完成）。

---

## 9. 跨宿主「四端互通」的可自动化证据面

`R-01` / `AC-12` 要求**四宿主间 12 条有向迁移路径逐条**有证据，且**不以代表路径替代**。
可自动化的那一半做成 `e2e/standalone/specs/cross-host.e2e.cjs`：

- **3 个真实源布局**（`fixtures/gen.js` 的 `fixture-st.zip` 摊平 / `fixture-l.zip` 摊平+manifest /
  `fixture-tt.zip` `data/`）× **4 个目标**（`st`/`l`/`tt`/`pt`）= **12 条有向路径**；
- 每条断言：① 产物合法且非空（**前置门**）；② 目标落位规则（必须有 / 必须没有的前缀）；
  ③ **数据一条不少**——聊天与角色卡的**条目数与源包逐条对上**（跨布局只改路径，不丢条目）；
- 每个源**新开一个 context**（`#file-input` 换源包的坑，见 `perf.e2e.cjs` 的 `measureFresh`）。
- 实测：**71/71**，12 条路径逐条 OK（`st→st` 12 条 / 跨布局 10–11 条 / chats=1 / chars=1）。

**不可自动化的那一半（不得冒充）**：目标侧**写入**——ST 恢复端点 404（`targetWrite=unavailable`）、
TT 无浏览器端口（人工交付）、PT 人工导入。故本 spec 是**格式转换 + 交付**层面的证据；
目标侧写入的证据在实例侧与人工记录里，**两者不得互相顶替**。

**PT 作为「源」是已知阻断（登记，不掩盖）**：`detect.js:6/55-57` 能**识别** PT 原生归档
（manifest 带 per-file `moduleId`）但 **v1 不支持转换**（`D-23` 已裁定「首版补齐」但实现未定）。
故有向路径的**源**只取三种**可读**布局（`st` / `l` / `tt`），**目标**取全部四端
⇒ **3 × 4 = 12**。PT 的 3 条**出边**（`pt→st` / `pt→l` / `pt→tt`）当前**不可自动化**，
逐条登记为阻断（`AC-12` 允许「无法自动化的形态逐条记录人工证据」，但**不允许**用代表路径替代）。
