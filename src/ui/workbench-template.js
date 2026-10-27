/**
 * 数据包转运 · HTML 模板（唯一源）
 *
 * 正式 UI 以此为准；开发预览页只 import 本模块，
 * 正式代码不得反向引用预览页。
 */

export function getWorkbenchHtml() {
  return `<header class="app-header">
      <div class="app-title">
        <h1 data-i18n="app.title"></h1>
        <span class="sub" data-i18n="app.subtitle"></span>
      </div>
      <div class="header-actions">
        <span class="badge accent" id="host-badge"><img class="host-icon" id="host-badge-icon" alt=""><svg class="gh-icon" id="host-badge-gh" viewBox="0 0 24 24" width="14" height="14" fill="currentColor" hidden><path d="M12 2A10 10 0 0 0 2 12c0 4.42 2.87 8.17 6.84 9.5.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.89 1.53 2.34 1.09 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.56-1.11-4.56-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.02a9.5 9.5 0 0 1 5 0c1.9-1.29 2.74-1.02 2.74-1.02.55 1.38.2 2.4.1 2.65.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.69-4.57 4.94.36.31.68.92.68 1.85v2.74c0 .27.18.58.69.48A10 10 0 0 0 22 12A10 10 0 0 0 12 2z"/></svg><span id="host-badge-text"></span></span>
        <button class="icon-btn" id="btn-guide" data-i18n-title="header.guide">?</button>
        <button class="icon-btn" id="btn-log" data-i18n-title="header.log">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M4 5h16v14H4z"/><path d="M7 9h10M7 13h7"/></svg>
          <span class="log-dot" id="log-dot" hidden></span>
        </button>
        <button class="icon-btn" id="btn-locale" data-i18n-title="settings.locale"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3z"/></svg></button>
        <button class="icon-btn" id="btn-settings" data-i18n-title="header.settings"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg></button>
        <button class="icon-btn" id="btn-close" data-i18n-title="header.close">×</button>
      </div>
    </header>

    <main class="app-main">
      <div class="col-chart">
        <section class="panel chart-card" id="chart-card">
          <div class="panel-head">
            <div class="panel-title">
              <svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M4 5h16v14H4z"/><path d="M4 10h16M9 10v9M15 10v9"/></svg>
              <span data-i18n="chart.title"></span>
            </div>
            <div class="panel-actions">
              <button class="help-btn" data-help="chart" data-i18n-title="chart.help">?</button>
            </div>
          </div>

          <div class="chart-controls">
            <div class="field"><span data-i18n="chart.target"></span>
              <div class="picker" id="target-select">
                <button class="picker-btn" id="target-btn" aria-haspopup="listbox" aria-expanded="false">
                  <img class="picker-ico" id="target-btn-icon" data-host="st" alt="">
                  <span id="target-btn-text">SillyTavern</span>
                  <svg class="caret" viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>
                </button>
                <div class="picker-pop" id="target-pop" role="listbox" hidden></div>
              </div>
            </div>
            <div class="segmented" id="delta-toggle" data-i18n-title="chart.overwrite">
              <button class="seg-btn active" data-delta="overwrite" data-i18n="chart.overwrite"></button>
              <button class="seg-btn" data-delta="incremental" data-i18n="chart.incremental"></button>
            </div>
            <label class="field"><span data-i18n="chart.split"></span>
              <input type="number" id="split-input" min="32" max="2048" step="1" data-i18n-placeholder="chart.splitPlaceholder">
              <span class="unit">MB</span>
              <span class="split-sim" id="split-sim"></span>
            </label>
            <label class="field"><span data-i18n="chart.compression"></span>
              <select id="compression-select" class="text_pole">
                <option value="0" data-i18n="chart.compression0"></option>
                <option value="1" data-i18n="chart.compression1"></option>
                <option value="5" selected data-i18n="chart.compression5"></option>
                <option value="9" data-i18n="chart.compression9"></option>
              </select>
            </label>
          </div>

          <div class="filename-row">
            <label class="field" for="filename-template" data-i18n="chart.filename"></label>
            <textarea id="filename-template" rows="1" spellcheck="false">{target}_{user}_{part}_{datetime}.zip</textarea>
            <span class="filename-preview" id="filename-preview"></span>
          </div>

          <div class="quota-head" id="quota-head"></div>
          <div class="legend">
            <span class="item"><i class="dot keep"></i><span data-i18n="chart.legendKeep"></span></span>
            <span class="item"><i class="dot optional"></i><span data-i18n="chart.legendOptional"></span></span>
            <span class="item"><i class="dot drop"></i><span data-i18n="chart.legendDrop"></span></span>
            <span class="item"><i class="dot unknown"></i><span data-i18n="chart.legendUnknown"></span></span>
            <span class="item" style="margin-left:auto" data-i18n="chart.scopeHint"></span>
          </div>
          <div class="batch-bar" id="batch-bar" hidden></div>
          <div class="chart-stack" id="chart-stack"></div>
        </section>
      </div>

      <div class="splitter-v" id="split-v" role="separator" aria-orientation="vertical" data-i18n-title="splitter.vertical"></div>

      <div class="col-side">
        <div class="splitter-corner" id="split-corner" data-i18n-title="splitter.corner"></div>
        <section class="panel zone-card" id="zone-card">
          <div class="panel-head">
            <div class="panel-title">
              <svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M4 7h16v13H4z"/><path d="M8 7V4h8v3"/><path d="M4 12h16"/></svg>
              <span data-i18n="zones.title"></span>
            </div>
            <div class="panel-actions">
              <button class="help-btn" data-help="zone" data-i18n-title="zones.help">?</button>
            </div>
          </div>
          <div class="zone-tabs" id="zone-tabs">
            <button class="zone-tab active" data-zone="import"><span data-i18n="zones.import"></span><span class="count" id="count-import">4</span></button>
            <button class="zone-tab" data-zone="export"><span data-i18n="zones.export"></span><span class="count" id="count-export">1</span></button>
          </div>
          <div class="zone-body" id="zone-body"></div>
        </section>

        <div class="splitter-h" id="split-h" role="separator" aria-orientation="horizontal" data-i18n-title="splitter.horizontal"></div>

        <section class="panel action-card" id="action-card">
          <div class="panel-head">
            <div class="panel-title">
              <svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M4 12h16"/><path d="M12 4v16"/></svg>
              <span data-i18n="action.title"></span>
            </div>
            <div class="panel-actions">
              <button class="help-btn" data-help="action" data-i18n-title="action.help">?</button>
            </div>
          </div>
          <div class="action-row" id="action-row"></div>

          <div class="lan-block" id="lan-block">
            <button class="lan-toggle" id="lan-toggle" aria-expanded="false">
              <svg class="lan-toggle-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M13 3L5 14h6l-1 7 8-11h-6z"/></svg>
              <span data-i18n="action.lan"></span>
              <span class="lan-toggle-hint" id="lan-toggle-hint" data-i18n="action.lanHint"></span>
              <svg class="lan-chev" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 5l7 7-7 7"/></svg>
            </button>
            <div class="lan-body" id="lan-body" hidden>
              <div class="lan-scan" id="lan-scan" hidden>
                <video id="lan-scan-video" playsinline muted></video>
                <div class="lan-scan-actions">
                  <span id="lan-scan-hint" data-i18n="action.scanHint"></span>
                  <button type="button" id="lan-scan-cancel" data-i18n="action.cancel"></button>
                </div>
                <canvas id="lan-scan-canvas" hidden></canvas>
              </div>
              <p class="lan-scan-error" id="lan-scan-error" hidden></p>

              <section class="lan-send" id="lan-send">
                <div class="lan-sec-head">
                  <span class="lan-sec-title" data-i18n="action.send"></span>
                  <span class="lan-sec-note" id="lan-send-summary" data-i18n="action.sendHint"></span>
                </div>
                <div class="lan-field">
                  <div class="lan-label"><span data-i18n="action.pickup"></span><button type="button" class="lan-link" id="lan-btn-copy-send" hidden data-i18n="action.copy"></button></div>
                  <textarea class="text_pole lan-code" id="lan-send-code" rows="2" readonly data-i18n-placeholder="action.pickupPlaceholder"></textarea>
                  <div class="lan-qr" id="lan-send-qr" hidden></div>
                </div>
                <div class="lan-row">
                  <button type="button" class="menu_button" id="lan-btn-generate" data-i18n="action.generate"></button>
                  <button type="button" class="menu_button" id="lan-btn-retry" hidden data-i18n="action.retry"></button>
                  <button type="button" class="menu_button" id="lan-btn-cancel" hidden data-i18n="action.cancel"></button>
                </div>
                <div class="lan-field">
                  <div class="lan-label"><span data-i18n="action.answer"></span><button type="button" class="lan-link" id="lan-btn-scan-answer" hidden data-i18n="action.scan"></button></div>
                  <textarea class="text_pole lan-code" id="lan-answer-input" rows="2" data-i18n-placeholder="action.answerPlaceholder"></textarea>
                </div>
                <div class="lan-row">
                  <button type="button" class="menu_button" id="lan-btn-apply-answer" data-i18n="action.start"></button>
                </div>
                <div class="lan-progress">
                  <span class="lan-phase" id="lan-send-phase" data-i18n="action.ready"></span>
                  <span class="lan-bar"><i id="lan-send-bar"></i></span>
                  <span class="lan-pct" id="lan-send-pct">0%</span>
                  <span class="lan-detail" id="lan-send-detail"></span>
                </div>
              </section>

              <section class="lan-recv" id="lan-recv">
                <div class="lan-sec-head"><span class="lan-sec-title" data-i18n="action.recv"></span></div>
                <div class="lan-field">
                  <div class="lan-label"><span data-i18n="action.pickup"></span><button type="button" class="lan-link" id="lan-btn-scan-offer" data-i18n="action.scan"></button></div>
                  <textarea class="text_pole lan-code" id="lan-offer-input" rows="2" data-i18n-placeholder="action.offerPlaceholder"></textarea>
                </div>
                <div class="lan-row">
                  <button type="button" class="menu_button" id="lan-btn-accept" data-i18n="action.accept"></button>
                </div>
                <div class="lan-field">
                  <div class="lan-label"><span data-i18n="action.answer"></span><button type="button" class="lan-link" id="lan-btn-copy-recv" hidden data-i18n="action.copy"></button></div>
                  <textarea class="text_pole lan-code" id="lan-recv-code" rows="2" readonly data-i18n-placeholder="action.recvPlaceholder"></textarea>
                  <div class="lan-qr" id="lan-recv-qr" hidden></div>
                </div>
                <div class="lan-progress">
                  <span class="lan-phase" id="lan-recv-phase" data-i18n="action.waiting"></span>
                  <span class="lan-bar"><i id="lan-recv-bar"></i></span>
                  <span class="lan-pct" id="lan-recv-pct">0%</span>
                  <span class="lan-detail" id="lan-recv-detail"></span>
                </div>
                <div class="lan-row">
                  <button type="button" class="menu_button" id="lan-btn-abandon" hidden data-i18n="action.abandon"></button>
                </div>
              </section>
            </div>
          </div>
          <div class="progress">
            <div class="progress-bar"><div class="progress-fill" id="progress-fill"></div></div>
            <div class="progress-text"><span id="progress-label" data-i18n="progress.ready"></span><span id="progress-pct">0%</span></div>
          </div>
        </section>

      </div>
    </main>

<!-- Help popover: mounted on body to avoid panel overflow clipping -->
<div class="help-popover" id="help-popover" hidden></div>

<!-- Tutorial -->
<div class="tutorial-overlay" id="tutorial-overlay">
  <div class="tutorial-ring" id="tutorial-ring"></div>
  <div class="tutorial-card" id="tutorial-card">
    <div class="tt" id="tutorial-title"></div>
    <div class="td" id="tutorial-desc"></div>
    <div class="dots" id="tutorial-dots"></div>
    <div class="acts">
      <button id="tutorial-adv" class="link" data-i18n="tutorial.adv"></button>
      <button id="tutorial-skip" data-i18n="tutorial.skip"></button>
      <button id="tutorial-prev" data-i18n="tutorial.prev"></button>
      <button id="tutorial-next" class="primary" data-i18n="tutorial.next"></button>
    </div>
  </div>
</div>

<!-- Generic modal -->
<div class="modal-overlay" id="modal-overlay">
  <div class="modal" id="modal">
    <h3 id="modal-title"></h3>
    <p id="modal-desc"></p>
    <div id="modal-extra"></div>
    <div class="actions" id="modal-actions"></div>
  </div>
</div>

<!-- Log: opened from the header button; no persistent log block in the panel -->
<div class="modal-overlay" id="log-overlay">
  <div class="modal log-modal">
    <div class="log-modal-head">
      <h3 data-i18n="log.title"></h3>
      <button class="help-btn" data-help="log" data-i18n-title="log.help">?</button>
      <span class="latest" id="log-latest" data-i18n="log.empty"></span>
      <button class="icon-btn" id="log-close" data-i18n-title="header.close">×</button>
    </div>
    <div class="log-toolbar" id="log-toolbar">
      <button class="log-level-btn active" data-level="ALL" data-i18n="log.all"></button>
      <button class="log-level-btn" data-level="INFO" data-i18n="log.info"></button>
      <button class="log-level-btn" data-level="WARN" data-i18n="log.warn"></button>
      <button class="log-level-btn" data-level="ERROR" data-i18n="log.error"></button>
      <span style="flex:1"></span>
      <span class="log-badge" id="log-count-info">0 INFO</span>
      <span class="log-badge warn" id="log-count-warn">0 WARN</span>
      <span class="log-badge err" id="log-count-err">0 ERR</span>
      <button id="log-copy" data-i18n="log.copy"></button>
      <button id="log-clear" data-i18n="log.clear"></button>
    </div>
    <div class="log-body" id="log-body"><div id="log-lines"></div></div>
  </div>
</div>

<div class="toast" id="toast"></div>
<div class="fullname-pop" id="fullname-pop" hidden></div><input type="file" id="file-input" accept=".zip" multiple hidden>`;
}
