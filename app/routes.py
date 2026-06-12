import re
import os
import time
import sqlite3
import zipfile
import hashlib
import hmac
import secrets
from io import BytesIO
from fastapi import APIRouter, Depends, HTTPException, Query, Response, Header, Request
from sqlalchemy.orm import Session
from .database import get_db, DB_PATH
from .models import Note, NotePage
from .utils import (
    CATEGORIES, ensure_dirs, get_safe_filename, save_markdown,
    read_markdown, delete_markdown, NOTES_DIR, DATA_DIR, BACKUPS_DIR,
    normalize_tags, build_markdown, extract_body, build_preview,
    is_protected
)
from .search import perform_search
from .auth import require_api_key
from pydantic import BaseModel, field_serializer
from typing import List, Optional
from datetime import datetime, timezone

router = APIRouter()
WINDOW_AUTH = [Depends(require_api_key)]

class NoteBase(BaseModel):
    title: str
    category: Optional[str] = None
    tags: Optional[str] = None
    content: str
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    source: Optional[str] = None

class NoteResponse(BaseModel):
    id: int
    title: str
    category: Optional[str]
    tags: Optional[str]
    source: Optional[str] = None
    file_path: Optional[str]
    content: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

    @field_serializer('created_at', 'updated_at')
    def serialize_dt(self, v: datetime) -> str:
        return serialize_note_timestamp(v)


class NotePageBase(BaseModel):
    title: str
    tags: Optional[str] = None
    content: str


class NotePageResponse(BaseModel):
    id: int
    note_id: int
    title: str
    tags: Optional[str]
    content: str
    position: int
    created_at: str
    updated_at: str

    class Config:
        from_attributes = True

class DuplicateNoteResponse(BaseModel):
    status: str
    existing_id: int
    note: NoteResponse


class AskRequest(BaseModel):
    question: str


def normalize_duplicate_text(value, *, lowercase=False):
    normalized = re.sub(r"\s+", " ", (value or "").strip())
    return normalized.lower() if lowercase else normalized


def find_duplicate_note(db, title, content):
    normalized_title = normalize_duplicate_text(title, lowercase=True)
    normalized_content = normalize_duplicate_text(content, lowercase=False)

    for note in db.query(Note).all():
        existing_content = extract_body(read_markdown(note.file_path))
        if (
            normalize_duplicate_text(note.title, lowercase=True) == normalized_title
            and normalize_duplicate_text(existing_content, lowercase=False) == normalized_content
        ):
            return note, existing_content

    return None, None


def validate_category(category):
    if category not in CATEGORIES:
        raise HTTPException(status_code=400, detail="Invalid category")


def normalize_note_timestamp(value):
    if value is None:
        return None
    if value.tzinfo is not None:
        return value.astimezone(timezone.utc).replace(tzinfo=None)
    # Existing SQLite values are naive UTC because the backend writes datetime.utcnow()
    # and SQLite CURRENT_TIMESTAMP. Treat incoming naive values the same way.
    return value


def serialize_note_timestamp(value):
    normalized = normalize_note_timestamp(value)
    if normalized is None:
        return None
    return normalized.replace(tzinfo=timezone.utc).isoformat().replace("+00:00", "Z")


def note_response_dict(note, content):
    return {
        "id": note.id,
        "title": note.title,
        "category": note.category,
        "tags": note.tags,
        "source": note.source,
        "file_path": note.file_path,
        "content": content,
        "created_at": serialize_note_timestamp(note.created_at),
        "updated_at": serialize_note_timestamp(note.updated_at),
    }


def note_page_response_dict(page):
    return {
        "id": page.id,
        "note_id": page.note_id,
        "title": page.title,
        "tags": page.tags,
        "content": page.content or "",
        "position": page.position or 0,
        "created_at": serialize_note_timestamp(page.created_at),
        "updated_at": serialize_note_timestamp(page.updated_at),
    }


def add_permanent_tags(tags):
    values = [t.strip() for t in (tags or "").split(",") if t.strip()]
    lower = {t.lower() for t in values}
    for tag in ["memory-permanent", "protected"]:
        if tag not in lower:
            values.append(tag)
    return normalize_tags(",".join(values))


