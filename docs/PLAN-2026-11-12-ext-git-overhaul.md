# 计划：教程首屏、扩展管理重排、Git 可视化（2026-11-12）

> 用户当轮裁定（原话要点）：教程模式打开必须立刻出现；Git 可视化里不许只是扩展列表，
> 要有真树图并能切换版本；已装扩展的按钮一律用符号（酒馆那套图标）；自动更新设置属扩展管理；
> 扩展管理要有 git 清理；顶部那条「导出清单 / 检查更新 / 刷新 / 排序 / 自定义」整行删掉；
> 导出清单放下面且必须勾选；检查更新与刷新进已装列表按钮行；「本地」标签无用；
> 加载顺序 `#N` 放扩展名前；删掉「工作区改动 / 未登记仓库」两句；已装扩展的云端仓库全都读。
>
> 方向选择（AskUserQuestion 已确认）：自绘 SVG 泳道图 · 查看 + 一键按版本重装 ·
> 插件内完整接管扩展管理 · git 清理只清插件侧 Git 数据。

## 目标

1. 打开插件进入教程模式时**首帧即出现**，不再等读库/配额/宿主请求。
2. 扩展管理宿主页重排：没有顶部工具条；已装列表按钮行承载检查更新/刷新/批量；
   底部「导出扩展清单」必须先勾选；行内管理按钮全部改图标；加载顺序在名字前；去掉「本地」。
3. 扩展管理新增「Git 清理」区块（插件侧登记 / 自动更新规则 / 失败记录）。
4. 自动更新策略设置从「设置」弹窗搬进扩展管理。
5. Git 页签改为「扩展选择 + SVG 泳道图 + 提交详情 + 按分支/标签重装」，
   云端仓库来源优先宿主 `version.remoteUrl`，其次安装登记；删除两条禁止文案。

## 判据

- 教程：`view.openTutorial()` 在 `main()` 首次 await 之前调用；教程模式下不跑 `syncPackages`/配额；
  关闭教程后再补真实数据。Dev 实例无头验证：打开面板到教程蒙层出现 < 300ms（本机）。
- Git 图：任意选中扩展至少渲染出节点与边；线性历史 1 条泳道；合并提交出现 2 条边；
  点击提交能出 diff；点分支/标签出现「装到该版本」并走 `installExtensions replace:true`。
- 扩展页：`#extension-body` 内不存在「导出清单/检查更新/刷新/排序」工具条；
  列表头含检查更新、刷新；底部导出按钮未勾选时 disabled；
  行内按钮为 `<i class="fa-solid …">`；`#N` 位于名字之前；非全局行没有「本地」标签。
- 守卫：`npm run check:template-source`、`check:control-consumer`、`check:css-scope`、`check:dom-injection` 全绿。

## 改点

| 文件 | 改动 |
| --- | --- |
| `src/core/git-graph.js`（新） | 泳道布局：`layoutGitGraph(commits)` → 节点/边/泳道数，纯函数 |
| `test/git-graph.test.js`（新） | 线性 / 合并 / 断链 / 空列表 |
| `src/core/git-site.js` | `normalizeCommitList` 补 `parents`（GitHub/Gitee/Gitea `parents[].sha`、GitLab `parent_ids`） |
| `src/ui/workbench-template.js` | Git 面板改为 `headbar + graph + detail`（不新增静态控件 id） |
| `src/ui/workbench-view.js` | Git 页重写；扩展页重排；git 清理区块；自动更新策略区块；教程退出回调 |
| `src/ui/settings-panel.js` | 移除「自动更新」分组与读写 |
| `index.js` | 教程提前到首个 await 前；教程模式跳过错峰同步；导出宿主清单支持按勾选过滤 |
| `src/i18n/locales/zh-CN.js` / `en-US.js` | 新增文案；删除 `gitv.workingTree` / `gitv.unregisteredNote` 等 |
| `style.css` | 泳道图、图标按钮、底部导出栏、清理区块、列表头控件 |
| `docs/DEVELOPER-GUIDE.md` / `README.md` / `.trellis/spec/frontend/extension-git-manager.md` | 同提交同步 |

## 执行状态

- [x] 1. `git-graph` 纯函数 + 单测
- [x] 2. 提交归一补 parents
- [x] 3. 模板 Git 面板改造
- [x] 4. Git 页渲染/加载/版本重装
- [x] 5. 扩展管理页重排（工具条删除、图标按钮、顺序前置、底部导出）
- [x] 6. git 清理区块
- [x] 7. 自动更新策略迁入扩展管理
- [x] 8. 教程首屏即时打开
- [x] 9. i18n / style
- [ ] 10. 守卫 + 目标测试 + 无头验收
- [ ] 11. 文档同步 + 提交推送

## 依赖与风险

- 泳道图只取**单一 ref 的最近 N 条提交**（默认 50），跨分支完整历史需多次请求，本轮不做；
  合并线来自提交的 `parents`，截断处画悬空线，不伪造。
- 版本重装依赖宿主 `install` 端点接受分支/标签（commit SHA 不接受，见 spec §1），
  失败按宿主原文回显。
- 教程模式跳过同步：退出教程时补一次 `syncPackages()`；若读库失败按原逻辑降级。
