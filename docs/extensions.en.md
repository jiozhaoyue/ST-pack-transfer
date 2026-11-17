---
title: Extension management & packing
layout: default
lang: en
alt_url: extensions.html
alt_lang: zh-CN
---

# Extension management & packing

Open it from the view switch at the top of the left panel: switch between **Storage chart** and **Extensions** (on mobile you can also switch to **Packages**).

## Three sections

| Section | What it does |
| --- | --- |
| **Host extensions** | View installed extensions, install new ones, batch update/uninstall, and manage server-side plugins (admins only) |
| **Developer** | Git accounts, OAuth login, token guidance, and advanced developer switches |
| **Extension packing** | Choose which extensions travel with the currently selected package |

## Interface consistency and scrolling

To keep desktop and mobile behavior identical, the extension manager follows these rules:

- **Read-only current package**: the **Inside package** section shows only the name of the package currently being viewed — there is no separate package dropdown here. To switch packages, select one in the **Packages** section; the inside-package view follows automatically. This prevents a mismatch between the dropdown and the package actually in effect.
- **Selecting a package shows its extensions**: whenever you switch packages, the app makes sure that package's extension information is ready and lists it immediately. Even a freshly imported, not-yet-parsed package is completed in the background first, so you never see "a selected package with no extensions".
- **The summary and action row stays fixed**: the row showing "N items / N selected", together with select-all, invert, clear, and the action buttons, is pinned to the top of the list. No matter how long the list or how far you scroll, that row never moves with the scrollbar and is never covered by list content.
- **Buttons and labels never break mid-word**: action buttons, status badges, and package names stay on one complete line; when space runs out the row degrades to icons or stacks onto another line, rather than cutting a word apart or squeezing it into an unreadable strip.
- **Same on both ends**: all of the above applies identically on desktop and mobile, regardless of screen width; mobile has only a single scroll area and never shows nested scrollbars.

## Full / manifest: dual selection and suggestions

Each extension row has **Full** and **Manifest** buttons, and **both can be active**:

- **Full**: include the extension's actual code in the package.
- **Manifest**: keep only source and version metadata; the target tavern pulls and installs it online.
- **Both**: write both the code and the official manifest entry, so the extension works immediately and can still be updated online.

The chart and the batch packing dialog show clear suggestions:

| Situation | Suggestion | Reason |
| --- | --- | --- |
| This plugin itself (ST-pack-transfer) | **Full** | It must bootstrap itself; it cannot depend on an online pull |
| No remote URL / local directory | **Full** | A manifest has no installable address |
| Private repository / requires credentials | **Full** | The target tavern usually does not have your credentials |
| Public Git remote | **Manifest** | Saves space and can be pulled after import |

> **If the network is poor, GitHub/GitLab is blocked, or the target machine cannot reach the remote, choose Full.**
> Manifest mode depends on the target tavern reaching the repository. Only Full guarantees the extension is usable offline.

## Installing extensions

Use the persistent **Install extension** area at the bottom of the panel:

- **Flexible input**: paste a single Git URL, paste multiple lines, or import a `.txt` / `.json` file.
- **Version selection**: each line accepts `repo-url | branch` or `repo-url#branch`, including branches, tags, and commits.
- **Private repositories**: configure a Git token in the **Developer** section first; private downloads then authenticate normally.
- **Link recognition**: GitHub / Gitee / GitLab web URLs and shorthand `owner/repo` are normalized automatically.
- **Robust install and force update**: the plugin handles dirty working trees, diverged branches, and leftover directories, and can clean up or remove-then-install instead of failing with a generic "Internet Error".

### Installing from the standalone web page

When the page is not connected to a running tavern, installing **writes the extension files into the selected package**. Select a package first; the extension is placed in that package's extension directory and is recognized after exporting and importing into a tavern.

## Managing installed extensions

- **Overview and ordering**: the top of the list shows the total and sort mode; drag to reorder and the order is remembered.
- **Source and status**: each row shows the remote URL (click to copy), public/private badge, and load order.
- **Actions**: update or uninstall individual extensions; admins can move extensions between global and private scopes.
- **Batch actions**: select all, invert, clear, batch update, and batch uninstall (with confirmation).

### Automatic update checks

- Enable the global auto-update switch in **Developer**; each installed extension can then set its own policy.
- Policies are **Off / Notify only / Auto update**. With **Notify only**, a tavern notification appears when a new version is available.
- Extension writes (update, install, uninstall) are queued and executed safely.

## Git commit visualization

Switch the package panel to the **Git** tab and select an extension:

- **Local / cloud views**: the local view reads the real `.git` data inside the package (HEAD, branches, refs, packfile). The cloud view reads remote branches/tags/commits and diffs.
- **Commit graph**: lanes and commit rows show merges and history; click a cloud commit to see the diff.
- **Version alignment**: compare the installed version with the latest remote version.
- **Quick version switch**: install a specific branch or tag.
- **UTF-8 decoding**: remote release notes and commit messages are decoded as UTF-8 to avoid mojibake.
- **No fabrication**: if cloud reading is disabled, the UI says so; if local parsing fails, it explains why instead of showing fake commits.

## Packing extensions with a package

- **Per-package selection**: choose extensions separately for each loaded package.
- **Git history optimization**: keep all history, keep only what daily updates need, or strip history to reduce package size.
- **Layout adaptation**: extension directories are normalized for the target tavern.

### Lightweight manifest mode

For smaller packages, choose **Full / Manifest** per extension directory. Full carries the actual files; Manifest keeps only the official list and source information and downloads on demand after import. Both buttons can be active at the same time. Group and batch rows light up based on whether Full or Manifest entries exist, and both can be active; the UI no longer shows a "mixed" state. A package can contain Full, Manifest, and dual entries at once, keeping bootstrap-only extensions offline while public extensions stay lightweight.

### Deduplication and built-ins

- **Automatic deduplication**: if the same extension exists in both user and global directories, only one copy is packed.
- **Protect built-ins**: native core modules (for example expressions and regex) stay in place during migration, keeping each tavern's core environment clean.

## Server-side plugins (admins)

Administrators also see a server-side plugin section in the host extension list, with dependency updates, uninstall, and URL installation.

- Regular users see only the options relevant to them.
- If a plugin is a server-side dependency (it has `package.json` but no front-end manifest), the UI explains how to install it through the server-side plugin feature.

## Accounts and access tokens

- **Hosting platforms**: GitHub, GitLab, Gitee, and self-hosted Gitea; multiple accounts with a default and a one-click connectivity test.
- **Authentication**: personal access tokens (PAT), username/password, and OAuth.
- **Guidance**: the developer page links directly to each platform's token creation page and lists the minimum scopes.

For local credential storage and privacy, see [Privacy & credentials](privacy.en.md).
