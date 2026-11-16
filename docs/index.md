---
title: 首页
layout: home
---

# ST-pack-transfer · 数据包转运

在 **SillyTavern / Luker / TauriTavern / PureTavern** 之间互转、搬运、备份与恢复用户数据包。

纯前端：装进酒馆就是一个面板，也能当独立网页用，不需要自己的服务端。
装了 Authority 时产物可服务端托管；没装则静默降级，功能不缺。

[在线使用（Web 版）](https://jiozhaoyue.github.io/ST-pack-transfer/) ·
[源码仓库](https://github.com/jiozhaoyue/ST-pack-transfer)

## 它解决什么问题

四款酒馆把用户数据（角色卡、聊天、世界书、预设、背景图、扩展……）放在各自的目录结构里，
导出的 zip 只有对应酒馆认得。换酒馆、备份迁移、把旧包搬给新设备时，常见「包是对的，但那边打不开」。

本工具把这一步做掉：**任意一方的包 → 任意一方的包**，尽量不丢东西。

## 文档目录

### 入门

- [安装与部署](install.md) —— 装进酒馆、本地跑、在线用
- [四酒馆数据包格式](formats.md) —— 目录布局、端点与能力矩阵

### 功能

- [数据包转换](convert.md) —— 互转、勾选、扫描预测、差量、分卷、断点续传
- [从宿主拉取](host-pull.md) —— 一步导出当前酒馆的数据
- [恢复写回宿主](restore.md) —— 合并 / 覆盖、跨引擎净化、写入门禁
- [扩展管理与打包](extensions.md) —— 安装、更新、卸载、Git 可视化、打包
- [传输与备份](transfer.md) —— 局域网、S3、WebDAV、一键备份
- [存储审查](storage.md) —— 浏览器与宿主配额，只读下钻
- [存储引擎互转](engines.md) —— Luker 文件系统 / PostgreSQL / MySQL / SQLite
- [教程演示模式](tutorial.md) —— 在占位数据上练手

### 参考

- [隐私与凭据](privacy.md) —— 四类凭据、存放位置、默认仅浏览器
- [常见问题与限制](faq.md)
- [开发者指南](DEVELOPER-GUIDE.html) —— 功能清单与源码落点

## 三形态

| 形态 | 入口 | 说明 |
| --- | --- | --- |
| 酒馆扩展 | 扩展列表 →「数据包转运」→「打开面板」 | 全屏模态，随宿主运行 |
| 独立网页 | 本仓库的 Web 版 | 不依赖宿主，任何浏览器可开 |
| 离线单文件 | `npm run build:offline` 产物 | `file://` 双击即用 |

## 许可证

AGPL-3.0-or-later。完整条款见仓库根的 `LICENSE`。
