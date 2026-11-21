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

## SillyTavern vs Luker: step by step

The two taverns differ in how "category selection" behaves, so the paths differ.
The key difference: SillyTavern's native endpoint does not support selection passthrough; Luker does.

### SillyTavern: full export + in-plugin filtering

1. In the **Pull from host** guidance, note the filter note: **the ST native endpoint ignores category selection and must request the full pack**.
2. Follow the prompt to open SillyTavern's native settings backup section and click the backup button to export all user data.
3. The downloaded full pack enters the plugin's package list.
4. Select the categories to convert in the plugin; filtering takes effect as **in-plugin filtering**.
5. Continue with conversion, splitting, or backup.

> The data size shown is the **full amount** according to the endpoint's real behavior, not your selection count. This is faithful feedback, not an estimation error.

### Luker: selection passthrough

1. In the **Pull from host** guidance, note the filter note: **the Luker native endpoint supports selection and passes your selection straight through**.
2. First select the data categories you need in the plugin.
3. Follow the prompt to open the account center's Backup section and click start backup.
4. The plugin passes your selection directly to the host, which exports only the selected categories.
5. The interface shows the categories you actually selected.

### Other taverns

TauriTavern and PureTavern migration endpoints are capability-probed; unsupported ones are reported clearly, never faked.
Some PureTavern endpoints may return 501; follow the on-screen message in that case.

## After the pull

- The package appears in the **Package list** on the right and the **Storage chart** on the left.
- You can select items, convert formats, split the package, or back it up to cloud/LAN devices.
- Large packages support resumable downloads.

## Privacy and safety

You stay in control: the plugin only provides shortcuts and guidance. All backup options and confirmation buttons are clicked by you in the tavern, and the tavern's existing backup behavior and settings remain unchanged.
