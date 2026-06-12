#!/usr/bin/env python3
"""MegaMind MCP server for Claude Desktop.

Exposes the Window Space notes and Sessions APIs over stdio MCP. Core Space,
admin routes, and Shelfd internals are intentionally not exposed.
"""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any, Optional

from mcp.server.fastmcp import FastMCP

import pause_resume as pause_resume_tools


PROJECT_ROOT = Path(__file__).resolve().parent.parent
ENV_PATH = PROJECT_ROOT / ".env"

mcp = FastMCP("MegaMind")


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


_env = load_env_file(ENV_PATH)
API_BASE = (os.environ.get("MEGAMIND_API_BASE") or _env.get("MEGAMIND_API_BASE", "http://127.0.0.1:8000/api")).rstrip("/")
ROOT_BASE = API_BASE[:-4] if API_BASE.endswith("/api") else API_BASE
ALLOW_WRITE = (os.environ.get("MEGAMIND_MCP_ALLOW_WRITE") or _env.get("MEGAMIND_MCP_ALLOW_WRITE", "")) == "1"
ACTIVE_ACCOUNT = os.environ.get("CLAUDE_ACTIVE_ACCOUNT") or _env.get("CLAUDE_ACTIVE_ACCOUNT", "default")


def _api_key() -> str:
    key = os.environ.get("MEGAMIND_API_KEY") or _env.get("MEGAMIND_API_KEY")
    if not key:
        raise RuntimeError("MEGAMIND_API_KEY not found in environment or .env")
    return key


def _headers() -> dict[str, str]:
    return {
        "Content-Type": "application/json",
        "X-API-Key": _api_key(),
    }


def _req(method: str, path: str, data: dict[str, Any] | None = None) -> Any:
    body = json.dumps(data).encode("utf-8") if data is not None else None
    request = urllib.request.Request(
        f"{API_BASE}{path}",
        data=body,
        headers=_headers(),
        method=method,
    )
    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            text = response.read().decode("utf-8")
            return json.loads(text) if text else {}
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"MegaMind API error {e.code}: {detail}") from e
    except urllib.error.URLError as e:
        raise RuntimeError(f"MegaMind backend is not reachable at {API_BASE}: {e}") from e


def _limited(items: list[Any], limit: int) -> list[Any]:
    safe_limit = max(1, min(int(limit or 20), 100))
    return items[:safe_limit]


def _matches_claud_query(item: dict[str, Any], query: str) -> bool:
    needle = query.strip().lower()
    if not needle:
        return True
    return needle in str(item.get("title", "")).lower() or needle in str(item.get("content", "")).lower()


@mcp.tool()
def health() -> dict[str, Any]:
    """Check whether the MegaMind backend is reachable."""
    try:
        with urllib.request.urlopen(f"{ROOT_BASE}/", timeout=5) as response:
            return {
                "ok": response.status == 200,
                "status": response.status,
                "body": response.read().decode("utf-8"),
            }
    except urllib.error.URLError as e:
        return {"ok": False, "error": f"MegaMind backend is not reachable: {e}"}


@mcp.tool()
def list_notes(limit: int = 20) -> list[dict[str, Any]]:
    """List recent Window Space notes."""
    notes = _req("GET", "/notes")
    if not isinstance(notes, list):
        return []
    return _limited(notes, limit)


@mcp.tool()
def get_note(note_id: int) -> dict[str, Any]:
    """Get a full Window Space note by ID."""
    return _req("GET", f"/notes/{note_id}")


@mcp.tool()
def search_notes(query: str, limit: int = 10) -> list[dict[str, Any]]:
    """Search Window Space notes by query."""
    encoded = urllib.parse.urlencode({"q": query})
    results = _req("GET", f"/search?{encoded}")
    if not isinstance(results, list):
        return []
    return _limited(results, limit)


@mcp.tool()
def ask_brain(question: str) -> dict[str, Any]:
    """Ask MegaMind a natural-language question over Window Space notes."""
    return _req("POST", "/ask", {"question": question})


@mcp.tool()
def list_sessions(limit: int = 20) -> list[dict[str, Any]]:
    """List recent MegaCode/session records."""
    sessions = _req("GET", "/sessions")
    if not isinstance(sessions, list):
        return []
    return _limited(sessions, limit)


@mcp.tool()
def get_session(session_id: int) -> dict[str, Any]:
    """Get a full MegaCode/session record by ID."""
    return _req("GET", f"/sessions/{session_id}")


@mcp.tool()
def search_sessions(query: str, limit: int = 10) -> list[dict[str, Any]]:
    """Search MegaCode/session records by query."""
    encoded = urllib.parse.urlencode({"q": query})
    results = _req("GET", f"/sessions/search?{encoded}")
    if not isinstance(results, list):
        return []
    return _limited(results, limit)


@mcp.tool()
def list_claud(limit: int = 20) -> list[dict[str, Any]]:
    """List recent Claud Space entries."""
    entries = _req("GET", "/claud")
    if not isinstance(entries, list):
        return []
    return _limited(entries, limit)


