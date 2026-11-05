#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""search-gate: block implementation writes until a Web/GitHub search happened.

Fail-open: any unexpected error allows the tool call. Planning paths
(`.trellis/`, `docs/`, `tasks/`) and read-only operations are always allowed.
Emergency disable: TRELLIS_SEARCH_GATE=0.
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import sys
from pathlib import Path

if sys.platform.startswith("win"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stdin.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

EDIT_TOOLS = {"Edit", "Write", "MultiEdit", "NotebookEdit"}
EXEMPT_PREFIXES = (".trellis/", "docs/", "tasks/")
SEARCH_BASH = re.compile(
    r"(gh\s+search|api\.github\.com/search|firecrawl_search|anysearch|tinyfish|web_search|WebFetch)",
    re.IGNORECASE,
)
BASH_WRITE = re.compile(
    r"(sed\s+-i\b|\btee\b|\bcat\b[^|]*>|\bprintf\b[^|]*>|\becho\b[^|]*>|>\s*[^&|>\s])",
)
EXEMPT_WRITE_HINTS = (".trellis/", "docs/", "tasks/", "/tmp/", "$temp", "%temp%", "nul")


def _project_dir(data: dict) -> Path:
    for name in ("CLAUDE_PROJECT_DIR", "CURSOR_PROJECT_DIR", "CODEX_PROJECT_DIR"):
        value = os.environ.get(name)
        if value:
            return Path(value)
    return Path(data.get("cwd") or ".")


def _session_key(data: dict) -> str:
    for key in ("session_id", "sessionId", "sessionID"):
        value = data.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    transcript = data.get("transcript_path")
    if isinstance(transcript, str) and transcript:
        return hashlib.sha256(transcript.encode("utf-8")).hexdigest()[:16]
    return "default"


def _state_path(project_dir: Path, session_key: str) -> Path:
    safe = "".join(ch if ch.isalnum() or ch in "-_" else "_" for ch in session_key)[:64] or "default"
    return project_dir / ".trellis" / ".runtime" / "hooks" / f"search-gate-{safe}.json"


def _has_searched(path: Path) -> bool:
    try:
        return bool(json.loads(path.read_text(encoding="utf-8")).get("searched"))
    except (OSError, ValueError):
        return False


def _mark_searched(path: Path) -> None:
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_name(f".{path.name}.{os.getpid()}.tmp")
        tmp.write_text(json.dumps({"searched": True}), encoding="utf-8")
        os.replace(tmp, path)
    except OSError:
        pass


def _is_search(tool_name: str, tool_input: dict) -> bool:
    if tool_name in {"WebSearch", "WebFetch"}:
        return True
    if "search" in tool_name.lower():
        return True
    if tool_name == "Bash":
        return bool(SEARCH_BASH.search(str(tool_input.get("command") or "")))
    return False


def _target_path(tool_name: str, tool_input: dict) -> str:
    for key in ("file_path", "notebook_path", "path"):
        value = tool_input.get(key)
        if isinstance(value, str) and value:
            return value.replace("\\", "/")
    return ""


def _is_exempt(path: str) -> bool:
    normalized = path.replace("\\", "/")
    for prefix in EXEMPT_PREFIXES:
        base = prefix.rstrip("/")
        if normalized.startswith(prefix) or normalized == base or f"/{base}/" in normalized:
            return True
    return False


def _is_bash_exempt(command: str) -> bool:
    lowered = command.replace("\\", "/").lower()
    return any(hint in lowered for hint in EXEMPT_WRITE_HINTS)


def _deny(reason: str) -> None:
    print(json.dumps({
        "hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "permissionDecision": "deny",
            "permissionDecisionReason": reason,
        }
    }, ensure_ascii=False), flush=True)


def main() -> None:
    if os.environ.get("TRELLIS_SEARCH_GATE") == "0":
        return
    try:
        raw = sys.stdin.read()
        data = json.loads(raw) if raw.strip() else {}
        if not isinstance(data, dict):
            return
        tool_name = str(data.get("tool_name") or "")
        tool_input = data.get("tool_input") if isinstance(data.get("tool_input"), dict) else {}
        project_dir = _project_dir(data)
        state = _state_path(project_dir, _session_key(data))

        if _is_search(tool_name, tool_input):
            _mark_searched(state)
            return

        if _has_searched(state):
            return

        if tool_name in EDIT_TOOLS:
            target = _target_path(tool_name, tool_input)
            if target and _is_exempt(target):
                return
            _deny(
                "检索先行：本会话尚未进行 Web/GitHub 检索，禁止实现类写操作。"
                "先 WebSearch/WebFetch 或 gh search repos；"
                "规划目录 .trellis/ docs/ tasks/ 与只读操作放行。"
                "紧急禁用 TRELLIS_SEARCH_GATE=0。"
            )
            return

        if tool_name == "Bash":
            command = str(tool_input.get("command") or "")
            if not BASH_WRITE.search(command) or _is_bash_exempt(command):
                return
            _deny(
                "检索先行：本会话尚未进行 Web/GitHub 检索，禁止写类 Bash。"
                "先 WebSearch/WebFetch 或 gh search repos；"
                "写入 .trellis/ docs/ tasks/ 或临时目录放行。"
                "紧急禁用 TRELLIS_SEARCH_GATE=0。"
            )
    except Exception:
        return


if __name__ == "__main__":
    main()
