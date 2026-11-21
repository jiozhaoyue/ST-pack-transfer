---
title: Restore to host
layout: default
lang: en
alt_url: restore.html
alt_lang: zh-CN
---

# Restore a package back into the tavern

Write a converted package back into the current tavern. The entry is **Upload / Restore** in the package **Export** area.

## Two restore modes (clearing up a common misconception)

Bottom line first: **there are no "incremental / full" restore modes**. The "two restore modes" in the docs are actually two **write strategies** — **merge update** and **full overwrite**. Both write the **entire package, all categories** to the host; the only difference is whether the target directories are rebuilt before writing, not how much or which categories are written.

| Mode | Request parameters | Write behavior | When to use |
| --- | --- | --- | --- |
| **Merge update** (`merge`) | `mode=merge`, `incremental=true` | Updates same-name files and keeps all other existing files | Daily sync, or partial character/chat updates |
| **Full overwrite** (`overwrite`) | `mode=overwrite`, `incremental=false` | Rebuilds the target directories before writing (second confirmation required) | Replace the current tavern content completely and start from scratch |

> `mode` and `incremental` in these two rows are **the same switch expressed two ways**: `incremental` is only a boolean derivation of `mode === 'merge'` (`src/ui/host-bridge.js:2268`); it does **not** mean "restore only the checked categories".

## Restore mechanism in detail

### 1. Entry and platform routing
From the **Upload / Restore** click, the chain is `restore:enqueueRestore` → `enqueueRestore` (`index.js:1610`) → `restoreSelected` (`index.js:1211`, guarded by `host.isPlugin`, which blocks standalone Web) → `restoreSelectedConfirmed` (`index.js:1261`). Routing then splits (`index.js:1303-1305`): **Luker** goes to `restoreToLuker(blob, {})`, an alias of `restoreToHost` (`src/ui/host-bridge.js:2962`); **ST / TT / PT** go to `restoreToHost(blob, { mode: 'merge', platform })` — note `mode` is **hardcoded to `merge`**, so overwrite is never triggered by the main chain.

### 2. Restore compatibility gate (three checks before writing)

`restoreSelected` (`index.js:1211-1258`) passes through three gates before any write; if any gate fails, the entire batch is rejected with a toast and **no package is silently skipped**:

1. **Host capability gate**: `hostRestoreCapability(host.platform)` (`index.js:1214`, `src/ui/host-bridge.js:344-352`) is the static capability judge — currently only Luker supports full-package restore; ST / TT / PT do not (each with a `restore.unsupported.*` reason key). This gate also applies at the **controller layer**: in plugin mode, even if the view button is bypassed and restore is called directly, it **does not pass through**.
2. **Layout compatibility gate**: each package's `declaredLayout || metadata.layout` (`index.js:1223`) is judged by `canRestoreLayout(host.platform, layout)` (`src/core/restore-compat.js:53`). An unknown / empty layout goes to `restore.incompatible.unknownLayout` (`index.js:1226-1228`); a mismatched family goes to `restore.incompatible.needConvert` (`src/core/restore-compat.js:25`). The three strings live in `src/i18n/locales/en-US.js:1746-1748`.
3. **Single-selection gate**: see the next section, "Single package and split groups".

**Basis of the directory-family criterion**: `canRestoreLayout` splits packages by "whether the internal directory structure can be written straight into the host user directory" (`src/core/restore-compat.js:18-43`) —

- **flat (no prefix)**: `st`, `l` (=luker). Basis: `src/core/transform.js:1107` / `:1112` — `targetEntryPath()` simply `return hubPath` for ST / Luker targets, with no prefix; `src/core/detect.js:4-5` also labels st/l as "flat at zip root".
- **prefixed (`data/default-user/` prefix)**: `tt`, `pt`. Basis: `src/core/transform.js:1109-1110` writes `data/default-user/${hubPath}` for TT / PT targets; `detect.js:6` labels tt as "data/ root".

**Same family passes; cross-family or unknown layout is rejected**: e.g. restoring a TT (prefixed) package into Luker (flat) is blocked with a "convert first" prompt; likewise an ST package into TT. This is the inevitable consequence of "no incremental restore" (see below) — when structures mismatch, the only way out is a full conversion; there is no "restore only part" middle ground. `describeLayout()` (`src/core/restore-compat.js:68-72`) is for display only, normalizing `l` to `luker`, and is not part of the decision. The criterion is locked by 38 tests in `test/restore-compat.test.js` (this round: `npx vitest run test/restore-compat.test.js` → 38 passed).

### 3. Single package and split groups

Only **one package** can be restored at a time — more precisely, one "package or split group". Rules:

