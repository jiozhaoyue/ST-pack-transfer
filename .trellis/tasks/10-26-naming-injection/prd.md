# 命名、入口与占位符

## Goal

仓库/插件改名为 `ST-pack-transfer`（中文「数据包转运」），四宿主入口统一，顶栏徽标区分运行形态，命名引擎支持完整占位符。父任务 R1 / R6.5 / R10.1。

## Requirements

- R1.1 仓库与插件改名 `ST-pack-transfer`，中文显示名「数据包转运」；manifest、package.json、文档、E2E、注入文案、`data-name` 匹配全部同步；**全仓不得残留 `tavern` 之外的旧名**（注意：仓名本身含 `zip-converter`，改名后旧名不得再出现在对外文案与 `data-name`）。
- R1.2 目标平台选择器只有四项，文案为四酒馆**英文全称**（SillyTavern / Luker / TauriTavern / PureTavern）；当前宿主项后加「（宿主）」标记；删除 `native` 选项与 `hostLayoutCode('native')` 分支。
- R1.3 打开入口三处：① 用户设置扩展列表内联下拉（内容只有「打开面板」）；② 账号弹层/管理面板原生备份按钮旁；③ Luker 备份管理器行。**扩展菜单（顶栏魔方棒）绝对不注入**。
- R1.4 四宿主入口一致，宿主重渲染后自动自愈（沿用 `watchHostDom` + `dataset` 防重）。
- R6.5 占位符完整集合：`host/target/user/part/date/time/datetime/mode/category/source/count`；各占位符语义独立互不冒充；`{target}` 输出四酒馆英文全称；`{datetime}` 精确到秒（`YYYY-MM-DD_HH-mm-ss`）；默认模板 `{target}_{user}_{part}_{datetime}.zip`；分卷时 `{part}` 替换为 `part1…`。
- R10.1 顶栏徽标：插件形态 = 宿主 icon + 宿主英文全名 + 「插件」；Web 形态 = GitHub 图标 + 「Web」。宿主名只在此处出现一次，图表区内不得再写宿主名。

## 约束

- 宿主差异只许进 `src/ui/host-bridge.js`；命名引擎进 `src/core/naming.js`（纯逻辑，禁止 DOM）。
- 平台码（`st|luker|standalone`）与布局码（`st|l|tt|pt`）双轨制不得混用，传给 `convert()` 前必须经 `hostLayoutCode()` 归一。

## Acceptance Criteria

- [ ] AC-1 全仓 `grep -ri "st-zip-converter"` 在对外文案/`data-name`/文档中为 0（历史任务目录与 git 历史除外）。
- [ ] AC-2 目标平台下拉恰好四项英文全称，当前宿主项带「（宿主）」，UI 中不存在 `native` 字符串。
- [ ] AC-3 三处入口均在宿主重渲染后自动恢复，顶栏魔方棒零注入（可用 E2E 断言 DOM 中不存在注入节点）。
- [ ] AC-4 十一个占位符各有单测；`{datetime}` 到秒；默认模板渲染结果符合 `{target}_{user}_{part}_{datetime}.zip`。
- [ ] AC-5 顶栏徽标在插件/Web 两种形态下文字与图标均正确，且宿主名在面板内仅出现一次。
