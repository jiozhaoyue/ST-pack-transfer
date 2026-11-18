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

Use delta merge when you want to merge a new export into an existing package without losing content that only exists in the old package:

- New content in the new package is updated normally;
- Content unique to the old package is preserved;
- Duplicate or conflicting entries are handled according to your settings and recorded in the report.

## Smart split packages

If your cloud tavern limits upload size, set a split size in the settings (MB, 32–2048). The output is split into independently importable parts. Leave it empty to disable splitting.

## Resume and task control

- You can **pause, continue, or cancel** at any time.
- Pausing saves the files already written; continuing checks the existing progress and resumes without producing an incomplete package.
- If browser storage is tight, the tool falls back to a full regeneration and explains it in the log.

## Export area

Generated packages are collected in the **Export area** instead of downloading automatically. Download or move them to the local workspace whenever you are ready.

## Related reading

- Format details: [Data pack formats of four taverns](formats.en.md)
- If the target is Luker, see [Storage engine conversion](engines.en.md)
