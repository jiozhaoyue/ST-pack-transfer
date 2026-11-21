---
title: Issue report
layout: default
lang: en
alt_url: issue-report.html
alt_lang: zh-CN
---

# Issue report

When something goes wrong, use **Issue report** to collect environment details and generate a redacted report in one click.
You can copy it to the clipboard, export it as a local Markdown file, or submit it directly to a GitHub Issue.

Chats, character cards, world books and host usernames are excluded by default.
All outgoing text passes through the redaction layer, so credentials never leave with your report.

## 1. Where to find it

Open the **Settings** view in the workbench.
Expand the **Issue report** group to see the full form.

> On open, the panel calls the GitHub API to resolve repository coordinates and fetch the Issue template. Failures degrade silently and do not affect usage. No repository URL is needed; pick the platform and account from the dropdowns.

## 2. Fill in the form

Fill each template field. Fields are generated dynamically from the GitHub Issue template and may differ slightly between repositories.

- **Issue title**: summarize the problem in one line. Required.
- **Description**: what went wrong.
- **Repro steps**: how to reproduce.
- **Platform**: GitHub only for now.
- **Account**: shows whether a token is configured on this machine. If it says **Not configured**, add a token in developer settings first.
- **GitHub token**: use a fine-grained PAT with Issues read/write on the target repository. Stored only in this browser, never on the server.

If you are submitting to a specific repository, confirm the owner and repository name resolved correctly.
Shortcuts to the issue lists and docs of both this repo and the upstream are at the bottom of the panel.

## 3. Choose log level and count

After ticking **Include redacted logs**, choose the level and count of log entries to attach.

Levels filter on "at or above" and have five options:

- All
- Info+
- Warn+
- Errors
- Debug+

Count can be 50, 100, 200, 500, or All.

The safest minimum is the default: level **Warn+** and count **100**.
When logs are attached, the panel tells you exactly what is collected.
**Debug+** includes more detail, but logs are still auto-redacted.
After choosing, the panel shows **"{n} redacted entries attached"** live.

## 4. Preview and rendered view

Click **Preview report** to review the full text before submitting.
The preview window offers two views:

- **Raw**: the raw Markdown text.
- **Preview**: the rendered view.

Switch between them at any time. Confirm the content is correct before submitting.

## 5. Confirm before submitting

Before submitting a public Issue, two prerequisites must be checked:

- Docs reviewed
- No duplicate found

The submit button stays disabled until both are checked, and the UI lists what is still required.
This avoids duplicate reports and submissions before reading the docs.

## 6. Three exits

- **Submit**: goes through a confirmation dialog, then submits to GitHub. The dialog warns that public issues cannot be removed and may be indexed by search engines. A successful submit returns the issue link.
- **Copy full text**: copies the report to the clipboard, so you can paste it anywhere.
- **Export Markdown**: exports a local `issue-report.md` file.

## 7. URL guard "Too long, copy instead"

When creating a GitHub Issue through the web page, the form content is packed into the URL.
GitHub limits the length of the full new-issue URL.

When the content exceeds the limit, submission does not fail silently: it shows **"Too long, copy instead"**.
Use **Copy full text** or **Export Markdown** instead, then paste into the Issue body manually.

You can also configure a token and submit through the API to avoid the URL length limit.

## 8. Credentials and privacy

- Use a fine-grained PAT with only Issues read/write on the target repository.
- The token is stored only in this browser's `localStorage`, never in the tavern `settings.json`.
- The title, description, environment values, and logs in the report all pass through unified redaction.
- Chats, character cards, world books and host usernames are excluded by default.
- Public issues cannot be removed and may be indexed by search engines. Use a private channel for sensitive issues; do not file a public Issue.

## Related docs

- [Privacy & credentials](privacy.en.md) — redaction rules and credential storage
- [FAQ](faq.en.md) — issue report questions
- [Task queue & logs](queue-and-logs.en.md) — log levels and full logs
