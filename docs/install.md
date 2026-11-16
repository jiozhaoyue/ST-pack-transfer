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

> 💡 **插件极简瘦身建议（强烈推荐）**：  
> 在酒馆生产环境中使用本插件时，插件目录内的测试与构建辅助文件夹（如 `test/`、`e2e/`、`scripts/` 等）仅供工程开发验证。日常使用完全可以直接删除这些测试目录，立刻为酒馆节省数十 MB 磁盘空间，核心转换与转运功能 100% 正常运行。

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

## 三、在线使用（Web 模式）

无需下载安装，直接在浏览器中打开：<https://jiozhaoyue.github.io/ST-pack-transfer/>

如果你想搭建属于自己的转运站点：Fork 本仓库后，在仓库的 **Settings → Pages** 中将 Source 设为 **GitHub Actions**，此后每次发布都会自动更新并部署插件本体与文档站。

### Web 模式说明（限制与网络代理真相）

- **Web 模式不支持什么**：Web 模式纯在本地前端运行，由于没有酒馆后端进程，因此无法直接「从宿主拉取」当前运行的酒馆数据，无法一键「写回宿主（恢复）」，无法读取宿主服务器磁盘物理存储，也无法管理宿主服务端的 plugins 插件。所有数据转换、分卷切片、轻量清单化等纯本地沙盒操作 100% 完整可用。
- **ZeroOmega / SwitchyOmega 等代理扩展有用吗？**  
  **能代理网络流量，但彻底解不了跨域（CORS）报错！**  
  代理扩展工作在底层网络栈，能够接管 Web 模式发起的 `fetch` 流量走代理转发，解决域名解析与网络链路连通问题；但跨域（CORS）是浏览器内核层面的核心安全策略。即便代理顺利把请求转发到了外部 S3 或 WebDAV 并拿回了响应，只要目标服务器未携带 `Access-Control-Allow-Origin` 等跨域头，浏览器内核在收到响应的瞬间依然会掐断数据并报错 `TypeError: Failed to fetch`。同理，HTTPS 网页下的 HTTP 明文混合内容阻断，代理也无权放行。
- **Web 模式下使用云功能的推荐服务端配置**：
  - **S3 存储桶**：在云厂商后台的 CORS 规则中添加允许来源（`*` 或前端地址）、允许方法（`GET, PUT, POST, DELETE, HEAD, OPTIONS`）与允许头（`*`）。
  - **WebDAV 服务**：在反代配置中补齐 CORS 响应头，并放行 `PROPFIND, MKCOL` 等非标 HTTP 动词。
  - **协议匹配**：HTTPS 页面务必使用 HTTPS 云端点。

## 四、安装后建议步骤

1. 首次打开面板会自动开启 [教程演示模式](tutorial.md)，带你快速熟悉界面与操作步骤，体验过程完全在模拟数据上进行，保护你的真实数据。
2. 需要备份当前酒馆的数据时，可以参考 [从宿主拉取](host-pull.md) 引导，直接在界面中导出标准格式。
3. 如果需要安装私有仓库中的扩展插件，请先阅读 [隐私与凭据](privacy.md) 了解令牌配置方法。
