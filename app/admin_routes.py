"""
admin_routes.py — API key management for MegaMind.
Protected by Core Space token (X-Core-Token).
Only someone who has unlocked Core Space can generate or rotate the API key.
"""

import os
import secrets
import urllib.request
from pathlib import Path
from fastapi import APIRouter, Depends, Header, HTTPException, status
from pydantic import BaseModel
from typing import Optional
from sqlalchemy.orm import Session

from .database import get_db
from .models import StructuringConfig

router = APIRouter(prefix="/admin", tags=["admin"])

DEFAULT_FORMATTING_PROMPT = """You are a content structuring agent for Shelfd, a personal knowledge manager.

Your job: take raw unstructured text and extract structured knowledge from it.

OUTPUT FORMAT (JSON only, no markdown, no explanation):
{
  "title": "short clear title, max 6 words",
  "summary": "one sentence describing what this is about",
  "key_ideas": ["only if raw text contains concepts/insights worth remembering", "each as a concise phrase"],
  "action_items": ["only if raw text contains tasks/todos/things to do", "each as an actionable phrase"],
  "tags": "comma-separated relevant tags, lowercase, no spaces",
  "category": "one of: Work, Personal, Learning, Health, Finance, Shopping, Ideas, Other"
}

RULES:
- key_ideas and action_items are OPTIONAL — only include if genuinely present in the raw text
- If raw text is just a shopping list, only action_items needed, no key_ideas
- If raw text is a book note, only key_ideas needed, no action_items
- If raw text is a reminder, just title + summary + action_items
- Never invent content not present in the raw text
- raw_text must NEVER be modified — you only produce the structured fields above
- Return valid JSON only"""


def _now_iso() -> str:
    from datetime import datetime, timezone
    return datetime.now(timezone.utc).isoformat()


def _get_or_create_config(db: Session) -> StructuringConfig:
    """Get the single config row, creating it with defaults if missing."""
    cfg = db.query(StructuringConfig).filter(StructuringConfig.id == 1).first()
    if not cfg:
        cfg = StructuringConfig(
            id=1,
            mode="watcher",
            interval_seconds=90,
            enabled=True,
            formatting_prompt=DEFAULT_FORMATTING_PROMPT,
            last_processed_at=None,
            updated_at=_now_iso(),
        )
        db.add(cfg)
        db.commit()
        db.refresh(cfg)
    return cfg


def _config_response(cfg: StructuringConfig) -> dict:
    return {
        "id": cfg.id,
        "mode": cfg.mode,
        "interval_seconds": cfg.interval_seconds,
        "enabled": cfg.enabled,
        "formatting_prompt": cfg.formatting_prompt,
        "last_processed_at": cfg.last_processed_at,
        "updated_at": cfg.updated_at,
    }

# ── locate .env file ────────────────────────────────────────────────────────
def _find_env_file() -> Path:
    """Walk up from this file's location to find the .env at project root."""
    here = Path(__file__).resolve().parent
    for candidate in [here / ".env", here.parent / ".env"]:
        if candidate.exists():
            return candidate
    # If not found, create at project root
    env_path = here.parent / ".env"
    env_path.touch()
    return env_path


# ── Core token validation (mirrors existing routes.py logic) ────────────────
_core_tokens: dict = {}  # injected at startup — see wire-up instructions

def _validate_core_token(token: Optional[str]) -> None:
    """Validate against MegaMind's existing in-memory Core token store."""
    import time
    from .routes import CORE_TOKENS

    if not token or token not in CORE_TOKENS:
        raise HTTPException(status_code=401, detail="Invalid or expired Core token")
    expiry = CORE_TOKENS[token]
    if time.time() > expiry:
        del CORE_TOKENS[token]
        raise HTTPException(status_code=401, detail="Core token expired")


# ── .env read/write helpers ─────────────────────────────────────────────────
def _read_env(path: Path) -> str:
    return path.read_text(encoding="utf-8") if path.exists() else ""