- **A split group (same `splitId`) counts as one**: `splitGroupKeyOf()` (`index.js:1205-1209`) groups parts with `isSplitPart && splitId` under one `split:xxx` key; `restoreSelected` counts group keys with a `Set` and only proceeds when `groups.size === 1`, otherwise it toasts `restore.incompatible.multiSelect` (`index.js:1252-1253`).
- **View layer converges in sync**: `restoreSelection()` in `workbench-view.js:6786-6797` automatically includes all parts with the same `splitId` when one part is selected; otherwise only the selected one is kept.
- **Old split-package fallback**: if a selected package's metadata has no `splitId`, `restoreSelected` asynchronously reads `_convert/split-manifest.json` from the package (`readSplitManifest()`, `index.js:575-591`) to fill in `isSplitPart/splitId/partIndex/partTotal` (`index.js:1239-1248`). On read failure it degrades to a single package and **does not fake success**; the group check then rejects extra items.
- **The `target` field in the split manifest**: newly generated `split-manifest.json` writes `target` (`st|l|tt|pt`), not `source` (`src/core/splitter.js:186-204`; splitter has no source-layout input, so writing source would be fabrication); `detect.js:90-112` uses `target` first and `source` only as a fallback for old packages; `pt` or an unmappable value is not falsely recognized here and falls through to filename/directory heuristics.
- **Metadata persistence**: on save (`index.js:1844-1852`) `isSplitPart/splitId/partIndex/partTotal` are written only when the caller actually supplies `splitId`; missing values are not fabricated.

### 4. Core write flow
`restoreToHost` (`src/ui/host-bridge.js:1983`, handles concurrency/cancel) calls `restoreToHostInner` (`:2237`), which splits into two upload paths:
- **Chunked first (Luker / ST only)**: when platform is `luker` or `st` (`:2250-2251`), try `tryLukerChunkedRestore` first (`:2053`), splitting the package into **8 MiB** chunks (`src/core/chunked-restore.js:17`); a missing chunk endpoint (404/405) falls back to the full package. **TT / PT do not enter the chunked branch.**
- **Full package**: build FormData (`:2264-2274`) with `avatar` (whole zip), `handle`, `mode`, `incremental` (`mode==='merge'?'true':'false'`, `:2268`), and `selection` (`:2274`).

Size/retry policy: bounded by Cloudflare's 100 MB single-request limit; on 413 the chunk is **halved (min 256 KiB)** and 5xx / 429 get **up to 3 retries** (`src/core/chunked-restore.js:17-19`).

### 5. Write scope: why checked categories do not affect restore
The `selection` in the full-package FormData is always `FULL_SELECTION` (`src/ui/host-bridge.js:2274`), and the chunked body uses the same value (`:2168`). `FULL_SELECTION` comes from `buildEndpointSelection()` (`src/ui/host-bridge.js:282`, `src/core/selection-defaults.js:86`) and contains only 10 standard categories, **all true**. In other words, **the user's checkbox selection is never passed through to the restore request**. What actually determines the restored content is **the entries inside the package itself**.

### 6. Endpoint resolution and capability degradation
`postRestoreWithFallback` (`src/ui/host-bridge.js:178`) resolves endpoints via `RESTORE_ENDPOINT_CANDIDATES`, which has **only luker / st keys** (`:93-96`): `luker=['/api/users/restore-backup','/api/users/restore']`, `st=['/api/users/restore','/api/users/restore-backup']`. **Platforms missing from the table (TT / PT) fall back to the ST candidates** (`:179`); endpoints are swapped only on 404 / 405; when all fail, `restoreCapability` is set to `'unsupported'` and `RESTORE_UNSUPPORTED` is thrown.

### 7. No incremental restore path to fall back to
Because the write scope is always full and `incremental` is only an alias of `mode`, **there is no "restore only checked categories" path in the code**. The real incremental merge function `incrementalMergeArchives()` (`src/ui/host-bridge.js:2985`) is explicitly marked "not wired: no callers"; the "incremental merge" checkbox it was meant to serve was confirmed non-functional and removed. Hard conclusion: **if a host lacks the full-package restore endpoint, it cannot restore at all — there is no incremental path to retreat to.** The new compatibility gate (section 2) and single/split-group constraint (section 3) are **pre-write interception only**: they block incompatible or multi-select requests before writing and do not create any "partial / incremental restore" capability. A request blocked by these gates still has only one way out — convert fully to the current host layout and retry.

## Host support matrix

### Before the change (current state, from measurements and static tracing)

