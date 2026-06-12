import os
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from .database import get_db
from .models import Session, SessionPage
from .session_utils import (
    ensure_session_dirs, build_session_markdown, extract_session_body,
    get_safe_session_filename, save_session_markdown, read_session_markdown,
    delete_session_markdown,
)
from .utils import normalize_tags, is_protected
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone

router = APIRouter()


class SessionBase(BaseModel):
    title: str
    agent: Optional[str] = None
    project: Optional[str] = None
    tags: Optional[str] = None
    content: str


class SessionResponse(BaseModel):
    id: int
    title: str
    agent: Optional[str]
    project: Optional[str]
    tags: Optional[str]
    file_path: Optional[str]
    content: str
    created_at: str
    updated_at: str

    class Config:
        from_attributes = True


class SessionPageBase(BaseModel):
    title: str
    tags: Optional[str] = None
    content: str


class SessionPageResponse(BaseModel):
    id: int
    session_id: int
    title: str
    tags: Optional[str]
    content: str
    position: int
    created_at: str
    updated_at: str

    class Config:
        from_attributes = True


def _session_response_dict(session, content):
    def dt_str(v):
        if v is None:
            return None
        return v.replace(tzinfo=timezone.utc).isoformat().replace("+00:00", "Z") if v.tzinfo is None else v.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
    return {
        "id": session.id,
        "title": session.title,
        "agent": session.agent,
        "project": session.project,
        "tags": session.tags,
        "file_path": session.file_path,
        "content": content or "",
        "created_at": dt_str(session.created_at),
        "updated_at": dt_str(session.updated_at),
    }


def _dt_str(v):
    if v is None:
        return None
    return v.replace(tzinfo=timezone.utc).isoformat().replace("+00:00", "Z") if v.tzinfo is None else v.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def _session_page_response_dict(page):
    return {
        "id": page.id,
        "session_id": page.session_id,
        "title": page.title,
        "tags": page.tags,
        "content": page.content or "",
        "position": page.position or 0,
        "created_at": _dt_str(page.created_at),
        "updated_at": _dt_str(page.updated_at),
    }


def _add_permanent_tags(tags):
    values = [t.strip() for t in (tags or "").split(",") if t.strip()]
    lower = {t.lower() for t in values}
    for tag in ["memory-permanent", "protected"]:
        if tag not in lower:
            values.append(tag)
    return normalize_tags(",".join(values))


@router.get("/sessions")
def list_sessions(db: Session = Depends(get_db)):
    sessions = db.query(Session).order_by(Session.updated_at.desc()).all()
    result = []
    for s in sessions:
        content = read_session_markdown(s.file_path) if s.file_path else ""
        body = extract_session_body(content) if "---" in content else content
        result.append(_session_response_dict(s, body))
    return result


@router.get("/sessions/search")
def search_sessions(q: str, db: Session = Depends(get_db)):
    if not q.strip():
        return []
    results = []
    sessions = db.query(Session).order_by(Session.updated_at.desc()).all()
    q_lower = q.lower()
    for s in sessions:
        content = read_session_markdown(s.file_path) if s.file_path else ""
        body = extract_session_body(content) if "---" in content else content
        score = 0
        if q_lower in s.title.lower():
            score += 10
        if s.agent and q_lower in s.agent.lower():
            score += 6
        if s.project and q_lower in s.project.lower():
            score += 5
        if s.tags and q_lower in s.tags.lower():
            score += 4
        if q_lower in body.lower():
            score += 3
        if score > 0:
            results.append({
                "id": s.id,
                "title": s.title,
                "agent": s.agent,
                "project": s.project,
                "tags": s.tags,
                "score": score,
                "preview": body[:200],
            })
    results.sort(key=lambda r: -r["score"])
    return results


