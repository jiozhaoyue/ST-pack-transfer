# 局域网互传 · 技术设计（2026-10-27 重写版）

## 1. 边界

| 层 | 文件 | 职责 | 禁止 |
| --- | --- | --- | --- |
| 纯逻辑 | `src/core/lan-transfer.js` | 取件码编解码、分块、进度、状态机、核对、能力探测、格式化 | DOM / WebRTC / OPFS |
| 装配 | `src/ui/lan-transfer-panel.js` | 面板骨架、角色切换、`RTCPeerConnection` / DataChannel、OPFS 落盘、状态渲染 | 全局样式、裸选择器 |
| 出口 | `index.js` | `onReceive(blob, name)` → `importFiles()` 入工作区 | 直接写 IndexedDB |

Hooks 只在 `src/ui/`，核心层可在 Node/Vitest 直接跑（L1-MR-6）。

## 2. 信令（一次性取件码，两跳）

```
offer  = SZC1.z.<base64url(deflate(JSON{v:2, role:'offer', sdp, file:{id,name,size,type}}))>
answer = SZC1.z.<base64url(deflate(JSON{v:2, role:'answer', sdp, fileId, resumeFrom}))>
```

- `file.id` = `name:size:lastModified` 的 32 位哈希（纯函数），只用于「同一个包的续传」判定。
- `resumeFrom` 由接收端在生成应答码时给出：它本地已有该 `fileId` 的半成品字节数。
- 仍接受 v1 负载（无 `v` / 无 `file`）：按无续传、无摘要的旧路径走，功能不缺。
- 一次性：完成后发送端清空取件码与应答码，状态机进入 `done`，再次点击走全新会话。

## 3. DataChannel 帧

| 帧 | 方向 | 形状 |
| --- | --- | --- |
| `meta` | 发送 → 接收 | `{"t":"meta","name","size","fileId","digest"}` |
| 二进制块 | 发送 → 接收 | `ArrayBuffer`，64 KB/块，从 `resumeFrom` 开始 |
| `ack` | 接收 → 发送 | `{"t":"ack","bytes":N}`（每 1 MB 或 250ms 一次） |
| `done` | 发送 → 接收 | `{"t":"done","bytes":N,"digest":"..."}` |
| `ok` / `err` | 接收 → 发送 | `{"t":"ok","digest":"..."}` / `{"t":"err","message"}` |
| `cancel` | 双向 | `{"t":"cancel"}` |

**背压**：`dc.bufferedAmountLowThreshold = 1 MB`；`bufferedAmount > 4 MB` 时等待
`bufferedamountlow`，**250 ms 兜底轮询**（不是 200 ms 空转）。

**有界等待**（L1-MR-7）：每个外部事件等待都有 `withTimeout`；`open` 10s、`answer` 应用 10s、
最终 `ok` 30s（按体积动态上调，上限 5 分钟）。

**连接监听**：`pc.onconnectionstatechange` / `oniceconnectionstatechange`；`failed` 立即失败，
`disconnected` 给 8s 观察窗后失败（避免瞬时抖动误报）。

## 4. 接收端落盘（R-08 半成品不覆盖目标）

`createSink({fileId, expectedBytes, resumeFrom})`：

- **OPFS 优先**：`OPFS 根 / lan-transfer/<fileId>.part`，`createWritable({keepExistingData:true})`
  + `write({type:'write',position:offset,data})` 顺序追加。
- **内存兜底**：`Uint8Array` 分片数组（OPFS 不可用 / 配额不足）。
- `finalize()` 返回 `File`（OPFS 读回）或 `Blob`；**成功后才交给 `onReceive`**，
  失败/取消只保留 `.part` 供续传，目标区不受影响。
- 成功后 `removeEntry` 清 `.part`。

## 5. 核对（R-09）

- 接收端：字节数必须等于 `meta.size`；再用 `crypto.subtle.digest('SHA-256')` 复核。
- 发送端提前算一次摘要（发送前），随 `meta` 下发；接收端 `ok` 帧回传自己的摘要。
- 没有 `crypto.subtle`（理论上非安全上下文）时退化为字节数核对，并在界面标注「未做摘要核对」。

## 6. 失败与重试（R-11）

- 失败原因写进状态行，区分：码格式错 / 对端未接入 / 连接失败 / 通道关闭 / 核对失败 / 取消。
- 「重试」= 生成**新的**取件码（旧码作废），接收端凭 `fileId` 从 `resumeFrom` 续传。
- 接收端保留半成品直到成功或用户主动「放弃」。

## 7. 非安全上下文（R-07）

`probeDirectCapability()` 返回 `direct:false` 时：发送/接收操作按钮全部禁用，
显示原因与降级路径（导出文件后手动传入）。**不提供「强行尝试」**——不假装能连。

## 8. Authority（R-06）

本轮**不做服务端信令中继**：本仓没有可依赖的中继端点契约，自行发明会制造不可用功能。
PRD 的 R-06/AC-04 在收口时改为「未实现，且界面不谎称一步」——与现有规范
`workbench-single-view.md §7` 一致。适配器接缝留在 `encodePickupCode` 之上，未来可加。

## 9. 测试策略（压缩后）

| 层 | 断言 |
| --- | --- |
| 纯逻辑 | 取件码往返/坏码、分块边界、状态机一次性、摘要核对、格式化 |
| 独立 Web E2E | **两个 Playwright 上下文真实互传**：取件码 → 应答码 → 传输 → 接收端工作区出现同字节文件；坏码/一次性负例 |
| 实例矩阵 | 四宿主入口可达（`#btn-lan-send` 存在且可点开面板），不做真实双机传输 |

## 10. 回滚

只动 `src/core/lan-transfer.js`、`src/ui/lan-transfer-panel.js`、`style.css`（`.wb-lan-*` 段）、
新增 E2E spec 与单测。回滚 = `git revert` 单个提交；无数据结构变更、无迁移。
