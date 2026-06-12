#!/usr/bin/env python3
"""Claude pause/resume helpers for MegaMind.

Called by the MegaMind MCP server when Claude Desktop needs to save a
session summary or reload prior project context.
"""

from __future__ import annotations

import datetime
import json
import os
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any


PROJECT_ROOT = Path(__file__).resolve().parent.parent
ENV_FILE = PROJECT_ROOT / ".env"
DEFAULT_API_BASE = "http://127.0.0.1:8000/api"


def load_env_file(path: Path) -> dict[str, str]:
    env: dict[str, str] = {}
    try:
        with path.open("r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, _, value = line.partition("=")
                env[key.strip()] = value.strip().strip('"').strip("'")
    except FileNotFoundError:
        pass
    return env


_env = load_env_file(ENV_FILE)
API_BASE = (os.environ.get("MEGAMIND_API_BASE") or _env.get("MEGAMIND_API_BASE", DEFAULT_API_BASE)).rstrip("/")
API_KEY = os.environ.get("MEGAMIND_API_KEY") or _env.get("MEGAMIND_API_KEY", "")
ACTIVE_ACCOUNT = os.environ.get("CLAUDE_ACTIVE_ACCOUNT") or _env.get("CLAUDE_ACTIVE_ACCOUNT", "default")
ALLOW_WRITE = (os.environ.get("MEGAMIND_MCP_ALLOW_WRITE") or _env.get("MEGAMIND_MCP_ALLOW_WRITE", "")) == "1"


def _headers() -> dict[str, str]:
    return {
        "Content-Type": "application/json",
        "X-API-Key": API_KEY,
    }


def _request(method: str, path: str, data: dict[str, Any] | None = None) -> Any:
    body = json.dumps(data).encode("utf-8") if data is not None else None
    req = urllib.request.Request(
        f"{API_BASE}{path}",
        data=body,
        headers=_headers(),
        method=method,
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            text = resp.read().decode("utf-8")
            return json.loads(text) if text else {}
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"MegaMind API error {e.code}: {detail}") from e
    except urllib.error.URLError as e:
        raise RuntimeError(f"MegaMind backend is not reachable at {API_BASE}: {e}") from e


def get_all_notes() -> list[dict[str, Any]]:
    notes = _request("GET", "/claud")
    return notes if isinstance(notes, list) else []


def get_note(id: int) -> dict[str, Any]:
    return _request("GET", f"/claud/{id}")


def create_note(title: str, content: str, tags: str = "") -> dict[str, Any]:
    return _request(
        "POST",
        "/claud",
        {
            "title": title,
            "agent": ACTIVE_ACCOUNT,
            "tags": tags,
            "content": content,
        },
    )


def update_note(id: int, title: str, content: str, tags: str = "") -> dict[str, Any]:
    return _request(
        "PUT",
        f"/claud/{id}",
        {
            "title": title,
            "agent": ACTIVE_ACCOUNT,
            "tags": tags,
            "content": content,
        },
    )


def find_note_by_title(title: str) -> dict[str, Any] | None:
    for note in get_all_notes():
        if note.get("title") == title:
            return note
    return None


def _timestamp() -> str:
    return datetime.datetime.now().strftime("%Y-%m-%d %H:%M")


def build_summary_block(project: str, summary: str, account: str) -> str:
    return f"---\n## Summary — {_timestamp()} | Account: {account}\n{summary.strip()}"


def _build_cross_reference_block(main_project: str, ref_type: str, account: str) -> str:
    label = "changes made" if ref_type == "modified" else "reference-only"
    return (
        f"---\n"
        f"## Cross-Reference — {_timestamp()} | Account: {account}\n"
        f"Session touched \"{main_project}\". [type: {label}]\n"
        f"See \"{main_project}\" note for full summary."
    )


def _result_id(result: dict[str, Any]) -> Any:
    return result.get("id") or result.get("existing_id") or result.get("note", {}).get("id", "?")


def _default_tags() -> str:
    return f"pause-resume,claude-session,account:{ACTIVE_ACCOUNT}"


def _append_to_project_note(project: str, block: str) -> tuple[str, Any]:
    found = find_note_by_title(project)
    if not found:
        result = create_note(project, block, tags=_default_tags())
        return "created", _result_id(result)

    note_id = int(found["id"])
    full_note = get_note(note_id)
    existing_content = full_note.get("content", "")
    updated_content = f"{existing_content}\n\n{block}" if existing_content else block
    result = update_note(
        note_id,
        full_note.get("title", project),
        updated_content,
        full_note.get("tags") or "",
    )
    return "appended", _result_id(result) or note_id


def pause(project: str, summary: str, cross_refs: list[dict[str, Any]] | None = None) -> str:
    summary_block = build_summary_block(project, summary, ACTIVE_ACCOUNT)
    found = find_note_by_title(project)

    if not found:
        result = create_note(project, summary_block, tags=_default_tags())
        note_id = _result_id(result)
        message = f'Created new note for project "{project}" (ID: {note_id})'
    else:
        note_id = int(found["id"])
        full_note = get_note(note_id)
        existing_content = full_note.get("content", "")
        updated_content = f"{existing_content}\n\n{summary_block}" if existing_content else summary_block
        result = update_note(
            note_id,
            full_note.get("title", project),
            updated_content,
            full_note.get("tags") or "",
        )
        note_id = _result_id(result) or note_id
        message = f'Appended summary to existing note "{project}" (ID: {note_id})'

    print(message)
    messages = [message]

    for ref in cross_refs or []:
        ref_project = str(ref.get("project", "")).strip()
        if not ref_project:
            continue
        ref_type = str(ref.get("type", "reference"))
        cross_ref_block = _build_cross_reference_block(project, ref_type, ACTIVE_ACCOUNT)
        action, ref_id = _append_to_project_note(ref_project, cross_ref_block)
        ref_message = f'{action.title()} cross-reference for project "{ref_project}" (ID: {ref_id})'
        print(ref_message)
        messages.append(ref_message)

    return "\n".join(messages)


def resume(project: str) -> str:
    found = find_note_by_title(project)
    if not found:
        return f'No saved session found for project "{project}". Starting fresh.'
    full_note = get_note(int(found["id"]))
    return full_note.get("content", "")