| Host | Full-package restore endpoint | Chunked restore | Merge | Overwrite | Notes |
| --- | --- | --- | --- | --- | --- |
| **Luker** 2.7.0 | Available (`/api/users/restore-backup` exists; `/restore` is 404, `:89-90`) | Yes (8 MiB first, fallback to full) | Yes (`mode` expressible) | Yes (`mode` expressible) | selection always full; no "checked-only" incremental |
| **SillyTavern (st)** 1.19.0 | **Unavailable** (both candidates measured 404, `:90`) | Only ST tries, but endpoint absent → fallback to full | No | No | all candidates 404 → `unsupported`; no incremental fallback |
| **TauriTavern (tt)** | Unavailable (no `tt` key → ST fallback, `:179`) | Not attempted (`:2221`) | No | No | selection capability `tt:false` (`:303`) |
| **PureTavern (pt)** | Unavailable (same as TT) | Not attempted | No | No | selection capability `pt:false` (`:304`) |
| **Standalone Web / single-file HTML** | No host endpoint | No | No | No | `restoreSelected` rejects with a toast (`index.js:1212`); `btn-upload` disabled (`src/ui/workbench-view.js:3098`) |

**Current dead-button gap (closed)**: `src/ui/export-queue.js`'s `restoreUnsupportedReason` / `restoreBlocked` still have no callers, but the main UI's `btn-upload` is no longer disabled only for non-plugin mode — the view layer also uses `hostRestoreCapability()` to disable it for unsupported ST / TT / PT hosts in plugin mode and writes the capability reason (`src/ui/workbench-view.js:3098-3109`). More importantly, the **same capability gate now exists at the controller layer** (`index.js:1213-1218`): even if the button is bypassed and `restoreSelected` is called directly, it is intercepted by `hostRestoreCapability()` and toasts instead of passing through to the write. ST / TT / PT users now get a clear message on both the button path and the controller path.

### After the change (measured endpoint facts)

> This table follows this round's endpoint measurements (forensics files: `st-facts.json` / `luker-facts.json` / `tt-pt-facts.json` under `test-results/screenshots/restore-endpoints/`; Luker restore evidence in `test-results/screenshots/restore-luker-live/luker-restore-verdict.json`). **"All hosts supported" is no longer treated as an achieved goal**: only Luker is measured restorable; ST / TT / PT have no server-side full-package restore endpoint.

