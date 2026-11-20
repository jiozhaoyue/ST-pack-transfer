# ST-pack-transfer

Move, convert, back up and restore data packs between **SillyTavern / Luker / TauriTavern / PureTavern**.

Pure front end: inside a tavern it is a feature panel, and it also runs as a standalone web page with no backend of its own.

[Online](https://jiozhaoyue.github.io/ST-pack-transfer/) · [Documentation](https://jiozhaoyue.github.io/ST-pack-transfer/docs/) · [GitHub](https://github.com/jiozhaoyue/ST-pack-transfer/)

## Screenshots

| Desktop workbench | Mobile |
| :---: | :---: |
| ![Desktop workbench: charts, pack list and quota](docs/assets/shots/desktop-03-workbench-demo.png) | ![Mobile workbench and drawer](docs/assets/shots/mobile-03-workbench-demo.png) |

| Extension manager | Transfer and backup |
| :---: | :---: |
| ![Extension manager: host and in-pack extension lists](docs/assets/shots/desktop-05-extension-manager.png) | ![LAN and cloud transfer panel](docs/assets/shots/desktop-08-transfer-cloud.png) |

All screenshots come from the tutorial demo mode and contain no real data.

## Core features

- **Four-way conversion**: SillyTavern, Luker, TauriTavern and PureTavern in any direction
- **Private file preservation**: host-specific config is sealed into a sandbox on the target and unpacked on the way back
- **Git policy**: per extension, keep full history or manifest only; chart volume accounts for stripped content
- **Luker engine conversion**: filesystem, PostgreSQL, MySQL and SQLite
- **Automatic backup**: scheduled pulls and snapshots, pruned to the retention you set
- **Transfer and backup**: LAN peer transfer, S3 and WebDAV
- **Storage inspector**: usage by category, drill down level by level
- **Pending export area**: every artifact lands in a queue, nothing downloads automatically

## Installation

### Into a tavern

In the tavern's extension manager, choose install from URL and paste:

```text
https://github.com/jiozhaoyue/ST-pack-transfer.git
```

Or clone into `public/scripts/extensions/third-party/`, reload the page, expand the data pack transfer extension in the extension list and open the panel.

### Single-file web page

Download [ST-pack-transfer-offline.html from GitHub Release](https://github.com/jiozhaoyue/ST-pack-transfer/releases/latest/download/ST-pack-transfer-offline.html) and open it directly. No Node and no local server required. The file is distributed via Release and is not tracked in the repository.

The `index.html` at the repository root is a development skeleton and cannot be opened on its own.

### Local development

```bash
git clone https://github.com/jiozhaoyue/ST-pack-transfer.git
cd ST-pack-transfer
npm install
npm run dev            # dev server, fixed at http://localhost:3040
npm run build          # outputs dist/
npm run build:offline  # outputs the single-file HTML
npm test               # unit tests
```

The local port is configured in one place: `LOCAL_PORT` in `vite.config.js` (default 3040), or the `PORT` environment variable before starting.

## Supported hosts

| Host | Layout code | Notes |
| --- | --- | --- |
| SillyTavern | `st` | The backup endpoint has no per-user selection; the plugin filters |
| Luker | `l` | Selection-capable backup; multiple storage engines |
| TauriTavern | `tt` | Uses the Tauri-side data layout |
| PureTavern | `pt` | Modular record structure |

## Privacy and credentials

The plugin has no server of its own and never sends credentials to third parties.

By default stored only in this browser's localStorage; can be switched to server `settings.json` in Settings.

Credentials are only needed for external services; every other feature works without them.

## Development and quality

```bash
npm test                    # unit tests
npm run verify:rules        # rule verification
npm run check:css-scope     # CSS scope guard
npm run check:dom-injection # DOM injection guard
npm run check:i18n          # hardcoded-copy guard
npm run docs:verify         # documentation sync check
```

Architecture and change guidance: [docs/DEVELOPER-GUIDE.md](docs/DEVELOPER-GUIDE.md).

## Documentation

- [Documentation site](https://jiozhaoyue.github.io/ST-pack-transfer/docs/)
- [Developer guide](docs/DEVELOPER-GUIDE.md)
- [FAQ](docs/faq.md)
- [中文 README](README.md)

## License

[AGPL-3.0-or-later](LICENSE)
