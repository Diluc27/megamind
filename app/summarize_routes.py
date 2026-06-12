import json
import os
import subprocess
import threading

from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, ValidationError
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool

from .claud_routes import _response_dict
from .database import get_db
from .models import Claud
from .utils import normalize_tags


router = APIRouter()

SUMMARY_INPUT_PATH = r"C:\temp\megamind_summary_input.txt"
SUMMARY_PROMPT = """Summarize this Claude conversation in this exact JSON format:
{
  "title": "short descriptive title",
  "summary": "2-3 paragraph detailed summary",
  "key_decisions": ["decision 1", "decision 2"],
  "current_state": "exactly where we left off",
  "next_steps": ["step 1", "step 2"],
  "important_context": "file paths, code details, technical decisions that must be preserved"
}
Return JSON only, no markdown, no preamble."""

_status_lock = threading.Lock()
_summarize_running = False


class SummaryResult(BaseModel):
    title: str
    summary: str
    key_decisions: list[str]
    current_state: str
    next_steps: list[str]
    important_context: str


def _extract_conversation_text(body: bytes, content_type: str) -> str:
    raw_text = body.decode("utf-8", errors="replace").strip()
    if not raw_text:
        raise HTTPException(status_code=400, detail="Conversation text is required")

    if "application/json" not in content_type.lower():
        return raw_text

    try:
        payload = json.loads(raw_text)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail="Invalid JSON request body") from exc

    if isinstance(payload, str):
        text = payload.strip()
    elif isinstance(payload, dict):
        value = payload.get("conversation_text") or payload.get("text") or payload.get("content")
        text = value.strip() if isinstance(value, str) else ""
    else:
        text = ""

    if not text:
        raise HTTPException(status_code=400, detail="Conversation text is required")
    return text


def _extract_json_object(text: str) -> dict[str, Any] | None:
    start = text.find("{")
    if start == -1:
        return None

    depth = 0
    in_string = False
    escape = False
    for idx in range(start, len(text)):
        char = text[idx]
        if escape:
            escape = False
            continue
        if char == "\\":
            escape = True
            continue
        if char == '"':
            in_string = not in_string
            continue
        if in_string:
            continue
        if char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                try:
                    value = json.loads(text[start:idx + 1])
                except json.JSONDecodeError:
                    return None
                return value if isinstance(value, dict) else None
    return None


def _candidate_summary(value: Any) -> dict[str, Any] | None:
    if isinstance(value, dict):
        if "title" in value and "summary" in value:
            return value
        for key in ("output", "result", "response", "message", "content", "text"):
            found = _candidate_summary(value.get(key))
            if found:
                return found
    elif isinstance(value, list):
        for item in value:
            found = _candidate_summary(item)
            if found:
                return found
    elif isinstance(value, str):
        stripped = value.strip()
        try:
            parsed = json.loads(stripped)
        except json.JSONDecodeError:
            parsed = _extract_json_object(stripped)
        return _candidate_summary(parsed) if parsed is not None else None
    return None


def _parse_summary_output(stdout: str) -> SummaryResult:
    try:
        parsed = json.loads(stdout.strip())
    except json.JSONDecodeError:
        parsed = _extract_json_object(stdout)

    candidate = _candidate_summary(parsed) if parsed is not None else None
    if not candidate:
        raise HTTPException(status_code=502, detail="OpenCode did not return summary JSON")

    try:
        return SummaryResult.model_validate(candidate)
    except ValidationError as exc:
        raise HTTPException(status_code=502, detail=f"Invalid summary JSON: {exc}") from exc


def _run_opencode_summary() -> SummaryResult:
    project_root = os.path.dirname(os.path.dirname(__file__))
    try:
        timeout_seconds = int(os.environ.get("MEGAMIND_SUMMARIZE_TIMEOUT_SECONDS", "600"))
    except ValueError:
        timeout_seconds = 600

    try:
        result = subprocess.run(
            [
                "opencode",
                "run",
                "-m",
                "openai/gpt-5.5",
                "--format",
                "json",
                "--file",
                SUMMARY_INPUT_PATH,
                SUMMARY_PROMPT,
            ],
            cwd=project_root,
            capture_output=True,
            text=True,
            encoding="utf-8",
            timeout=timeout_seconds,
        )
    except FileNotFoundError as exc:
        raise HTTPException(status_code=502, detail="opencode command was not found") from exc
    except subprocess.TimeoutExpired as exc:
        raise HTTPException(status_code=504, detail="OpenCode summarize command timed out") from exc
    if result.returncode != 0:
        detail = (result.stderr or result.stdout or "OpenCode summarize command failed").strip()
        raise HTTPException(status_code=502, detail=detail)
    return _parse_summary_output(result.stdout)


def _save_summary_to_claud(summary: SummaryResult, db: Session) -> dict[str, Any]:
    now_utc = datetime.utcnow()
    content = json.dumps(summary.model_dump(), indent=2)
    row = Claud(
        title=summary.title,
        agent="opencode/gpt-5.5",
        tags=normalize_tags("claude-summary,megamind-extension,auto-summary"),
        content=content,
        file_path="",
        created_at=now_utc,
        updated_at=now_utc,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _response_dict(row, content)


@router.get("/summarize/status")
def summarize_status():
    with _status_lock:
        return {"running": _summarize_running}


@router.post("/summarize", status_code=status.HTTP_201_CREATED)
async def summarize_conversation(
    request: Request,
    db: Session = Depends(get_db),
):
    global _summarize_running

    body = await request.body()
    conversation_text = _extract_conversation_text(body, request.headers.get("content-type", ""))

    with _status_lock:
        if _summarize_running:
            raise HTTPException(status_code=409, detail="Summarize is already running")
        _summarize_running = True

    try:
        os.makedirs(os.path.dirname(SUMMARY_INPUT_PATH), exist_ok=True)
        with open(SUMMARY_INPUT_PATH, "w", encoding="utf-8") as f:
            f.write(conversation_text)
        summary = await run_in_threadpool(_run_opencode_summary)
        return _save_summary_to_claud(summary, db)
    finally:
        with _status_lock:
            _summarize_running = False