def format_search_result(note, score, content):
    body = extract_body(content)
    return {
        "id": note.id,
        "title": note.title,
        "category": note.category,
        "tags": note.tags,
        "source": note.source,
        "score": score,
        "preview": build_preview(body),
        "created_at": serialize_note_timestamp(note.created_at),
        "updated_at": serialize_note_timestamp(note.updated_at)
    }


@router.post("/notes", response_model=NoteResponse | DuplicateNoteResponse, dependencies=WINDOW_AUTH)
def create_note(note_data: NoteBase, db: Session = Depends(get_db)):
    validate_category(note_data.category)
    normalized_tags = normalize_tags(note_data.tags)

    duplicate_note, duplicate_content = find_duplicate_note(db, note_data.title, note_data.content)
    if duplicate_note:
        incoming_created_at = normalize_note_timestamp(note_data.created_at)
        if note_data.source == "mobile" and incoming_created_at is not None:
            if duplicate_note.created_at is None or incoming_created_at != duplicate_note.created_at:
                duplicate_note.created_at = incoming_created_at
                db.commit()
                db.refresh(duplicate_note)
        duplicate_response = note_response_dict(duplicate_note, duplicate_content)
        return {
            "status": "duplicate",
            "existing_id": duplicate_note.id,
            "note": duplicate_response,
        }

    # 1. Insert metadata first with empty file_path
    now_utc = datetime.utcnow()
    created_at = normalize_note_timestamp(note_data.created_at) if note_data.created_at is not None else now_utc
    updated_at = normalize_note_timestamp(note_data.updated_at) if note_data.updated_at is not None else created_at
    db_note = Note(
        title=note_data.title,
        category=note_data.category,
        tags=normalized_tags,
        source=note_data.source,
        file_path="",
        created_at=created_at,
        updated_at=updated_at,
    )
    db.add(db_note)
    db.commit()
    db.refresh(db_note)

    # 2. Generate safe filename using note ID
    file_path = get_safe_filename(db_note.title, db_note.id, db_note.category)

    # 3. Save Markdown file
    markdown = build_markdown(
        db_note.title,
        db_note.category,
        db_note.tags,
        db_note.created_at,
        db_note.updated_at,
        note_data.content
    )
    save_markdown(file_path, markdown)

    # 4. Update file_path in SQLite
    db_note.file_path = file_path
    db.commit()
    db.refresh(db_note)

    return note_response_dict(db_note, note_data.content)

@router.get("/notes", response_model=List[NoteResponse], dependencies=WINDOW_AUTH)
def get_notes(db: Session = Depends(get_db)):
    notes = db.query(Note).order_by(Note.created_at.desc(), Note.id.desc()).all()
    results = []
    for note in notes:
        content = extract_body(read_markdown(note.file_path))
        results.append(note_response_dict(note, content))
    return results

@router.get("/notes/{id}", response_model=NoteResponse, dependencies=WINDOW_AUTH)
def get_note(id: int, db: Session = Depends(get_db)):
    db_note = db.query(Note).filter(Note.id == id).first()
    if not db_note:
        raise HTTPException(status_code=404, detail="Note not found")

    content = extract_body(read_markdown(db_note.file_path))
    return note_response_dict(db_note, content)


@router.get("/notes/{id}/pages", response_model=List[NotePageResponse], dependencies=WINDOW_AUTH)
def list_note_pages(id: int, db: Session = Depends(get_db)):
    db_note = db.query(Note).filter(Note.id == id).first()
    if not db_note:
        raise HTTPException(status_code=404, detail="Note not found")
    pages = db.query(NotePage).filter(NotePage.note_id == id).order_by(NotePage.position.asc(), NotePage.id.asc()).all()
    return [note_page_response_dict(page) for page in pages]


@router.post("/notes/{id}/pages", response_model=NotePageResponse, status_code=201, dependencies=WINDOW_AUTH)
def create_note_page(id: int, page_data: NotePageBase, db: Session = Depends(get_db)):
    db_note = db.query(Note).filter(Note.id == id).first()
    if not db_note:
        raise HTTPException(status_code=404, detail="Note not found")
    now_utc = datetime.utcnow()
    position = db.query(NotePage).filter(NotePage.note_id == id).count() + 1
    page = NotePage(
        note_id=id,
        title=page_data.title,
        tags=normalize_tags(page_data.tags),
        content=page_data.content,
        position=position,
        created_at=now_utc,
        updated_at=now_utc,
    )
    db.add(page)
    db.commit()
    db.refresh(page)
    return note_page_response_dict(page)


