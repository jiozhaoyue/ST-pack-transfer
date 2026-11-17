# 核心全流程云通道 E2E 审计（2026-11-17）

## 目标

验证「真实数据包 → 本机 S3/WebDAV 上传 → 下载回读 → 哈希校验」核心链路可复用、可回归。
用于确认转换产物确实能上云再取回，且两通道内容逐字节一致。

## 运行方法

```bash
node tooling/e2e-flows/cloud-core-e2e.cjs
```

- 默认取 `fixtures/` 内最小 zip（当前 `fixture-st.zip`，2479 B），保证快速可重复。
- 指定大包测吞吐：`CLOUD_E2E_FIXTURE=fixtures/fixture-st-large.zip node tooling/e2e-flows/cloud-core-e2e.cjs`
- 可选项：`CLOUD_E2E_BUCKET`、`CLOUD_E2E_AK`/`CLOUD_E2E_SK`、`CLOUD_E2E_DAV_USER`/`CLOUD_E2E_DAV_PASS`。
- 服务器由并行任务产出：`tooling/local-cloud/s3-server.cjs`、`tooling/local-cloud/webdav-server.cjs`，
  端口固定 `0`，不占 3040。缺失时报「依赖未就绪」并写失败证据，脚本不自造服务器。
- 只用 Node 内置模块 + 仓内模块，无 npm install。
- 通过退出码 0，失败退出码 1；stdout 固定 4～6 行。
- 结果：`test-results/e2e-flows/cloud-<stamp>/result.json`（字节数、耗时、吞吐、sha256、通过项、失败点）。

## 实测数字

环境：Node v24.14.1 / Windows；本机回环 HTTP；内存态服务器（进程退出即释放）。
吞吐按十进制 MB（1e6 字节）计算，仅计 put / get 数据面耗时，不含 head/list。

### 小包回归（默认，2479 B）

| 通道 | put | get | 上行 MB/s | 下行 MB/s | sha256 | head | list |
| --- | --- | --- | --- | --- | --- | --- | --- |
| S3 | 49.133 ms | 10.413 ms | 0.050 | 0.238 | OK | OK | OK |
| S3（复跑） | 56.641 ms | 12.242 ms | 0.044 | 0.202 | OK | OK | OK |
| WebDAV | 2.507 ms | 1.724 ms | 0.989 | 1.438 | OK | OK | OK |
| WebDAV（复跑） | 2.288 ms | 2.099 ms | 1.083 | 1.181 | OK | OK | OK |

小包吞吐低是固定 HTTP 开销主导，非带宽瓶颈；仅用于正确性回归。

### 大包吞吐（fixture-st-large.zip，25,169,946 B）

| 通道 | put | get | 上行 MB/s | 下行 MB/s | sha256 | head | list |
| --- | --- | --- | --- | --- | --- | --- | --- |
| S3 | 332.658 ms | 178.192 ms | 75.663 | 141.252 | OK | OK | OK |
| WebDAV | 215.975 ms | 174.305 ms | 116.541 | 144.402 | OK | OK | OK |

原始 sha256：`f6866900c78aa16f4456d691535fffcafbd822f296543a794baff1761d2e1159`（小包）、
`b0b4d8444b0c001acdfbd1233d0efaa7991d0431a1a83a49fbd8a501f3f7d0b0`（大包）。
两通道下载回读 sha256 均与原始一致。

### 结果文件

- `test-results/e2e-flows/cloud-2026-11-17T14-14-43-225Z/result.json`
- `test-results/e2e-flows/cloud-2026-11-17T14-15-08-926Z/result.json`
- `test-results/e2e-flows/cloud-2026-11-17T14-15-09-200Z/result.json`（大包）

三次运行 `passed: true`、`failures: []`。

## 覆盖范围

- S3：客户端构造 → putObject → headObject 大小校验 → getObject → sha256 比对 → listObjects 确认 key。
- WebDAV：ensureCollection → putObject → headObject 大小校验 → getObject → sha256 比对 → list 确认条目。
- 使用仓内真实客户端 `src/core/s3-client.js` 与 `src/core/webdav-client.js`，非模拟实现。
- 服务器为真实 HTTP 回环，非 stub 函数调用；S3 通道要求 Authorization 头存在，证明客户端确实签名。
- 失败点逐步骤记录（config/put/head/get/sha256/list/exception），单通道失败不阻断另一通道。

## 未覆盖项

- UI 上传与用户交互流程：由 GLM 负责（本脚本只覆盖核心层）。
- 真实云端服务、鉴权失败、断网重连、断点续传、分片上传：未覆盖。
- 大文件分片路径、S3 multipart 完整链路：未覆盖（仅单对象 PUT）。
- 跨宿主注入、扩展设置页：未覆盖。
- 数字为本机回环实测，不代表公网链路性能。

## 变更边界

仅新增本脚本、本报告及 `test-results/**` 产物；未改产品代码、测试、`package.json`，未提交 Git。
