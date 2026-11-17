# 大包恢复上传与仅清单包（2026-11-10）

> 本页自包含。适用：`src/ui/host-bridge.js`、`src/core/chunked-restore.js`、`index.js`。
> 事实来源：Dev Luker 源码 `public/scripts/luker-chunked-upload.js` 与
> `src/endpoints/users-private.js`；云酒馆运维规范
> `Instance/Real/Cloud-Luker/.trellis/spec/ops/tunnel-and-keepalive.md` §6。

---

## 1. 为什么必须分片

云酒馆经 Cloudflare 代理（Worker → 隧道池 → Luker）。Cloudflare 对**单请求体**的限制：
Free/Pro 100 MB、Business 200 MB、Enterprise 500 MB。**任何 >100 MB 的单请求都不可能穿透**。
本插件旧实现把整包 zip 放进一个 `FormData` POST 到 `/api/users/restore-backup`，
因此大于上限的恢复必然失败（表现为 413/502/挂起）。

## 2. Luker 原生分片协议（唯一权威）

```
POST /api/users/restore-backup/uploads
     {handle, fileName: "backup.zip", size}          → {uploadId}
PUT  /api/users/restore-backup/uploads/{uploadId}/chunks/{offset}
     Content-Type: application/octet-stream           → {ok, offset, bytes}
POST /api/users/restore-backup/uploads/{uploadId}/finalize
     {}                                                → {size}
POST /api/users/restore-backup
     {uploadId, handle, mode, selection}               → {restoredCount, skippedCount, ...}
DELETE /api/users/restore-backup/uploads/{uploadId}    → 204（取消/失败时尽力清理）
```

- 分片固定 **8 MiB**；413 时**减半**（最低 256 KiB）。
- 单片最多重试 **3 次**，退避 **1 / 2 / 4 秒**。
- 404 表示服务端丢失会话（重启清空 `_uploads`）：允许**重新初始化一次并从 0 开始**；
  再次 404 直接失败，不无限重试。
- 所有请求必须带 `X-CSRF-Token`；分片的 `Content-Type` 必须是 `application/octet-stream`。
- `selection` 必须显式传全类目（`FULL_SELECTION`）。

## 3. 回退链

1. `platform === 'luker'`：先试分片初始化；
2. 初始化返回 **404/405** ⇒ 该版本没有分片端点 ⇒ 回退旧整包 `FormData` 候选链；
3. 其它失败（超时 / 5xx / 413 到下限 / 网络中断）**不得**回退整包——
   整包会因同样的限制再次失败，且可能对同一用户目录重复写入；
4. 非 Luker 宿主：ST 1.19 无整包恢复端点；其它版本若暴露恢复端点，仍走原有候选探测 + 整包。

## 4. 分卷的定位（不再是大包上传的必需项）

- 分卷最初动机是规避云酒馆 100 MB 单包上限；分片上传上线后，**宿主上传不再需要分卷**。
- 仍保留分卷的场景：对象存储单对象限制、手动导入/离线介质、目标平台原生导入限制。
- UI/帮助文案必须如实说明，不得再宣称「不分卷就不能上传大包」。

## 5. 仅清单包

- 产物内含 `_convert/extensions-manifest.json`（无扩展代码）时，本插件**从 zip 内直接读取**，
  不需要用户另起 HTTP 服务托管该 JSON。
- 图表卡头出现 `[data-extmanifest]` 按钮（带条目数），点击打开安装器；
  安装器对 `unavailable` 条目提供 http(s) 来源输入框，填写后可勾选安装。
- 只有使用宿主原生「下载扩展和资源菜单 → Asset URL」时，才需要把**官方资产列表 JSON**
  放到某个 http(s) 地址（本地 / 局域网 / 服务器均可）；这与本插件的清单安装是两条不同路径。

## 6. 验收

1. >9 MiB 包恢复时，日志出现分片进度；请求顺序为 init → chunk(8 MiB) → chunk(余量) → finalize → restore。
2. 分片端点返回 404 时，回退整包 POST 且仍能成功。
3. 分片 413 时自动减半，最低 256 KiB。
4. 取消恢复时 DELETE 上传会话（尽力而为，失败不影响主错误）。
5. 仅清单包导入后可在插件内看到清单按钮与条目；缺 URL 可填写后安装。
