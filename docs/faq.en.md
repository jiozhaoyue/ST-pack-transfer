---
title: FAQ
layout: default
lang: en
alt_url: faq.html
alt_lang: zh-CN
---

# Frequently asked questions

## Installation and startup

**The page is blank after installation. What should I do?**
Installing through a Git URL normally does not require `npm install`. If the page is blank, open the browser developer tools (F12) and check the Console for module path errors, then refresh the page.

**The extension is missing after installing in Luker.**
Luker's private extension directory is `data/<user>/extensions/<name>/`. Extract or install the plugin directly there; do not add another `third-party` level.

**Why does double-clicking `index.html` fail?**
Modern browsers restrict module code over `file://`. When running locally as a standalone page, open it through the dev server (for example `npm run preview`). For a double-clickable build, use the offline single file produced by `npm run build:offline`.

## Data pack conversion

**Why is the Generate export package button greyed out?**
Select at least one package in the **Package list** on the right; the button becomes available.

**I imported a new package, but the chart still shows the old data.**
A newly imported package is added as a candidate. To convert only the new package, select it in the list, or refresh the page and start a fresh conversion.

**Will a paused conversion produce an incomplete package?**
No. Pausing seals the files already written; continuing validates them and resumes seamlessly, producing the same result as a single run.

**Where are generated packages stored?**
They are collected in the **Export area** at the bottom of the page. Nothing downloads automatically; download or move them to the local workspace when ready.

## Pulling from the current tavern

**I clicked Pull from host but no native backup dialog appeared.**
The plugin looks for the native backup area for the current tavern version. If the UI changed significantly, follow the dialog's instructions and open the tavern's native settings page manually.

**The pull is slow or the network dropped.**
The plugin supports resumable downloads. Trigger the pull again after the network recovers and it continues from the checkpoint.

## Extension management

**Why can't regular users see Server-side plugins?**
Server-side plugins modify backend dependencies, so the section is available to tavern administrators only. The regular UI stays focused.

**Auto-update is on, but no update check happens.**
Auto-update needs the extension's Git remote URL. If the extension was copied manually without Git metadata, reinstall it once through the URL so it is linked to the official repository.

**How are cloud branches shown in the Git commit graph?**
The locally installed commit history is drawn with full branch lanes and commit nodes. Cloud branches are shown as labels for the latest version so you can compare local progress.

## Privacy and credentials

**Where are Git tokens and cloud backup accounts stored?**
By default they are stored only in the current browser's LocalStorage. They are not uploaded to an external server and are not written into the tavern backend's shared configuration. See [Privacy & credentials](privacy.en.md).

**Do I need to re-enter Git accounts after changing browsers?**
In the default **Browser only** mode, yes—a new browser or cleared cache requires re-entry. To reuse credentials across devices, choose the server-side storage option in **Settings → Privacy**.

## Platform support

- **LAN transfer and WebDAV**: the four taverns do not provide these natively; this plugin implements them in the front end so you can move data between devices.
- **Storage inspector**: the browser-side inspector works everywhere; Luker additionally exposes native server-side storage data.
- **Extension load order**: the UI shows the tavern's real current load index to help diagnose dependency order.
