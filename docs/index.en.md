---
title: Home
layout: default
lang: en
alt_url: index.html
alt_lang: zh-CN
---

# ST-pack-transfer · Data pack transfer

Move, convert, back up, and restore data packs between **SillyTavern, Luker, TauriTavern, and PureTavern**.

It is a pure front-end tool: install it as a tavern extension or open it as a standalone web page. No separate backend is required, and every transfer feature works entirely in the browser.

[Open the Web app](https://jiozhaoyue.github.io/ST-pack-transfer/) ·
[Source repository](https://github.com/jiozhaoyue/ST-pack-transfer)

## Feature highlights

- **Full / manifest dual selection**: each extension directory has **Full** and **Manifest** buttons, and both can be active. Dual selection means both the code and the official manifest entry. Use Full for this plugin, packages without a remote, and private repositories; use Manifest for public remotes. **Choose Full when the network is poor or GitHub is blocked.**
- **Mobile tutorial fix**: the tutorial overlay is mounted on `document.body` and uses `100dvh`, so the host's scroll container can no longer push it off-screen. Tall cards scroll internally.
- **LAN QR fix**: the QR encoder is imported locally as an ES module instead of relying on the host's `window.qrcode`, so other extensions or CSP cannot silently break it.
- **Continuous task queue**: queue multiple generation batches, pause/resume/interrupt running tasks, reorder queued tasks, and keep the last 200 finished tasks.
- **Changelog and full logs**: release notes pop up after a version change (and can be disabled); the settings page shows the full commit log from oldest to newest. Logs include DEBUG and default to WARN and above.
- **Automatic Luker engine switch**: after selecting a package in Luker, the target storage engine switches to the engine declared by that package.
- **More accurate size estimates**: the chart estimate now excludes `.git` entries that Git cleanup will remove.

## What problem it solves

Each tavern stores user data—character cards, chats, world books, presets, backgrounds, extensions—with different directory rules. Importing one tavern's backup directly into another usually fails because the layout does not match.

ST-pack-transfer converts packs between any two taverns, recognizes and rebuilds the directory layout, and preserves characters, chats, and personal settings as far as possible.

## Documentation

### Getting started

- [Installation & deployment](install.en.md) — install into a tavern, run locally, or use it online
- [Data pack formats](formats.en.md) — directory differences and capability support

### Core features

- [Data pack conversion](convert.en.md) — free conversion, selection, pre-analysis, merging, and smart splitting
- [Pull from host](host-pull.en.md) — export data from the current tavern in one step
- [Restore to host](restore.en.md) — merge updates, safety checks, and chunked upload
- [Extension management & packing](extensions.en.md) — install, update, uninstall, Git history, and packing
- [Transfer & backup](transfer.en.md) — phone/PC QR transfer, S3-compatible storage, and WebDAV backup
- [Storage inspector](storage.en.md) — browser and tavern server storage usage
- [Storage engine conversion](engines.en.md) — Luker only: file system and PG/MySQL/SQLite conversion
- [Tutorial demo mode](tutorial.en.md) — try every feature on simulated data
- [Task queue & logs](queue-and-logs.en.md) — queueing, pause/resume/interrupt, changelog, and full logs

### Reference

- [Public acceptance guide](testing.en.md) — end-to-end checks users can perform
- [Privacy & credentials](privacy.en.md) — tokens, storage location, and local privacy
- [FAQ](faq.en.md) — common questions and troubleshooting
- [Developer guide](DEVELOPER-GUIDE.html) — runtime forms, compatibility, structure, and build (Chinese)

## Three ways to use it

| Mode | How to open | Best for |
| --- | --- | --- |
| Tavern extension | Tavern extension list → "Data Pack Transfer" → "Open panel" | Daily backup, restore, and extension management inside a tavern |
| Standalone web app | Open the online URL or a local page | Pure conversion and analysis without starting a tavern |
| Offline single file | Download `download/ST-pack-transfer-offline.html` and double-click | Air-gapped or portable use |

## License

AGPL-3.0-or-later. See the `LICENSE` file in the repository root.
