"""
shelfd_routes.py — Shelfd Space for MegaMind
Handles projects synced from the Shelfd Flutter app.
All endpoints require X-API-Key header (validated via shared middleware).
"""

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session
from datetime import datetime, timezone
from typing import Optional, List

from .database import get_db
from .auth import require_api_key
from .models import ShelfdProject, ShelfdPage
from .utils import normalize_tags, is_protected

router = APIRouter(prefix="/shelfd", tags=["shelfd"])

# ─────────────────────────────────────────────
# Pydantic schemas
# ─────────────────────────────────────────────
from pydantic import BaseModel

class ShelfdProjectIn(BaseModel):
    id: str                          # UUID generated on device
    title: str
    summary: Optional[str] = None
    key_ideas: Optional[List[str]] = []
    action_items: Optional[List[str]] = []
    sections: Optional[List[dict]] = []
    raw_text: Optional[str] = None
    storage_mode: str = "synced"     # "local_only" | "synced" | "cloud_only" | "saved"
    updated_at: str                  # ISO-8601 from device

class ShelfdProjectPatch(BaseModel):
    id: Optional[str] = None
    title: Optional[str] = None
    summary: Optional[str] = None
    key_ideas: Optional[List[str]] = None
    action_items: Optional[List[str]] = None
    sections: Optional[List[dict]] = None
    raw_text: Optional[str] = None
    storage_mode: Optional[str] = None
    updated_at: str

class ShelfdProjectOut(ShelfdProjectIn):
    created_at: str
    server_updated_at: str
    structured: bool = False
    structured_at: Optional[str] = None
    deleted: bool = False


class ShelfdPageBase(BaseModel):
    title: str
    tags: Optional[str] = None
    content: str


class ShelfdPageOut(BaseModel):
    id: int
    project_id: str
    title: str
    tags: Optional[str] = None
    content: str
    position: int
    created_at: str
    updated_at: str

class BulkSyncRequest(BaseModel):
    projects: List[ShelfdProjectIn]
    device_id: Optional[str] = None

class BulkSyncResponse(BaseModel):
    upserted: List[str]              # IDs written to server
    conflicts_resolved: List[str]    # IDs where server kept its version
    server_updates: List[ShelfdProjectOut]  # Projects device should pull

# ─────────────────────────────────────────────
# Helper
# ─────────────────────────────────────────────
def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()

def _project_to_out(p) -> ShelfdProjectOut:
    return ShelfdProjectOut(
        id=p.id,
        title=p.title,
        summary=p.summary,
        key_ideas=p.key_ideas or [],
        action_items=p.action_items or [],
        sections=p.sections or [],
        raw_text=p.raw_text,
        storage_mode=p.storage_mode,
        updated_at=p.updated_at,
        created_at=p.created_at,
        server_updated_at=p.server_updated_at,
        structured=p.structured or False,
        structured_at=p.structured_at,
        deleted=p.deleted or False,
    )


def _page_to_out(page) -> ShelfdPageOut:
    def dt_str(v):
        if v is None:
            return None
        return v.replace(tzinfo=timezone.utc).isoformat().replace("+00:00", "Z") if v.tzinfo is None else v.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")

    return ShelfdPageOut(
        id=page.id,
        project_id=page.project_id,
        title=page.title,
        tags=page.tags,
        content=page.content or "",
        position=page.position or 0,
        created_at=dt_str(page.created_at),
        updated_at=dt_str(page.updated_at),
    )


def _add_permanent_tags(tags):
    values = [t.strip() for t in (tags or "").split(",") if t.strip()]
    lower = {t.lower() for t in values}
    for tag in ["memory-permanent", "protected"]:
        if tag not in lower:
            values.append(tag)
    return normalize_tags(",".join(values))

# ─────────────────────────────────────────────
# Routes
# ─────────────────────────────────────────────

@router.get("/projects", response_model=List[ShelfdProjectOut])
def list_projects(
    db: Session = Depends(get_db),
    _: None = Depends(require_api_key),
):
    """Return all non-deleted projects."""
    rows = db.query(ShelfdProject).filter(ShelfdProject.deleted == False).all()
    return [_project_to_out(r) for r in rows]


@router.get("/projects/{project_id}", response_model=ShelfdProjectOut)
def get_project(
    project_id: str,
    db: Session = Depends(get_db),
    _: None = Depends(require_api_key),
):
    p = db.query(ShelfdProject).filter(
        ShelfdProject.id == project_id,
        ShelfdProject.deleted == False,
    ).first()
    if not p:
        raise HTTPException(status_code=404, detail="Project not found")
    return _project_to_out(p)


