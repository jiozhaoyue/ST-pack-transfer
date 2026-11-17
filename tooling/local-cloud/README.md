# 本机云存储测试服务器（S3 / WebDAV）

## 用途

给 `src/core/s3-client.js` 与 `src/core/webdav-client.js` 提供**真实 HTTP 通道**，用于云上传/下载的端到端测试。
两台服务器均为**内存态**，进程退出数据即清空。默认监听端口 `0`（系统随机分配），不占用 `3040` 与酒馆实例端口。

> **仅测试用。无鉴权、无 TLS、无持久化。禁止公网暴露或绑定 `0.0.0.0` 对外提供服务。**
> S3 端只检查 `Authorization` 头是否存在，不做任何签名验证；任何字符串都能通过。

## 启动方式

### CLI（适合手工调试）

```bash
node tooling/local-cloud/s3-server.cjs
node tooling/local-cloud/webdav-server.cjs
```

启动时打印一行 JSON：`{"url":"http://127.0.0.1:xxxxx","port":xxxxx}`。
可用环境变量 `PORT` 指定固定端口（默认 `0`）。`Ctrl+C` 优雅关闭。

### 进程内调用（适合 Vitest / 脚本）

```js
const { startS3Server } = require('./tooling/local-cloud/s3-server.cjs');
const { startWebdavServer } = require('./tooling/local-cloud/webdav-server.cjs');

const s3 = await startS3Server();          // { url, port, close(), objects, uploads }
const dav = await startWebdavServer();     // { url, port, close(), files, dirs }

// ... 测试 ...
await s3.close();
await dav.close();
```

两台服务器都返回 `close(): Promise`，会顺带掐掉 keep-alive 连接，避免进程挂住。

### 客户端接入参数

```js
// S3：必须 pathStyle，bucket 任意非空，凭据任意非空字符串
createS3Client({ config: {
  endpoint: s3.url,
  bucket: 'test-bucket',
  pathStyle: true,
  accessKeyId: 'test',
  secretAccessKey: 'test',
} });

// WebDAV：baseUrl 直接填 url
createWebdavClient({ config: { baseUrl: dav.url } });
```

## 支持的子集

### S3（`/tooling/local-cloud/s3-server.cjs`）

| 能力 | 请求 | 响应要点 |
| --- | --- | --- |
| PUT 对象 | `PUT /{bucket}/{key}` | `200`，`ETag` 为内容 MD5（带引号） |
| GET 对象 | `GET /{bucket}/{key}` | `200`，带 `Content-Length`/`ETag`/`Last-Modified` |
| Range GET | `Range: bytes=a-b` | `206` + `Content-Range: bytes a-b/total`；支持 `a-` 与 `-n`；不满足返回 `416` |
| HEAD | `HEAD /{bucket}/{key}` | `200`/`404`，无响应体，长度与 ETag 同 GET |
| DELETE | `DELETE /{bucket}/{key}` | `204`；不存在 `404` |
| 列举 | `GET /{bucket}/?list-type=2&prefix=...` | `200`，ListObjectsV2 XML：`Key`/`Size`/`LastModified`/`ETag`，支持 `max-keys` 与 `continuation-token` 分页 |
| 初始化分片 | `POST /{bucket}/{key}?uploads` | `200`，XML 含 `UploadId` |
| 上传分片 | `PUT /{bucket}/{key}?partNumber=N&uploadId=...` | `200`，`ETag` 为分片 MD5 |
| 完成分片 | `POST /{bucket}/{key}?uploadId=...` | `200`，按分片号升序拼接落库，返回 Complete XML |
| 放弃分片 | `DELETE /{bucket}/{key}?uploadId=...` | `204`；未知 uploadId 返回 `404`（客户端视作已删除） |
| 预检 | `OPTIONS` | `204` + CORS，免鉴权 |
| 鉴权桩 | 所有业务请求 | 缺 `Authorization` → `403`；不做真实验签 |

