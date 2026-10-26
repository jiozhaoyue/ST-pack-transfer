/**
 * 数据包转运 - HTML 模板生成器（单一模板源 · 单一视图）
 *
 * 三个入口共用本函数（L1-MR-10 单向化）：
 *   · 独立 Web   ：index.html 空骨架 → bootstrap() 注入 getWorkbenchHtml({ isStandalone: true })
 *   · 插件态     ：ensureConverterModal() → getWorkbenchHtml({ isModal: true })（全屏浮层）
 *   · 抽屉态     ：getWorkbenchHtml({ isDrawer: true })，无页头变体，仅测试与向后兼容在用
 *
 * 2026-10-14 重构：**删除迁移向导外壳**（六步步骤条 / 向导模式·高级模式切换 / 不兼容门）。
 * 向导把同一份 DOM 用 `data-wb-step` 分段显隐，结果第 6 步是空的、第 3 步显示的不是范围
 * 选择器；不兼容门因 CSS `display` 压过 `hidden` 变成全程可见的空壳框（且全仓无调用点）。
 * 现在只有**一个视图**：区块按层级顺序排列，没有模式切换，没有步骤条。
 *
 * 文案约定（用户 2026-10-14 死命令，逐条可判定）：
 *   禁止括号说明、禁止分号、禁止长句说明、禁止并排铺开、禁止任何解释性文案。
 *   保留：状态与错误反馈、placeholder、状态读数摘要。
 *
 * 控件约定：所有多选一一律用下拉枚举控件，不用并排 radio（用户裁定「禁止模式选择」）。
 *   注：本行**不得**出现控件标签字面量——`check:control-consumer` 按源码正则提取控件，
 *   注释里写标签会被当成无 id 的控件而误报（2026-10-14 实际踩到）。
 *
 * 配色约定：本文件不承载颜色；一切颜色由 style.css 从 `--SmartTheme*` 继承（用户裁定
 * 「只用酒馆颜色」）。模板内禁止写 style 里的色值。
 */

import { DEFAULT_SELECTION } from '../core/selection-defaults.js';
import { DEFAULT_FILENAME_TEMPLATE } from '../core/naming.js';

/** 特殊类目复选框的 `checked` 由**唯一默认源**派生（用户 2026-10-14 裁定 OQ-1「13 键为准」）。 */
const checkedAttr = (key) => (DEFAULT_SELECTION[key] ? ' checked' : '');

/** 徽标组（抽屉态渲染在状态行，其余形态渲染在页头；两处只渲染一份，防重复 id） */
const BADGES_HTML = `
      <span class="badge badge-host" id="env-badge" title="检测中...">
        <img class="host-badge-icon" id="env-badge-icon" alt="" hidden>
        <svg class="host-badge-gh" id="env-badge-gh" viewBox="0 0 24 24" width="13" height="13" fill="currentColor" aria-hidden="true" hidden><path d="M12 2A10 10 0 0 0 2 12c0 4.42 2.87 8.17 6.84 9.5.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.89 1.53 2.34 1.09 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.56-1.11-4.56-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.02a9.5 9.5 0 0 1 5 0c1.9-1.29 2.74-1.02 2.74-1.02.55 1.38.2 2.4.1 2.65.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.69-4.57 4.94.36.31.68.92.68 1.85v2.74c0 .27.18.58.69.48A10 10 0 0 0 22 12A10 10 0 0 0 12 2z"/></svg>
        <span id="env-badge-text">检测中...</span>
      </span>
      <span class="badge badge-user" id="host-user-badge" style="display: none;">用户: 未登录</span>
`;

/**
 * 生成工作台 HTML
 * @param {{isModal?: boolean, isStandalone?: boolean}} [opts]
 * @returns {string}
 */