@router.get("/projects/{project_id}/pages", response_model=List[ShelfdPageOut])
def list_project_pages(
    project_id: str,
    db: Session = Depends(get_db),
    _: None = Depends(require_api_key),
):
    p = db.query(ShelfdProject).filter(ShelfdProject.id == project_id, ShelfdProject.deleted == False).first()
    if not p:
        raise HTTPException(status_code=404, detail="Project not found")
    pages = db.query(ShelfdPage).filter(ShelfdPage.project_id == project_id).order_by(ShelfdPage.position.asc(), ShelfdPage.id.asc()).all()
    return [_page_to_out(page) for page in pages]


@router.post("/projects/{project_id}/pages", response_model=ShelfdPageOut, status_code=201)
def create_project_page(
    project_id: str,
    body: ShelfdPageBase,
    db: Session = Depends(get_db),
    _: None = Depends(require_api_key),
):
    p = db.query(ShelfdProject).filter(ShelfdProject.id == project_id, ShelfdProject.deleted == False).first()
    if not p:
        raise HTTPException(status_code=404, detail="Project not found")
    now_utc = datetime.utcnow()
    position = db.query(ShelfdPage).filter(ShelfdPage.project_id == project_id).count() + 1
    page = ShelfdPage(
        project_id=project_id,
        title=body.title,
        tags=normalize_tags(body.tags),
        content=body.content,
        position=position,
        created_at=now_utc,
        updated_at=now_utc,
    )
    db.add(page)
    db.commit()
    db.refresh(page)
    return _page_to_out(page)


@router.put("/projects/{project_id}/pages/{page_id}", response_model=ShelfdPageOut)
def update_project_page(
    project_id: str,
    page_id: int,
    body: ShelfdPageBase,
    db: Session = Depends(get_db),
    _: None = Depends(require_api_key),
):
    page = db.query(ShelfdPage).filter(ShelfdPage.id == page_id, ShelfdPage.project_id == project_id).first()
    if not page:
        raise HTTPException(status_code=404, detail="Shelfd page not found")
    if is_protected(page.tags):
        raise HTTPException(status_code=403, detail="This Shelfd page is protected and cannot be edited.")
    page.title = body.title
    page.tags = normalize_tags(body.tags)
    page.content = body.content
    page.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(page)
    return _page_to_out(page)


@router.delete("/projects/{project_id}/pages/{page_id}", status_code=204)
def delete_project_page(
    project_id: str,
    page_id: int,
    db: Session = Depends(get_db),
    force: bool = Query(False),
    _: None = Depends(require_api_key),
):
    page = db.query(ShelfdPage).filter(ShelfdPage.id == page_id, ShelfdPage.project_id == project_id).first()
    if not page:
        raise HTTPException(status_code=404, detail="Shelfd page not found")
    if not force and is_protected(page.tags):
        raise HTTPException(status_code=403, detail="This Shelfd page is protected and cannot be deleted through normal means.")
    db.delete(page)
    db.commit()


@router.post("/projects/{project_id}/make-permanent", response_model=ShelfdProjectOut)
def make_project_permanent(
    project_id: str,
    db: Session = Depends(get_db),
    _: None = Depends(require_api_key),
):
    p = db.query(ShelfdProject).filter(ShelfdProject.id == project_id, ShelfdProject.deleted == False).first()
    if not p:
        raise HTTPException(status_code=404, detail="Project not found")
    p.storage_mode = "saved"
    p.server_updated_at = _now_iso()
    db.commit()
    db.refresh(p)
    return _project_to_out(p)


@router.post("/projects/{project_id}/pages/{page_id}/make-permanent", response_model=ShelfdPageOut)
def make_project_page_permanent(
    project_id: str,
    page_id: int,
    db: Session = Depends(get_db),
    _: None = Depends(require_api_key),
):
    page = db.query(ShelfdPage).filter(ShelfdPage.id == page_id, ShelfdPage.project_id == project_id).first()
    if not page:
        raise HTTPException(status_code=404, detail="Shelfd page not found")
    page.tags = _add_permanent_tags(page.tags)
    page.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(page)
    return _page_to_out(page)


