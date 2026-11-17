---
title: Data pack formats of four taverns
layout: default
lang: en
alt_url: formats.html
alt_lang: zh-CN
---

# Data pack formats across four taverns

SillyTavern, Luker, TauriTavern, and PureTavern each use different directory structures and conventions for user data. A package exported from one tavern is usually recognized only by that tavern:

| Platform | Package layout | Native export | Native import |
| :-- | :-- | :-- | :-- |
| **SillyTavern** (ST) | User data is flat at the package root | Backend backup endpoint (full export) | No official import endpoint; usually manual extraction or writing back with this tool |
| **Luker** (L) | Flat directories plus `manifest.json` | Export endpoint with 10 fine-grained categories | Restore endpoint with 8 MiB chunked upload |
| **TauriTavern** (TT) | Uses a `data/default-user/` structure | Migration export (with task polling) | Accepts ZIP/tar and can read ST packages directly |
| **PureTavern** (PT) | Similar to TT, with modules and provenance records | Archive export endpoint | Archive import endpoint with conflict preview and safe replacement |

## Data pack capabilities

| Capability | SillyTavern | Luker | TauriTavern | PureTavern |
| --- | --- | --- | --- | --- |
| Export | Yes (full) | Yes (selectable categories) | Yes (migration task) | Yes (archive) |
| Import / restore | No native endpoint | Yes (chunked) | Yes (ST-compatible) | Yes (TT-compatible) |
| Packed file layout | `data/<user>/` tree | Same as ST | `data/default-user/` | Manifest + modular records |
| Import strategy | — | Merge or full overwrite | Migration job | Merge / skip / module replacement |
| Automatic restore point | No | No | No | Creates a backup restore point before import |
| Cross-tavern reading | No | No | Reads ST layouts directly | Reads TT layouts directly |

## Transfer capabilities

| Capability | SillyTavern | Luker | TauriTavern | PureTavern |
| --- | --- | --- | --- | --- |
| LAN sync | No | Server-to-server communication | Internal command handling | No |
| Cloud object storage | No | S3 sync | Cloud sync | No |
| WebDAV backup | No | No | No | No |
| Native storage panel | No | Built-in storage inspector | No | No |

> Note: this plugin provides its **own storage inspector** in all four taverns, so you can see space usage in a pure browser. In Luker it can also query the native server-side storage details.

## Where extensions live inside a package

| Tavern | User-private extensions | Global extensions |
| :-- | :-- | :-- |
| ST / Luker / PT | `extensions/<name>/` (flat, no extra nesting) | `public/scripts/extensions/third-party/<name>/` |
| TauriTavern | `data/default-user/extensions/<name>/` | `data/extensions/third-party/<name>/` |

The converter normalizes extension paths for the selected target and removes redundant nesting levels.

## How the features are implemented

| Module | Strategy | Notes |
| --- | --- | --- |
| Pull from host / restore / extension install | **Prefer native tavern APIs** | Uses stable native endpoints and stays consistent with official behavior |
| Storage inspector | **Unified panel + native enhancement** | Read-only browser inspection; in Luker it connects to the native data source for server-side usage |
| Four-tavern conversion / LAN transfer / S3 and WebDAV backup / delta merge / resumable transfer | **Implemented by this plugin** | Fills gaps the taverns do not cover natively |