| Host | Full-package endpoint (measured) | Chunked | Merge / Overwrite | Restore entry state (F5 landed) |
| --- | --- | --- | --- | --- |
| **Luker** 2.9.0-rc.3 (Dev fork, D-05: not a product fact) | **Available**: `POST /api/users/restore-backup` measured merge / overwrite both HTTP 200 (restoredCount=10, failedCount=0, skippedCount=1; skip = out-of-category thumbnail) | Yes (uploads→finalize→chunks chain measured 200) | Yes (both modes' `mode` field measured distinct) | Available, entry not disabled |
| **SillyTavern (st)** | **Unavailable**: both candidates GET 404 with no 405 evidence (ST routes are POST-only; status code is not existence proof); POST blocked by global CSRF, no existence confirmation without login | Only ST tries; endpoint unconfirmed | No | **disabled** + reason: use the host native import |
| **TauriTavern (tt)** | **Unavailable**: Tauri desktop project has no browser/HTTP server, `/api/users/*` all 404; restore goes through Rust native file import | Not attempted | No | **disabled** + reason: import via native data migration |
| **PureTavern (pt)** | **Unavailable**: `/api/*` are in-page patched-fetch legacy routes with no server write endpoint; remote-server is only an LLM proxy | Not attempted | No | **disabled** + reason: import via the data management panel |
| **Standalone Web / single-file HTML** | No host endpoint | No | No | Keeps `disabled` + message (`pluginOnlyHint`) |

**F5 dead-button guard (landed)**: `hostRestoreCapability(platform)` in `src/ui/host-bridge.js` is the static capability judge (luker available; st / tt / pt unavailable, each with an i18n reason key). `btn-upload` in `src/ui/workbench-view.js` is now `disabled` for unsupported hosts even in plugin mode, with the capability reason written to `title` / `aria-label`. If a real probe already failed, `getRestoreUnsupportedReason()` (including probed "endpoint → status code") takes priority. i18n strings live under `restore.unsupported.*` in `src/i18n/locales/{zh-CN,en-US}.js`.

**F4 ST Authority enhanced restore channel (not implemented: endpoint absent)**: this round measured `authorityAvailable=false`; `/api/plugins/authority/host/st-restore` GET 404 (no 405 evidence), POST+TOKEN 403 (same as a random path, indistinguishable). The real probe point in source is `POST /api/plugins/authority/probe` reading the `data.stBackup` flag; the task's `st-restore` candidate does not match the code. Conclusion: **the Authority st-restore enhanced restore endpoint does not exist; pending Authority plugin development**. No probe code or enhanced channel is fabricated, avoiding dead code and false promises. If the Authority plugin later provides this endpoint, wire it per D-05 as an adapter (probe success → enhanced write, failure → silent fallback to native guidance).

**F3 category-filter forward-move (already implemented, verified)**: package generation already filters entries by selection — `src/core/transform.js:624-625` calls `entry.skip()` per `selection[cat] === false` during convert generation, and the core layer's preview-planning module reflects the unchecked state. This replaces the old idea of relying on the host parsing restore selection (the host is insensitive to restore-request selection; measured with/without it both give restoredCount=1).

> **Forensics boundary**: the endpoint criterion is overturned on the ST instance by control endpoints — `GET` 404 is a method mismatch on POST-only routes and cannot prove nonexistence; no endpoint produced 405 evidence, and POST is blocked by global CSRF. Therefore this table makes only an **observable judgment** of "no usable restore endpoint" for ST / Authority, not an absolute nonexistence claim; TT / PT are confirmed by desktop/pure-frontend form factors plus docs to have no server HTTP restore endpoint. The Luker restore success evidence comes from the 23:10 real-HTTP capture (see the verdict's `screenshotNote`; later host auto-update deleted the extension symlink, so re-runs failed — the PNG timestamps only prove host form factor).

## Incremental fallback principle

**Category filtering fallback and restore capability are two different things.**

- `selection` applies only to the **export / pull phase**; the restore path's `selection` is always `FULL_SELECTION` (`src/ui/host-bridge.js:2274` / `:2168`), independent of user checkboxes.
- A restore request **technically can carry a filtered payload**: `buildRestoreBody` has a `selection` parameter (`src/core/chunked-restore.js:52`) and the full-package FormData appends `selection` (`src/ui/host-bridge.js:2274`). But the host is measured to be insensitive to selection (with/without it, `restoredCount: 1`), the package's `manifest.json` selection is not parsed, and **the package entries themselves determine the restored content**.
- Therefore moving category filtering from the restore request into the plugin (export / package-generation phase) is technically correct and already has a landing spot: filter entries by selection when generating the package (`src/core/selection-defaults.js:42` `SPECIAL_SELECTION_FLAGS`, `src/core/transform.js:624-625`'s per-category `entry.skip()`), instead of relying on the host to parse restore selection.
- **Limit of the fallback**: in-plugin filtering only affects the export phase and **cannot solve the root obstacle** to "all hosts supporting both restore modes" — ST 1.19 has no full-package write endpoint (both endpoints 404), and filtering cannot conjure a write capability out of thin air.
- Current in-plugin filtering: ST required and available (full export then in-plugin filtering); Luker passes checkboxes natively and can use it but does not require it (`hostSelectionCapability()`, `:316-323`); TT / PT usable but have no browser read port.

## Write safety checks

> **Forensics boundary**: the behavior below comes from this document's existing statements. This read-only tracing pass **did not locate the corresponding implementation in the restore path**; it is not asserted as confirmed fact until separately verified.

Before writing, the tool checks the environment:

- A usable backup file exists;
- The backup is recent and the target environment is stable;
- The current operation has valid write permission.

If the environment changed or no valid backup is found, the plugin shows a warning and pauses the write to protect existing data.

## Switching storage engines

> **Forensics boundary**: as above, this description comes from this document's existing statements; this pass did not locate the "automatic cleanup of intermediate database dump files" implementation in the restore path, so it is not asserted as confirmed fact.

When restoring between database and plain-file storage, the plugin cleans up intermediate database dump files to avoid primary-key conflicts.

## Batch restore and fault tolerance

> Note the connection to "Single package and split groups" above: one restore accepts only **one package or one group of parts sharing a `splitId`** (`index.js:1235-1253`); multiple unrelated packages are blocked by `restore.incompatible.multiSelect`. The "per-package handling" below therefore only holds **inside a split group**.

The following three items were located in the main chain (per-part tolerance inside a split group in `index.js:1269-1320`; progress/failure handling in `src/ui/host-bridge.js:1983-2160`):

- **Per-part handling within a group**: a restore is limited to one package or one split group, but the group's parts are still processed one by one; a bad part does not block the other parts of the same group.
- **Clear report**: after processing, a detailed report shows successful and skipped entries.
- **Progress checkpoints**: progress is recorded, so a network drop or refresh can resume later.

## Automatic chunking for large packages

In taverns that support chunked restore (**only Luker / ST**), packages larger than **8 MiB** are split into chunks and uploaded smoothly (`src/core/chunked-restore.js:17`; `src/ui/host-bridge.js:2053`, `1983-2160`), avoiding single-request size limits. **TT / PT do not enter the chunked branch** (`src/ui/host-bridge.js:2250-2251`), and a missing chunk endpoint falls back to the full package.

## After restore

- A **Refresh page** button appears in the notice bar; refresh to see the restored chats and content.
- If the package contains an extension manifest, the plugin guides you to install those extensions online.
- See [Extension management & packing](extensions.en.md) for details.