@router.post("/projects", response_model=ShelfdProjectOut, status_code=201)
def create_project(
    body: ShelfdProjectIn,
    db: Session = Depends(get_db),
    _: None = Depends(require_api_key),
):
    existing = db.query(ShelfdProject).filter(ShelfdProject.id == body.id).first()
    if existing:
        raise HTTPException(status_code=409, detail="Project ID already exists — use PUT to update")

    now = _now_iso()
    p = ShelfdProject(
        id=body.id,
        title=body.title,
        summary=body.summary,
        key_ideas=body.key_ideas,
        action_items=body.action_items,
        sections=[],
        raw_text=body.raw_text,
        storage_mode=body.storage_mode,
        structured=False,
        structured_at=None,
        updated_at=body.updated_at,
        created_at=now,
        server_updated_at=now,
        deleted=False,
    )
    db.add(p)
    db.commit()
    db.refresh(p)
    return _project_to_out(p)


@router.put("/projects/{project_id}", response_model=ShelfdProjectOut)
def update_project(
    project_id: str,
    body: ShelfdProjectPatch,
    db: Session = Depends(get_db),
    _: None = Depends(require_api_key),
):
    p = db.query(ShelfdProject).filter(ShelfdProject.id == project_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Project not found")

    # Last write wins: compare updated_at timestamps
    if body.updated_at <= p.updated_at:
        # Server version is newer — return server state, device should pull
        return _project_to_out(p)

    fields_set = getattr(body, "model_fields_set", getattr(body, "__fields_set__", set()))
    if "title" in fields_set and body.title is not None:
        p.title = body.title
    if "summary" in fields_set:
        p.summary = body.summary
    if "key_ideas" in fields_set:
        p.key_ideas = body.key_ideas
    if "action_items" in fields_set:
        p.action_items = body.action_items
    if "sections" in fields_set:
        p.sections = body.sections
    if "raw_text" in fields_set:
        p.raw_text = body.raw_text
    if "storage_mode" in fields_set and body.storage_mode is not None:
        p.storage_mode = body.storage_mode
    p.structured = False
    p.structured_at = None
    p.updated_at = body.updated_at
    p.server_updated_at = _now_iso()
    p.deleted = False
    db.commit()
    db.refresh(p)
    return _project_to_out(p)


@router.delete("/projects/{project_id}", status_code=204)
def delete_project(
    project_id: str,
    db: Session = Depends(get_db),
    _: None = Depends(require_api_key),
):
    p = db.query(ShelfdProject).filter(ShelfdProject.id == project_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Project not found")
    if p.storage_mode == "saved":
        raise HTTPException(
            status_code=403,
            detail="Project is saved — unmark as saved in MegaMind before deleting",
        )
    p.deleted = True
    p.server_updated_at = _now_iso()
    db.commit()


@router.post("/sync", response_model=BulkSyncResponse)
def bulk_sync(
    body: BulkSyncRequest,
    since: Optional[str] = Query(default=None, description="ISO-8601 — pull changes after this timestamp"),
    db: Session = Depends(get_db),
    _: None = Depends(require_api_key),
):
    """
    Two-way bulk sync.
    1. Device pushes its projects → server upserts with last-write-wins.
    2. Server returns projects updated since `since` timestamp for device to pull.
    """
    upserted = []
    conflicts_resolved = []

    for proj in body.projects:
        existing = db.query(ShelfdProject).filter(ShelfdProject.id == proj.id).first()

        if not existing:
            # New project — create it
            now = _now_iso()
            row = ShelfdProject(
                id=proj.id,
                title=proj.title,
                summary=proj.summary,
                key_ideas=proj.key_ideas,
                action_items=proj.action_items,
                sections=[],
                raw_text=proj.raw_text,
                storage_mode=proj.storage_mode,
                structured=False,
                structured_at=None,
                updated_at=proj.updated_at,
                created_at=now,
                server_updated_at=now,
                deleted=False,
            )
            db.add(row)
            upserted.append(proj.id)
        else:
            if proj.updated_at > existing.updated_at:
                # Device is newer — accept device version
                existing.title = proj.title
                existing.summary = proj.summary
                existing.key_ideas = proj.key_ideas
                existing.action_items = proj.action_items
                existing.raw_text = proj.raw_text
                existing.storage_mode = proj.storage_mode
                existing.structured = False
                existing.structured_at = None
                existing.updated_at = proj.updated_at
                existing.server_updated_at = _now_iso()
                existing.deleted = False
                upserted.append(proj.id)
            else:
                # Server is newer — conflict resolved in server's favour
                conflicts_resolved.append(proj.id)

    db.commit()

    # Pull: return everything server has that's newer than `since`, including
    # soft-deleted rows so Shelfd can remove them locally.
    query = db.query(ShelfdProject)
    if since:
        query = query.filter(ShelfdProject.server_updated_at > since)
    server_updates = [_project_to_out(p) for p in query.all()]

    return BulkSyncResponse(
        upserted=upserted,
        conflicts_resolved=conflicts_resolved,
        server_updates=server_updates,
    )


@router.get("/sync", response_model=List[ShelfdProjectOut])
def pull_since(
    since: str = Query(..., description="ISO-8601 timestamp — return projects updated after this"),
    db: Session = Depends(get_db),
    _: None = Depends(require_api_key),
):
    """Lightweight pull-only endpoint for periodic background sync."""
    rows = db.query(ShelfdProject).filter(
        ShelfdProject.server_updated_at > since,
    ).all()
    return [_project_to_out(r) for r in rows]


# ── Pending structuring queue ─────────────────────────────────
@router.get("/pending")
def get_pending(
    db: Session = Depends(get_db),
    _: None = Depends(require_api_key),
):
    """
    Returns all projects that need AI structuring.
    Agent polls this endpoint to find work to do.
    """
    rows = db.query(ShelfdProject).filter(
        ShelfdProject.structured == False,
        ShelfdProject.deleted == False,
        ShelfdProject.raw_text != None,
        ShelfdProject.raw_text != "",
    ).all()
    return [_project_to_out(r) for r in rows]


@router.patch("/projects/{project_id}/structured")
def mark_structured(
    project_id: str,
    body: dict,
    db: Session = Depends(get_db),
    _: None = Depends(require_api_key),
):
    """
    Called by agent after structuring a project.
    Updates title, summary, sections, key_ideas, action_items, tags, category
    and marks structured=True. Does NOT modify raw_text — ever.
    """
    p = db.query(ShelfdProject).filter(ShelfdProject.id == project_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Project not found")

    now = datetime.now(timezone.utc).isoformat()

    if "title" in body:        p.title = body["title"]
    if "summary" in body:      p.summary = body["summary"]
    if "key_ideas" in body:    p.key_ideas = body["key_ideas"]
    if "action_items" in body: p.action_items = body["action_items"]
    if "sections" in body:     p.sections = body["sections"]
    if "key_ideas" in body and body["key_ideas"] and "sections" not in body:
        existing = p.sections or []
        existing.append({"title": "Key Ideas", "items": body["key_ideas"]})
        p.sections = existing
    if "action_items" in body and body["action_items"] and "sections" not in body:
        existing = p.sections or []
        existing.append({"title": "Action Items", "items": body["action_items"]})
        p.sections = existing
    if "tags" in body:         p.tags = body.get("tags")
    if "category" in body:     p.category = body.get("category")

    p.structured = True
    p.structured_at = now
    p.server_updated_at = now
    db.commit()
    db.refresh(p)
    return _project_to_out(p)


@router.post("/projects/{project_id}/requeue")
def requeue_for_structuring(
    project_id: str,
    db: Session = Depends(get_db),
    _: None = Depends(require_api_key),
):
    """Force re-structuring of an already structured project."""
    p = db.query(ShelfdProject).filter(ShelfdProject.id == project_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Project not found")
    p.structured = False
    p.structured_at = None
    db.commit()
    return {"requeued": True}


@router.get("/internal/structuring-config")
def get_structuring_config_internal(
    request: Request,
    db: Session = Depends(get_db),
):
    """
    Internal endpoint for watcher script — localhost only, no auth needed.
    Returns structuring config so watcher knows mode + interval + prompt.
    """
    from .routes import _require_local_host
    _require_local_host(request)

    from .models import StructuringConfig
    cfg = db.query(StructuringConfig).filter(StructuringConfig.id == 1).first()
    if not cfg:
        return {
            "mode": "watcher",
            "interval_seconds": 90,
            "enabled": True,
            "formatting_prompt": None,
        }
    return {
        "mode": cfg.mode,
        "interval_seconds": cfg.interval_seconds,
        "enabled": cfg.enabled,
        "formatting_prompt": cfg.formatting_prompt,
        "last_processed_at": cfg.last_processed_at,
    }


@router.post("/internal/last-processed")
def update_last_processed_internal(
    request: Request,
    db: Session = Depends(get_db),
):
    """Internal endpoint — watcher calls this after each run."""
    from .routes import _require_local_host
    _require_local_host(request)

    from .models import StructuringConfig
    cfg = db.query(StructuringConfig).filter(StructuringConfig.id == 1).first()
    if cfg:
        cfg.last_processed_at = datetime.now(timezone.utc).isoformat()
        db.commit()
    return {"updated": True}