@router.get("/sessions/{session_id}")
def get_session(session_id: int, db: Session = Depends(get_db)):
    s = db.query(Session).filter(Session.id == session_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Session not found")
    content = read_session_markdown(s.file_path) if s.file_path else ""
    body = extract_session_body(content) if "---" in content else content
    return _session_response_dict(s, body)


@router.get("/sessions/{session_id}/pages", response_model=list[SessionPageResponse])
def list_session_pages(session_id: int, db: Session = Depends(get_db)):
    s = db.query(Session).filter(Session.id == session_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Session not found")
    pages = db.query(SessionPage).filter(SessionPage.session_id == session_id).order_by(SessionPage.position.asc(), SessionPage.id.asc()).all()
    return [_session_page_response_dict(page) for page in pages]


@router.post("/sessions/{session_id}/pages", response_model=SessionPageResponse, status_code=201)
def create_session_page(session_id: int, data: SessionPageBase, db: Session = Depends(get_db)):
    s = db.query(Session).filter(Session.id == session_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Session not found")
    now_utc = datetime.utcnow()
    position = db.query(SessionPage).filter(SessionPage.session_id == session_id).count() + 1
    page = SessionPage(
        session_id=session_id,
        title=data.title,
        tags=normalize_tags(data.tags),
        content=data.content,
        position=position,
        created_at=now_utc,
        updated_at=now_utc,
    )
    db.add(page)
    db.commit()
    db.refresh(page)
    return _session_page_response_dict(page)


@router.put("/sessions/{session_id}/pages/{page_id}", response_model=SessionPageResponse)
def update_session_page(session_id: int, page_id: int, data: SessionPageBase, db: Session = Depends(get_db)):
    page = db.query(SessionPage).filter(SessionPage.id == page_id, SessionPage.session_id == session_id).first()
    if not page:
        raise HTTPException(status_code=404, detail="Session page not found")
    if is_protected(page.tags):
        raise HTTPException(status_code=403, detail="This session page is protected and cannot be edited.")
    page.title = data.title
    page.tags = normalize_tags(data.tags)
    page.content = data.content
    page.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(page)
    return _session_page_response_dict(page)


@router.delete("/sessions/{session_id}/pages/{page_id}", status_code=204)
def delete_session_page(session_id: int, page_id: int, db: Session = Depends(get_db), force: bool = Query(False)):
    page = db.query(SessionPage).filter(SessionPage.id == page_id, SessionPage.session_id == session_id).first()
    if not page:
        raise HTTPException(status_code=404, detail="Session page not found")
    if not force and is_protected(page.tags):
        raise HTTPException(status_code=403, detail="This session page is protected and cannot be deleted through normal means.")
    db.delete(page)
    db.commit()


@router.post("/sessions/{session_id}/make-permanent")
def make_session_permanent(session_id: int, db: Session = Depends(get_db)):
    s = db.query(Session).filter(Session.id == session_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Session not found")
    content = read_session_markdown(s.file_path) if s.file_path else ""
    body = extract_session_body(content) if "---" in content else content
    s.tags = _add_permanent_tags(s.tags)
    s.updated_at = datetime.utcnow()
    markdown = build_session_markdown(s.title, s.agent, s.project, s.tags, s.created_at, s.updated_at, body)
    save_session_markdown(s.file_path, markdown)
    db.commit()
    db.refresh(s)
    return _session_response_dict(s, body)


@router.post("/sessions/{session_id}/pages/{page_id}/make-permanent", response_model=SessionPageResponse)
def make_session_page_permanent(session_id: int, page_id: int, db: Session = Depends(get_db)):
    page = db.query(SessionPage).filter(SessionPage.id == page_id, SessionPage.session_id == session_id).first()
    if not page:
        raise HTTPException(status_code=404, detail="Session page not found")
    page.tags = _add_permanent_tags(page.tags)
    page.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(page)
    return _session_page_response_dict(page)


@router.post("/sessions")
def create_session(data: SessionBase, db: Session = Depends(get_db)):
    ensure_session_dirs()
    normalized_tags = normalize_tags(data.tags)
    now_utc = datetime.utcnow()
    db_session = Session(
        title=data.title,
        agent=data.agent,
        project=data.project,
        tags=normalized_tags,
        file_path="",
        created_at=now_utc,
        updated_at=now_utc,
    )
    db.add(db_session)
    db.commit()
    db.refresh(db_session)

    file_path = get_safe_session_filename(db_session.title, db_session.id)
    markdown = build_session_markdown(
        db_session.title,
        db_session.agent,
        db_session.project,
        db_session.tags,
        db_session.created_at,
        db_session.updated_at,
        data.content
    )
    save_session_markdown(file_path, markdown)

    db_session.file_path = file_path
    db.commit()
    db.refresh(db_session)

    return _session_response_dict(db_session, data.content)


@router.put("/sessions/{session_id}")
def update_session(session_id: int, data: SessionBase, db: Session = Depends(get_db)):
    s = db.query(Session).filter(Session.id == session_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Session not found")
    if is_protected(s.tags):
        raise HTTPException(status_code=403, detail="This session is protected and cannot be edited.")
    normalized_tags = normalize_tags(data.tags)
    now_utc = datetime.utcnow()

    s.title = data.title
    s.agent = data.agent
    s.project = data.project
    s.tags = normalized_tags
    s.updated_at = now_utc
    db.commit()
    db.refresh(s)

    markdown = build_session_markdown(
        s.title, s.agent, s.project, s.tags,
        s.created_at, s.updated_at, data.content
    )
    save_session_markdown(s.file_path, markdown)

    return _session_response_dict(s, data.content)


@router.delete("/sessions/{session_id}")
def delete_session(session_id: int, db: Session = Depends(get_db), force: bool = Query(False)):
    s = db.query(Session).filter(Session.id == session_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Session not found")

    if not force and is_protected(s.tags):
        raise HTTPException(status_code=403, detail="This session is protected and cannot be deleted through normal means. Use `delete-permanent` via CLI.")

    delete_session_markdown(s.file_path)
    db.delete(s)
    db.commit()
    return {"detail": "Session deleted"}
