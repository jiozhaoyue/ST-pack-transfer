# feat(backup): make `backups/` history a selectable category

> 目标仓：`funnycups/Luker` · 源分支：`jiozhaoyue/Luker:release`（已推送 `b978e69b3`）
> 未提 PR —— 需要时执行文末的一键命令。

## Checklist

- [ ] I have read the [Contribution guidelines](https://github.com/funnycups/Luker/blob/release/CONTRIBUTING.md).

## Problem

The `settings` category in the Backup & Restore dialog silently bundles the
whole `backups/` directory (`src/users.js:1369`). On a long-lived account that
directory holds one ZIP snapshot per settings save — measured on a real
instance: **308 snapshots, ~2.5 GB**. A user who only wants `settings.json`
cannot get it without downloading every historical snapshot, because the
endpoint has no flag that separates the two.

## Change

Split the directory out of `settings` into its own category, default **on**,
so the default backup is byte-for-byte what users get today unless they
uncheck it.

| File | Change |
| --- | --- |
| `src/users.js` | `USER_BACKUP_SELECTION_DEFAULTS` gains `backups: true`; `getUserBackupTargets` adds `directories.backups` only when `selection.backups` |
| `public/scripts/user.js` | `BACKUP_CATEGORY_KEYS` / `BACKUP_DEFAULT_SELECTION` gain `backups` |
| `public/scripts/templates/userBackupManager.html` | new "Settings History (backups/)" checkbox |
| `tests/storage/endpoints/backup-roundtrip.parity.test.js` | `ALL_SELECTION` includes the new key |

11 added lines, 0 removed. No API shape change: `normalizeUserBackupSelection`
derives its key set from `USER_BACKUP_SELECTION_DEFAULTS`, so the endpoint
accepts the new key automatically, and `BACKUP_CATEGORY_ORDER` (used by the
per-category LAN/zip paths) picks it up as well.

## Verification

- `settings` checked alone → the archive contains `settings.json` only.
- `backups` checked alone → the archive contains `backups/` only.
- End-to-end on a real Luker instance: every category unchecked except
  `characters` → resulting ZIP was **59.9 MB** on an account whose full
  backup is multi-GB; the native UI's own selection was left untouched
  (reopening the dialog shows the user's checks, not the pulled set).
- Round-trip parity test updated; nothing else in the test surface depends on
  the number of categories.

## Compatibility

- Existing behavior is preserved by the `true` default — no migration, no
  stored-selection rewrite (`normalizeUserBackupSelection` fills missing keys
  from the defaults).
- Restore is unaffected: the ZIP layout is unchanged, only the category
  boundary moved. Old archives still restore; new archives with `backups`
  unchecked simply lack that directory.

---

## 一键提 PR（需要你自己确认后执行）

```bash
gh pr create --repo funnycups/Luker --base release --head jiozhaoyue:release \
  --title "feat(backup): make backups/ history a selectable category" \
  --body-file docs/pr-note-luker-backup-category.md
```
