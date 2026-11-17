---
title: Task queue & logs
layout: default
lang: en
alt_url: queue-and-logs.html
alt_lang: zh-CN
---

# Task queue & logs

## Continuous task queue

Generating export packages, pulling from the host, restoring, cloud backup, downloads, copy-back, imports, cloud download/restore, and LAN transfers share one task view. Generation tasks support pause/resume; other long tasks expose running state and interruption.

- **Queueing**: the first **Generate export package** starts immediately; clicking again while running appends to the queue instead of dropping the request.
- **Display**: a persistent **Task queue** summary sits at the bottom of the workbench; the log view has a **Task queue** tab showing all tasks.
- **Details**: click a task row to expand type, status, created/started/finished times, duration, progress bar, and error.
- **Pause / resume**: a running generation task can pause and resume from the conversion checkpoint instead of starting over.
- **Interrupt**: abandon the current task; queued tasks can be removed. Generation uses cooperative cancellation; host pull aborts the plugin-side request; restore stops at a batch boundary; cloud backup stops the upload loop (uploaded chunks are kept for deduplicated retry).
- **Ordering**: queued tasks can move up or down.
- **History**: the last 200 finished tasks are kept for inspection; click × to remove one.

Task types include: generate export package, pull from host, restore, cloud backup, one-click auto backup, download, copy-back, import, cloud download, cloud restore, LAN send/receive. Only generation tasks show **Pause / Resume**; other tasks show **Running + Interrupt** and never pretend to be pausable.

## One-click automatic backup

The cloud backup card adds **One-click automatic backup**:

1. Pull a package from the host into the import area (the card shows an **Auto pull** badge);
2. Trim it according to the current chart selection and Full/Manifest extension modes;
3. Generate an export package for the current target platform (the card shows an **Auto generate** badge);
4. Upload and verify; on success, delete the automatic flow packages according to the settings.

Deletion policy: if **Delete import package after generating** is on, the automatic import package is deleted immediately after generation. **Delete automatic flow packages after backup** is on by default and removes the remaining automatic import/export packages after a successful upload and verification. Failures always keep the packages and write a log entry.

## Changelog

- **Automatic popup**: after the plugin version changes, the first open shows the release notes; on by default.
- **Do not show again**: tick **Do not show changelog automatically** in the dialog; the setting can be re-enabled on the settings page.
- **Full log**: click the fixed version row at the bottom of the settings page to open the full commit log, newest first. Builds include the full Git history and release tag mapping; release commits show a tag badge, and you can switch to **release commits only**.
- **Documentation site**: **View docs** in the tutorial and settings always opens the deployed GitHub Pages docs site and never appends the current page path.

## Log levels

- All levels (including DEBUG) are **always recorded** and never dropped by a threshold;
- By default only **WARN + ERROR** are displayed; the console mirror threshold is also WARN;
- **Settings → Logs → Log level** can switch to **Debug (all)**; the log view also has DEBUG / INFO / WARN / ERROR / SUCCESS filters for reviewing history.
