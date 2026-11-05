#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""UserPromptSubmit hook: inject the project's iron rules before every user turn.

Fail-open by design: any error prints nothing and exits 0 so the user's prompt
is never blocked by a broken hook.
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

from rules_lib import read_section

if sys.platform.startswith("win"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stdin.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass


def _project_dir(hook_input: dict) -> Path:
    for env_name in ("CLAUDE_PROJECT_DIR", "CURSOR_PROJECT_DIR", "CODEX_PROJECT_DIR"):
        value = os.environ.get(env_name)
        if value:
            return Path(value)
    cwd = hook_input.get("cwd") if isinstance(hook_input, dict) else None
    return Path(cwd or ".")


INJECT_EVERY = 5


def _rules_text(project_dir: Path) -> str:
    path = project_dir / ".trellis" / "spec" / "guides" / "iron-rules.md"
    return read_section(path, "铁律")


def _session_key(hook_input: dict) -> str:
    for key in ("session_id", "sessionId", "sessionID"):
        value = hook_input.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return "default"


def _bump_counter(project_dir: Path, session_key: str) -> int:
    safe = "".join(ch if ch.isalnum() or ch in "-_" else "_" for ch in session_key)[:64] or "default"
    path = project_dir / ".trellis" / ".runtime" / "hooks" / f"prompt-count-{safe}.json"
    try:
        previous = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        previous = {}
    count = int(previous.get("count", 0)) + 1
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_name(f".{path.name}.{os.getpid()}.tmp")
        tmp.write_text(json.dumps({"count": count}), encoding="utf-8")
        os.replace(tmp, path)
    except OSError:
        pass
    return count


def main() -> None:
    try:
        raw = sys.stdin.read()
        hook_input = json.loads(raw) if raw.strip() else {}
        if not isinstance(hook_input, dict):
            hook_input = {}
        project_dir = _project_dir(hook_input)
        count = _bump_counter(project_dir, _session_key(hook_input))
        if count % INJECT_EVERY != 0:
            sys.exit(0)
        rules = _rules_text(project_dir)
        if not rules:
            context = (
                "<iron-rules>\n[注入源缺失] .trellis/spec/guides/iron-rules.md；"
                "请恢复该文件，规则不再硬编码在 hook 里。\n</iron-rules>"
            )
        else:
            context = f"<iron-rules>\n{rules}\n</iron-rules>"
        print(json.dumps({
            "hookSpecificOutput": {
                "hookEventName": "UserPromptSubmit",
                "additionalContext": context,
            }
        }, ensure_ascii=False), flush=True)
    except Exception:
        sys.exit(0)


if __name__ == "__main__":
    main()
