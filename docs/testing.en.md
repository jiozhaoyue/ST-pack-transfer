---
title: Public acceptance guide
layout: default
lang: en
alt_url: testing.html
alt_lang: zh-CN
---

# Public acceptance guide

This page only describes checks that end users can perform themselves. Back up real data first; for any write-back step, prefer tutorial demo mode or a disposable test tavern.

## 1. Standalone Web / single-file HTML

**Goal**: confirm unpacking, four-platform conversion, fine-grained selection, and splitting work entirely in the browser.

1. Open the online version, or download `download/ST-pack-transfer-offline.html` and double-click it.
2. Choose an existing tavern backup ZIP.
3. Check that the left chart parses characters, chats, world info, images, extensions, and other categories correctly.
4. Switch the target tavern, select categories, and set a split size.
5. Click **Generate export package**, then download the ZIP from the export area.
6. Unzip and inspect: Luker targets contain `manifest.json`; TauriTavern targets land under `data/default-user/`; PureTavern targets follow its module record layout.

**Expected**: all local conversion, splitting, and manifest generation work; **Pull from host**, **Restore to host**, and **server plugin management** are explicitly disabled in Web mode.

## 2. Install as a tavern extension

**Goal**: confirm the panel mounts and can read the current tavern's data.

1. Install from the repository URL in the tavern extension manager and refresh.
2. Open the **Data Pack Transfer** panel.
3. Check that the host badge matches the current tavern.
4. Try **Pull from current host** and confirm the current user's packages or category counts appear.
5. Switch the target platform, generate an export, and download it.

**Expected**: the panel does not cover the tavern's native UI; host identity, version, and capabilities are reported truthfully; unsupported host capabilities never pretend to succeed.

## 3. Cross-host round trip

**Goal**: confirm private settings, extensions, and chats survive a round trip without polluting the target root.

1. Convert a test package from tavern A to tavern B.
2. Import it into B and inspect characters, chats, world info, presets, and extensions.
3. Convert from B back to A and check the key files.
4. Confirm B's top level does not contain A's private files.

**Expected**: incompatible private files are boxed into a compatibility directory; converting back unpacks them; anything that cannot be preserved is listed in the conversion report, never silently dropped.

## 4. Backup and splitting

**Goal**: confirm each part imports independently and retention follows user settings.

1. Choose a package close to or above the split limit.
2. Set a split size and generate.
3. Import each part in order and confirm completeness.
4. Configure cloud backup retention and create several snapshots.
5. Confirm the oldest extra snapshots are deleted and the newest configured count is intact.

**Expected**: every part is an independently importable ZIP; retention strictly follows user settings and does not consume extra quota.

## 5. Extension packing and updates

**Goal**: confirm Full / Manifest / Both modes behave as documented.

1. Pick a public remote extension and pack it in **Full**, **Manifest**, and **Both** modes.
2. Check that Full contains the extension files; Manifest contains only the manifest entry and required metadata; Both contains both.
3. Install into the target tavern and confirm the version and source are correct.
4. Make a recoverable local change, then install or update again and confirm self-healing completes.

**Expected**: Manifest suits public remotes; Full suits offline, private repositories, or blocked networks; Both prioritizes a working entity. Conflicts that cannot be healed must show a clear error, not a generic network error.

## 6. Mobile and desktop layout

- Desktop at 1440×900: target platform buttons, chart, package list, and the three log states.
- Mobile at 390×844: the package list opens and closes, extension **Package** mode allows exactly one selection, and the half-expanded task queue does not cover controls.
- Log states: closed → half-expanded task queue → full log/queue tabs → closed.
