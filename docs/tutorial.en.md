---
title: Tutorial demo mode
layout: default
lang: en
alt_url: tutorial.html
alt_lang: zh-CN
---

# Tutorial demo mode

A built-in sandbox that walks you through transfer and backup operations on simulated data. Everything runs locally, never touches your real chats or settings, and the real workspace is restored when you exit.

## Screenshots

All screenshots come from tutorial demo mode and show the real interface with simulated data (no user chats are included):

![Tutorial goal picker](assets/shots/desktop-01-tutorial-goal.png)
![Tutorial step guidance](assets/shots/desktop-02-tutorial-step.png)
![Demo workbench](assets/shots/desktop-03-workbench-demo.png)
![Export area](assets/shots/desktop-04-export-area.png)
![Extension manager](assets/shots/desktop-05-extension-manager.png)
![Extension packing](assets/shots/desktop-06-extension-pack.png)
![LAN transfer](assets/shots/desktop-07-transfer-lan.png)
![Cloud repository](assets/shots/desktop-08-transfer-cloud.png)
![WebDAV](assets/shots/desktop-09-transfer-webdav.png)
![Storage inspector](assets/shots/desktop-10-storage-inspector.png)
![localStorage inspector](assets/shots/desktop-11-storage-localstorage.png)
![Logs and task queue](assets/shots/desktop-12-log-view.png)
![Half-expanded task queue](assets/shots/desktop-13-task-queue.png)
![Settings](assets/shots/desktop-14-settings.png)
![Changelog](assets/shots/desktop-15-changelog.png)

### Mobile (390×844)

![Mobile tutorial goals](assets/shots/mobile-01-tutorial-goal.png)
![Mobile tutorial step](assets/shots/mobile-02-tutorial-step.png)
![Mobile workbench](assets/shots/mobile-03-workbench-demo.png)
![Mobile extension manager](assets/shots/mobile-04-extension-manager.png)
![Mobile package selection](assets/shots/mobile-05-extension-pack.png)
![Mobile transfer](assets/shots/mobile-06-transfer.png)
![Mobile export area](assets/shots/mobile-07-export-area.png)
![Mobile half-expanded queue](assets/shots/mobile-08-task-queue.png)
![Mobile full log view](assets/shots/mobile-09-log-view.png)

## How to open it

The demo opens automatically the first time you install and open the panel. You can reopen it at any time with the tutorial button at the top of the interface.

## Supported practice goals

Choose the feature you want to learn:

- Data pack format conversion
- Restore back to a tavern
- Pull directly from a tavern
- Extension management and packing
- LAN and cloud backup

After choosing a goal, the tutorial highlights each step. You can switch to another goal at any time with **Change goal**.

## Mobile behavior

The tutorial overlay is fixed to the browser viewport (mounted on `document.body`, independent of the host drawer's scroll/zoom coordinate system) and uses dynamic viewport height. Tall cards scroll inside the card, and the buttons remain reachable. Opening the tutorial from the middle of a long package list no longer places the overlay outside the visible area.

## Full or manifest (including network advice)

The extension step shows both buttons and a recommendation:

- **This plugin itself, no remote URL, or a private repository** → **Full**;
- **Public Git remote** → **Manifest**;
- **Poor network, GFW blocking, or a target machine that cannot reach GitHub/GitLab** → choose **Full** even if the recommendation is Manifest; otherwise the target tavern cannot pull the extension online.

Both buttons can be active at once (dual selection): carry the code and keep the manifest, which is useful when you want it to work first and update online later.

## What makes the demo safe

- **Try anything**: select packages, run generation, simulate deletion, and open the storage inspector;
- **Guided safety**: operations that would normally use the network or write to disk are handled by simulated data with explanatory notices;
- **Realistic scenarios**: demo data covers all four taverns and packages from 16 MB to 4 GB.

## How to exit

You can leave the tutorial and return to the real workspace at any time:

- Use the persistent **Exit tutorial** switch at the top;
- Or click **Exit tutorial** on the right side of the banner.

If you click **Skip guide**, the overlay is hidden but the demo data stays, so you can explore freely. Click **Reopen tutorial** on the banner to resume the guide. When you finish all steps, exit whenever you are ready.
