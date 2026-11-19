/**
 * 数据包转运 · HTML 模板（唯一源）
 *
 * 正式 UI 以此为准；开发预览页只 import 本模块，
 * 正式代码不得反向引用预览页。
 */

export function getWorkbenchHtml() {
  return `<header class="app-header">
      <div class="app-title">
        <!-- Symbol before title: ⇄; falls back to symbol only when narrow; aria-label preserves accessible name -->
        <h1 data-i18n-aria="app.title"><span class="app-title-sym" aria-hidden="true">⇄</span><span class="app-title-txt" data-i18n="app.title"></span></h1>
      </div>
      <div class="header-actions">
        <span class="badge accent" id="host-badge"><img class="host-icon" id="host-badge-icon" alt=""><svg class="gh-icon" id="host-badge-gh" viewBox="0 0 24 24" width="14" height="14" fill="currentColor" hidden><path d="M12 2A10 10 0 0 0 2 12c0 4.42 2.87 8.17 6.84 9.5.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.89 1.53 2.34 1.09 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.56-1.11-4.56-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.02a9.5 9.5 0 0 1 5 0c1.9-1.29 2.74-1.02 2.74-1.02.55 1.38.2 2.4.1 2.65.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.69-4.57 4.94.36.31.68.92.68 1.85v2.74c0 .27.18.58.69.48A10 10 0 0 0 22 12A10 10 0 0 0 12 2z"/></svg><svg class="web-icon" id="host-badge-web" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" hidden><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3z"/></svg><span id="host-badge-text"></span><span id="host-badge-user"></span></span>
        <div class="header-theme-picker" id="header-theme-picker" hidden>
          <select class="text_pole header-theme-select" id="header-theme-select" data-i18n-title="header.theme">
            <option value="Dark Lite">Dark Lite</option>
            <option value="Dark V 1.0">Dark V 1.0</option>
            <option value="Azure">Azure</option>
            <option value="Cappuccino">Cappuccino</option>
            <option value="Celestial Macaron">Celestial Macaron</option>
          </select>
        </div>
        <button class="icon-btn" id="btn-guide" data-i18n-title="header.guide"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 20.5A2.5 2.5 0 0 1 6.5 18H20v3H6.5"/></svg></button>
        <button class="icon-btn" id="btn-locale" data-i18n-title="settings.locale"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3z"/></svg></button>
        <button class="icon-btn" id="btn-settings" data-i18n-title="header.settings"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg></button>
        <button class="icon-btn" id="btn-close" data-i18n-title="header.close">×</button>
      </div>
    </header>

    <div class="tutorial-banner" id="tutorial-banner" hidden>
      <span class="tb-text" data-i18n="tutorial.modeBanner"></span>
      <button type="button" class="btn" id="tutorial-banner-reopen" data-i18n="tutorial.reopen"></button>
      <button type="button" class="btn" id="tutorial-banner-exit" data-i18n="tutorial.exitMode"></button>
    </div>

    <div class="app-body">
    <main class="app-main" id="view-workbench">
      <div class="col-chart">
        <section class="panel chart-card is-mobile-settings" id="chart-card">
          <div class="panel-head panel-head--switch">
            <div class="view-switch" data-view-switch></div>
            <div class="panel-actions">
              <button class="icon-btn chart-pref-btn" id="chart-pref-btn" data-i18n-title="chart.prefsBtn" data-i18n-aria="chart.prefsBtn">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 7h8M16 7h4M4 12h4M12 12h8M4 17h10M18 17h2"/><circle cx="14" cy="7" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="16" cy="17" r="2"/></svg>
                <span class="pref-btn-txt" data-i18n="chart.prefsBtnText"></span>
              </button>

            </div>
          </div>

          <div class="chart-mobile-summary" id="chart-mobile-summary">
            <span class="cms-text" id="chart-mobile-summary-text"></span>
            <button type="button" class="btn cms-toggle" id="chart-mobile-settings-toggle" aria-expanded="true" data-i18n="chart.mobileSettingsClose"></button>
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
            <label class="field" id="engine-field" hidden><span data-i18n="chart.engine"></span>
              <select id="target-engine" class="text_pole">
                <option value="" data-i18n="chart.engineAuto"></option>
                <option value="fs" data-i18n="chart.engineFs"></option>
                <option value="postgres" data-i18n="chart.enginePostgres"></option>
                <option value="mysql" data-i18n="chart.engineMysql"></option>
                <option value="sqlite" data-i18n="chart.engineSqlite"></option>
              </select>
            </label>
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
            <button type="button" class="icon-btn filename-toggle is-open" id="filename-toggle" data-i18n-title="chart.filename" data-i18n-aria="chart.filename" aria-expanded="true">
              <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 20h4l10-10-4-4L4 16z"/><path d="M13.5 6.5l4 4"/></svg>
              <span data-i18n="chart.filename"></span>
              <svg class="chev" viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 5l7 7-7 7"/></svg>
            </button>
          </div>

          <div class="filename-row" id="filename-row">
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
            <!-- Minimal mode switch: persistent / legacy -->
            <div class="lan-mode-bar" id="lan-mode-bar">
              <div class="segmented lan-mode-tabs" id="lan-mode-tabs">
                <button type="button" class="seg-btn active" data-lan-mode="peer" data-i18n="lan.mode.peerShort"></button>
                <button type="button" class="seg-btn" data-lan-mode="legacy" data-i18n="lan.mode.legacyShort"></button>
              </div>
              <span class="lan-mode-hint" id="lan-mode-hint" data-i18n="lan.mode.hintShort"></span>
            </div>

            <!-- 1. Identity-free universal link panel (single adaptive input) -->
            <div class="lan-peer-container" id="lan-peer-container">
              <!-- Disconnected: single adaptive pairing card -->
              <div class="lan-peer-box" id="lan-peer-unconnected">
                <div class="lan-peer-input-row">
                  <input type="text" class="text_pole" id="lan-peer-input" data-i18n-placeholder="lan.peer.inputPlaceholder">
                </div>
                <div class="lan-peer-actions">
                  <button type="button" class="btn" id="lan-peer-btn-generate" data-i18n="lan.peer.generateCode"></button>
                  <button type="button" class="btn" id="lan-peer-btn-scan"><i class="fa-solid fa-camera"></i> <span data-i18n="action.scan"></span></button>
                  <button type="button" class="btn accent" id="lan-peer-btn-connect" data-i18n="lan.peer.connect"></button>
                  <button type="button" class="btn icon" id="lan-peer-btn-copy" hidden data-i18n-title="action.copy"><i class="fa-regular fa-copy"></i></button>
                </div>
                <div class="lan-peer-qr-wrap" id="lan-peer-qr-box" hidden>
                  <div class="lan-qr is-compact" id="lan-peer-qr"></div>
                  <span class="lan-qr-tip" id="lan-peer-qr-tip" data-i18n="lan.peer.qrTip"></span>
                </div>
              </div>

              <!-- Connected: peer board (persistent, bi-directional alternating queue) -->
              <div class="lan-peer-connected" id="lan-peer-connected" hidden>
                <div class="lan-peer-bar">
                  <span class="lan-peer-badge"><i class="fa-solid fa-circle" style="color:var(--keep,#4caf50);font-size:10px;margin-right:4px"></i> <span id="lan-peer-status-label" data-i18n="lan.peer.statusConnected"></span></span>
                  <span class="lan-peer-rtt" id="lan-peer-rtt-text">RTT --ms</span>
                  <span class="spacer"></span>
                  <button type="button" class="btn danger-btn" id="lan-peer-btn-disconnect" data-i18n="lan.peer.disconnect"></button>
                </div>

                <div class="lan-peer-actions-row">
                  <span class="lan-peer-sel-note" id="lan-peer-sel-summary" data-i18n="lan.peer.selectedNote"></span>
                  <button type="button" class="btn accent" id="lan-peer-btn-send" data-i18n="lan.peer.sendToPeerButton"></button>
                </div>

                <!-- Active single-transfer progress card -->
                <div class="lan-peer-active-card" id="lan-peer-active-card" hidden>
                  <div class="lan-peer-active-head">
                    <span class="lan-peer-active-dir" id="lan-peer-active-dir">📤</span>
                    <span class="lan-peer-active-name" id="lan-peer-active-name" data-i18n="lan.peer.transferring"></span>
                    <span class="spacer"></span>
                    <span class="lan-peer-active-pct" id="lan-peer-active-pct">0%</span>
                  </div>
                  <div class="lan-progress">
                    <span class="lan-bar"><i id="lan-peer-active-bar"></i></span>
                  </div>
                  <div class="lan-peer-active-detail" id="lan-peer-active-detail">-- / -- · -- MB/s</div>
                </div>

                <!-- Bi-directional task queue board -->
                <div class="lan-peer-queue-card">
                  <div class="lan-peer-queue-head">
                    <span class="lan-peer-queue-title" data-i18n="lan.peer.queueTitleShort"></span>
                    <span class="lan-peer-queue-count" id="lan-peer-queue-count">0</span>
                  </div>
                  <div class="lan-peer-queue-list" id="lan-peer-queue-list">
                    <div class="ext-note" id="lan-peer-queue-empty" data-i18n="lan.peer.queueEmptyShort"></div>
                  </div>
                </div>
              </div>
            </div>

            <!-- 2. Legacy single-transfer container (fallback) -->
            <div class="lan-legacy-container" id="lan-legacy-container" hidden>
              <div class="lan-overview" id="lan-overview">
                <span class="lo-item"><b data-i18n="lan.ovPeer"></b><span id="lan-ov-peer"></span></span>
                <span class="lo-item"><b data-i18n="lan.ovCats"></b><span id="lan-ov-cats"></span></span>
                <span class="lo-item"><b data-i18n="lan.ovState"></b><span id="lan-ov-state"></span></span>
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
                  <div class="lan-qr" id="lan-send-qr"></div>
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
                  <div class="lan-qr" id="lan-recv-qr"></div>
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
          </div>

          <div class="transfer-pane cloud-view" id="cloud-view" hidden>
          <!-- 1. Storage credentials card (pinned to top with integrated tabs) -->
          <div class="cloud-card cloud-storage-config-card">
            <div class="cloud-card-header cloud-provider-header">
              <div class="segmented cloud-provider-tabs" id="cloud-provider-tabs">
                <button type="button" class="seg-btn active" data-cloud-provider="s3"><i class="fa-solid fa-cloud"></i> <span data-i18n="cloud.providerS3"></span></button>
                <button type="button" class="seg-btn" data-cloud-provider="webdav"><i class="fa-solid fa-network-wired"></i> <span data-i18n="cloud.providerWebdav"></span></button>
              </div>
              <span class="cloud-settings-guide" data-i18n="cloud.settingsGuide"></span>
              <span class="cch-tag" id="cloud-provider-tag">S3 / WebDAV</span>
            </div>

            <div class="transfer-subpane" id="cloud-s3-pane">
            <div class="cloud-body" id="cloud-body">
              <div class="cloud-note-box"><i class="fa-solid fa-lock"></i> <p class="cloud-note" data-i18n="cloud.note"></p></div>
              <div class="cloud-grid">
                <label class="cloud-field span-2"><span data-i18n="cloud.endpoint"></span>
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
                <label class="cloud-check span-2"><input type="checkbox" id="cloud-path-style"><span data-i18n="cloud.pathStyle"></span></label>
              </div>
              <div class="cloud-row">
                <button type="button" class="btn accent" id="cloud-save"><i class="fa-solid fa-floppy-disk"></i> <span data-i18n="cloud.save"></span></button>
                <button type="button" class="btn" id="cloud-refresh"><i class="fa-solid fa-arrows-rotate"></i> <span data-i18n="cloud.refresh"></span></button>
              </div>
            </div>
            </div>

            <div class="transfer-subpane" id="cloud-webdav-pane" hidden>
            <div class="cloud-body" id="webdav-body">
              <div class="cloud-note-box"><i class="fa-solid fa-lock"></i> <p class="cloud-note" data-i18n="webdav.note"></p></div>
              <div class="cloud-grid">
                <label class="cloud-field span-2"><span data-i18n="webdav.baseUrl"></span>
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
                <button type="button" class="btn accent" id="webdav-save"><i class="fa-solid fa-floppy-disk"></i> <span data-i18n="cloud.save"></span></button>
                <button type="button" class="btn" id="webdav-test" data-i18n-title="webdav.testHint"><i class="fa-solid fa-bolt"></i> <span data-i18n="webdav.test"></span></button>
                <button type="button" class="btn" id="webdav-refresh"><i class="fa-solid fa-arrows-rotate"></i> <span data-i18n="cloud.refresh"></span></button>
              </div>
              <!-- Self-test report: standalone block container; must NOT reuse the
                   flex-based .cloud-note-box, otherwise multi-row reports get squeezed
                   into unreadable vertical text. -->
              <div class="cloud-test-box" id="webdav-test-result" hidden></div>
            </div>
            </div>
          </div>

          <!-- 2. Cloud backup and sync actions card -->
          <div class="cloud-card cloud-action-card">
            <div class="cloud-card-header">
              <div class="cch-title"><i class="fa-solid fa-cloud-arrow-up"></i> <span data-i18n="cloud.actionCardTitle"></span></div>
              <div class="cloud-picked-badge" id="cloud-picked-wrap"><span class="cloud-picked" id="cloud-picked"></span></div>
            </div>
            <div class="cloud-row cloud-action-buttons">
              <button type="button" class="btn accent cloud-btn-primary" id="cloud-backup-selected"><i class="fa-solid fa-cloud-arrow-up"></i> <span data-i18n="cloud.backupSelected"></span></button>
              <button type="button" class="btn cloud-btn-secondary" id="cloud-upload" disabled><i class="fa-solid fa-upload"></i> <span data-i18n="cloud.upload"></span></button>
              <button type="button" class="btn accent cloud-btn-primary" id="cloud-auto-backup"><i class="fa-solid fa-bolt"></i> <span data-i18n="cloud.autoBackup"></span></button>
            </div>
            <div class="cloud-note-box"><i class="fa-solid fa-bolt"></i> <div class="cloud-note" data-i18n="cloud.autoBackupHint"></div></div>
            <div class="cloud-status" id="cloud-status"></div>
            <div class="cloud-guide-group">
              <div class="cloud-note-box"><i class="fa-solid fa-circle-info"></i> <div class="cloud-note" id="cloud-unified-guide" data-i18n="cloud.unifiedPackHint"></div></div>
              <div class="cloud-note-box"><i class="fa-solid fa-lightbulb"></i> <div class="cloud-note" id="webdav-guide-card" data-i18n="webdav.tutorialGuide"></div></div>
            </div>
            <div class="cloud-list" id="cloud-list"></div>
          </div>

          <!-- 3. Backup strategy and format card (bottom) -->
          <div class="cloud-card cloud-strategy-card" id="cloud-mode-row">
            <div class="cloud-card-header">
              <div class="cch-title"><i class="fa-solid fa-sliders"></i> <span data-i18n="cloud.strategyCardTitle"></span></div>
              <span class="cch-tag" data-i18n="cloud.strategyBadge"></span>
            </div>
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
            <div class="cloud-note-box"><i class="fa-solid fa-shield-halved"></i> <p class="cloud-note" data-i18n="cloud.encryptNote"></p></div>
          </div>
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
                <button class="seg-btn" data-exttab="package" data-i18n="extmgr.tabPackage"></button>
                <button class="seg-btn" data-exttab="cred" data-i18n="extmgr.tabCred"></button>
              </div>

            </div>
          </div>
          <div class="extension-body" id="extension-body"></div>
          <div class="ext-footer" id="extmgr-install-block" hidden>
            <div class="ext-server-area" id="extmgr-server-area" hidden></div>
            <div class="ext-install-area" id="extmgr-install-area" hidden></div>
            <button type="button" class="btn ext-install-toggle" id="extmgr-install-toggle" aria-expanded="false">
              <svg class="ext-install-ico" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M12 4v11"/><path d="M7 11l5 5 5-5"/><path d="M5 20h14"/></svg>
              <span class="ext-install-label" data-i18n="extmgr.installBlock"></span>
              <svg class="ext-chev" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>
            </button>
          </div>
          <div class="ext-report-bar" id="extmgr-report-bar" role="button" tabindex="0"></div>
          <div class="ext-report-panel" id="extmgr-report-panel" hidden></div>
        </section>
      </div>

      <div class="splitter-v" id="split-v" role="separator" aria-orientation="vertical" data-i18n-title="splitter.vertical"></div>

      <div class="col-side">
        <section class="panel zone-card" id="zone-card">
          <div class="zone-mobile-collapse-bar" id="zone-mobile-collapse-bar">
            <span class="zmcb-title" data-i18n="zones.title"></span>
            <button type="button" class="btn zmcb-btn" id="zone-mobile-collapse" data-i18n-title="zones.collapse" data-i18n-aria="zones.collapse">
              <span data-i18n="zones.collapseShort"></span>
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 15l6-6 6 6"/></svg>
            </button>
          </div>
          <div class="panel-head panel-head--switch">
            <div class="segmented zone-side-tabs" id="zone-side-tabs">
              <button type="button" class="seg-btn active" data-sidetab="zone" data-i18n="view.zone">
                <svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M4 7h16v13H4z"/><path d="M8 7V4h8v3"/><path d="M4 12h16"/></svg>
                <span data-i18n="zones.title"></span>
              </button>
              <button type="button" class="seg-btn" data-sidetab="git"><i class="fa-solid fa-code-branch"></i> <span data-i18n="gitv.title"></span></button>
            </div>
            <div class="view-switch" data-view-switch data-view-switch-zone hidden></div>
            <div class="panel-actions">
              <div class="zone-tabs" id="zone-tabs">
                <button class="zone-tab active" data-zone="import"><span data-i18n="zones.import"></span><span class="count" id="count-import">4</span></button>
                <button class="zone-tab" data-zone="export"><span data-i18n="zones.export"></span><span class="count" id="count-export">1</span></button>
              </div>
              <button type="button" class="icon-btn zone-mobile-close" id="zone-mobile-close" data-i18n-title="zones.collapse" data-i18n-aria="zones.collapse">×</button>
            </div>
          </div>
          <div class="zone-side-panel" id="zone-side-zone">
            <div class="zone-delta-row" id="zone-mode-row">
              <button type="button" class="btn zone-fetch-btn" id="btn-fetch"><svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M7 18a4 4 0 0 1 0-8 5 5 0 0 1 9.6-1.4A3.5 3.5 0 0 1 18 18z"/></svg><span data-i18n="action.fetch"></span></button>
              <button type="button" class="btn zone-fetch-btn" id="btn-inspect" data-i18n="inspect.pick"></button>
              <span class="zone-mode-extra" id="zone-mode-extra"></span>
              <span class="zone-delta-label" data-i18n="chart.deltaLabel"></span>
              <div class="segmented" id="delta-toggle" data-i18n-title="chart.overwrite">
                <button class="seg-btn active" data-delta="overwrite" data-i18n="chart.overwrite"></button>
                <button class="seg-btn" data-delta="incremental" data-i18n="chart.incremental"></button>
              </div>
            </div>
            <div class="zone-body" id="zone-body"></div>
            <div class="inspect-panel" id="inspect-panel"></div>
          <div class="zone-foot-actions" id="zone-actions-bottom"></div>
          </div>
          <div class="zone-side-panel git-viz" id="zone-side-git" hidden>
            <div class="git-viz-body">
              <div class="git-viz-headbar" id="git-viz-headbar"></div>
              <div class="git-viz-graph" id="git-viz-graph"></div>
              <div class="git-viz-detail" id="git-viz-detail"></div>
            </div>
          </div>
        </section>

      </div>
    </main>

    <section class="panel view-card" id="view-settings" hidden>
      <div class="view-head">
        <h3 data-i18n="settings.title"></h3>
        <button class="icon-btn" id="settings-close" data-i18n-title="header.close">×</button>
      </div>
      <div class="view-body" id="settings-body"></div>
      <button type="button" class="settings-version" id="settings-version" data-action="changelog"
        title="" aria-label="">
        <span class="sv-main" id="settings-version-main"></span>
        <span class="sv-hint" data-i18n="settings.openChangelog"></span>
        <svg class="sv-chev" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor"
          stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>
      </button>
      <div class="view-actions">
        <button class="btn" id="settings-cancel" data-i18n="modal.cancel"></button>
        <button class="btn accent" id="settings-save" data-i18n="modal.save"></button>
      </div>
    </section>

    <section class="panel view-card" id="view-log" hidden>
      <div class="view-head">
        <h3 data-i18n="log.title"></h3>
        <div class="segmented log-tabs" id="log-tabs">
          <button type="button" class="seg-btn active" data-logtab="log" data-i18n="log.tabLog"></button>
          <button type="button" class="seg-btn" data-logtab="queue" data-i18n="log.tabQueue"></button>
        </div>

        <span class="latest" id="log-latest" data-i18n="log.empty"></span>
        <button class="icon-btn" id="log-close" data-i18n-title="header.close">×</button>
      </div>
      <div class="log-pane" id="log-pane-log">
        <div class="log-toolbar" id="log-toolbar">
          <button class="log-level-btn" data-level="DEBUG" data-i18n="log.debug" title=""></button>
          <button class="log-level-btn" data-level="INFO" data-i18n="log.info" title=""></button>
          <button class="log-level-btn active" data-level="WARN" data-i18n="log.warn" title=""></button>
          <button class="log-level-btn active" data-level="ERROR" data-i18n="log.error" title=""></button>
          <button class="log-level-btn active" data-level="SUCCESS" data-i18n="log.success" title=""></button>
          <span style="flex:1"></span>
          <button id="log-export" data-i18n="log.export"></button>
          <button id="log-copy" data-i18n="log.copy"></button>
          <button id="log-clear" data-i18n="log.clear"></button>
        </div>
        <div class="log-body" id="log-body"><div id="log-lines"></div></div>
      </div>
      <div class="log-pane log-queue-pane" id="log-pane-queue" hidden>
        <div class="lq-head">
          <span data-i18n="taskq.title"></span>
          <span class="lq-count" id="lq-count"></span>
        </div>
        <div class="lq-list" id="lq-list"></div>
      </div>
    </section>

    <section class="panel view-card" id="view-help" hidden>
      <div class="view-head">
        <h3 id="help-title"></h3>
        <button class="icon-btn" id="help-close" data-i18n-title="header.close">×</button>
      </div>
      <div class="view-body help-view-body" id="help-body"></div>
    </section>

    <button type="button" class="workbench-progress" id="workbench-progress" data-i18n-title="progress.openLog"
      aria-controls="view-log" aria-expanded="false">
      <span class="progress-bar"><span class="progress-fill" id="progress-fill"></span></span>
      <span class="progress-text">
        <span id="progress-label" data-i18n="progress.ready"></span>
        <span class="progress-hint" id="progress-hint" data-i18n="progress.openLog"></span>
        <span class="log-dot" id="log-dot" hidden></span>
        <span id="progress-pct">0%</span>
        <span class="app-version" id="app-version"></span>
      </span>
    </button>

    <!-- Fullscreen QR scan overlay: camera + detection frame with three-state hint -->
    <div class="scan-overlay" id="lan-scan" hidden>
      <video id="lan-scan-video" playsinline muted></video>
      <canvas id="lan-scan-canvas" hidden></canvas>
      <div class="scan-frame" id="lan-scan-frame"><span class="scan-corner tl"></span><span class="scan-corner tr"></span><span class="scan-corner bl"></span><span class="scan-corner br"></span></div>
      <div class="scan-status" id="lan-scan-status" data-state="idle"><span data-i18n="qr.scanIdle"></span></div>
      <button type="button" class="scan-close" id="lan-scan-cancel" data-i18n-aria="header.close">×</button>
    </div>

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
<div class="tutorial-overlay" id="st-pt-tutorial-overlay">
  <div class="tutorial-ring" id="tutorial-ring"></div>
  <div class="tutorial-card" id="tutorial-card">
    <div class="tt" id="tutorial-title"></div>
    <div class="td" id="tutorial-desc"></div>
    <div class="goals" id="tutorial-goals" hidden></div>
    <div class="dots" id="tutorial-dots"></div>
    <div class="acts">
      <button id="tutorial-adv" class="link" data-i18n="tutorial.changeGoal"></button>
      <a id="tutorial-doc-btn" class="tutorial-doc-btn" target="_blank" rel="noopener noreferrer" href="https://jiozhaoyue.github.io/ST-pack-transfer/docs/tutorial.html" data-i18n-title="tutorial.docHint"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg><span id="tutorial-doc-text" data-i18n="tutorial.openDoc"></span></a>
      <button id="tutorial-never" class="link" data-i18n="tutorial.never"></button>
      <button id="tutorial-skip" data-i18n="tutorial.skip"></button>
      <button id="tutorial-prev" data-i18n="tutorial.prev"></button>
      <button id="tutorial-next" class="primary" data-i18n="tutorial.next"></button>
    </div>
  </div>
</div>

<div class="toast" id="toast"></div>
<input type="file" id="file-input" accept=".zip" multiple hidden>
<input type="file" id="file-input-inspect" accept=".zip" hidden>`;
}
