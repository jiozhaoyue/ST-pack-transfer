#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Shared reader for the project's single injection source.

Rules live in `.trellis/spec/guides/iron-rules.md`. Hooks only read sections;
changing a rule never requires editing a hook.
"""
from __future__ import annotations

from pathlib import Path


def read_section(path: Path, heading: str) -> str:
    """Return the body lines of a `## <heading>` section, without headings/comments."""
    try:
        text = path.read_text(encoding="utf-8")
    except OSError:
        return ""
    lines = text.splitlines()
    start = None
    for index, line in enumerate(lines):
        if line.strip() == f"## {heading}":
            start = index + 1
            break
    if start is None:
        return ""
    body: list[str] = []
    for line in lines[start:]:
        if line.startswith("## "):
            break
        if line.strip() and not line.startswith("#") and not line.startswith(">"):
            body.append(line)
    return "\n".join(body).strip()
