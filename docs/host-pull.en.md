---
title: Pull from host
layout: default
lang: en
alt_url: host-pull.html
alt_lang: zh-CN
---

# Pull directly from the current tavern

Export the current tavern's user data as a package, and optionally package it directly into your target format in one step.

## Where to find it

Open the **Import / Export** tab and click **Pull from host** on the right side.

## Pull flow

1. **Estimate**: shows the expected data size and a local-transfer explanation.
2. **Guidance**: points to the exact native backup control in the current tavern.
3. **Open the native backup UI**: guides you to export through the tavern's own backup screen.

If you already know the flow, tick **Do not remind me again** to skip the guidance next time.

## Native backup locations

| Tavern | Native backup entry |
| --- | --- |
| SillyTavern | Backup button in the native settings backup section |
| Luker | Start backup in the account center's Backup section |
| TauriTavern | Export button in the **Data Migration** extension |
| PureTavern | Export backup button in the **PureTavern Data Management** extension |

> Note: the plugin only adds a shortcut next to the corresponding backup area, keeping the native UI clean and stable.

## After the pull

- The package appears in the **Package list** on the right and the **Storage chart** on the left.
- You can select items, convert formats, split the package, or back it up to cloud/LAN devices.
- Large packages support resumable downloads.

## Privacy and safety

You stay in control: the plugin only provides shortcuts and guidance. All backup options and confirmation buttons are clicked by you in the tavern, and the tavern's existing backup behavior and settings remain unchanged.