export function getWorkbenchHtml({ isModal = false, isStandalone = false } = {}) {
  // 三种形态共用同一个页头/页脚：独立 Web 与插件态（全屏模态）的根都是 #app.app-container。
  // 2026-10-15 起不再有「抽屉态」变体——插件态改挂全屏模态后，无页头的那一支已无调用点。
  void isStandalone;

  return `
    <header class="app-header">
      <div class="title-group">
        <h1><i class="fa-solid fa-file-zipper"></i> 数据包转运</h1>
      </div>
      <div class="header-badges">
        ${BADGES_HTML}
        <button type="button" class="menu_button menu_button_icon wb-storage-btn" id="btn-storage-inspector" hidden>
          <i class="fa-solid fa-hard-drive"></i><span>存储</span>
        </button>
        <button type="button" class="menu_button btn-tool" id="btn-guide"><i class="fa-solid fa-circle-question"></i> 引导</button>
        ${isModal ? '<button type="button" class="st-converter-modal-close-btn" id="btn-close-converter-modal" title="关闭工作台">&times;</button>' : ''}
      </div>
    </header>

    <!-- ═══ 外壳：模块由 workbench-shell.js 按「流程 × 阶段」摆进两栏 ═══
         模板里的顺序只是初始落点，运行时由 resolveLayout 重排，详见 design.md 第 2 节。
         ⚠ 方向开关必须在 wb-shell **内部**：外壳用 shell.querySelector 按 id 找它。
         放到外面（兄弟节点）不会报错，只会静默失效——2026-10-15 实测踩过。 -->
    <div class="wb-shell" id="wb-shell">

    <!-- ═══ 方向开关（导出 / 导入）═══ -->
    <div class="wb-flow-switch" id="wb-flow-switch" role="tablist" aria-label="流程方向">
      <button type="button" class="menu_button wb-flow-tab" id="btn-flow-out" data-wb-flow="out" role="tab">导出</button>
      <button type="button" class="menu_button wb-flow-tab" id="btn-flow-in" data-wb-flow="in" role="tab">导入</button>
    </div>

    <div class="wb-col" id="wb-col-left">

    <!-- ═══ 状态读数（配额）═══ -->
    <div class="wb-status-line" data-wb-module="quota">
      <div class="quota-bars" id="usage-dashboard"></div>
    </div>

    <!-- ═══ 数据包槽：导出与导入共享 ═══
         角色标签由 index.js syncSlotRole() 按方向写：导出=源包 / 导入=待恢复包。
         槽本身是同一个，切方向不重传、不重扫。 -->
    <section class="wb-sec" data-wb-module="source">
      <div class="wb-sec-head">
        <span class="wb-sec-title"><i class="fa-solid fa-inbox"></i> 数据包</span>
        <span class="wb-slot-role" id="wb-slot-role">源包</span>
      </div>
      <div class="wb-sec-body">
        <div class="dropzone dropzone-inline" id="dropzone">
          <input type="file" id="file-input" accept=".zip" multiple style="display: none;">
          <p class="main-text" id="drop-main-text"><i class="fa-solid fa-cloud-arrow-up"></i> 选择数据包</p>
          <p class="sub-text" id="drop-sub-text"></p>
        </div>
        <div class="host-fetch-preview" id="host-fetch-preview" hidden>
          <span class="hfp-text" id="host-fetch-preview-text"></span>
          <button type="button" class="menu_button menu_button_icon btn-accent" id="btn-host-fetch-go">
            <i class="fa-solid fa-cloud-arrow-down"></i> <span>确认拉取</span>
          </button>
          <button type="button" class="menu_button" id="btn-host-fetch-cancel">取消</button>
        </div>
        <div id="stash-list"></div>
        <div id="stash-batch-bar" hidden></div>
      </div>
    </section>

    <!-- ═══ 产物 ═══ -->
    <section class="wb-sec" data-wb-module="products">
      <div class="wb-sec-head"><span class="wb-sec-title"><i class="fa-solid fa-file-export"></i> 产物</span></div>
      <div class="wb-sec-body">
        <div id="export-queue-panel"></div>
      </div>
    </section>

    <!-- ═══ 私有格式仓：各酒馆原生格式包的原样保存与进出 ═══ -->
    <section class="wb-sec" data-wb-module="vault">
      <div class="wb-sec-head">
        <span class="wb-sec-title"><i class="fa-solid fa-box-archive"></i> 仓</span>
        <span class="vault-backend-badge" id="vault-backend-badge"></span>
      </div>
      <div class="wb-sec-body">
        <div class="wb-tool-row">
          <button type="button" class="menu_button btn-tool" id="btn-vault-add">
            <i class="fa-solid fa-file-arrow-up"></i> 存入文件
          </button>
          <input type="file" id="vault-file-input" style="display: none;" multiple>
        </div>
        <div id="vault-list"></div>
      </div>
    </section>

    <!-- ═══ 打包设置 ═══ -->
    <section class="wb-sec" data-wb-module="pack">
      <div class="wb-sec-head"><span class="wb-sec-title"><i class="fa-solid fa-sliders"></i> 打包</span></div>
      <div class="wb-sec-body">
        <label class="wb-field">
          <span class="wb-field-key">目标平台</span>
          <select id="target-select" class="text_pole">
            <option value="st">SillyTavern</option>
            <option value="l">Luker</option>
            <option value="tt">TauriTavern</option>
            <option value="pt" selected>PureTavern</option>
          </select>
        </label>
        <label class="wb-field">
          <span class="wb-field-key">压缩</span>
          <select id="compression-select" class="text_pole">
            <option value="0">不压缩</option>
            <option value="1">快速</option>
            <option value="5" selected>标准</option>
            <option value="9">最大</option>
          </select>
        </label>
        <label class="wb-field">
          <span class="wb-field-key">扩展包</span>
          <select id="extension-mode-select" class="text_pole">
            <option value="manifest">只导出清单</option>
            <option value="full" selected>完整扩展包</option>
          </select>
        </label>
        <label class="wb-field">
          <span class="wb-field-key">Git 历史</span>
          <select id="git-mode-select" class="text_pole">
            <option value="keep" selected>保留历史</option>
            <option value="minimal">只留更新所需</option>
            <option value="strip">不含历史</option>
          </select>
        </label>
        <label class="wb-field">
          <span class="wb-field-key">分卷</span>
          <input type="number" id="split-input" class="text_pole" min="1" step="1" inputmode="numeric" placeholder="不分卷">
        </label>
        <label class="wb-field">
          <span class="wb-field-key">包名</span>
          <input type="text" id="filename-template-input" class="text_pole" placeholder="${DEFAULT_FILENAME_TEMPLATE}" value="${DEFAULT_FILENAME_TEMPLATE}">
        </label>
        <div class="filename-preview-box" id="filename-preview-box">
          <code class="preview-code" id="filename-preview"></code>
        </div>
        <label class="checkbox_label flex-container">
          <input type="checkbox" id="keep-dev-files-check">
          <span>保留构建配置</span>
        </label>
        <div class="wb-actions">
          <button type="button" id="btn-export-ext-manifest" class="menu_button menu_button_icon">
            <i class="fa-solid fa-file-export"></i> <span>导出扩展清单</span>
          </button>
        </div>
      </div>
    </section>

    <!-- ═══ 内容范围 ═══ -->
    <section class="wb-sec" data-wb-module="scope">
      <div class="wb-sec-head">
        <span class="wb-sec-title"><i class="fa-solid fa-list-check"></i> 内容</span>
        <span class="category-sub-summary" id="category-summary-badge"></span>
      </div>
      <div class="wb-sec-body">
        <div class="category-panel" id="category-panel">
          <div class="wb-tool-row">
            <button type="button" class="menu_button btn-tool" id="btn-select-all">全选</button>
            <button type="button" class="menu_button btn-tool" id="btn-deselect-all">全不选</button>
            <button type="button" class="menu_button btn-tool" id="btn-invert-select">反选</button>
          </div>
          <div class="category-grid" id="category-checkboxes"></div>
          <div class="host-tree-confirm-bar" id="host-tree-confirm-bar" hidden>
            <span class="htc-hint"><i class="fa-solid fa-list-check"></i> 统一文件树已就绪</span>
            <div class="htc-actions">
              <button type="button" class="menu_button btn-tool" id="btn-host-tree-selectall">全选</button>
              <button type="button" class="menu_button menu_button_icon btn-accent" id="btn-host-tree-confirm">
                <i class="fa-solid fa-check"></i> <span>继续转换</span>
              </button>
              <button type="button" class="menu_button" id="btn-host-tree-cancel">
                <i class="fa-solid fa-ban"></i> <span>取消</span>
              </button>
            </div>
          </div>
        </div>
        <div class="plan-summary-bar" id="plan-summary-bar" style="display: none;">
          <div class="action-badges" id="action-stats-badges"></div>
          <div class="output-estimate" id="output-estimate-text"></div>
        </div>
      </div>
    </section>

    <!-- ═══ 清理与差量（可选，紧凑折叠）═══ -->
    <section class="wb-sec" data-wb-module="pack">
      <div class="inline-drawer wb-fold" id="fold-cleanup">
        <div class="inline-drawer-toggle inline-drawer-header">
          <b><i class="fa-solid fa-broom"></i> 清理</b>
          <span class="wb-fold-summary" id="fold-summary-cleanup"></span>
          <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
        </div>
        <div class="inline-drawer-content" style="display: none;">
          <div class="wb-checks">
            <label class="checkbox_label flex-container">
              <input type="checkbox" id="include-backups-check"${checkedAttr('backups')}>
              <span>打包 backups 快照</span>
            </label>
            <label class="checkbox_label flex-container">
              <input type="checkbox" id="include-cache-check"${checkedAttr('cache')}>
              <span>打包派生缓存</span>
            </label>
            <label class="checkbox_label flex-container">
              <input type="checkbox" id="include-private-check"${checkedAttr('appPrivate')}>
              <span>打包私有配置</span>
            </label>
            <label class="checkbox_label flex-container">
              <input type="checkbox" id="prune-builtin-check" checked>
              <span>清理原生重复资产</span>
            </label>
          </div>
        </div>
      </div>

      <div class="inline-drawer wb-fold" id="fold-incremental">
        <div class="inline-drawer-toggle inline-drawer-header">
          <b><i class="fa-solid fa-code-compare"></i> 差量</b>
          <span class="wb-fold-summary" id="fold-summary-incremental"></span>
          <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
        </div>
        <div class="inline-drawer-content" style="display: none;">
          <div class="wb-checks">
            <label class="checkbox_label flex-container">
              <input type="checkbox" id="host-incremental-export">
              <span>差量补丁</span>
            </label>
          </div>
          <div id="host-base-zip-section" class="base-zip-section" style="display: none;">
            <input type="file" id="host-base-zip-input" accept=".zip" style="display: none;">
            <button type="button" class="menu_button" id="btn-select-base-zip">
              <i class="fa-solid fa-folder-open"></i> 选择基准 ZIP
            </button>
            <select id="host-base-archive-select" class="text_pole">
              <option value="">从暂存区选取</option>
            </select>
            <div id="host-base-zip-status" class="base-zip-status"></div>
          </div>
        </div>
      </div>
    </section>

    <!-- ═══ 检查 ═══ -->
    <section class="wb-sec" data-wb-module="scope">
      <div class="wb-sec-head"><span class="wb-sec-title"><i class="fa-solid fa-clipboard-check"></i> 检查</span></div>
      <div class="wb-sec-body">
        <div class="wb-check-panel" id="wizard-check-panel">
          <p class="wb-check-summary" id="wizard-check-summary"></p>
          <ul class="wb-check-exclusions" id="wizard-check-exclusions"></ul>
        </div>
      </div>
    </section>

    <!-- ═══ 恢复选项（仅导入流程）═══ -->
    <section class="wb-sec" data-wb-module="restore">
      <div class="wb-sec-head"><span class="wb-sec-title"><i class="fa-solid fa-rotate"></i> 恢复</span></div>
      <div class="wb-sec-body">
        <p class="wb-restore-target" id="wb-restore-target"></p>
        <div class="wb-actions">
          <button type="button" class="menu_button menu_button_icon btn-accent" id="btn-restore-inline" disabled>
            <i class="fa-solid fa-rotate"></i> <span>恢复到当前宿主</span>
          </button>
        </div>
      </div>
    </section>

    <!-- ═══ 执行 ═══ -->
    <section class="wb-sec" data-wb-module="action">
      <div class="wb-sec-head"><span class="wb-sec-title"><i class="fa-solid fa-play"></i> 执行</span></div>
      <div class="wb-sec-body">
        <div class="action-row">
          <button type="button" class="menu_button menu_button_icon flex1" id="btn-host-fetch" style="display: none;">
            <i class="fa-solid fa-server"></i> <span>从宿主拉取</span>
          </button>
          <button type="button" class="menu_button menu_button_icon flex1" id="btn-library-export" style="display: none;" disabled>
            <i class="fa-solid fa-database"></i> <span>从聊天库导出</span>
          </button>
          <button type="button" class="menu_button menu_button_icon flex1 btn-accent" id="btn-convert" disabled>
            <i class="fa-solid fa-play"></i> <span>开始转换</span>
          </button>
          <button type="button" class="menu_button menu_button_icon flex1" id="btn-restore-luker" style="display: none;" disabled>
            <i class="fa-solid fa-file-import"></i> <span>恢复到当前用户</span>
          </button>
        </div>
        <button type="button" class="menu_button menu_button_icon" id="btn-lan-send">
          <i class="fa-solid fa-tower-broadcast"></i> <span>发送到另一台设备</span>
        </button>
        <div class="progress-container" id="progress-container">
          <div class="progress-bar-bg">
            <div class="progress-bar-fill" id="progress-bar-fill"></div>
          </div>
          <div class="progress-text">
            <span id="status-label">准备就绪</span>
            <span id="progress-percent">0%</span>
          </div>
          <div class="task-controls" id="task-controls" hidden>
            <button type="button" class="tc-btn" id="tc-pause" title="暂停"><i class="fa-solid fa-pause"></i> 暂停</button>
            <button type="button" class="tc-btn tc-danger" id="tc-abort" title="中止"><i class="fa-solid fa-xmark"></i> 中止</button>
            <button type="button" class="tc-btn" id="tc-resume" title="继续" hidden><i class="fa-solid fa-play"></i> 继续</button>
            <button type="button" class="tc-btn tc-danger" id="tc-discard" title="丢弃" hidden><i class="fa-solid fa-trash"></i> 丢弃</button>
          </div>
        </div>
      </div>
    </section>

    <!-- ═══ 报告 ═══ -->
    <section class="wb-sec" data-wb-module="products">
      <div class="wb-sec-head"><span class="wb-sec-title"><i class="fa-solid fa-chart-simple"></i> 报告</span></div>
      <div class="wb-sec-body">
        <div class="report-panel" id="report-panel" hidden>
          <div class="module-grid" id="module-grid">
            <div class="module-item"><span class="count" id="count-chars">0</span><span class="label">角色卡</span></div>
            <div class="module-item"><span class="count" id="count-chats">0</span><span class="label">聊天记录</span></div>
            <div class="module-item"><span class="count" id="count-lorebooks">0</span><span class="label">世界书</span></div>
            <div class="module-item"><span class="count" id="count-presets">0</span><span class="label">预设配置</span></div>
            <div class="module-item"><span class="count" id="count-assets">0</span><span class="label">资产与头像</span></div>
            <div class="module-item"><span class="count" id="count-extensions">0</span><span class="label">扩展</span></div>
            <div class="module-item"><span class="count" id="count-settings">0</span><span class="label">系统设置</span></div>
            <div class="module-item"><span class="count" id="count-secrets">0</span><span class="label">密钥</span></div>
          </div>

          <div class="inline-drawer wb-fold" id="fold-report-details">
            <div class="inline-drawer-toggle inline-drawer-header">
              <b><i class="fa-solid fa-list"></i> 详情</b>
              <span class="wb-fold-summary" id="fold-summary-report"></span>
              <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
            </div>
            <div class="inline-drawer-content" style="display: none;">
              <pre id="discards-log"></pre>
              <pre id="filtered-log"></pre>
              <pre id="warnings-log"></pre>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- 日志控制台挂载点 -->
    <div id="log-console-mount" data-wb-module="log"></div>

    </div><!-- /#wb-col-left -->
    <div class="wb-col" id="wb-col-right"></div>
    </div><!-- /#wb-shell -->

    <div class="restore-modal-overlay" id="restore-modal-overlay" style="display: none;">
      <div class="restore-modal-card">
        <h3 class="modal-title"><i class="fa-solid fa-triangle-exclamation"></i> 恢复至当前宿主</h3>
        <p class="modal-desc" id="restore-modal-desc"></p>
        <label class="wb-field">
          <span class="wb-field-key">写入方式</span>
          <select id="restore-mode-select" class="text_pole">
            <option value="merge" selected>合并写入</option>
            <option value="overwrite">覆盖写入</option>
          </select>
        </label>
        <label class="checkbox_label flex-container" id="restore-backup-label">
          <input type="checkbox" id="restore-backup-confirmed">
          <span>我已备份目标数据</span>
        </label>
        <label class="checkbox_label flex-container" id="restore-conflict-label">
          <input type="checkbox" id="restore-conflict-ack">
          <span id="restore-conflict-text"></span>
        </label>
        <div class="modal-desc" id="restore-backup-desc"></div>
        <div class="wb-tool-row">
          <button type="button" class="menu_button" id="btn-target-preflight">自动备份并预检目标</button>
          <span class="modal-desc" id="restore-preflight-status"></span>
        </div>
        <div class="wb-tool-row">
          <button type="button" class="menu_button" id="btn-cancel-restore">取消</button>
          <button type="button" class="menu_button menu_button_icon btn-accent" id="btn-confirm-restore">
            <i class="fa-solid fa-rotate"></i> <span>确认恢复</span>
          </button>
        </div>
      </div>
    </div>

    <footer class="app-footer">
      <p><a href="https://github.com/jiozhaoyue/ST-pack-transfer" target="_blank" rel="noopener">GitHub</a></p>
    </footer>
  `;
}
