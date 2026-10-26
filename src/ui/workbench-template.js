/**
 * 数据包转运 - HTML 模板（由 UI 定稿 demo 原样搬运）
 *
 * 与 demo 的唯一差异：关闭按钮只在模态态渲染；末尾附一个隐藏文件输入供上传。
 */

export function getWorkbenchHtml({ isModal = false } = {}) {
  const html = `<header class="app-header">
      <div class="app-title">
        <h1>数据包转运</h1>
        <span class="sub">ST-pack-transfer</span>
      </div>
      <div class="header-actions">
        <span class="badge accent" id="host-badge"><img class="host-icon" id="host-badge-icon" alt=""><svg class="gh-icon" id="host-badge-gh" viewBox="0 0 24 24" width="14" height="14" fill="currentColor" hidden><path d="M12 2A10 10 0 0 0 2 12c0 4.42 2.87 8.17 6.84 9.5.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.89 1.53 2.34 1.09 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.56-1.11-4.56-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.02a9.5 9.5 0 0 1 5 0c1.9-1.29 2.74-1.02 2.74-1.02.55 1.38.2 2.4.1 2.65.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.69-4.57 4.94.36.31.68.92.68 1.85v2.74c0 .27.18.58.69.48A10 10 0 0 0 22 12A10 10 0 0 0 12 2z"/></svg><span id="host-badge-text">Luker 插件</span></span>
        <button class="icon-btn" id="btn-guide" title="基础教程">?</button>
        <button class="icon-btn" id="btn-log" title="日志">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M4 5h16v14H4z"/><path d="M7 9h10M7 13h7"/></svg>
          <span class="log-dot" id="log-dot" hidden></span>
        </button>
        <button class="icon-btn" id="btn-settings" title="设置"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9L17 7M7 17l-2.1 2.1"/></svg></button>
        <button class="icon-btn" id="btn-close" title="关闭">×</button>
      </div>
    </header>

    <main class="app-main">
      <div class="col-chart">
        <section class="panel chart-card" id="chart-card">
          <div class="panel-head">
            <div class="panel-title">
              <svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M4 5h16v14H4z"/><path d="M4 10h16M9 10v9M15 10v9"/></svg>
              <span>存储图表</span>
            </div>
            <div class="panel-actions">
              <button class="help-btn" data-help="chart" title="图表帮助">?</button>
            </div>
          </div>

          <div class="chart-controls">
            <div class="field">目标平台
              <div class="picker" id="target-select">
                <button class="picker-btn" id="target-btn" aria-haspopup="listbox" aria-expanded="false">
                  <img class="picker-ico" id="target-btn-icon" data-host="st" alt="">
                  <span id="target-btn-text">SillyTavern</span>
                  <svg class="caret" viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>
                </button>
                <div class="picker-pop" id="target-pop" role="listbox" hidden></div>
              </div>
            </div>
            <div class="segmented" id="delta-toggle" title="覆盖 / 增量">
              <button class="seg-btn active" data-delta="overwrite">覆盖</button>
              <button class="seg-btn" data-delta="incremental">增量</button>
            </div>
            <label class="field">分卷
              <input type="number" id="split-input" min="32" max="2048" step="1" placeholder="不分卷">
              <span class="unit">MB</span>
              <span class="split-sim" id="split-sim"></span>
            </label>
          </div>

          <div class="filename-row">
            <label class="field" for="filename-template">包名</label>
            <textarea id="filename-template" rows="1" spellcheck="false">{target}_{user}_{part}_{datetime}.zip</textarea>
            <span class="filename-preview" id="filename-preview"></span>
          </div>

          <div class="quota-head" id="quota-head"></div>
          <div class="legend">
            <span class="item"><i class="dot keep"></i>建议保留</span>
            <span class="item"><i class="dot optional"></i>可选</span>
            <span class="item"><i class="dot drop"></i>建议清理</span>
            <span class="item"><i class="dot unknown"></i>未识别</span>
            <span class="item" style="margin-left:auto">勾选即导出范围</span>
          </div>
          <div class="batch-bar" id="batch-bar" hidden></div>
          <div class="chart-stack" id="chart-stack"></div>
        </section>
      </div>

      <div class="splitter-v" id="split-v" role="separator" aria-orientation="vertical" title="拖动调整左右宽度"></div>

      <div class="col-side">
        <div class="splitter-corner" id="split-corner" title="拖动同时调整宽度与高度"></div>
        <section class="panel zone-card" id="zone-card">
          <div class="panel-head">
            <div class="panel-title">
              <svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M4 7h16v13H4z"/><path d="M8 7V4h8v3"/><path d="M4 12h16"/></svg>
              <span>数据包</span>
            </div>
            <div class="panel-actions">
              <button class="help-btn" data-help="zone" title="数据包帮助">?</button>
            </div>
          </div>
          <div class="zone-tabs" id="zone-tabs">
            <button class="zone-tab active" data-zone="import">导入<span class="count" id="count-import">4</span></button>
            <button class="zone-tab" data-zone="export">导出<span class="count" id="count-export">1</span></button>
          </div>
          <div class="zone-body" id="zone-body"></div>
        </section>

        <div class="splitter-h" id="split-h" role="separator" aria-orientation="horizontal" title="拖动调整高度"></div>

        <section class="panel action-card" id="action-card">
          <div class="panel-head">
            <div class="panel-title">
              <svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M4 12h16"/><path d="M12 4v16"/></svg>
              <span>执行</span>
            </div>
            <div class="panel-actions">
              <button class="help-btn" data-help="action" title="执行帮助">?</button>
            </div>
          </div>
          <div class="action-row" id="action-row"></div>
          <div class="progress">
            <div class="progress-bar"><div class="progress-fill" id="progress-fill"></div></div>
            <div class="progress-text"><span id="progress-label">准备就绪</span><span id="progress-pct">0%</span></div>
          </div>
        </section>

      </div>
    </main>

<!-- 帮助浮层：挂在 body，避免被面板 overflow 裁切 -->
<div class="help-popover" id="help-popover" hidden></div>

<!-- 教程 -->
<div class="tutorial-overlay" id="tutorial-overlay">
  <div class="tutorial-ring" id="tutorial-ring"></div>
  <div class="tutorial-card" id="tutorial-card">
    <div class="tt" id="tutorial-title"></div>
    <div class="td" id="tutorial-desc"></div>
    <div class="dots" id="tutorial-dots"></div>
    <div class="acts">
      <button id="tutorial-adv" class="link">进阶教程</button>
      <button id="tutorial-skip">跳过</button>
      <button id="tutorial-prev">上一步</button>
      <button id="tutorial-next" class="primary">下一步</button>
    </div>
  </div>
</div>

<!-- 通用弹窗 -->
<div class="modal-overlay" id="modal-overlay">
  <div class="modal" id="modal">
    <h3 id="modal-title"></h3>
    <p id="modal-desc"></p>
    <div id="modal-extra"></div>
    <div class="actions" id="modal-actions"></div>
  </div>
</div>

<!-- 日志：顶栏按钮打开，面板里不再常驻日志块 -->
<div class="modal-overlay" id="log-overlay">
  <div class="modal log-modal">
    <div class="log-modal-head">
      <h3>日志</h3>
      <button class="help-btn" data-help="log" title="日志帮助">?</button>
      <span class="latest" id="log-latest">暂无日志</span>
      <button class="icon-btn" id="log-close" title="关闭">×</button>
    </div>
    <div class="log-toolbar" id="log-toolbar">
      <button class="log-level-btn active" data-level="ALL">全部</button>
      <button class="log-level-btn" data-level="INFO">信息</button>
      <button class="log-level-btn" data-level="WARN">警告</button>
      <button class="log-level-btn" data-level="ERROR">错误</button>
      <span style="flex:1"></span>
      <span class="log-badge" id="log-count-info">0 INFO</span>
      <span class="log-badge warn" id="log-count-warn">0 WARN</span>
      <span class="log-badge err" id="log-count-err">0 ERR</span>
      <button id="log-copy">复制</button>
      <button id="log-clear">清空</button>
    </div>
    <div class="log-body" id="log-body"><div id="log-lines"></div></div>
  </div>
</div>

<div class="toast" id="toast"></div>
<div class="fullname-pop" id="fullname-pop" hidden></div>`;
  const bodyHtml = isModal ? html : html.replace('<button class="icon-btn" id="btn-close" title="关闭">×</button>', '');
  return bodyHtml + '<input type="file" id="file-input" accept=".zip" multiple hidden>';
}