@router.put("/notes/{id}/pages/{page_id}", response_model=NotePageResponse, dependencies=WINDOW_AUTH)
def update_note_page(id: int, page_id: int, page_data: NotePageBase, db: Session = Depends(get_db)):
    page = db.query(NotePage).filter(NotePage.id == page_id, NotePage.note_id == id).first()
    if not page:
        raise HTTPException(status_code=404, detail="Note page not found")
    if is_protected(page.tags):
        raise HTTPException(status_code=403, detail="This note page is protected and cannot be edited.")
    page.title = page_data.title
    page.tags = normalize_tags(page_data.tags)
    page.content = page_data.content
    page.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(page)
    return note_page_response_dict(page)


@router.delete("/notes/{id}/pages/{page_id}", status_code=204, dependencies=WINDOW_AUTH)
def delete_note_page(id: int, page_id: int, db: Session = Depends(get_db), force: bool = Query(False)):
    page = db.query(NotePage).filter(NotePage.id == page_id, NotePage.note_id == id).first()
    if not page:
        raise HTTPException(status_code=404, detail="Note page not found")
    if not force and is_protected(page.tags):
        raise HTTPException(status_code=403, detail="This note page is protected and cannot be deleted through normal means.")
    db.delete(page)
    db.commit()


@router.post("/notes/{id}/make-permanent", response_model=NoteResponse, dependencies=WINDOW_AUTH)
def make_note_permanent(id: int, db: Session = Depends(get_db)):
    db_note = db.query(Note).filter(Note.id == id).first()
    if not db_note:
        raise HTTPException(status_code=404, detail="Note not found")
    content = extract_body(read_markdown(db_note.file_path)) if os.path.exists(db_note.file_path) else ""
    db_note.tags = add_permanent_tags(db_note.tags)
    db_note.updated_at = datetime.utcnow()
    markdown = build_markdown(db_note.title, db_note.category, db_note.tags, db_note.created_at, db_note.updated_at, content)
    save_markdown(db_note.file_path, markdown)
    db.commit()
    db.refresh(db_note)
    return note_response_dict(db_note, content)


@router.post("/notes/{id}/pages/{page_id}/make-permanent", response_model=NotePageResponse, dependencies=WINDOW_AUTH)
def make_note_page_permanent(id: int, page_id: int, db: Session = Depends(get_db)):
    page = db.query(NotePage).filter(NotePage.id == page_id, NotePage.note_id == id).first()
    if not page:
        raise HTTPException(status_code=404, detail="Note page not found")
    page.tags = add_permanent_tags(page.tags)
    page.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(page)
    return note_page_response_dict(page)

@router.put("/notes/{id}", response_model=NoteResponse, dependencies=WINDOW_AUTH)
def update_note(id: int, note_data: NoteBase, db: Session = Depends(get_db)):
    validate_category(note_data.category)
    normalized_tags = normalize_tags(note_data.tags)

    db_note = db.query(Note).filter(Note.id == id).first()
    if not db_note:
        raise HTTPException(status_code=404, detail="Note not found")

    if is_protected(db_note.tags):
        raise HTTPException(status_code=403, detail="This note is protected and cannot be edited.")

    old_file_path = db_note.file_path
    old_content = extract_body(read_markdown(old_file_path)) if os.path.exists(old_file_path) else ""

    title_changed = db_note.title != note_data.title
    category_changed = db_note.category != note_data.category
    tags_changed = db_note.tags != normalized_tags
    content_changed = old_content != note_data.content

    has_changes = title_changed or category_changed or tags_changed or content_changed

    # Update metadata only if changed
    if title_changed:
        db_note.title = note_data.title
    if category_changed:
        db_note.category = note_data.category
    if tags_changed:
        db_note.tags = normalized_tags
    if note_data.source is not None and db_note.source != note_data.source:
        db_note.source = note_data.source
        has_changes = True

    new_file_path = old_file_path
    if title_changed or category_changed:
        new_file_path = get_safe_filename(db_note.title, db_note.id, db_note.category)
        if os.path.exists(old_file_path):
            os.rename(old_file_path, new_file_path)

    if has_changes:
        db_note.updated_at = datetime.utcnow()
        markdown = build_markdown(
            db_note.title,
            db_note.category,
            db_note.tags,
            db_note.created_at,
            db_note.updated_at,
            note_data.content
        )
        save_markdown(new_file_path, markdown)
        db_note.file_path = new_file_path

    db.commit()
    db.refresh(db_note)

    content = note_data.content if has_changes else old_content
    return note_response_dict(db_note, content)

