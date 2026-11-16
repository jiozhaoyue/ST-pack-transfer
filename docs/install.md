---
title: 安装与部署
---

# 安装与部署

## 一、装进酒馆（推荐）

打开酒馆的「扩展管理」→「从 URL 安装」，粘贴仓库地址：

```
https://github.com/jiozhaoyue/ST-pack-transfer.git
```

或者手动将仓库克隆到酒馆的 `public/scripts/extensions/third-party/` 目录中。

刷新酒馆页面后，在扩展列表里展开 **「数据包转运」** 并点击 **「打开面板」** 即可。

> 提示：在 Luker 中如果是用户私有扩展（`data/<user>/extensions/<name>/`），直接放置插件目录即可，无需额外嵌套 `third-party` 目录。

## 二、本地部署

```bash
git clone https://github.com/jiozhaoyue/ST-pack-transfer.git
cd ST-pack-transfer
npm install
npm run dev
```

构建静态站点：

```bash
npm run build        # 产出 dist/（用于部署到静态托管）
npm run preview      # 本地启动预览服务器（端口 4173）
npm run build:offline # 产出可直接双击运行的离线单文件
```

> 提示：在本地作为独立网页运行时，请通过本地 Web 服务器（如 `npm run preview`）打开。现代浏览器默认限制通过 `file://` 协议直接加载模块化代码；如果需要脱离服务器直接双击打开运行，可使用 `npm run build:offline` 生成的离线单文件。

## 三、在线使用

无需下载安装，直接在浏览器中打开：<https://jiozhaoyue.github.io/ST-pack-transfer/>

如果你想搭建属于自己的转运站点：Fork 本仓库后，在仓库的 **Settings → Pages** 中将 Source 设为 **GitHub Actions**，此后每次发布都会自动更新并部署插件本体与文档站。

## 四、安装后建议步骤

1. 首次打开面板会自动开启 [教程演示模式](tutorial.md)，带你快速熟悉界面与操作步骤，体验过程完全在模拟数据上进行，保护你的真实数据。
2. 需要备份当前酒馆的数据时，可以参考 [从宿主拉取](host-pull.md) 引导，直接在界面中导出标准格式。
3. 如果需要安装私有仓库中的扩展插件，请先阅读 [隐私与凭据](privacy.md) 了解令牌配置方法。
