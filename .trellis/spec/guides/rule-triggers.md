# 触发索引（提到什么 → 读哪份规范 → 守哪条铁律）

> 用途：用户或需求里一旦出现左列关键词，**先读**中列规范，**同时受**右列铁律约束。不必通读全部 spec。
> 本文件不写日期。新增触发词时同步登记，禁止在别处另建索引。

## 一、UI 与布局

| 触发词 | 必读规范 | 铁律 |
| --- | --- | --- |
| 滑动条 / 滚动条 / 滚动 / overflow / 竖屏 / 滚不到 / 横向滚动 | `guides/scroll-containers.md` | 25 |
| 拖拽 / 分隔条 / 拉伸 / 调整大小 | `guides/scroll-containers.md` | 26 |
| 布局 / 挤压 / 截断 / 显示不全 / 响应式 / 手机 / 小屏 | `frontend/responsive-and-aesthetics.md` | 24 |
| 图表 / 四宫格 / 平分 / 占满 / 配色可辨 | `frontend/component-guidelines.md` | 24、26 |
| 全屏 / 面板切换 / 内联 | `frontend/ui-orchestration-rules.md` | 24 |
| 按钮重复 / 入口重复 / 按钮位置 | `frontend/component-guidelines.md` | 31 |
| CSS / 样式 / 配色 / 作用域 / 污染 | `frontend/component-guidelines.md` | 7 |
| 模板 / 新增控件 / 节点 | `frontend/directory-structure.md` | 8 |
| 通知 / 提示 / toast | `frontend/component-guidelines.md` | 28 |

## 二、宿主与平台

| 触发词 | 必读规范 | 铁律 |
| --- | --- | --- |
| 宿主 / 平台 / luker / st / tt / pt / 适配 | `frontend/host-capabilities.md` | 9、28 |
| 原生能力 / 重复造轮子 / 抄原生 | `frontend/host-capability-matrix.md` | 28 |
| 从宿主拉取 / 备份 / 恢复 / 覆盖增量 | `frontend/host-native-pull-lifecycle.md` | 17、28、30 |
| 扩展管理 / 扩展安装 / git 版本 / 分支 commit | `frontend/extension-git-manager.md` | 32 |
| 插件路径 / third-party / 平铺 / 嵌套 | `frontend/directory-structure.md` | 33 |
| 账户 / 配额 / 存储页 / 占用 | `frontend/storage-inspector.md` | 29 |
| 数据包格式 / 互转 / 导入导出 | `guides/tavern-datapack-formats.md` | 5 |

## 三、传输与存储

| 触发词 | 必读规范 | 铁律 |
| --- | --- | --- |
| 上传 / 下载 / S3 / WebDAV / 局域网 / 互传 | `frontend/transfer-s3-webdav.md` | 27、30 |
| 凭据 / 密码 / token / 隐私 | `guides/public-repo-security.md` | 35 |
| 大包 / 分包 / 分块 / 增量 | `frontend/large-pack-upload.md` | 27 |
| 体积 / 占用 / 数值 / 配额显示 | `frontend/size-model.md` | 5 |

## 四、正确性与稳定性

| 触发词 | 必读规范 | 铁律 |
| --- | --- | --- |
| 勾选 / 全选 / 反选 / 状态丢失 | `frontend/state-management.md` | 5 |
| 异步 / await / 卡死 / 挂起 / Worker | `frontend/async-bounds.md` | 10 |
| 断点续传 / 恢复 / 进度 | `frontend/resume-checkpoint-invariant.md` | 30 |
| 错误 / 失败 / 回滚 / 迁移安全 | `backend/error-handling.md` | 30 |
| 迁移 / 兼容 / 发版 | `frontend/migration-compatibility-and-release.md` | 13 |

## 五、测试与验证

| 触发词 | 必读规范 | 铁律 |
| --- | --- | --- |
| 测试 / E2E / 实例 / 启动实例 | `guides/instance-testing-discipline.md` | 13、23 |
| 截图 / 验收 / UI 验证 | `frontend/ui-verification.md` | 23 |
| 性能 / 慢 / 卡顿 / 延迟 / 耗时 | `frontend/perf-budget.md` | 27 |
| 术语 / 中英混排 / 标签语言 / 英文原名 | `frontend/i18n-and-settings.md` | 29 |

## 六、工程纪律

| 触发词 | 必读规范 | 铁律 |
| --- | --- | --- |
| 提交 / 推送 / 暂存区 | `guides/iron-rules.md` 第 13、31 条 | 13、31 |
| 硬编码 / 魔法数字 / 常量 / i18n | `frontend/i18n-and-settings.md` | 34 |
| 绝对路径 / 脱敏 | `guides/public-repo-security.md` | 35 |
| 规则 / 规范 / 注入 / 铁律 | 本目录 `iron-rules.md` | 18、19 |
| 子代理 / 并发 / 并行 | `guides/subagent-collaboration.md` | — |
| 文档 / README / dev 文档 | `docs/sync-baseline.md` | 22 |
| 计划 / PRD / 任务 | `guides/iron-rules.md` 第 2 条 | 2 |
| 检索 / 造轮子 | `guides/code-reuse-thinking-guide.md` | 3 |

## 七、使用方式

1. 命中触发词 → 打开中列文件 → 只读与本次改动相关的小节。
2. 中列文件与本文件冲突时，以规范文件为准；规范文件与铁律冲突时，**以铁律为准**。
3. 触发词命中但中列为空 → 说明该领域还没有规范，**先补规范再动手**（铁律 1）。
