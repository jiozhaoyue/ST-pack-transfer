---
title: 四酒馆数据包格式
---

# 四酒馆数据包格式

四款酒馆都把用户数据放在各自的目录结构里，导出的 zip 只有对应酒馆认得：

| 平台 | 包内布局 | 导出端点 | 怎么导入 |
| :-- | :-- | :-- | :-- |
| **SillyTavern**（ST） | 用户目录摊平在根 | `POST /api/users/backup`（忽略 selection，全量） | 无恢复端点；解压覆盖到 `data/<用户>/`，或用本工具写回 |
| **Luker**（L） | 目录摊平 + `manifest.json` | 同 ST，**支持 10 键 selection** | `POST /api/users/restore-backup`（8 MiB 分片） |
| **TauriTavern**（TT） | `data/default-user/` 结构 | `POST /api/extensions/data-migration/export`（job_id 轮询） | `POST /api/extensions/data-migration/import`（ZIP/tar/gz，可直接吃 ST 包） |
| **PureTavern**（PT） | 与 TT 相近 + 模块记录 + 扩展来源记录 | `POST /api/backups/archive/export` | `POST /api/backups/archive/import`（支持 TT 包与冲突预览） |

## 数据包能力

| 能力 | SillyTavern | Luker | TauriTavern | PureTavern |
| --- | --- | --- | --- | --- |
| 导出端点 | `/api/users/backup`（全量） | 同左 + selection | data-migration export | archive/export |
| 导入 / 恢复端点 | ❌ 无 | ✅ + 8 MiB 分片 | ✅（兼容 ST 包） | ✅（兼容 TT 包） |
| 包内布局 | `data/<handle>/` 树 | 同 ST | `data/default-user/` 树 | manifest + 模块记录 |
| 导入策略 | — | 合并 / 覆盖 | 迁移作业 | merge / skip / replace / 受保护替换 |
| 恢复点 | ❌ | ❌ | ❌ | ✅ 导入前自动建 |
| 跨宿主互操作 | ❌ | ❌ | ✅ 吃 ST 包 | ✅ 吃 TT 包 |

## 传输能力

| 能力 | ST | Luker | TT | PT |
| --- | --- | --- | --- | --- |
| 局域网互传 | ❌ | ✅ `/api/sync/v1/*`（服务端↔服务端） | ✅ 但为 Rust 命令，扩展不可 invoke | ❌ |
| 云端对象存储 | ❌ | ✅ S3 Sync | ✅ TT-Sync v2 | ❌ |
| WebDAV | ❌ | ❌ | ❌ | ❌ |
| 存储面板 / 配额（原生） | ❌ | ✅ `storage-inspector.js` | ❌ | ❌ |

> 本插件在四宿主都提供**自建存储审查面板**（浏览器源全平台可用）；Luker 额外复用其原生数据源。

## 扩展在包里的位置

| 宿主 | 用户级扩展 | 全局扩展 |
| :-- | :-- | :-- |
| ST / Luker / PT | `extensions/<name>/`（平铺，**严禁**再套 `third-party`） | `public/scripts/extensions/third-party/<name>/` |
| TauriTavern | `data/default-user/extensions/<name>/` | `data/extensions/third-party/<name>/` |

转换器按目标布局自动迁移，并消除错误的 `third-party/third-party` 嵌套。

## 插件功能的来源

| 插件功能 | 来源 |
| --- | --- |
| 从宿主拉取数据包 / 写回恢复 / 扩展清单与安装 | **优先用宿主原生**，缺失时自建兜底或如实提示 |
| 存储审查（浏览器 / 宿主两处配额） | **同一自建面板**；宿主数据源只在 Luker 可用，其余宿主如实显示「未提供」 |
| 四酒馆格式互转 / 局域网互传 / S3 与 WebDAV 仓库 / 条目级差量 / 暂停续传 | **自建**（四家都没有） |
