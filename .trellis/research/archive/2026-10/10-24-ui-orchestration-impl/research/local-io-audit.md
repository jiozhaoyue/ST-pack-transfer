# 纯本地磁盘 IO 审计（R-A6，2026-10-24）

> 范围：OPFS 不可用（手机浏览器 / 桌面 Safari 旧版等）时的回退路径读数与优化项。
> 方法：代码路径审计（file:line 为 2026-10-24 读数）+ 能力检测点核对，未做真机 profiling——
> 真机读数待 C 线 e2e:instances 矩阵跑通后补（移动端设备不在本轮手边）。

## 1. 回退链现状（逐路径）

| 路径 | OPFS 可用 | OPFS 不可用（回退） | 证据 |
| --- | --- | --- | --- |
| 宿主拉取接收 | 流式直写 OPFS 临时文件，零内存缓冲 | **全量进内存**（`chunks[]` 拼 Blob）——GB 级包在手机上会 OOM 或被浏览器杀页 | `host-bridge.js` fetchHostBackup：`const chunks = writable ? null : []` |
| 断点续传 | Range + OPFS 半成品追加 | **不可续传**（`useRangeResume` 要求 `supportsOpfs()`），失败即整包重拉 | 同上 `useRangeResume` 求值 |
| 转换输入/输出 | 内存 Blob → Worker | 同左（转换本就内存态，无差别） | `worker-client.js` |
| 暂存区持久化 | IndexedDB files store | 同左（IndexedDB 与 OPFS 互不依赖，均可用） | `src/storage/db.js` |
| 产物导出 | `showSaveFilePicker` 选位置 | 普通 `<a download>` 触发（已有特性检测回退） | `export-queue.js exportToLocation` |
| 配额条 | `navigator.storage.estimate` | 不可用时无读数（已有检测） | `usage-dashboard.js` |

## 2. 结论

- **IndexedDB 是手机上的事实源**（L1-MR-2 语义在手机上的承载），健康；
- **唯一高危缺口**：宿主拉取的内存回退路径。GB 级包 + 手机内存上限 = 大概率失败，
  且失败形态是「页面崩溃」而非可读错误——但注意：**手机上几乎不存在「宿主拉取」场景**
  （ST/Luker 宿主是桌面/服务器形态；手机浏览器是独立 Web 态，无 same-origin 宿主端点）。
  ⇒ 该缺口实际暴露面 =「桌面 Safari 旧版拉 GB 级包」，低频但真实。

## 3. 优化项（按性价比排序，登记不改码）

1. **拉取回退加保险丝**：无 OPFS 时若 `Content-Length` > 阈值（如 512 MB）在预览行
   就提示「包过大且本环境无法流式落盘」，让用户在发起前知情（可并入 R-A5 预览行文案）。
2. **内存回退分段入库**：`chunks[]` 每累计 N MB 写 IndexedDB 一段，收尾拼装——
   把峰值内存从「全包」降到「分段」；成本是拼装需二次读。
3. **配额预估前置**：独立态用 `estimate()` 在上传/拉取前对 `filesize + 现存` 做占位告警
   （quota 条已有读数，缺「事前」语义）。