路径规则：`/{bucket}/{key}` 第一段为 bucket，其余原样拼回 key（key 可含 `/`，逐段百分号解码）。
对外暴露 `objects: Map<key, { body, etag, lastModified, contentType }>` 与 `uploads: Map`。

### WebDAV（`/tooling/local-cloud/webdav-server.cjs`）

| 能力 | 请求 | 响应要点 |
| --- | --- | --- |
| OPTIONS | `OPTIONS /` | `200`，`Allow: OPTIONS,GET,HEAD,PUT,DELETE,PROPFIND,MKCOL` |
| PROPFIND | `PROPFIND /path`，`Depth: 0/1` | `207` Multi-Status XML：`href`/`displayname`/`getcontentlength`/`getlastmodified`/`getetag`/`resourcetype`（目录为 `<d:collection/>`）；`infinity` 按 `1` 处理；根目录不返回自身条目 |
| PUT | `PUT /path` | 新建 `201` / 覆盖 `204`；父集合不存在 `409`；目标是目录 `405` |
| GET / Range | `GET /path` | 同 S3，`206` + `Content-Range` |
| HEAD | `HEAD /path` | `200`/`404`，无响应体 |
| DELETE | `DELETE /path` | 文件/空集合 `204`；非空集合 `409`；不存在 `404`。支持带尾斜杠删目录 |
| MKCOL | `MKCOL /path` | 新建 `201`；已存在 `405`；父级缺失 `409` |

路径规则：URL 路径逐段解码后作为内存树路径，根为 `''`。
对外暴露 `files: Map<path, { body, etag, lastModified, contentType }>` 与 `dirs: Set<path>`。

## 未实现

- 真实 SigV4 验签、IAM、策略、Bucket API、多版本、生命周期、标签、拷贝。
- WebDAV 的 `LOCK`/`UNLOCK`/`MOVE`/`COPY`、`Depth: infinity` 全量递归、属性补丁、配额与锁令牌。
- 持久化、并发事务语义、断点续传的服务端状态恢复、TLS。

## 冒烟结果（本机实测，Node v24.14.1）

用 `node -e` 起服务器 + 全局 `fetch`，状态值为实际输出。

### S3 基础通道

```
PUT 200
HEAD 200 content-length=14 etag="893b3836dd48d7b5168e1418d5fe37f1"
GET 200 hello-s3-smoke
GET_RANGE 206 bytes 0-4/14 hello
LIST 200 keyFound=true
DELETE 204
PUT_NO_AUTH 403
```

### WebDAV 基础通道

```
OPTIONS 200 OPTIONS,GET,HEAD,PUT,DELETE,PROPFIND,MKCOL
MKCOL 201
PUT 201
HEAD 200 12 "0f482e947624575703ad302383917fc3"
GET 200 hello-webdav
GET_RANGE 206 bytes 0-4/12 hello
PROPFIND 207 sizeFound=true
DELETE 204
RMDIR 204
PUT_NO_PARENT 409
```

### 真实客户端端到端（额外验证）

```
S3   CLIENT_READY true / CLIENT_PUT true 200 / CLIENT_RANGE true ab
S3   CLIENT_HEAD true 3 900150983cd24fb0d6963f7d28e17f72
S3   CLIENT_LIST true 1 x/y.txt
S3   CLIENT_INIT true true / CLIENT_PARTS true true / CLIENT_COMPLETE true 200
S3   CLIENT_MP_GET true part1part2 / CLIENT_ABORT_404 true true
DAV  CLIENT_PROBE true 200 canWrite=true
DAV  CLIENT_SELFTEST true OPTIONS:1,PROPFIND:1,MKCOL:1,PUT:1,GET:1,DELETE:1
```

### CLI 输出（额外验证）

```
CLI_S3    {"url":"http://127.0.0.1:55796","port":55796}   → PUT 200
CLI_WEBDAV {"url":"http://127.0.0.1:55797","port":55797}  → PUT 201
```
