# 破坏性红队质检报告：Issue 报告与日志脱敏机制漏洞分析与证伪

**报告编号**：`RT-AUDIT-20261120-01`  
**审计目标**：`src/core/logger.js`（日志脱敏与导出机制）、`src/ui/issue-report.js`（Issue 报告环境采集、脱敏与导出机制）  
**质检专员**：`general-redteam-critic`（通用红队反向质检专员）  
**审计结论**：**严重阻断（Critical Blocker）**。发现 **4 项严重（Critical）**、**3 项高危（High）**、**2 项中危（Medium）** 漏洞。现有脱敏正则在 JSON 嵌套、带空格路径、非标准盘符、单引号包围、常见大模型与云平台 API Key/Token 场景下存在严重绕过，直接违反工程红线 `G-11` 与 `R-08`（零凭据、零隐私、零本机绝对路径）。

---

## 一、漏洞总览与风险矩阵

| 漏洞 ID | 威胁等级 | 漏洞分类 | 影响文件 | 核心表现 |
| :--- | :--- | :--- | :--- | :--- |
| **VULN-01** | **CRITICAL** | 路径脱敏绕过 | `src/core/logger.js` | JSON 序列化导致 Windows 路径双反斜杠 `\\` 未匹配，用户名 100% 泄露 |
| **VULN-02** | **HIGH** | 用户名信息泄露 | `src/core/logger.js` | 用户名含空格时正则在空格处断开，后半段用户名完全泄露 |
| **VULN-03** | **CRITICAL** | 本机绝对路径泄露 | `src/ui/issue-report.js` / `src/core/logger.js` | 独立模式 `file:///` 非 Users 目录直接在环境信息表中原样输出，泄露本机工程路径 |
| **VULN-04** | **CRITICAL** | 凭据脱敏绕过 | `src/core/logger.js` | 对象/JSON 中的 `api_key`、`apiKey`、`token`、`secretAccessKey` 完全不脱敏 |
| **VULN-05** | **HIGH** | 正则匹配失效 | `src/core/logger.js` | 单引号 `'` 被排除字符集误杀，导致 `password: 'xxx'` 匹配 0 字符全面失效 |
| **VULN-06** | **HIGH** | 敏感载体盲区 | `src/core/logger.js` | Google API Key (`AIzaSy...`)、HuggingFace Token (`hf_...`)、私钥与原始 JWT 零覆盖 |
| **VULN-07** | **MEDIUM** | Markdown 格式注入 | `src/ui/issue-report.js` | 日志含反引号未转义，破坏 Markdown 代码块结构并溢出至正文 |
| **VULN-08** | **HIGH** | 诊断数据丢失 | `src/ui/issue-report.js` | `collectLogText` 未走 `safeDetail()`，Error 对象的堆栈和 message 序列化为 `{}` |
| **VULN-09** | **MEDIUM** | 浏览器超长 URL 截断 | `src/ui/issue-report.js` | `buildGitHubNewIssueUrl` 带入全量日志时超出 8KB 上限，导致 HTTP 414 或截断失败 |

---

## 二、整改建议（调度专员执行）

1. **加固 Windows 路径脱敏正则**：
   允许单个 `\` 或 JSON 双重 `\\`，兼容包含空格的用户名。
2. **彻底清理本机绝对路径**：
   在 `collectReportEnv` 中，若 `pageUrl` 属于 `file://` 协议，统一脱敏为 `file:///[LOCAL]/index.html`。
3. **扩充对象级凭据脱敏字段**：
   在键值匹配中追加 `token`、`apiKey`、`api_key`、`secretKey`、`secretAccessKey`、`accessKeyId`、`client_secret`，并兼容单双引号。
4. **补充特征凭据模式**：
   增加 Google API Key、HuggingFace Token、JWT、PEM 私钥过滤。
5. **统一 Issue 报告中的日志序列化逻辑**：
   复用 `safeDetail()`，确保 Error 对象的堆栈与 message 不丢失。
6. **转义 Markdown 日志代码块闭合符**：
   在写入代码块前转义内部三重反引号。
7. **超长 Issue URL 截断与保护**：
   当生成的 URL 超过 4000 字符时自动降级精简版并提示使用剪贴板。
