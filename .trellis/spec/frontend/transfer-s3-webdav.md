# S3 / WebDAV 传输（分片 · 断点 · 降级）

> 2026-11-09 新建。S3 与 WebDAV 共用同一套分片与清单协议；
> WebDAV 不允许因单个方法被禁而整体失败。本页自包含。

---

## 1. 分片协议（两侧共用）

- 默认分片 `8 MiB`；`normalizeChunkSize()` 夹在 `1–64 MiB`。
- 分片对象：`<name>.partNNN`；清单最后写：`<name>.manifest.json`。
- 清单 `schema:1`，记录 `name / size / chunkSize / totalChunks / sha256 / chunks[{index,size}]`；
  可选字段 `encrypted / salt / entryCount`（旧清单没有这些字段 ⇒ 视为未加密，向后兼容）。
- 断点：对每个分片 `HEAD`，命中即跳过；全部命中 ⇒ **零字节上传**（仍补写清单）。
- 加密（可选）：清单 `encrypted:true` 时每片是 `SPT1` 载荷（随机 IV），`salt` 存清单；
  续传必须沿用清单里的原 salt，否则旧分片无法解密。缺口令 ⇒ `passphrase-required`，
  错口令 ⇒ `bad-passphrase`；均不返回半包。
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

- 入口是面板头切换行第 4 项 `[data-wbview="transfer"]`；面板 `#transfer-view` 一级 tab：局域网 / 公网。
- 公网内 `#cloud-provider-tabs` 二级切换：S3 / WebDAV。
- 备份方式 `#cloud-mode-select`：`full`（全量时间戳快照）/ `set`（增量备份集）；
  配套 `#cloud-set-name`、`#cloud-retention`。
- S3 配置与 WebDAV 配置分键持久化：`st-pack-transfer:s3` / `st-pack-transfer:webdav`，
  两键都保存 `mode / setName / retention`。
- 上传/下载/删除走执行器；列表把 `.partNNN` 过滤掉，把 `.manifest.json` 折叠成包条目；
  `sets/**` 不混进普通包列表，改由 `sets/index.json` 登记表读取快照。
- **选包唯一来源**：所有上传/备份入口只读左侧数据包列表的当前选中项（`state.selectedPkgs`）；
  面板内**不设**独立文件选择器（用户 2026-11-09 明令：禁止再造轮子）。
  `#cloud-upload` = 按原包名上传选中项；`#cloud-backup-selected` = 按 `full/set` 模式建备份版本。
- 加密短语**留空即不加密**；填写后逐片加密，手动上传与一键备份同样生效。
- 增量备份集一次只接受一个选中的包（`cloud.setSinglePack`），避免把多个数据集混进同一快照。
- 快照条目的「恢复」= 下载对象 → 本地重建 ZIP → `importCloudPack` 落入工作区。
- 无服务端直传、无 cron：本插件禁止后台插件；`serverTransfer` 能力表全 false。

## 5. 内容寻址备份集（D-8）

用户 2026-11-09 裁定：**不用差量链、不做单对象追加**。远端固定三层：

```
sets/<set>/index.json            # 对象总账 sha256 → size，只增不改；含 salt / snapshots / latest
sets/<set>/objects/<sha256>      # 条目内容，按内容寻址，跨快照共享
sets/<set>/snapshots/<ts>.json   # 每版**完整**清单；加密时后缀 .spt
```

- 指纹：先用 ZIP 中央目录的 `(path,size,crc32)` 零解压比对；变化或首次出现才解压算 sha256。
- 上传：只 `PUT` 新对象；最后各写一次快照与索引。对象已存在 ⇒ 去重，不重传。
- 快照清单是完整的 ⇒ **任意一张可独立恢复**，不依赖快照顺序，没有“补丁链”。
- 删除快照只删 `snapshots/<ts>.json`，共享对象保留；保留策略按 `retention` 删最旧快照。
- 不依赖 PROPFIND / LIST：用 `index.json` 总账；主路径仍只依赖 `GET/PUT/HEAD/DELETE`。
- 加密按备份集固定：对象与快照都用同一 set salt 派生密钥；同一明文只加密一次并复用。

## 6. 验收

1. 中断后重跑只补缺失分片；全部分片命中显示「零字节上传」。
2. 下载结果与上传字节一致；清单 sha256 不符即失败。
3. WebDAV 任一方法 405 不导致整体失败；失败分类可读。
4. 列表不显示 `.partNNN`；删除包会清理分片与清单。
5. 加密可选：缺口令 / 错口令如实失败；对口令恢复字节一致；重传沿用原 salt。
6. 增量备份集：第二次备份只传变化对象；任选快照可恢复；删旧快照不影响新快照。
7. 单测：`test/transfer-plan.test.js`、`test/transfer-runner.test.js`、
   `test/webdav-client.test.js`、`test/backup-set.test.js`（均为小规模，不跑大数据）。

## 7. 能力判定与自检（2026-11-12 真机取证）

- **`Allow` 只是参考，不能据此判死写入**：实测 Apache 2.4 mod_dav（Caddy 前置）的
  `OPTIONS` 返回 `Allow: OPTIONS,GET,HEAD,POST,DELETE,TRACE,PROPFIND,PROPPATCH,COPY,MOVE,LOCK,UNLOCK`
  —— **不含 PUT / MKCOL**，但 `MKCOL 201`、`PUT 201` 都成功。
  ⇒ `probe()` 的 `canWrite` / `canMakeCollection` 恒为 true（真实请求说话），
  声明值另放 `declared` 供展示；不得再用 `Allow` 直接禁用上传按钮。
- **「测试连接」走真实六步**：`webdav-client.js` 的 `selfTest()` 依次
  `OPTIONS → PROPFIND → MKCOL(.stpt-selftest) → PUT 小文件 → GET 字节比对 → DELETE`，
  任何一步失败即停并返回 `failedStep` + 状态码；只写临时文件并立即删除。
- **列表过滤自身条目**：`PROPFIND Depth:1` 会把请求的集合本身也返回，
  `list()` 按 URL 路径比对剔除，避免列表多出一个同名目录。
- **可选 CORS 代理**：浏览器无法直连 SOCKS/HTTP 代理；插件只接受用户自填的
  **带 CORS 头的转发地址**（设置 → 网络 → `netProxyUrl`），留空即直连。
  `applyProxy()` 约定：含 `{url}` 占位 → 替换；以 `=` 结尾 → 追加编码目标；
  以 `/` 结尾 → 路径前缀追加原样目标；否则追加 `?url=`。
  Luker/SillyTavern 的 `requestProxy` 与 `enableCorsProxy` 只能改服务端 `config.yaml`
  （需能编辑服务端文件并重启，**不是 OS 管理员权限**），插件不修改也不探测。
