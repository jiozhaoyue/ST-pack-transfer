# 技术设计：UI 编排与数据流重规划

> 配套 `prd.md`（需求全集与决策记录）。本文件承载技术设计要点：各线的数据结构、契约接缝、
> 取证步骤与回滚。所有现状 `file:line` 以 2026-10-24 为准。

---

## 1. 总架构：沿用 10-15 三层，不另起炉灶

模块（纯渲染 `state → DOM`）/ 流程（模块清单声明）/ 外壳（摆法声明）三层**不变**
（`src/ui/workbench-layout.js`）。本设计只做三件事：

1. **左栏列表模块升级为分组渲染**（§2）；
2. **新增一个纯渲染帮助层模块**（§3）；
3. **host-bridge 内新增两个能力接缝**：宿主平台识别两级判定、Authority 选择性备份特性检测（§4/§5）。

双栏外壳、阶段门控、方向开关、五条守卫全部沿用——新需求都在模块层与 bridge 层内消化，
外壳与流程层零改动（避免重排伤及已验收的 10-15 骨架）。

---

## 2. 分组列表（R-A1）

### 2.1 数据结构

```js
// 分组是「渲染视图」不是「存储模型」——IndexedDB 记录形状不变，分组键现算：
// 源包列表：groupKey = origin（'upload' | 'host-export'）
// 产物列表：groupKey = targetLayout（'st' | 'l' | 'tt' | 'pt' | 其他→'其他'）
function groupItems(items, keyOf) {
  // 返回 [{ key, label, count, totalBytes, collapsed, items }]，稳定排序：组间按声明顺序，组内按时间倒序
}
```

- 组的折叠态进 **state**（`state.listGroups = { [listId]: { [groupKey]: collapsed } }`），
  模块自身无闭包状态（层 1 契约）；折叠默认态（全展开/全收起）经浏览器实测裁定后写死为常量。
- 组头徽标：`N 项 · X MB`（复用既有 `formatBytes`）。空组**不渲染**（不留空组头）。

### 2.2 批操作与分组的关系

跨组多选**必须可用**（批量转换跨来源、批量下载跨平台是真实场景）——组头 checkbox 只作
「组内全选/清选」快捷，不切断跨组选择。选中集合仍是扁平 `Set<id>`（现状不变），
组头状态 = 对组内成员的派生读数（全选/半选/空选三态）。

### 2.3 契约与守卫

- `renderStashList` / `renderExportQueue` 保持签名不变，新增 opts `groupBy`（默认开启，
  传 `null` 退回平铺——单测两态都锁）。
- E2E 断言：上传一个包+从宿主拉一个包 ⇒ 源包列表恰两组；转出两个目标 ⇒ 产物列表恰两组。

---

## 3. 区块「?」上下文帮助（R-A2）

### 3.1 形态

- 每个区块标题栏右侧一个「?」图标按钮（`menu_button` 原生类，零新增 CSS 主体样式）。
- 点击弹出**锚定该区块标题栏**的浮层：标题 + ≤5 行要点 + （可选）文档链接。
- 浮层内容是**静态数据表**（`HELP_TOPICS: { [moduleId]: { title, points[], link? } }`），
  纯数据声明，不进模板字符串——帮助文案不受「模板内禁说明文案」守卫误伤，
  但**受同一份文案铁律约束**（无括号补充、无分号长句、禁教学口吻）。

### 3.2 浮层实现

复用 10-15 已裁定的 `attachRowMenu` 通用浮层（R2 浮层必锚行 + 视口边界翻转）——
帮助浮层与行菜单走同一实现，不另写一套 absolute 定位。

### 3.3 守卫

- 新增断言：`HELP_TOPICS` 的每个 key 必须对应模板中存在的 `data-wb-module`（防悬空帮助项）；
- 帮助文案断言与界面文案同规（无括号/分号），落在文案守卫的同一测试文件。

---

## 4. 《UI 编排铁律》定型与守卫补强（R-A3）

### 4.1 spec 单页结构（落 `.trellis/spec/frontend/ui-orchestration-rules.md`）