def _write_api_key(new_key: str) -> None:
    """Update or insert MEGAMIND_API_KEY in .env, preserve all other lines."""
    env_path = _find_env_file()
    content = _read_env(env_path)
    lines = content.splitlines(keepends=True)

    key_line = f"MEGAMIND_API_KEY={new_key}\n"
    updated = False
    new_lines = []

    for line in lines:
        if line.startswith("MEGAMIND_API_KEY="):
            new_lines.append(key_line)
            updated = True
        else:
            new_lines.append(line)

    if not updated:
        # Add newline separator if file doesn't end with one
        if new_lines and not new_lines[-1].endswith("\n"):
            new_lines.append("\n")
        new_lines.append(key_line)

    env_path.write_text("".join(new_lines), encoding="utf-8")

    # Hot-reload into os.environ so the running server uses the new key
    # immediately — no restart required
    os.environ["MEGAMIND_API_KEY"] = new_key


# ── Schemas ─────────────────────────────────────────────────────────────────
class ApiKeyStatus(BaseModel):
    key_configured: bool
    key_preview: str          # shows first 6 chars + "..." for confirmation only
    env_file: str

class ApiKeyRotateResponse(BaseModel):
    success: bool
    new_key: str              # full key returned ONCE — user must copy it
    key_preview: str
    env_file: str
    message: str


# ── Routes ──────────────────────────────────────────────────────────────────
@router.get("/api-key", response_model=ApiKeyStatus)
def get_api_key_status(x_core_token: Optional[str] = Header(default=None)):
    """Check if API key is configured. Never returns the full key."""
    _validate_core_token(x_core_token)

    current = os.environ.get("MEGAMIND_API_KEY", "")
    env_path = _find_env_file()

    return ApiKeyStatus(
        key_configured=bool(current),
        key_preview=f"{current[:6]}..." if len(current) >= 6 else ("(not set)" if not current else current),
        env_file=str(env_path),
    )


@router.post("/api-key/rotate", response_model=ApiKeyRotateResponse)
def rotate_api_key(x_core_token: Optional[str] = Header(default=None)):
    """
    Generate a new cryptographically secure API key.
    Saves it to .env and hot-reloads into memory.
    Returns the full key ONCE — copy it immediately.
    All existing clients (Shelfd app) will need to update their saved key.
    """
    _validate_core_token(x_core_token)

    new_key = secrets.token_urlsafe(32)
    env_path = _find_env_file()

    try:
        _write_api_key(new_key)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to write .env: {e}",
        )

    return ApiKeyRotateResponse(
        success=True,
        new_key=new_key,
        key_preview=f"{new_key[:6]}...",
        env_file=str(env_path),
        message="Key rotated and live. Copy the new key now — it won't be shown again. Update Shelfd settings with the new key.",
    )


@router.get("/ngrok-url")
def get_ngrok_url(x_core_token: Optional[str] = Header(default=None)):
    """
    Returns the current ngrok public URL by querying ngrok's local agent API.
    ngrok exposes a local API at http://127.0.0.1:4040/api/tunnels when running.
    Protected by Core token — no API key needed since this is admin info.
    """
    _validate_core_token(x_core_token)
    import urllib.request, json as _json
    try:
        with urllib.request.urlopen("http://127.0.0.1:4040/api/tunnels", timeout=3) as r:
            data = _json.loads(r.read())
        tunnels = data.get("tunnels", [])
        https = next((t for t in tunnels if t.get("proto") == "https"), None)
        url = (https or tunnels[0])["public_url"] if tunnels else None
        return {"url": url, "running": bool(url)}
    except Exception:
        return {"url": None, "running": False}


@router.get("/structuring-config")
def get_structuring_config(
    x_core_token: Optional[str] = Header(default=None),
    db: Session = Depends(get_db),
):
    _validate_core_token(x_core_token)
    cfg = _get_or_create_config(db)
    return _config_response(cfg)


