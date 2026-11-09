# S3 / WebDAV 传输（分片 · 断点 · 降级）

> 2026-11-09 新建。S3 与 WebDAV 共用同一套分片与清单协议；
> WebDAV 不允许因单个方法被禁而整体失败。本页自包含。

---

## 1. 分片协议（两侧共用）

- 默认分片 `8 MiB`；`normalizeChunkSize()` 夹在 `1–64 MiB`。
- 分片对象：`<name>.partNNN`；清单最后写：`<name>.manifest.json`。
- 清单 `schema:1`，记录 `name / size / chunkSize / totalChunks / sha256 / chunks[{index,size}]`。
- 断点：对每个分片 `HEAD`，命中即跳过；全部命中 ⇒ **零字节上传**（仍补写清单）。
- 下载：优先读清单并按分片合并；清单缺失 ⇒ 单对象 `Range` 回退。
- 校验：清单 `sha256` 或调用方传入的 `expectedSha256`；不一致返回 `sha256-mismatch`。
- 中止：`AbortSignal` 在每片前检查；已上传分片保留，重跑即续传。

实现：`src/core/transfer-plan.js`（纯函数）、`src/app/transfer-runner.js`（编排）、
`src/core/transfer-target.js`（S3 / WebDAV 统一接口）。

## 2. S3

- SigV4；`HEAD` 取 `content-length/etag/last-modified`；`GET Range` 取分片。
- 分片对象主路径不依赖 multipart；multipart 方法（create/uploadPart/complete/abort）
  已具备，供将来需要单对象分片时使用。
- 4xx（429 除外）不重试；5xx/网络错误有限重试。

## 3. WebDAV

主路径只依赖 `GET / PUT / HEAD / DELETE`；`OPTIONS / PROPFIND / MKCOL` 全部可降级：

| 情况 | 处理 |
| --- | --- |
| `OPTIONS` 405/501 | `probe()` 返回 `ok:true, degraded:true`，能力按 fail-open 处理 |
| `PROPFIND` 405/501 | `list()` 返回 `code:'list-not-supported'`，UI 如实提示 |
| `MKCOL` 405 | 目录已存在，继续 |
| `MKCOL` 409 | 父级缺失；`ensureCollection` 逐级创建 |
| `PUT` 405 | `code:'method-not-allowed'`，提示「服务器禁止写入」 |
| `401` | `code:'auth'` |
| `TypeError: Failed to fetch` | `code:'cors-blocked'`，提示代理/CORS |
| `423` | `code:'locked'` |

**不使用** PATCH / LOCK / MOVE 作为主路径。

## 4. UI

- 动作行只留 `#transfer-open-btn`；面板 `#transfer-view` 一级 tab：局域网 / 公网。
- 公网内 `#cloud-provider-tabs` 二级切换：S3 / WebDAV。
- S3 配置与 WebDAV 配置分键持久化：`st-pack-transfer:s3` / `st-pack-transfer:webdav`。
- 上传/下载/删除走执行器；列表把 `.partNNN` 过滤掉，把 `.manifest.json` 折叠成包条目。
- `#cloud-backup-selected`：把当前选中包逐片备份到当前云端；加密短语如实拒绝
  （需要整包加密，自动备份不做）。
- 无服务端直传、无 cron：本插件禁止后台插件；`serverTransfer` 能力表全 false。

## 5. 验收

1. 中断后重跑只补缺失分片；全部分片命中显示「零字节上传」。
2. 下载结果与上传字节一致；清单 sha256 不符即失败。
3. WebDAV 任一方法 405 不导致整体失败；失败分类可读。
4. 列表不显示 `.partNNN`；删除包会清理分片与清单。
5. 单测：`test/transfer-plan.test.js`、`test/transfer-runner.test.js`、
   `test/webdav-client.test.js`（均为小规模内存映射，不跑大数据）。