收敛源：`workbench-single-view.md` §1/3/4/5 + 本轮新裁定。分四节，每节「规则 + 判据 + 守卫名」：

1. **布局**：单一视图；双栏外壳；禁外层滚动条；浮层必锚行；单行文字不折（10-15 三条 CSS 铁律原文收编）。
2. **控件**：多选一用枚举；单列不并排；每控件必须有消费点（`check:control-consumer`）；
   按钮动词表（开始/暂停/中止/载入/下载/写回/删除…**封闭集合**，新增按钮先扩表）。
3. **文案**：无括号补充/无分号长句/无教学 tooltip/无空态解释段；`title` ≤ 8 字；禁黑话（瘦身/剔除）。
4. **帮助**：常驻说明为零；说明只活在引导层与「?」浮层；帮助文案同受第 3 节约束。

### 4.2 守卫补强（进既有守卫脚本，不新开第五之外的第六个）

- 文案守卫扩展：按钮文案 ∈ 动词表封闭集合（按模板源码正则，与既有实现同路数）；
- `HELP_TOPICS` 悬空断言（§3.3）。

---

## 5. 宿主能力接缝（R-A4 / R-A5 / R-B1 / R-B2）

### 5.1 detectHost 两级判定（清 10-14 缺口）

```
第 1 级（前端全局，顺序不可颠倒——Luker 同时暴露 SillyTavern 全局）：
  lukerContext → luker ／ __TAURITAVERN__ → tt ／ __PURE_TAVERN__ → pt ／ SillyTavern → st ／ 否则 standalone
第 2 级（仅插件态且第 1 级非 standalone 时复核）：GET /version 的 agent 串（…:TauriTavern / …:PureTavern / Luker:x.y.z）
两级不一致 → 以第 2 级为准并 logger.warn；都认不出 → unknown（兜底常量）
```

- 返回值集合扩为 `st|luker|tt|pt|standalone|unknown`；**所有既有消费点逐一过堂**
  （`hostLayoutCode()`、`hostSelectionCapability()`、端点选择）——tt/pt 进能力表后按已取证矩阵落值，
  不臆造（TT 端点形态与 PT M21 浏览器侧通道**先在 R-C1/R-B2 取证后再接**，接之前 tt/pt 的拉取按钮置灰
  而非隐藏——与 QuotaBoard 置灰语义一致）。
- 判据数据化：宿主注册表数组（`globalFlag` / `agentMatch` / `platformCode`），新增宿主=加一行。

### 5.2 拉取前预览（R-A5）

- 数据源**零新增请求**：类目清单来自 `selection-defaults.js` 的 13 键表 + `hostSelectionCapability()`
  的能力读数（`supported/known/reason` 已是可直接展示的状态读数）。
- 形态：拉取按钮点击后、发起前，在源包区块内联一行摘要（`将拉取 13 类目 · 全量打包后浏览器内过滤`
  / `按勾选 8 类目透传`）+ 确认按钮——不是新浮层，复用 `awaiting` 阶段语义。

### 5.3 Luker 极致省字节（R-B1，取证驱动）

- 取证三问：① selection 值形状是否支持**文件/路径级**排除（现状只传类目布尔）；
  ② `backups/` `cache/` 等重类目在 Luker 端是否可排除（对应 `includeBackups=false` 能否透传）；
  ③ 端点是否返回 `Content-Length`（可估总量）。
- 实施原则：端点支持什么就透传什么，粒度以取证为准；不支持的排除项退回浏览器内过滤（现状路径）。
- 读数基线：同勾选集下「优化前 vs 优化后」拉取字节数（Dev Luker 8003 实测）。

### 5.4 Authority 适配器（R-B2）

- 本仓侧**只加特性检测**，不加依赖：`host-bridge.js` 内探测 Authority 可移植子集端点
  （如 `/api/plugins/authority/…` 的选择性备份/整包恢复），可用则 `fetchHostBackup`/`restoreToHost`
  在 **st** 平台上优先走增强通道，失败/未装回退原生 `/api/users/backup`（L0-11：fire-and-forget 不阻塞）。
