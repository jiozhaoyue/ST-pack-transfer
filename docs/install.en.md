---
title: Installation & deployment
layout: default
lang: en
alt_url: install.html
alt_lang: zh-CN
---

# Installation & deployment

## 1. Choose a runtime form first

| Form | How to use it | Best for | Host / browser requirement |
| --- | --- | --- | --- |
| Tavern extension | Install from the repository URL in the extension manager | Pull, restore, and manage extensions inside a tavern | See “Host versions” below |
| Online Web | Open the online URL | Local conversion, analysis, splitting | Modern desktop or mobile browser |
| Single-file HTML | Download and double-click | Offline, no network, portable | Modern desktop browser; runs over `file://` |
| Local static server | Build and open over HTTP | Self-hosting, LAN sharing | Any modern browser |

### Exact download path for the single-file HTML

- Repository path: `download/ST-pack-transfer-offline.html`
- Direct download: <https://github.com/jiozhaoyue/ST-pack-transfer/raw/main/download/ST-pack-transfer-offline.html>
- Online HTML: <https://jiozhaoyue.github.io/ST-pack-transfer/>

> The root `index.html` is a development skeleton and **cannot be downloaded and double-clicked by itself**; it needs a dev server or a built static server. Use the single-file HTML above when you want double-click behavior.

## 2. Install into a tavern (recommended)

Open the tavern's **Extension Manager → Install from URL** and paste:

```
https://github.com/jiozhaoyue/ST-pack-transfer.git
```

You can also clone the repository into the tavern's extension directory. Refresh the page, expand **Data Pack Transfer**, and click **Open panel**.

> Luker user-private extensions live in `data/<user>/extensions/<name>/`. Put the plugin directory there directly; do not nest another `third-party` directory.

## 3. Host versions and capabilities

| Host | Tested version | Minimum | Capability notes |
| --- | --- | --- | --- |
| SillyTavern | 1.19.0 | 1.19.0-class endpoints | Pull, restore, extension management; older versions are not verified |
| Luker | 2.7.0 / 2.9.0 class | 2.7.0-class basics; 2.9+ account window | 2.9+ adds the custom account window, graphical storage page, and backup selection |
| TauriTavern | Current public desktop build | Host's public version | Migration endpoints are capability-probed; unsupported ones are reported |
| PureTavern | Current public version | Host's public version | Some migration endpoints may return 501; the plugin reports it truthfully |
| Standalone Web | N/A | Modern browser | No host backend; host-only features are disabled |

The plugin does not guess host versions. It probes public endpoints: use what exists, degrade clearly when it does not, and never pretend to succeed.

## 4. Browsers and WebViews

| Engine | Recommended | Verified | Fallback |
| --- | --- | --- | --- |
| Chromium (Chrome / Edge, etc.) | 120+ | Chromium 151 | Save picker and drag-out download; older engines fall back to normal download |
| Firefox | 120+ | Not separately verified | Falls back to normal download without `showSaveFilePicker` / drag-out |
| Safari / iOS WebView | 17+ | Not separately verified | Uses rgba borders without `color-mix`; file save falls back to download |
| Tauri WebView | With the host | Per host | WebView2 on Windows, WKWebView on macOS |

Mobile layout is checked at 390×844; desktop at 1440×900. Mobile browsers and tavern WebViews share the same responsive rules.

## 5. Local build and preview

```bash
git clone https://github.com/jiozhaoyue/ST-pack-transfer.git
cd ST-pack-transfer
npm install
npm run dev        # dev server; the terminal prints the actual address
npm run build      # production build into dist/
npm run preview    # preview dist/; the terminal prints the actual address
npm run build:offline  # produce the single-file HTML
```

- Addresses for `npm run dev` and `npm run preview` are whatever the terminal prints.
- Double-clicking the root `index.html` is blocked by the browser's module security policy over `file://`; use the single-file HTML when you need double-click behavior.

## 6. Use online (Web mode)

No installation required: <https://jiozhaoyue.github.io/ST-pack-transfer/>

To host your own site: fork this repository and set **Settings → Pages → Source** to **GitHub Actions**.

### Web mode limitations

- It cannot pull from or restore to a running tavern because there is no tavern backend.
- It cannot read the host server's disk or manage server-side plugins.
- All local conversion, splitting, manifest generation, and size analysis work fully.
- Cloud S3 / WebDAV requires correct CORS on the target server; proxy extensions can forward traffic but cannot bypass browser CORS.

## 7. Suggested steps after installation

1. The first launch opens [Tutorial demo mode](tutorial.en.md) on simulated data.
2. To back up the current tavern, follow [Pull from host](host-pull.en.md).
3. Before installing extensions from private repositories, read [Privacy & credentials](privacy.en.md).
