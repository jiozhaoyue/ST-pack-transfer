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
      </div>
      <div class="header-actions">
        <span class="badge accent" id="host-badge"><img class="host-icon" id="host-badge-icon" alt=""><svg class="gh-icon" id="host-badge-gh" viewBox="0 0 24 24" width="14" height="14" fill="currentColor" hidden><path d="M12 2A10 10 0 0 0 2 12c0 4.42 2.87 8.17 6.84 9.5.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.89 1.53 2.34 1.09 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.56-1.11-4.56-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.02a9.5 9.5 0 0 1 5 0c1.9-1.29 2.74-1.02 2.74-1.02.55 1.38.2 2.4.1 2.65.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.69-4.57 4.94.36.31.68.92.68 1.85v2.74c0 .27.18.58.69.48A10 10 0 0 0 22 12A10 10 0 0 0 12 2z"/></svg><span id="host-badge-text"></span></span>
        <button class="icon-btn" id="btn-guide" data-i18n-title="header.guide">?</button>
        <button class="icon-btn" id="btn-locale" data-i18n-title="settings.locale"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3z"/></svg></button>
        <button class="icon-btn" id="btn-settings" data-i18n-title="header.settings"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg></button>
        <button class="icon-btn" id="btn-close" data-i18n-title="header.close">×</button>
      </div>
    </header>

    <div class="tutorial-banner" id="tutorial-banner" hidden>
      <span class="tb-text" data-i18n="tutorial.modeBanner"></span>
      <button type="button" class="btn" id="tutorial-banner-exit" data-i18n="tutorial.exitMode"></button>
    </div>

    <div class="app-body">
    <main class="app-main" id="view-workbench">
      <div class="col-chart">
        <section class="panel chart-card" id="chart-card">
          <div class="panel-head panel-head--switch">
            <div class="view-switch" data-view-switch></div>
            <div class="panel-actions">
              <button class="icon-btn chart-pref-btn" id="chart-pref-btn" data-i18n-title="chart.prefsBtn" data-i18n-aria="chart.prefsBtn">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 7h8M16 7h4M4 12h4M12 12h8M4 17h10M18 17h2"/><circle cx="14" cy="7" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="16" cy="17" r="2"/></svg>
              </button>
              <button class="help-btn" data-help="chart" data-i18n-title="chart.help">?</button>
            </div>
          </div>

          <div class="chart-controls">
            <div class="field"><span data-i18n="chart.target"></span>
              <div class="picker" id="target-select">
                <button class="picker-btn" id="target-btn" aria-haspopup="listbox" aria-expanded="false">
                  <img class="picker-ico" id="target-btn-icon" data-host="st" alt="">
                  <span id="target-btn-text">SillyTavern</span>
                  <span class="host-tag" id="target-btn-host" hidden></span>
                  <svg class="caret" viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>
                </button>
                <div class="picker-pop" id="target-pop" role="listbox" hidden></div>
              </div>
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
            <button type="button" class="icon-btn filename-toggle" id="filename-toggle" data-i18n-title="chart.filename" data-i18n-aria="chart.filename" aria-expanded="false">
              <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 20h4l10-10-4-4L4 16z"/><path d="M13.5 6.5l4 4"/></svg>
              <span data-i18n="chart.filename"></span>
              <svg class="chev" viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 5l7 7-7 7"/></svg>
            </button>
          </div>

          <div class="filename-row" id="filename-row" hidden>
            <div class="filename-edit">
              <label class="field" for="filename-template" data-i18n="chart.filenameLabel"></label>
              <textarea id="filename-template" rows="1" spellcheck="false">{target}_{user}_{part}_{datetime}.zip</textarea>
            </div>
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

        <section class="panel transfer-view" id="transfer-view" hidden>
          <div class="panel-head panel-head--switch">
            <div class="view-switch" data-view-switch></div>
            <div class="panel-actions">
              <div class="segmented transfer-tabs" id="transfer-tabs">
                <button type="button" class="seg-btn active" data-transfer-tab="lan" data-i18n="action.lan"></button>
                <button type="button" class="seg-btn" data-transfer-tab="cloud" data-i18n="cloud.open"></button>
              </div>
            </div>
          </div>
          <div class="transfer-body">
          <div class="transfer-pane" id="lan-view">
          <div class="lan-body" id="lan-body">
            <div class="lan-overview" id="lan-overview">
              <span class="lo-item"><b data-i18n="lan.ovPeer"></b><span id="lan-ov-peer"></span></span>
              <span class="lo-item"><b data-i18n="lan.ovCats"></b><span id="lan-ov-cats"></span></span>
              <span class="lo-item"><b data-i18n="lan.ovState"></b><span id="lan-ov-state"></span></span>
            </div>
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

          <div class="transfer-pane" id="cloud-view" hidden>
          <div class="transfer-subtabs">
            <div class="segmented" id="cloud-provider-tabs">
              <button type="button" class="seg-btn active" data-cloud-provider="s3">S3</button>
              <button type="button" class="seg-btn" data-cloud-provider="webdav">WebDAV</button>
            </div>
          </div>
          <div class="cloud-body" id="cloud-mode-row">
            <div class="cloud-grid">
              <label class="cloud-field"><span data-i18n="cloud.mode"></span>
                <select class="text_pole" id="cloud-mode-select">
                  <option value="full" data-i18n="cloud.modeFull"></option>
                  <option value="set" data-i18n="cloud.modeSet"></option>
                </select></label>
              <label class="cloud-field"><span data-i18n="cloud.setName"></span>
                <input class="text_pole" id="cloud-set-name" autocomplete="off" placeholder="default"></label>
              <label class="cloud-field"><span data-i18n="cloud.retention"></span>
                <input class="text_pole" id="cloud-retention" type="number" min="1" max="99" value="10"></label>
            </div>
            <p class="cloud-note" data-i18n="cloud.encryptNote"></p>
          </div>
          <div class="transfer-subpane" id="cloud-s3-pane">
          <div class="cloud-body" id="cloud-body">
            <p class="cloud-note" data-i18n="cloud.note"></p>
            <div class="cloud-grid">
              <label class="cloud-field"><span data-i18n="cloud.endpoint"></span>
                <input class="text_pole" id="cloud-endpoint" placeholder="https://s3.example.com" autocomplete="off"></label>
              <label class="cloud-field"><span data-i18n="cloud.region"></span>
                <input class="text_pole" id="cloud-region" placeholder="us-east-1" autocomplete="off"></label>
              <label class="cloud-field"><span data-i18n="cloud.bucket"></span>
                <input class="text_pole" id="cloud-bucket" autocomplete="off"></label>
              <label class="cloud-field"><span data-i18n="cloud.prefix"></span>
                <input class="text_pole" id="cloud-prefix" autocomplete="off"></label>
              <label class="cloud-field"><span data-i18n="cloud.accessKey"></span>
                <input class="text_pole" id="cloud-access-key" autocomplete="off"></label>
              <label class="cloud-field"><span data-i18n="cloud.secretKey"></span>
                <input class="text_pole" id="cloud-secret-key" type="password" autocomplete="off"></label>
              <label class="cloud-field"><span data-i18n="cloud.passphrase"></span>
                <input class="text_pole" id="cloud-passphrase" type="password" autocomplete="off"></label>
              <label class="cloud-check"><input type="checkbox" id="cloud-path-style"><span data-i18n="cloud.pathStyle"></span></label>
            </div>
            <div class="cloud-row">
              <button type="button" class="menu_button" id="cloud-save" data-i18n="cloud.save"></button>
              <button type="button" class="menu_button" id="cloud-refresh" data-i18n="cloud.refresh"></button>
            </div>
          </div>
          </div>

          <div class="transfer-subpane" id="cloud-webdav-pane" hidden>
          <div class="cloud-body" id="webdav-body">
            <p class="cloud-note" data-i18n="webdav.note"></p>
            <div class="cloud-grid">
              <label class="cloud-field"><span data-i18n="webdav.baseUrl"></span>
                <input class="text_pole" id="webdav-base-url" placeholder="https://dav.example.com/remote.php/dav/files/user" autocomplete="off"></label>
              <label class="cloud-field"><span data-i18n="webdav.username"></span>
                <input class="text_pole" id="webdav-username" autocomplete="off"></label>
              <label class="cloud-field"><span data-i18n="webdav.password"></span>
                <input class="text_pole" id="webdav-password" type="password" autocomplete="off"></label>
              <label class="cloud-field"><span data-i18n="webdav.prefix"></span>
                <input class="text_pole" id="webdav-prefix" autocomplete="off"></label>
              <label class="cloud-field"><span data-i18n="webdav.passphrase"></span>
                <input class="text_pole" id="webdav-passphrase" type="password" autocomplete="off"></label>
            </div>
            <div class="cloud-row">
              <button type="button" class="menu_button" id="webdav-save" data-i18n="cloud.save"></button>
              <button type="button" class="menu_button" id="webdav-refresh" data-i18n="cloud.refresh"></button>
            </div>
          </div>
          </div>

          <div class="cloud-row">
            <button type="button" class="menu_button" id="cloud-upload" data-i18n="cloud.upload" disabled></button>
            <button type="button" class="menu_button" id="cloud-backup-selected" data-i18n="cloud.backupSelected"></button>
            <span class="cloud-picked" id="cloud-picked"></span>
          </div>
          <div class="cloud-status" id="cloud-status"></div>
          <div class="cloud-list" id="cloud-list"></div>
          </div>
          </div>
        </section>

        <section class="panel storage-inspector-view" id="storage-inspector-view" hidden>
          <div class="panel-head">
            <div class="panel-title">
              <svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v12c0 1.7 3.1 3 7 3s7-1.3 7-3V6"/><path d="M5 12c0 1.7 3.1 3 7 3s7-1.3 7-3"/></svg>
              <span data-i18n="si.title"></span>
            </div>
            <div class="panel-actions">
              <div class="segmented" id="si-source-tabs">
                <button type="button" class="seg-btn active" data-si-source="browser" data-i18n="si.sourceBrowser"></button>
                <button type="button" class="seg-btn" data-si-source="host" data-i18n="si.sourceHost"></button>
              </div>
              <button type="button" class="icon-btn" id="si-refresh" data-i18n-title="si.refresh" data-i18n-aria="si.refresh">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M20 12a8 8 0 1 1-2.6-5.9"/><path d="M20 4v4h-4"/></svg>
              </button>
              <button class="icon-btn" id="si-close" data-i18n-title="header.close">×</button>
            </div>
          </div>
          <div class="si-body" id="si-body">
            <nav class="si-breadcrumbs" id="si-breadcrumbs"></nav>
            <div class="si-quota" id="si-quota"></div>
            <div class="si-bar" id="si-bar"></div>
            <div class="si-legend" id="si-legend"></div>
            <div class="si-list" id="si-list"></div>
            <div class="si-state" id="si-loading" hidden data-i18n="si.loading"></div>
            <div class="si-state" id="si-empty" hidden></div>
            <div class="si-state si-error" id="si-error" hidden>
              <span class="si-error-msg" id="si-error-msg"></span>
              <button type="button" class="menu_button" id="si-retry" data-i18n="si.retry"></button>
            </div>
          </div>
        </section>

        <section class="panel extension-view" id="extension-view" hidden>
          <div class="panel-head panel-head--switch">
            <div class="view-switch" data-view-switch></div>
            <div class="panel-actions">
              <div class="segmented" id="extmgr-tabs">
                <button class="seg-btn active" data-exttab="host" data-i18n="extmgr.tabHost"></button>
                <button class="seg-btn" data-exttab="cred" data-i18n="extmgr.tabCred"></button>
                <button class="seg-btn" data-exttab="pack" data-i18n="extmgr.tabPack"></button>
              </div>
              <button class="help-btn" data-help="extmgr" data-i18n-title="extmgr.help">?</button>
            </div>
          </div>
          <div class="extension-body" id="extension-body"></div>
          <div class="ext-report-bar" id="extmgr-report-bar" role="button" tabindex="0"></div>
          <div class="ext-report-panel" id="extmgr-report-panel" hidden></div>
        </section>
      </div>

      <div class="splitter-v" id="split-v" role="separator" aria-orientation="vertical" data-i18n-title="splitter.vertical"></div>

      <div class="col-side">
        <section class="panel zone-card" id="zone-card">
          <div class="panel-head panel-head--switch">
            <div class="panel-title panel-title--zone">
              <svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M4 7h16v13H4z"/><path d="M8 7V4h8v3"/><path d="M4 12h16"/></svg>
              <span data-i18n="zones.title"></span>
            </div>
            <div class="view-switch" data-view-switch data-view-switch-zone hidden></div>
            <div class="panel-actions">
              <button class="help-btn" data-help="zone" data-i18n-title="zones.help">?</button>
            </div>
          </div>
          <div class="zone-tabs" id="zone-tabs">
            <button class="zone-tab active" data-zone="import"><span data-i18n="zones.import"></span><span class="count" id="count-import">4</span></button>
            <button class="zone-tab" data-zone="export"><span data-i18n="zones.export"></span><span class="count" id="count-export">1</span></button>
          </div>
          <div class="zone-delta-row" id="zone-mode-row">
            <button type="button" class="btn zone-fetch-btn" id="btn-fetch"><svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M7 18a4 4 0 0 1 0-8 5 5 0 0 1 9.6-1.4A3.5 3.5 0 0 1 18 18z"/></svg><span data-i18n="action.fetch"></span></button>
            <span class="zone-mode-extra" id="zone-mode-extra"></span>
            <span class="zone-delta-label" data-i18n="chart.deltaLabel"></span>
            <div class="segmented" id="delta-toggle" data-i18n-title="chart.overwrite">
              <button class="seg-btn active" data-delta="overwrite" data-i18n="chart.overwrite"></button>
              <button class="seg-btn" data-delta="incremental" data-i18n="chart.incremental"></button>
            </div>
          </div>
          <div class="pending-exports" id="pending-exports" hidden></div>
          <div class="zone-body" id="zone-body"></div>
          <div class="zone-foot-actions" id="zone-actions-bottom"></div>
        </section>

      </div>
    </main>

    <section class="panel view-card" id="view-settings" hidden>
      <div class="view-head">
        <h3 data-i18n="settings.title"></h3>
        <button class="icon-btn" id="settings-close" data-i18n-title="header.close">×</button>
      </div>
      <div class="view-body" id="settings-body"></div>
      <div class="view-actions">
        <button class="btn" id="settings-cancel" data-i18n="modal.close"></button>
        <button class="btn accent" id="settings-save" data-i18n="modal.save"></button>
      </div>
    </section>

    <section class="panel view-card" id="view-log" hidden>
      <div class="view-head">
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
        <button id="log-export" data-i18n="log.export"></button>
        <button id="log-copy" data-i18n="log.copy"></button>
        <button id="log-clear" data-i18n="log.clear"></button>
      </div>
      <div class="log-body" id="log-body"><div id="log-lines"></div></div>
    </section>

    <section class="panel view-card" id="view-help" hidden>
      <div class="view-head">
        <h3 id="help-title"></h3>
        <button class="icon-btn" id="help-close" data-i18n-title="header.close">×</button>
      </div>
      <div class="view-body help-view-body" id="help-body"></div>
    </section>

    <button type="button" class="workbench-progress" id="workbench-progress" data-i18n-title="progress.openLog">
      <span class="progress-bar"><span class="progress-fill" id="progress-fill"></span></span>
      <span class="progress-text">
        <span id="progress-label" data-i18n="progress.ready"></span>
        <span class="progress-hint" id="progress-hint" data-i18n="progress.openLog"></span>
        <span class="log-dot" id="log-dot" hidden></span>
        <span id="progress-pct">0%</span>
      </span>
    </button>

    <dialog class="confirm-dialog" id="confirm-dialog">
      <div class="view-head">
        <h3 id="modal-title"></h3>
        <button class="icon-btn" id="modal-close" data-i18n-title="header.close">×</button>
      </div>
      <p class="view-desc" id="modal-desc"></p>
      <div class="view-body" id="modal-extra"></div>
      <div class="view-actions" id="modal-actions"></div>
    </dialog>
    </div>

<!-- Tutorial -->
<div class="tutorial-overlay" id="tutorial-overlay">
  <div class="tutorial-ring" id="tutorial-ring"></div>
  <div class="tutorial-card" id="tutorial-card">
    <div class="tt" id="tutorial-title"></div>
    <div class="td" id="tutorial-desc"></div>
    <div class="goals" id="tutorial-goals" hidden></div>
    <div class="dots" id="tutorial-dots"></div>
    <div class="acts">
      <button id="tutorial-adv" class="link" data-i18n="tutorial.changeGoal"></button>
      <button id="tutorial-skip" data-i18n="tutorial.skip"></button>
      <button id="tutorial-prev" data-i18n="tutorial.prev"></button>
      <button id="tutorial-next" class="primary" data-i18n="tutorial.next"></button>
    </div>
  </div>
</div>

<div class="toast" id="toast"></div>
<input type="file" id="file-input" accept=".zip" multiple hidden>`;
}
