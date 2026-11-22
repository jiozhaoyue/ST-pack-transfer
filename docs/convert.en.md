---
title: Data pack conversion
layout: default
lang: en
alt_url: convert.html
alt_lang: zh-CN
---

# Data pack conversion

Convert data packs between SillyTavern, Luker, TauriTavern, and PureTavern—whether you are moving to another tavern or organizing backups.

## Basic steps

1. **Choose the target platform**: the **Target platform** menu defaults to **Match source** — the selected package's source platform, or the current host when no package is selected. Pick an entry to override it; your explicit choice is then remembered.
2. **Select what to bring**: use the **Storage chart** on the left to tick the items you want.
3. **Choose source packages**: tick the packages to convert in the **Package list** on the right.
4. **Generate**: click **Generate export package** at the bottom.
5. **Collect and save**: switch to the **Export area** to download, keep in the workspace, or remove the result.

<figure class="shot-figure">
  <img src="assets/shots/desktop-03-workbench-demo.png" alt="Conversion workbench with storage chart and package list" width="1440" height="900" loading="lazy">
  <figcaption>Workbench: pick content on the left, packages on the right</figcaption>
</figure>

> Note: the **Generate export package** button becomes available after at least one package is selected.

## Selectable categories

You can choose any of the following:

Chats, character cards, world books, image assets, presets, extensions, vector databases, user settings, backup archives, cache files, and built-in tavern assets.

The chart shows a suggestion badge for each category (keep, optional, clean up) so you can expand and confirm.

## Pre-conversion analysis

Before generating, the tool inspects the package and shows:

- **Automatic cleanup**: target-specific caches or temporary files the target tavern does not need;
- **Path adaptation**: files that will be reorganized or renamed for the target layout;
- **Warnings**: special settings worth checking after import.

The analysis can be downloaded as a report.

## Merge and update (delta mode)

> Honest status: the delta capability currently exists only as a core-layer structure and is **not wired into the conversion main chain or the UI**.

- The core layer already has `compareArchives` / `generateDeltaArchive` (`src/core/delta.js`), which can produce an incremental patch-package structure: the `_delta_manifest.json` inside records `generator` / `type` (delta-patch) / `baseArchiveName` / `stats` / `changes`;
- The generator is currently referenced **only by tests** (`test/delta.test.js`); the conversion main chain (`generate` / `generateMerged` in `index.js`) has no delta branch, and the UI delta toggle produces no delta package;
- The merge / apply functions for patch packages are not wired (`incrementalMergeArchives()` in `src/ui/host-bridge.js` is marked "not wired: no callers"); "conflicts handled automatically and recorded in a report" **does not exist**;
- This section will be updated with real instructions once incremental restore lands.

## Smart split packages

If your cloud tavern limits upload size, set a split size in the settings (MB, 32–2048). The output is split into independently importable parts. Leave it empty to disable splitting.

Each part contains a `_convert/split-manifest.json` manifest recording that part's target layout (`target`, one of st / l / tt / pt), part index and total. Layout detection uses `target` first, so split parts are recognized without renaming. Older parts without `target` fall back to filename and other heuristics; a package whose layout cannot be confirmed is rejected on restore with a prompt to convert it to the current host format first.

## Resume and task control

- You can **pause, continue, or cancel** at any time.
- Pausing saves the files already written; continuing checks the existing progress and resumes without producing an incomplete package.
- If browser storage is tight, the tool falls back to a full regeneration and explains it in the log.

## Export area

Generated packages are collected in the **Export area** instead of downloading automatically. Download or move them to the local workspace whenever you are ready.

<figure class="shot-figure">
  <img src="assets/shots/desktop-04-export-area.png" alt="Desktop export area list" width="1440" height="900" loading="lazy">
  <figcaption>Desktop export area: download, save, or remove generated packages</figcaption>
</figure>

<figure class="shot-figure">
  <img src="assets/shots/mobile-07-export-area.png" alt="Mobile export area list" width="390" height="844" loading="lazy">
  <figcaption>Mobile export area: the same responsive layout</figcaption>
</figure>

## Related reading

- Format details: [Data pack formats of four taverns](formats.en.md)
- If the target is Luker, see [Storage engine conversion](engines.en.md)
