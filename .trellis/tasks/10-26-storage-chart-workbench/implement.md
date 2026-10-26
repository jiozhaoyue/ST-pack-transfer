# 存储图表工作台 — 执行计划

> 复杂任务。每个阶段结束跑一次质量门；阶段提交保持可回滚。

## 阶段 0：UI Demo（中间评审件）

- [x] 单文件 `deliverables/ui-demo.html`，离线、双击即开。
- [x] 桌面 + 移动双形态；面板边框完整、组件不交错。
- [x] 模拟数据覆盖：四宿主可读/不可读、私有配置、未识别包、分卷、导入/导出区、包卡、日志、教程、问号。
- [x] 截图校对桌面与移动，交用户评审后再进入实现。
- [x] 2026-10-27 评审轮：配色改为继承酒馆主题令牌 + BodyColor 派生轮廓（R9）。
- [x] 2026-10-27 评审轮：四平台品牌色按官方图标取色、只用于标识；Luker 换真图标（R9.3–R9.5）。
- [x] 2026-10-27 评审轮：顶栏徽标改「宿主名+插件 / GitHub+Web」；日志移入顶栏弹窗（R10）。
- [x] 2026-10-27 评审轮：桌面左右/上下分隔条 + 交叉点十字手柄；执行贴底；筛选行固定（R11）。
- [x] 2026-10-27 评审轮：图表树按真实备份包逐文件重写；分卷 32–2048 MB 且能下钻装卷（R12）。
- [x] 2026-10-27 评审轮：包卡序号改两位数字、删「在图表中查看」、包名动态两行（R4 修订）。
- [x] 2026-10-27 评审轮：批量生成导出包按「包 × 卷」产出多个可独立导入的包。
- [x] 2026-10-27 评审轮：基础教程首次自动弹出（同一会话一次）。

**验证**：Playwright 打开 `file://` 截图 14 组（桌面/移动/四宿主/浅色/分卷/多包/拖拽/日志/Web/教程/批量导出），控制台零错误。

## 阶段 1：纯逻辑骨架

- [ ] 新增 `src/core/format-registry.js`：四宿主英文全称、icon 资源、检测规则、类目映射。
- [ ] 新增 `src/core/naming.js`：完整占位符集合；`{target}` 英文全称；`{datetime}` 到秒；默认模板。
- [ ] 新增 `src/core/package-model.js`：包、私有配置、图表节点的纯数据模型。
- [ ] `src/storage/db.js` 扩展 origins：`export-copy`、`private-config`、`unrecognized`。
- [ ] 单测覆盖命名、注册表、模型。

**验证**：`npx vitest run test/naming* test/format-registry* test/package-model*`

## 阶段 2：存储清单适配器

- [ ] `inventory-adapters/luker.js`：`/api/users/storage/inspect` 逐级钻取。
- [ ] `inventory-adapters/puretavern.js`：Dexie `pure-tavern-modular-dev` 枚举。
- [ ] `inventory-adapters/tauritavern.js`：`window.__TAURI__.fs` 枚举 `$APPDATA/data`；实测 scope，被拒则降级。
- [ ] `inventory-adapters/sillytavern.js`：`unsupported`，UI 置灰。
- [ ] `inventory-adapters/browser.js`：浏览器配额 + 插件自身 IndexedDB。
- [ ] 统一节点形状与建议色映射。
- [ ] 单测用夹具覆盖四种返回形状；不引入宿主依赖。

**验证**：`npx vitest run test/inventory*`

## 阶段 3：图表

- [ ] `src/ui/storage-chart.js`：配额表头 + 树主体；大类折叠到文件；三态；全选/反选/反选。
- [ ] 目标平台选择器在图表卡顶部；四英文全称；当前宿主徽标；删除 native。
- [ ] 差量顶部切换；扩展一级节点（完整/仅列表、Git、构建）；私有配置一级节点；未识别显式节点。
- [ ] 建议色 + 图例 + 悬浮；勾选按宿主+包记忆。
- [ ] 大包性能：默认折叠 + 超阈值虚拟滚动 + rAF 合帧。
- [ ] 多卷渲染：`volumesOf()` 下钻装卷、每卷一张标准图表卡、单卷超上限显式标记、0 字节不成卷。
- [ ] 多包渲染：多选时按包分组网格；桌面网格、移动单列折叠（默认只展开第一卷）。
- [ ] 主题层：只读 `--SmartTheme*`，轮廓取 BodyColor 派生；品牌色只作用于标识元素。
- [ ] 单测：图表模型、三态、记忆键、建议色、分卷分配、多卷/多包渲染。

