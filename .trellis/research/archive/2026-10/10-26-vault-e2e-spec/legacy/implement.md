# 执行计划 · 仓运行时验证固化

## 顺序

- [x] 1. `e2e/specs/vault.e2e.cjs`：从 `10-26-host-vault/research/verify-vault-runtime.cjs`
      移植，改用运行器的 `t` 断言 API（`t.ok/eq/ge/log`）与 `h.page/rec`
- [x] 2. 打开路径抽成 spec 内 `openPanel(page)`：先试 `#st-zip-converter-menu-item`，
      失败回退 `lib/workbench-entry.cjs` 的 `openWorkbenchModal`（ST/Luker/PT 三形态实测差异）
- [x] 3. 固件：`test-results/fixtures/` 现场生成（复用 `fixtures/gen.js` 的 `generateAll`），
      取 `fixture-tt.zip`（跨格式包，正好体现「不兼容也原样存」）
- [x] 4. 断言组：
      ① 工作台打开 ② 仓模块可见 + 徽标 ③ 清场后后端 0 ④ 存入后 UI=1 且后端=1
      ⑤ 导出字节一致 ⑥ 删除后 UI=0 且后端=0 ⑦ 插件错误 0
- [x] 5. `scripts/run-e2e-instances.cjs`：HOSTS 中 dev-st / dev-luker 增
      `['vault', ['--only','vault','--instance',<id>]]`；dev-pt 增 `--instance pt-web`
- [x] 6. `e2e/lib/tt-cdp.cjs` 增 `ttVaultSmoke`：connectOverCDP → 等插件已加载（复用
      `ttCdpSmoke` 的有界等待判据）→ 点菜单项开工作台 → 仓模块可见 → 页内 `import()`
      `vault-store` 清场 → `setInputFiles('#vault-file-input')` 存入 → 断言 UI 1 行 + 后端 1 条
      → 删除（宿主 `Popup.show.confirm`：找弹窗里的「确定」）→ 断言双归零 → 截图
- [x] 7. 矩阵 tt-cdp 行：`ttCdpSmoke` 之后接 `ttVaultSmoke`，两条都 PASS 才判该宿主绿
- [x] 8. 实跑：`--only vault --instance dev-st / dev-luker / pt-web`，再 `npm run e2e:instances` 全量
- [x] 9. 产物核对：四宿主各有 `vault-*.png` 与读数 md；TT/PT 截图肉眼校对（面板里真有一行条目）
- [x] 10. 规范：`guides/e2e-instances-runner.md` 增「vault 行」说明与判据；`npm test` + 五守卫
- [x] 11. 删除 `10-26-host-vault/research/verify-vault-runtime.cjs`（已固化，避免第二实现）

## 验证命令

```bash
node e2e/run.cjs --only vault --instance dev-st
node e2e/run.cjs --only vault --instance dev-luker
node e2e/run.cjs --only vault --instance pt-web
npm run e2e:instances
npm test
for g in css-scope dom-injection template-source dom-scope control-consumer; do npm run check:$g; done
```

## 回滚点

- 新增 spec 与矩阵行是纯增量：删掉 `vault.e2e.cjs` + 矩阵两行 + `ttVaultSmoke` 即回到现状。
- 已归档的 `10-26-host-vault` 里有原始取证脚本（archive 目录），可作为参考实现。

## 风险

- **PT 的初始化工期慢**（实测 t+15s 仍在初始化、t+30s 抽屉才出现）⇒ 打开前给足有界等待。
- **TT 延迟激活 28.6–34.6s** ⇒ 复用 `ttCdpSmoke` 的 120s 有界等待，不得读一次即判死。
- **Dev 浏览器档案是持久的** ⇒ 仓条目会跨轮残留，spec 必须先清场再断言"恰好 1 条"。

## 实跑结果（2026-10-26）

| 宿主 | vault 行 | 后端 |
| --- | --- | --- |
| dev-st | 17/17 PASS | indexeddb ·「本地」 |
| dev-luker | 17/17 PASS（连跑 3 次稳定） | authority ·「服务端」 |
| pt-web | 17/17 PASS | indexeddb ·「本地」 |
| tt-cdp | ttVaultSmoke PASS | indexeddb ·「本地」 |

整轮 `npm run e2e:instances` exit 0：guard 21 · st 16+93+17 · luker 16+93+17 · pt 28+17 · tt smoke+vault。
`npm test` 924 passed / 2 skipped；五守卫全绿。

## 计划外但必须做的事（实测暴露）

1. **TT 已装副本会过期**：`ensureInstalled()` 原为「manifest 在即跳过」⇒ TT 里是 10-25 旧拷贝，
   缺 vault 文件 ⇒ 插件 import 404、整插件不加载。改为每次同步四件 + `src/`。
2. **TT 冷启动页面自行导航** ⇒ `evaluate` 抛 `Execution context was destroyed` 整轮异常。
   加 `retryOnNav`（只重试导航类错误）。
3. **PT 的阶段卡在 scanned**：`pt-load` 留下的 `fixture-web-split-st.zip` 不在清理白名单里。
   spec 内按 `fixture-` 前缀删源包记录，必要时再清一次并重载。
4. **Luker 删除后 UI 刷新 4.5–9s** 且弹窗可能叠层：按「从仓…删除」文案锁定目标弹窗 + 等到 30s。
5. **TT 截图会带进真实聊天内容**（P-11）：改为工作台元素截图，并先点掉宿主 toast / ChatFilesys 提示。