@router.delete("/notes/{id}", dependencies=WINDOW_AUTH)
def delete_note(id: int, db: Session = Depends(get_db), force: bool = Query(False)):
    db_note = db.query(Note).filter(Note.id == id).first()
    if not db_note:
        raise HTTPException(status_code=404, detail="Note not found")

    if not force and is_protected(db_note.tags):
        raise HTTPException(status_code=403, detail="This note is protected and cannot be deleted through normal means. Use `delete-permanent` via CLI.")

    delete_markdown(db_note.file_path)
    db.delete(db_note)
    db.commit()
    return {"detail": "Note deleted"}

@router.get("/search", dependencies=WINDOW_AUTH)
def search_notes(q: str = Query(...), db: Session = Depends(get_db)):
    notes = db.query(Note).all()
    notes_with_content = []
    for note in notes:
        content = read_markdown(note.file_path)
        notes_with_content.append((note, extract_body(content)))

    results = perform_search(q, notes_with_content)[:10]

    return [
        format_search_result(r["note"], r["score"], r["content"])
        for r in results
    ]

@router.get("/export", dependencies=WINDOW_AUTH)
def export_brain():
    # Ensure backups dir
    if not os.path.exists(BACKUPS_DIR):
        os.makedirs(BACKUPS_DIR)
        
    zip_buffer = BytesIO()
    with zipfile.ZipFile(zip_buffer, "a", zipfile.ZIP_DEFLATED, False) as zip_file:
        # Add DB
        if os.path.exists(DB_PATH):
            zip_file.write(DB_PATH, arcname="brain.db")
            
        # Add Notes
        for root, dirs, files in os.walk(NOTES_DIR):
            for file in files:
                file_path = os.path.join(root, file)
                # Skip files larger than 10MB
                if os.path.getsize(file_path) < 10 * 1024 * 1024:
                    arcname = os.path.relpath(file_path, NOTES_DIR)
                    zip_file.write(file_path, arcname=os.path.join("notes", arcname))
                    
    zip_buffer.seek(0)
    
    # Save to backups for record (optional, but requested in plan)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_path = os.path.join(BACKUPS_DIR, f"brain_export_{timestamp}.zip")
    with open(backup_path, "wb") as f:
        f.write(zip_buffer.getvalue())
        
    return Response(
        content=zip_buffer.getvalue(),
        media_type="application/zip",
        headers={
            "Content-Disposition": f"attachment; filename=brain_export_{timestamp}.zip"
        }
    )

@router.post("/ask", dependencies=WINDOW_AUTH)
def ask_brain(request: AskRequest, db: Session = Depends(get_db)):
    notes = db.query(Note).all()
    notes_with_content = []
    for note in notes:
        content = read_markdown(note.file_path)
        notes_with_content.append((note, extract_body(content)))

    results = perform_search(request.question, notes_with_content)[:10]
    matched_notes = [
        format_search_result(r["note"], r["score"], r["content"])
        for r in results
    ]

    count = len(matched_notes)
    if count == 0:
        answer = "I could not find anything about that in your saved notes yet."
    else:
        top = matched_notes[0]
        if count == 1:
            answer = (
                f"I found 1 relevant note. The strongest match is "
                f"'{top['title']}' in {top['category'] or 'Uncategorized'}. "
                f"It says: \"{top['preview']}\""
            )
        else:
            lines = [f"I found {count} relevant notes:"]
            for i, n in enumerate(matched_notes[:3], 1):
                preview = (n['preview'] or '')[:80].strip()
                if preview:
                    lines.append(f"{i}. {n['title']} — {preview}")
                else:
                    lines.append(f"{i}. {n['title']}")
            if count > 3:
                lines.append(f"... and {count - 3} more.")
            answer = "\n".join(lines)

    return {
        "mode": "local",
        "answer": answer,
        "matched_notes": matched_notes
    }