**验证**：`npx vitest run test/storage-chart*`

## 阶段 4：分区与数据包区

- [ ] `src/ui/zone-panel.js`：导入区/导出区列表；按区限定批操作。
- [ ] `src/ui/package-card.js`：名称 + 格式宿主 icon + 大小 + 时间；桌面 hover、手机点击看全名；全量排序。
- [ ] 「生成导出包」复制解耦；导出区只读；复制回导入区；两区删除确认。
- [ ] 生成导出包按「包 × 卷」产出多个独立可导入的包（每卷一个），不是带分卷标记的单包。
- [ ] 包卡序号：两区各自按导入时间编号，只显示两位数字并压在图标角上。
- [ ] 包名两行判定：折行尾段 ≥45% 才折，否则单行省略。
- [ ] 多选合并上传；同名即停冲突清单。
- [ ] 导出后默认保留 + 可选删除（二次确认 + 不再显示 + 设置重开）。
- [ ] 后端上下传流量提示 + 不再显示 + 设置开关。
- [ ] 单测：分区状态机、复制解耦、同名冲突、排序。

**验证**：`npx vitest run test/zone* test/package-card*`

## 阶段 5：私有配置与容器

- [ ] `src/core/package-container.js`：zip 兼容容器 + `_private/manifest.json`。
- [ ] `src/storage/private-config-store.js` 取代 vault-store。
- [ ] 目标宿主匹配时调用原生导入完整还原；不匹配原样存储。
- [ ] ST/Luker `/api/files/upload` 上传/下载/删除/校验；清单预览 + 流量提示。
- [ ] 移除 `vault-panel.js` / `vault-store.js` 与模板「仓」区块。
- [ ] 单测：容器 round-trip、manifest 校验、上传路径拼接。

**验证**：`npx vitest run test/package-container* test/private-config*`

## 阶段 6：命名、注入与入口

- [ ] 全仓改名 `ST-pack-transfer` / 「数据包转运」；同步 manifest、package.json、文档、E2E、`data-name` 匹配。
- [ ] `src/ui/host-entry.js`：扩展列表内联下拉（与其他扩展一致）+ 原生备份按钮 + Luker 备份管理器。
- [ ] 删除 `registerMenuButton`；扩展菜单零注入。
- [ ] 四宿主注入幂等与自愈。
- [ ] E2E 快照：四宿主入口均出现且可用。

**验证**：`npm run check:css-scope && npm run check:dom-injection && npm run check:template-source`

## 阶段 7：模板、布局、教程与文案

- [ ] 重写 `workbench-template.js`：移除 flow 开关、独立清理/差量/仓区块；保留单一模板源。
- [ ] 重写 `workbench-layout.js`：双端布局声明（桌面两栏 / 移动单列 + 吸底操作条）。
- [ ] `tutorial.js`：基础 7 步首次自动弹一次 + 进阶教程。
- [ ] 修复问号：`.wb-sec` 裁切、锚定、随模块重建。
- [ ] 删除日志旁的说明文字（`host-bridge.js:601` 等）。
- [ ] 文案纪律单测。

**验证**：`npx vitest run test/workbench-layout* test/help-topics* test/onboarding*`

## 阶段 8：全量质量门与清理

- [ ] `npm test` 全绿；零回归。
- [ ] `npm run check:css-scope`、`check:dom-injection`、`check:template-source`、`check:dom-scope`、`check:control-consumer` 全绿。
- [ ] `npm run e2e:web -- --rebuild`。
- [ ] `npm run e2e:instances` 只连 Dev 实例。
- [ ] 删除无人引用的旧模块与测试桩；更新 README/AGENTS/spec。
- [ ] 提交并推送 `origin`（显式 pathspec）。

## 回滚点

- 每个阶段独立提交；阶段 3/4/5 任一失败可回退到上一阶段，不影响核心转换。
- 改名阶段单独提交，便于整体回退。
- 旧 `vault-*` 与 flow 模型的删除放在对应阶段末尾，不在阶段 1 提前删。

## 质量门命令

```bash
npm test
npm run check:css-scope
npm run check:dom-injection
npm run check:template-source
npm run check:dom-scope
npm run check:control-consumer
npm run e2e:web -- --rebuild
```
