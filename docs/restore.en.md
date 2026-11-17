---
title: Restore to host
layout: default
lang: en
alt_url: restore.html
alt_lang: zh-CN
---

# Restore a package back into the tavern

Write a converted package back into the current tavern. The entry is **Upload / Restore** in the package **Export** area.

## Two restore modes

| Mode | Write behavior | When to use |
| --- | --- | --- |
| **Merge update** | Updates files with the same name and keeps all other existing files | Daily sync or partial character/chat updates |
| **Full overwrite** | Rebuilds the target directories before writing (requires a second confirmation) | Replace the current tavern content completely and start from scratch |

The restore-mode switch is on the right side of the **Import / Export** tab.

## Write safety checks

Before writing, the tool checks the environment:

- A usable backup file exists;
- The backup is recent and the target environment is stable;
- The current operation has valid write permission.

If the environment changed or no valid backup is found, the plugin shows a warning and pauses the write to protect existing data.

## Switching storage engines

When restoring between database and plain-file storage, the plugin cleans up intermediate database dump files to avoid primary-key conflicts.

## Batch restore and fault tolerance

- **Per-package handling**: multiple packages can be imported at once; a bad package does not block the others.
- **Clear report**: after processing, a detailed report shows successful and skipped entries.
- **Progress checkpoints**: progress is recorded, so a network drop or refresh can resume later.

## Automatic chunking for large packages

In taverns that support chunked restore (for example Luker), packages larger than 8 MiB are split into chunks and uploaded smoothly, avoiding single-request size limits.

## After restore

- A **Refresh page** button appears in the notice bar; refresh to see the restored chats and content.
- If the package contains an extension manifest, the plugin guides you to install those extensions online.
- See [Extension management & packing](extensions.en.md) for details.