@mcp.tool()
def get_claud(claud_id: int) -> dict[str, Any]:
    """Get a full Claud Space entry by ID."""
    return _req("GET", f"/claud/{claud_id}")


@mcp.tool()
def search_claud(query: str, limit: int = 10) -> list[dict[str, Any]]:
    """Search Claud Space entries by title and content."""
    entries = _req("GET", "/claud")
    if not isinstance(entries, list):
        return []
    return _limited([entry for entry in entries if _matches_claud_query(entry, query)], limit)


@mcp.tool()
def create_claud(title: str, content: str, tags: str = "") -> dict[str, Any]:
    """Create a Claud Space entry. Disabled unless MEGAMIND_MCP_ALLOW_WRITE=1."""
    if not ALLOW_WRITE:
        raise RuntimeError("Write tools are disabled. Set MEGAMIND_MCP_ALLOW_WRITE=1 to enable create_claud.")
    return _req(
        "POST",
        "/claud",
        {
            "title": title,
            "agent": ACTIVE_ACCOUNT,
            "tags": tags,
            "content": content,
        },
    )


@mcp.tool()
def update_claud(
    claud_id: int,
    title: str | None = None,
    content: str | None = None,
    tags: str | None = None,
) -> dict[str, Any]:
    """Update a Claud Space entry. Disabled unless MEGAMIND_MCP_ALLOW_WRITE=1."""
    if not ALLOW_WRITE:
        raise RuntimeError("Write tools are disabled. Set MEGAMIND_MCP_ALLOW_WRITE=1 to enable update_claud.")
    current = get_claud(claud_id)
    return _req(
        "PUT",
        f"/claud/{claud_id}",
        {
            "title": title if title is not None else current.get("title", ""),
            "agent": ACTIVE_ACCOUNT,
            "tags": tags if tags is not None else current.get("tags", ""),
            "content": content if content is not None else current.get("content", ""),
        },
    )


@mcp.tool()
def delete_claud(claud_id: int) -> dict[str, Any]:
    """Delete a Claud Space entry. Disabled unless MEGAMIND_MCP_ALLOW_WRITE=1."""
    if not ALLOW_WRITE:
        raise RuntimeError("Write tools are disabled. Set MEGAMIND_MCP_ALLOW_WRITE=1 to enable delete_claud.")
    return _req("DELETE", f"/claud/{claud_id}")


@mcp.tool()
def create_note(title: str, content: str, category: str = "Projects", tags: str = "") -> dict[str, Any]:
    """Create a Window Space note. Disabled unless MEGAMIND_MCP_ALLOW_WRITE=1."""
    if not ALLOW_WRITE:
        raise RuntimeError("Write tools are disabled. Set MEGAMIND_MCP_ALLOW_WRITE=1 to enable create_note.")
    return _req(
        "POST",
        "/notes",
        {
            "title": title,
            "category": category,
            "tags": tags,
            "content": content,
        },
    )


@mcp.tool()
def update_note(
    note_id: int,
    title: str | None = None,
    content: str | None = None,
    category: str | None = None,
    tags: str | None = None,
) -> dict[str, Any]:
    """Update a Window Space note. Disabled unless MEGAMIND_MCP_ALLOW_WRITE=1."""
    if not ALLOW_WRITE:
        raise RuntimeError("Write tools are disabled. Set MEGAMIND_MCP_ALLOW_WRITE=1 to enable update_note.")
    current = get_note(note_id)
    return _req(
        "PUT",
        f"/notes/{note_id}",
        {
            "title": title if title is not None else current.get("title", ""),
            "category": category if category is not None else current.get("category"),
            "tags": tags if tags is not None else current.get("tags", ""),
            "content": content if content is not None else current.get("content", ""),
        },
    )


@mcp.tool(description="Save session summary to MegaMind. Creates new project note or appends to existing.")
def pause(project: str, summary: str, cross_refs: Optional[str] = None) -> str:
    """
    project   : Project name e.g. 'MegaMind', 'Shelfd', 'Wink'
    summary   : Full session summary text
    cross_refs: Optional JSON string: [{"project": "Shelfd", "type": "reference"}]
    """
    if not ALLOW_WRITE:
        raise RuntimeError("Pause/resume tools are disabled. Set MEGAMIND_MCP_ALLOW_WRITE=1 to enable pause.")

    parsed_refs = None
    if cross_refs:
        try:
            parsed_refs = json.loads(cross_refs)
        except json.JSONDecodeError as e:
            raise RuntimeError(f"Invalid cross_refs JSON: {e}") from e
        if not isinstance(parsed_refs, list):
            raise RuntimeError("cross_refs must be a JSON list")

    return pause_resume_tools.pause(project, summary, parsed_refs)


@mcp.tool(description="Resume a project by loading its full session history from MegaMind.")
def resume(project: str) -> str:
    """
    project: Project name to resume e.g. 'MegaMind', 'Shelfd'
    """
    if not ALLOW_WRITE:
        raise RuntimeError("Pause/resume tools are disabled. Set MEGAMIND_MCP_ALLOW_WRITE=1 to enable resume.")
    return pause_resume_tools.resume(project)


if __name__ == "__main__":
    mcp.run()
