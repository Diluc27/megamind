from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from .database import get_db
from .models import Claud, ClaudPage
from .utils import normalize_tags, is_protected
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone

router = APIRouter()


class ClaudBase(BaseModel):
    title: str
    agent: Optional[str] = None
    tags: Optional[str] = None
    content: str


class ClaudResponse(BaseModel):
    id: int
    title: str
    agent: Optional[str]
    tags: Optional[str]
    content: str
    created_at: str
    updated_at: str

    class Config:
        from_attributes = True


class ClaudPageBase(BaseModel):
    title: str
    tags: Optional[str] = None
    content: str


class ClaudPageResponse(BaseModel):
    id: int
    claud_id: int
    title: str
    tags: Optional[str]
    content: str
    position: int
    created_at: str
    updated_at: str

    class Config:
        from_attributes = True


def _dt_str(v):
    if v is None:
        return None
    return v.replace(tzinfo=timezone.utc).isoformat().replace("+00:00", "Z") if v.tzinfo is None else v.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def _response_dict(claud_row, content):
    return {
        "id": claud_row.id,
        "title": claud_row.title,
        "agent": claud_row.agent,
        "tags": claud_row.tags,
        "content": content or "",
        "created_at": _dt_str(claud_row.created_at),
        "updated_at": _dt_str(claud_row.updated_at),
    }


def _page_response_dict(page):
    return {
        "id": page.id,
        "claud_id": page.claud_id,
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


@router.get("/claud")
def list_claud(db: Session = Depends(get_db)):
    rows = db.query(Claud).order_by(Claud.updated_at.desc()).all()
    return [_response_dict(r, r.content or "") for r in rows]


@router.get("/claud/{claud_id}")
def get_claud(claud_id: int, db: Session = Depends(get_db)):
    row = db.query(Claud).filter(Claud.id == claud_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Claud note not found")
    return _response_dict(row, row.content or "")


@router.post("/claud/{claud_id}/make-permanent", response_model=ClaudResponse)
def make_claud_permanent(claud_id: int, db: Session = Depends(get_db)):
    row = db.query(Claud).filter(Claud.id == claud_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Claud note not found")
    row.tags = _add_permanent_tags(row.tags)
    row.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(row)
    return _response_dict(row, row.content or "")


@router.get("/claud/{claud_id}/pages", response_model=list[ClaudPageResponse])
def list_claud_pages(claud_id: int, db: Session = Depends(get_db)):
    row = db.query(Claud).filter(Claud.id == claud_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Claud note not found")
    pages = db.query(ClaudPage).filter(ClaudPage.claud_id == claud_id).order_by(ClaudPage.position.asc(), ClaudPage.id.asc()).all()
    return [_page_response_dict(page) for page in pages]


@router.post("/claud/{claud_id}/pages", response_model=ClaudPageResponse, status_code=201)
def create_claud_page(claud_id: int, data: ClaudPageBase, db: Session = Depends(get_db)):
    row = db.query(Claud).filter(Claud.id == claud_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Claud note not found")
    now_utc = datetime.utcnow()
    position = db.query(ClaudPage).filter(ClaudPage.claud_id == claud_id).count() + 1
    page = ClaudPage(
        claud_id=claud_id,
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
    return _page_response_dict(page)


@router.put("/claud/{claud_id}/pages/{page_id}", response_model=ClaudPageResponse)
def update_claud_page(claud_id: int, page_id: int, data: ClaudPageBase, db: Session = Depends(get_db)):
    page = db.query(ClaudPage).filter(ClaudPage.id == page_id, ClaudPage.claud_id == claud_id).first()
    if not page:
        raise HTTPException(status_code=404, detail="Claud page not found")
    if is_protected(page.tags):
        raise HTTPException(status_code=403, detail="This Claud page is protected and cannot be edited.")
    page.title = data.title
    page.tags = normalize_tags(data.tags)
    page.content = data.content
    page.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(page)
    return _page_response_dict(page)


@router.delete("/claud/{claud_id}/pages/{page_id}", status_code=204)
def delete_claud_page(claud_id: int, page_id: int, db: Session = Depends(get_db), force: bool = Query(False)):
    page = db.query(ClaudPage).filter(ClaudPage.id == page_id, ClaudPage.claud_id == claud_id).first()
    if not page:
        raise HTTPException(status_code=404, detail="Claud page not found")
    if not force and is_protected(page.tags):
        raise HTTPException(status_code=403, detail="This Claud page is protected and cannot be deleted through normal means.")
    db.delete(page)
    db.commit()


@router.post("/claud/{claud_id}/pages/{page_id}/make-permanent", response_model=ClaudPageResponse)
def make_claud_page_permanent(claud_id: int, page_id: int, db: Session = Depends(get_db)):
    page = db.query(ClaudPage).filter(ClaudPage.id == page_id, ClaudPage.claud_id == claud_id).first()
    if not page:
        raise HTTPException(status_code=404, detail="Claud page not found")
    page.tags = _add_permanent_tags(page.tags)
    page.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(page)
    return _page_response_dict(page)


@router.post("/claud", status_code=201)
def create_claud(data: ClaudBase, db: Session = Depends(get_db)):
    normalized_tags = normalize_tags(data.tags)
    now_utc = datetime.utcnow()
    row = Claud(
        title=data.title,
        agent=data.agent,
        tags=normalized_tags,
        content=data.content,
        file_path="",
        created_at=now_utc,
        updated_at=now_utc,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _response_dict(row, data.content)


@router.put("/claud/{claud_id}")
def update_claud(claud_id: int, data: ClaudBase, db: Session = Depends(get_db)):
    row = db.query(Claud).filter(Claud.id == claud_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Claud note not found")
    if is_protected(row.tags):
        raise HTTPException(status_code=403, detail="This Claud note is protected and cannot be edited.")
    normalized_tags = normalize_tags(data.tags)
    now_utc = datetime.utcnow()
    row.title = data.title
    row.agent = data.agent
    row.tags = normalized_tags
    row.content = data.content
    row.updated_at = now_utc
    db.commit()
    db.refresh(row)
    return _response_dict(row, data.content)


@router.delete("/claud/{claud_id}", status_code=204)
def delete_claud(claud_id: int, db: Session = Depends(get_db), force: bool = Query(False)):
    row = db.query(Claud).filter(Claud.id == claud_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Claud note not found")
    if not force and is_protected(row.tags):
        raise HTTPException(status_code=403, detail="This Claud note is protected and cannot be deleted through normal means. Use `delete-permanent` via CLI.")
    db.delete(row)
    db.commit()
