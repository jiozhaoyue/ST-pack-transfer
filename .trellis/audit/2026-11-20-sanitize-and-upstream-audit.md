# 全量代码与依赖审计报告 (Sanitize & Upstream Suite)

**审计专员**：`general-code-auditor`  
**审计对象**：
- `src/core/sanitize-share.js`
- `src/core/upstream-resolver.js`
- `test/sanitize-share.test.js`
- `test/sanitize-share-convert.test.js`
- `test/upstream-resolver.test.js`

**落盘路径**：`.trellis/audit/2026-11-20-sanitize-and-upstream-audit.md`
**审计日期**：2026-11-20

---

## 一、核心审查结论摘要

| 审计维度 | 判定 | 说明 |
| :--- | :---: | :--- |
| **1. 纯逻辑无 DOM 依赖** | **PASS (优)** | 两个核心模块均处于 `src/core/` 边界内，完全不依赖 `document`、`HTMLElement`、`navigator` 等 DOM API；`upstream-resolver.js` 对 `window.location`、`fetch` 和 `AbortController` 均有严格的 `typeof` 环境特性检测与降级。纯 Node/Worker/Browser 同构可用。 |
| **2. 边界条件覆盖** | **WARN (需微调)** | 发现 **2 处路径脱敏遗漏漏洞**（根级 `secrets/*` 目录漏判、根级 `.env.local` 漏判）与 **1 处防御性空指针隐患**（`preUploadGuard` 对空 entry 未判空）。 |
| **3. 全局状态污染与内存泄漏** | **WARN (需微调)** | 正则表达式均无 `/g` 状态机污染，常量对象已冻结；但在 `upstream-resolver.js` 中发现 **`clearTimeout` 未放在 `finally` 块**，在网络报错/离线时会导致 3 秒的 `setTimeout` 悬挂定时器。 |
| **4. 测试用例完备性** | **PASS (良好)** | E2E 与核心逻辑单测完整度高，包含真实 zip 打包与解压全链路验证，需针对上述边界漏洞补充测试用例。 |

---

## 二、详细缺陷审查与修复建议

### 缺陷 1：`shouldDropForSanitizedShare` 漏判根级 `secrets/*` 目录，且与 `preUploadGuard` 规则不对称
- **位置**：`src/core/sanitize-share.js` L114-L123 与 L175
- **事实分析**：
  在 L120 中判断为 `p.includes('/secrets/')`。如果文件处于 zip 根目录的 `secrets/` 文件夹下（例如 `secrets/token.txt` 或 `secrets/auth.json`），`p` 的开头为 `secrets/`，前面没有 `/`，导致 `p.includes('/secrets/')` 为 `false`。
  同时，`preUploadGuard` 中未检查 `api_keys.json` 与 `secrets.json`，与 `shouldDropForSanitizedShare` 规则存在不对称性。
- **建议**：
  追加 `p.startsWith('secrets/')`，并在 `preUploadGuard` 保持对等防范。

### 缺陷 2：根级 `.env.*` (如 `.env.local`, `.env.production`) 漏判
- **位置**：`src/core/sanitize-share.js` L115-L116
- **事实分析**：
  当前逻辑为 `p.endsWith('.env') || p.includes('/.env')`。
  如果根目录存在 `.env.local` 或 `.env.development`，`p.endsWith('.env')` 为 `false`，且不包含 `/.env`（因在根目录），导致包含真实密钥的 local env 逃逸。
- **建议**：
  补全 `p.startsWith('.env.')` 与 `p === '.env'`。

### 缺陷 3：`resolveUpstreamChannels` 的 `setTimeout` 悬挂定时器
- **位置**：`src/core/upstream-resolver.js` L79-L88
- **事实分析**：
  L80 设置了 3000ms 的超时定时器。若网络瞬断或 `fetchFn` 抛错直接跳至 `catch`，`clearTimeout(timeoutId)` 被跳过，导致 3 秒未清理定时器保持事件循环活跃。
- **建议**：
  将 `clearTimeout(timeoutId)` 放入内层 `finally` 块。

### 缺陷 4：`parseGitHubUrl` 对 URL 参数、Hash 与尾部斜杠的鲁棒性
- **位置**：`src/core/upstream-resolver.js` L19-L21
- **事实分析**：
  若传入带有 Query 参数或 Fragment 的 URL（如 `https://github.com/owner/repo?tab=readme`），`m[2]` 会被赋值为 `repo?tab=readme`。
- **建议**：
  排除 `?`、`#` 等非法字符，剥除尾部 `.git`。

### 缺陷 5：`preUploadGuard` 防御性空指针保护
- **位置**：`src/core/sanitize-share.js` L166
- **事实分析**：
  若调用者传入形如 `[{ path: '...' }, null]` 的条目，`entry.path` 会直接引发未捕获的 `TypeError`。
- **建议**：
  增加 `if (!entry) continue;`。