def _require_local_host(request: Request):
    host = request.client.host if request.client else ""
    if host not in ("127.0.0.1", "::1", "localhost"):
        raise HTTPException(
            status_code=403,
            detail="Core Space is only available from this PC."
        )


CORE_TOKENS: dict = {}
TOKEN_LIFETIME = 1800
CORE_ROOT = os.environ.get("MEGAMIND_CORE_ROOT", r"C:\Users\Sm1th\MegaMindCore")
CORE_DB = os.path.join(CORE_ROOT, "private.db")
CORE_NOTES_DIR = os.path.join(CORE_ROOT, "notes")


def _get_core_note_db():
    if not os.path.isfile(CORE_DB):
        return None
    conn = sqlite3.connect(CORE_DB)
    conn.row_factory = sqlite3.Row
    return conn


def _get_core_token(
    x_core_token: Optional[str] = Header(None, alias="X-Core-Token")
) -> str:
    if not x_core_token or x_core_token not in CORE_TOKENS:
        raise HTTPException(status_code=401, detail="Invalid or expired Core token")
    expiry = CORE_TOKENS[x_core_token]
    if time.time() > expiry:
        del CORE_TOKENS[x_core_token]
        raise HTTPException(status_code=401, detail="Core token expired")
    return x_core_token


class CoreUnlockRequest(BaseModel):
    password: str


class CoreUnlockResponse(BaseModel):
    unlocked: bool
    token: str


class CoreStatusResponse(BaseModel):
    unlocked: bool
    message: str


@router.post("/core/unlock")
def core_unlock(core_request: CoreUnlockRequest, request: Request = Depends(_require_local_host)):
    password_hash = os.environ.get("MEGAMIND_CORE_PASSWORD_HASH")
    if not password_hash:
        raise HTTPException(status_code=503, detail="Core password is not configured")
    computed = hashlib.sha256(core_request.password.encode()).hexdigest()
    if not hmac.compare_digest(computed, password_hash):
        raise HTTPException(status_code=401, detail="Invalid Core password")
    token = secrets.token_hex(32)
    CORE_TOKENS[token] = time.time() + TOKEN_LIFETIME
    return CoreUnlockResponse(unlocked=True, token=token)


@router.get("/core/status")
def core_status(
    token: str = Depends(_get_core_token),
    request: Request = Depends(_require_local_host)
):
    return CoreStatusResponse(
        unlocked=True,
        message="Core Space unlocked. Read-only Core notes are available."
    )


@router.get("/core/notes")
def get_core_notes(
    token: str = Depends(_get_core_token),
    request: Request = Depends(_require_local_host)
):
    conn = _get_core_note_db()
    if conn is None:
        raise HTTPException(status_code=503, detail="Core storage is not configured")
    try:
        rows = conn.execute(
            "SELECT id, original_window_id, title, category, tags, "
            "imported_at, created_at, updated_at, migration_batch_id, is_sensitive "
            "FROM core_notes ORDER BY created_at DESC, id DESC"
        ).fetchall()
        notes = [dict(r) for r in rows]
        return notes
    finally:
        conn.close()


@router.get("/core/notes/{note_id}")
def get_core_note(
    note_id: int,
    token: str = Depends(_get_core_token),
    request: Request = Depends(_require_local_host)
):
    conn = _get_core_note_db()
    if conn is None:
        raise HTTPException(status_code=503, detail="Core storage is not configured")
    try:
        row = conn.execute(
            "SELECT * FROM core_notes WHERE id=?", (note_id,)
        ).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Core note not found")
        note = dict(row)
        file_path = note.get("file_path", "")
        if not file_path or not os.path.isfile(file_path):
            raise HTTPException(status_code=404, detail="Core note file not found")
        with open(file_path, "r", encoding="utf-8", errors="replace") as f:
            note["content"] = f.read()
        return note
    finally:
        conn.close()


@router.post("/core/lock")
def core_lock(
    token: str = Depends(_get_core_token),
    request: Request = Depends(_require_local_host)
):
    if token in CORE_TOKENS:
        del CORE_TOKENS[token]
    return {"unlocked": False, "message": "Core Space locked."}
