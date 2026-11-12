/**
 * 演示 / 占位扩展数据（**仅演示模式**使用）。
 *
 * 为什么是 `.js` 而不是 `.json`（2026-11-11 宿主事故）：
 * 本扩展在酒馆里是 git clone 直装、**不经打包器**。浏览器不支持无 import attributes 的
 * JSON 模块静态导入，一旦 `import data from './x.json'`，整张模块图在实例化阶段直接失败，
 * 宿主只会报一句 “Failed to fetch dynamically imported module”，插件永远加载不出来
 * （Vite 开发/打包会替你转 JSON，所以这个问题在独立态看不出来）。
 *
 * 纪律不变：仓库清单只允许放**本数据文件**，禁止写进业务逻辑；业务侧只读 `items`。
 */
export default {
  generatedAt: '2026-11-11',
  source: 'github.com/jiozhaoyue (repos matching /^(st|ST)/)',
  note: '演示/占位数据；kind 是占位判断：extension = 前端扩展，server = 服务端插件。',
  items: [
    { name: 'ST-pack-transfer', version: '0.1.0', kind: 'extension', type: 'local', sourceType: 'local', loadingOrder: 10, url: 'https://github.com/jiozhaoyue/ST-pack-transfer', ref: 'main', description: '四类酒馆数据包互转与传输备份增强插件' },
    { name: 'ST-msg-btn-mgr', version: '1.0.0', kind: 'extension', type: 'local', sourceType: 'local', loadingOrder: 12, url: 'https://github.com/jiozhaoyue/ST-msg-btn-mgr', ref: 'main', description: '控制消息上按钮显示的酒馆助手脚本' },
    { name: 'ST-chatfile-improve', version: '1.0.0', kind: 'extension', type: 'local', sourceType: 'local', loadingOrder: 14, url: 'https://github.com/jiozhaoyue/ST-chatfile-improve', ref: 'main', description: '增强酒馆聊天文件功能' },
    { name: 'ST-shujuku-rebuild', version: '1.0.0', kind: 'extension', type: 'local', sourceType: 'local', loadingOrder: 16, url: 'https://github.com/jiozhaoyue/ST-shujuku-rebuild', ref: 'master', description: 'Luker/TauriTavern 数据库扩展' },
    { name: 'st-chatfilesys-frontend', version: '1.0.0', kind: 'extension', type: 'global', sourceType: 'global', loadingOrder: 18, url: 'https://github.com/jiozhaoyue/st-chatfilesys-frontend', ref: 'main', description: '聊天文件系统扩展：分支树与 JSONL 导出' },
    { name: 'ST-BgLoader', version: '1.0.0', kind: 'extension', type: 'global', sourceType: 'global', loadingOrder: 20, url: 'https://github.com/jiozhaoyue/ST-BgLoader', ref: 'master', description: '富媒体背景与氛围特效插件' },
    { name: 'st-git-improve', version: '0.1.0', kind: 'extension', type: 'local', sourceType: 'local', loadingOrder: 22, url: 'https://github.com/jiozhaoyue/st-git-improve', ref: 'main', description: 'Git 体验增强（占位描述）' },
    { name: 'ST-Delegation-of-authority', version: '1.0.0', kind: 'server', type: 'server', sourceType: 'server', loadingOrder: 24, url: 'https://github.com/jiozhaoyue/ST-Delegation-of-authority', ref: 'main', description: '面向 SillyTavern 的服务端能力与权限治理项目' },
    { name: 'ST-PanelReset', version: '1.0.0', kind: 'extension', type: 'global', sourceType: 'global', loadingOrder: 26, url: 'https://github.com/jiozhaoyue/ST-PanelReset', ref: 'main', description: '面板回正功能按钮' },
  ],
};
