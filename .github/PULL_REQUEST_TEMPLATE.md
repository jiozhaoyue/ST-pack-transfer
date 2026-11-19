## 改动摘要

<!-- 这一段写“改了什么、为什么改”，不要只贴文件名。 -->

## 影响的运行形态

- [ ] SillyTavern 扩展
- [ ] Luker 扩展
- [ ] TauriTavern 扩展
- [ ] PureTavern 扩展
- [ ] 独立 Web（HTTP）
- [ ] 单文件 HTML（file://）
- [ ] 全部形态

## 宿主 / 浏览器环境

| 项 | 值 |
| --- | --- |
| 宿主与版本 | 例如 SillyTavern 1.19.0 / Luker 2.9.0 / TauriTavern 公开构建 / 不适用 |
| 浏览器 / WebView 与版本 | 例如 Chrome 151 / 单文件 HTML + Safari 18 / Tauri WebView2 |
| 操作系统 | 例如 Windows 11 / macOS 15 / Android 15 / iOS 18 |
| 视口 | 桌面 1440×900 / 手机 390×844 |

## 测试结果

```bash
npm test
npm run qa:static
npm run build
npm run docs:verify
```

- [ ] `npm test` 通过
- [ ] `npm run qa:static` 通过
- [ ] `npm run build` 通过
- [ ] `npm run docs:verify` 通过
- [ ] 涉及单文件 HTML 时，`npm run build:offline` 后已双击验证
- [ ] 涉及宿主桥接/拉取/恢复时，已在真实宿主验证并填写上方版本
- [ ] 涉及 UI 时，已检查桌面与手机布局

未验证项（必须如实列出）：

## 文档与基线

- [ ] README 已同步
- [ ] `docs/` 中文页已同步
- [ ] 对应 `*.en.md` 已同步
- [ ] 教程截图已重拍并被页面引用
- [ ] `npm run docs:update` 已刷新基线（仅确认改动完整后）
- [ ] 若改动影响单文件 HTML，已确认 `npm run build:offline` 可正常生成（产物由 Release 分发，无需提交）

## 隐私与安全确认

- [ ] 不含真实聊天、角色卡、世界书、预设、图片、语音、日志
- [ ] 不含凭据、Token、Cookie、OAuth code、密码、私钥、私有仓库地址
- [ ] 不含本机路径、用户名、机器名、IP、实例目录、端口
- [ ] 截图只来自教程演示模式，无浏览器书签栏、下载路径、系统通知
- [ ] `docs/` 不含日期、内部任务/计划/交接/研究内容、内部规范引用
- [ ] 没有把安全问题公开成可利用细节（如涉及，改走私密报告）

## 关联 Issue

<!-- 例如：Closes #123；没有就写“无”。 -->
