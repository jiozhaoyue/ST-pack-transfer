---
title: Privacy & credentials
layout: default
lang: en
alt_url: privacy.html
alt_lang: zh-CN
---

# Privacy & credentials

## Core principle

**All sensitive credentials are stored only in the current browser's local storage (LocalStorage) by default and are never written into the tavern server's shared configuration file.** You control the storage mode in **Settings → Privacy**.

## Credential types

Most features need no login. Credentials are only required when connecting to an external code host or cloud backup:

| Credential | Used for | What to enter | Recommended minimum scope |
| --- | --- | --- | --- |
| **GitHub token** | Download or update private extensions | `github_pat_…` or `ghp_…` | Contents and Metadata read-only (classic: `repo`) |
| **GitLab token** | Same | `glpat-…` | `read_repository` (add `read_api` for project metadata) |
| **Gitee token** | Same | Private token | `projects` |
| **Gitea token** | Self-hosted Gitea, same | Access token | `read:repository` |
| **S3 credentials** | Cloud object-storage backup | Endpoint / region / bucket / key pair | Read/write/admin on the selected bucket |
| **WebDAV account** | WebDAV / NAS backup | Server URL / username / password | Read/write on the selected backup folder |

Where to enter them: Git tokens in **Extensions → Developer → Git accounts**; S3 and WebDAV in **Migration & backup → Cloud**.

## Choose where credentials are stored

In **Settings → Privacy** each credential type can be stored independently:

| Setting | Default | Meaning |
| --- | --- | --- |
| Git accounts and tokens | **Browser only** | Written only to this machine's `localStorage`, not the tavern server config |
| S3 credentials | **Browser only** | Keeps cloud access keys on your computer |
| WebDAV credentials | **Browser only** | Isolates them from other users on a shared tavern |

- **Browser only** is the recommended privacy mode; data stays in the current browser.
- **Save to server `settings.json`** is available if you want to reuse credentials on other devices connected to the same tavern. If you switch back to **Browser only** and save, the server-side plaintext copy is cleared automatically.

## Local privacy protections

- **Local-only processing**: unpacking, cleaning, and rebuilding packages happen in your browser; no third-party relay server is involved.
- **Controlled network requests**: the only outbound requests are Git repository status checks you trigger in extension management, or cloud backups you configure yourself.
- **Masked exports and reports**: Tokens and secrets in exported logs and issue reports are masked by the unified redaction layer; the live log panel shows raw text, inputs are password-masked.
- **Deep masking of sensitive fields**: logs and reports recursively fold values under sensitive keys such as token, secret, password, api_key, credential and cookie — nested data is covered up to eight levels — while non-sensitive fields such as keyboard layouts stay intact.
- **Broader credential coverage**: redaction now also recognizes secrets in query parameters, passwords written in single quotes, Google API keys starting with `AIzaSy`, and HuggingFace tokens starting with `hf_`; all are masked before export and never leave with your report.
- **Generic credential carriers**: redaction also recognizes three-part JWT tokens (`eyJ` prefix), PEM private-key blocks (the whole `-----BEGIN … PRIVATE KEY-----` block is masked, with the single regex source of truth in `credential-patterns.js`, shared with log redaction), generic long keys starting with `sk-`, Slack tokens like `xoxb-`, and AWS access keys starting with `AKIA` — all replaced with `[REDACTED]` before export.

## Sanitized share and pre-upload guard

To share a personal tavern data pack with others, use sanitized share mode to produce a package that is safe to distribute.
It is meant for sharing chats and layout **without** leaking character cards or credentials.

### What a sanitized share package contains

- **Character cards removed outright**: the whole `characters/*` segment is dropped, in both PNG tEXt and JSON form, so cards cannot be redistributed.
- **Credential files removed**: `credentials.json`, `api_keys.json`, `secrets.json` and similar files are dropped by filename.
- **Chats kept**: `chats/*.jsonl` is explicitly allowed for distribution.
- **settings.json cleaned**: an AST tree whitelist keeps only keyless, common keys such as theme, font size, layout and sampling presets; sensitive values such as `api_key`, `token`, `password`, `proxy` and `endpoint` are cleared.
- **Watermark**: a lightweight `_watermark.json` can be embedded.
- **Exclusion details available**: the conversion report lists removed and cleaned entries with reasons. The setting **Show removal/cleanup details when exporting a sanitized pack** is on by default and can be turned off.

> Note: the exact UI location of the sanitized-share toggle is **to be confirmed**. The core conversion logic supports the `sanitizeShare` parameter; the concrete switch location depends on the installed version.

### Local hard guard before upload

Before uploading to a server (S3 / WebDAV or other cloud backup), a local redaction guard runs.
It completes before any data leaves this machine; a failed check hard-blocks the upload.

- **Content-level scan**: inspects the actual entry paths and text content of the ZIP, relying on no external marker file.
- **Block on match**: a character-card entry, credential file, or plaintext API key, token, private key, or connection string inside an entry immediately stops the upload.
- **Block when undetermined**: entries with no valid path or that cannot be parsed fail closed; unsanitized content is never allowed through.
- **Report truthfully**: a blocked upload returns a clear reason; it is never silent and does not abort unrelated tasks.

## Pulling private repositories

When installing a private repository through the tavern, the plugin passes your token securely to the tavern backend for the clone. You can revoke or rotate the token afterwards.

## Exporting and backing up settings

In **Settings → Data** you can export the plugin's settings, cloud configuration, and UI preferences as a standalone JSON file. On import, account information is restored only when you explicitly include credentials, so existing accounts are not accidentally overwritten.

## Multiple network environments

After configuring an account, public and private repositories on that host can be read for branches, tags, and release notes. On restricted networks the plugin picks a working API path so extension updates and diffs remain responsive.