- Authority 仓侧（其自己的任务/PR）：新增 ST 平台的选择性备份与整包恢复端点——**能力设计以该仓
  治理规划为准**，本任务只登记需求与验收期望，不代写实现。

---

## 6. 多实例测试（R-C1 / R-C2）

### 6.1 TT CDP 注入取证步骤（R-C1）

1. 设 `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9223` 后启动本机 TT；
2. `curl http://127.0.0.1:9223/json/version` 验证调试口开；
3. Playwright `chromium.connectOverCDP('http://127.0.0.1:9223')` 枚举页面，找 TT 前端上下文；
4. 冒烟：打开扩展设置页 ⇒ 本插件挂载 ⇒ 扩展行「打开」⇒ 工作台零异常（对齐既有 E2E 断言）。
5. 结论三分支：全通 → 纳入 `e2e:instances`（tag `tt-cdp`）；部分通 → 登记 tauri-driver 备选评估；
   不通 → 替证策略（TT 走「构建产物静态断言 + 手测清单」）落 spec。
- 纪律不变：TT 实例属 Dev 侧（无真实数据），但端口须进白名单登记（新端口按 L0-16 申请，禁 8000/3000）。

### 6.2 e2e:instances 统一入口（R-C2）

```
npm run e2e:instances
  ├─ 1. restart-instances（收编 scripts/restart-instances.cjs：junction 校验 + PT 重装 + 六进程重启）
  ├─ 2. guard 断言（e2e/lib/guard.cjs 白名单 {8001,8003,8899} + TT 调试口（若 6.1 通过））
  └─ 3. 逐宿主冒烟矩阵：
       dev-st  8001 http  ：挂载/工作台打开/上传-转换-下载冒烟
       dev-luker 8003 https：同上 + 宿主拉取（selection 透传读数）
       dev-pt  8899 http  ：挂载（--headed 硬约束）+ 工作台打开
       tt-cdp  9223 cdp   ：（若 6.1 通过）挂载 + 工作台打开
  产物：test-results/instances/<host>-<date>.md 读数 + 截图
```

- 四脚本**先提交入库**（当前 untracked，属 P-18 风险面）——收编时逐个审阅头注释与端口写死处。
- 上贡路径（跑稳一两个任务后）：提炼「守卫+矩阵+收编脚本」为 tavern-harness 的
  `tavern-browser-automation` 扩展节或新 skill `tavern-instance-matrix`，**在其仓走回流流程（R-D1）**。

---

## 7. harness 回流（R-D1~R-D4，全部在其仓走流程）

- **回流机制**（R-D1）：`registry/` 旁加 `contributions.md`（回流清单：来源仓/条目/状态）+
  审核约定（真源仓 PR → 校验脚本过 → 入 rules|skills|registry 之一）。业界无现成轮子（检索结论），
  按 harness 自身「真源+校验」模式自建。
- **UI 铁律上贡**（R-D2）：素材＝本仓 `spec/frontend/{workbench-single-view,component-guidelines,host-capabilities}.md`
  的酒馆通用部分（去本仓细节），落 `tavern-helper-frontend/`（现为空目录）或 `tavern-ui-style`。
- **扫描登记**（R-D3）：harness 新增登记命令（扫描给定根目录下含 `.trellis`/`AGENTS.md` 的 tavern 项目，
  增量写入 `targets.json`），`--verify` 挂进各仓工作流的开头（trellis workflow 模板加一步）。
- **工具化访问**（R-D4）：`tavern-surfaces` MCP 扩查询面（规则条目/回流状态），注册方式沿用用户级。

---

## 8. 回滚与提交边界

- A 线（列表分组/帮助层/守卫）分四个独立提交，每个提交点 = 守卫全绿点；
  `renderStashList` 的 `groupBy=null` 退回平铺是内置回滚开关。
- B 线与 A 线**无文件交集**（bridge/适配器 vs 列表渲染），可并行不互踩。
- C 线 `scripts/` 收编是**独立提交**（先于 e2e:instances 主体），避免 P-18 在途捎带。
- D 线全在 harness 仓，本仓零改动；素材导出物放任务 `deliverables/` 并注明去向。