@router.patch("/structuring-config")
def update_structuring_config(
    body: dict,
    x_core_token: Optional[str] = Header(default=None),
    db: Session = Depends(get_db),
):
    """
    Update structuring config. Accepts any subset of:
    { mode, interval_seconds, enabled, formatting_prompt }
    """
    _validate_core_token(x_core_token)
    cfg = _get_or_create_config(db)

    if "mode" in body:
        mode = body["mode"]
        if mode not in {"watcher", "always_on"}:
            raise HTTPException(status_code=400, detail="mode must be watcher or always_on")
        cfg.mode = mode
    if "interval_seconds" in body:
        interval = int(body["interval_seconds"])
        if interval < 1:
            raise HTTPException(status_code=400, detail="interval_seconds must be positive")
        cfg.interval_seconds = interval
    if "enabled" in body:
        cfg.enabled = bool(body["enabled"])
    if "formatting_prompt" in body:
        cfg.formatting_prompt = body.get("formatting_prompt")

    cfg.updated_at = _now_iso()
    db.commit()
    db.refresh(cfg)
    return _config_response(cfg)


@router.post("/structuring-config/last-processed")
def update_last_processed(
    x_core_token: Optional[str] = Header(default=None),
    db: Session = Depends(get_db),
):
    """Called by watcher after each processing run to update last_processed_at."""
    _validate_core_token(x_core_token)
    cfg = _get_or_create_config(db)
    now = _now_iso()
    cfg.last_processed_at = now
    cfg.updated_at = now
    db.commit()
    return {"updated": True}


@router.get("/status")
def get_system_status(
    x_core_token: Optional[str] = Header(default=None),
    db: Session = Depends(get_db),
):
    """Returns real-time status of MegaMind services and recent activity."""
    _validate_core_token(x_core_token)

    import subprocess, json as _json

    # Backend is running (this endpoint is reachable)
    backend = {"status": "running", "port": 8000}

    # Watcher process check (filter by name='python.exe' server-side, no self-match)
    watcher_running = False
    try:
        import subprocess
        result = subprocess.run(
            ["powershell", "-NoProfile", "-Command",
             "if (Get-CimInstance Win32_Process -Filter \"name = 'python.exe' and CommandLine like '%shelfd_watcher%'\") { '1' } else { '0' }"],
            capture_output=True, text=True, timeout=5,
        )
        watcher_running = result.stdout.strip() == "1"
    except Exception:
        pass

    watcher = {"running": watcher_running}

    # Pending structuring count
    from .models import ShelfdProject
    pending = db.query(ShelfdProject).filter(
        ShelfdProject.structured == False,
        ShelfdProject.deleted == False,
        ShelfdProject.raw_text != None,
        ShelfdProject.raw_text != "",
    ).count()

    # Ngrok check
    ngrok = {"running": False, "url": None}
    try:
        with urllib.request.urlopen("http://127.0.0.1:4040/api/tunnels", timeout=3) as r:
            data = _json.loads(r.read())
        tunnels = data.get("tunnels", [])
        https = next((t for t in tunnels if t.get("proto") == "https"), None)
        url = (https or tunnels[0])["public_url"] if tunnels else None
        ngrok = {"running": bool(url), "url": url}
    except Exception:
        pass

    # MCP process check (filter by name='python.exe' server-side, no self-match)
    mcp_running = False
    try:
        result = subprocess.run(
            ["powershell", "-NoProfile", "-Command",
             "if (Get-CimInstance Win32_Process -Filter \"name = 'python.exe' and CommandLine like '%megamind_mcp%'\") { '1' } else { '0' }"],
            capture_output=True, text=True, timeout=5,
        )
        mcp_running = result.stdout.strip() == "1"
    except Exception:
        pass

    # Note and session counts
    from .models import Note, Session as SessionModel
    note_count = db.query(Note).count()
    session_count = db.query(SessionModel).count()
    claud_count = 0
    try:
        from .models import Claud
        claud_count = db.query(Claud).count()
    except Exception:
        pass

    return {
        "backend": backend,
        "watcher": watcher,
        "pending_structures": pending,
        "ngrok": ngrok,
        "mcp": {"running": mcp_running},
        "counts": {
            "notes": note_count,
            "sessions": session_count,
            "claud": claud_count,
            "shelfd_projects": db.query(ShelfdProject).filter(ShelfdProject.deleted == False).count(),
        },
    }
