import os
import sqlite3
from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .database import DB_PATH, init_db
from .auth import require_api_key
from .security import LocalOnlyGuard
from .utils import build_markdown, ensure_dirs, get_safe_filename, save_markdown
from .routes import router
from .session_routes import router as session_router
from .shelfd_routes import router as shelfd_router
from .admin_routes import router as admin_router
from .claud_routes import router as claud_router
from .summarize_routes import router as summarize_router
from .models import ShelfdProject, StructuringConfig  # noqa: F401 - registers tables before init_db


def _load_dotenv():
    env_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env")
    if not os.path.exists(env_path):
        return
    with open(env_path, "r", encoding="utf-8") as f:
        for raw_line in f:
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            os.environ[key.strip()] = value.strip().strip('"').strip("'")


_load_dotenv()

app = FastAPI(title="MegaMind: Digital Brain")

origins_str = os.environ.get(
    "MEGAMIND_CORS_ORIGINS",
    "http://localhost:5173,http://127.0.0.1:5173,chrome-extension://*,moz-extension://*",
)
origins = [o.strip() for o in origins_str.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_origin_regex=r"^(chrome-extension|moz-extension)://.*$",
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(LocalOnlyGuard)


def _ensure_shelfd_structuring_columns():
    """Backfill additive columns because SQLite create_all does not alter existing tables."""
    conn = sqlite3.connect(DB_PATH)
    try:
        columns = {row[1] for row in conn.execute("PRAGMA table_info(shelfd_projects)")}
        structured_added = "structured" not in columns
        additions = {
            "tags": "ALTER TABLE shelfd_projects ADD COLUMN tags VARCHAR",
            "category": "ALTER TABLE shelfd_projects ADD COLUMN category VARCHAR",
            "structured": "ALTER TABLE shelfd_projects ADD COLUMN structured BOOLEAN DEFAULT 1",
            "structured_at": "ALTER TABLE shelfd_projects ADD COLUMN structured_at VARCHAR",
            "sections": "ALTER TABLE shelfd_projects ADD COLUMN sections JSON",
        }
        for name, statement in additions.items():
            if name not in columns:
                conn.execute(statement)
        if structured_added:
            conn.execute("UPDATE shelfd_projects SET structured = 1 WHERE structured IS NULL OR structured = 0")
        conn.commit()
    finally:
        conn.close()


def _ensure_note_source_column():
    conn = sqlite3.connect(DB_PATH)
    try:
        columns = {row[1] for row in conn.execute("PRAGMA table_info(notes)")}
        if "source" not in columns:
            conn.execute("ALTER TABLE notes ADD COLUMN source VARCHAR")
            conn.commit()
            print("[migration] Added source column to notes")
    finally:
        conn.close()


async def _migrate_to_sections():
    from sqlalchemy.orm import Session
    from .database import SessionLocal
    from .models import ShelfdProject

    db: Session = SessionLocal()
    try:
        projects = db.query(ShelfdProject).filter(ShelfdProject.deleted == False).all()
        migrated = 0

        for p in projects:
            if p.sections and len(p.sections) > 0:
                continue

            new_sections = []

            if p.key_ideas and len(p.key_ideas) > 0:
                new_sections.append({
                    "title": "Key Ideas",
                    "items": p.key_ideas,
                })

            if p.action_items and len(p.action_items) > 0:
                new_sections.append({
                    "title": "Action Items",
                    "items": p.action_items,
                })

            if new_sections:
                p.sections = new_sections
                db.add(p)
                migrated += 1

        db.commit()
        print(f"[migration] Migrated sections for existing projects ({migrated})")
    except Exception as e:
        print(f"[migration] sections migration error: {e}")
    finally:
        db.close()


async def _seed_shelfd_prompt():
    """
    Creates a permanent Window Space note with the Shelfd formatting prompt
    if one doesn't already exist (tagged shelfd-prompt).
    Safe to run on every boot — checks before creating.
    """
    from datetime import datetime
    from sqlalchemy.orm import Session
    from .admin_routes import DEFAULT_FORMATTING_PROMPT
    from .database import SessionLocal
    from .models import Note

    db: Session = SessionLocal()
    try:
        existing = db.query(Note).filter(Note.tags.like('%shelfd-prompt%')).first()
        if existing:
            return

        now = datetime.utcnow()
        note = Note(
            title="Shelfd Structuring Prompt",
            category="System",
            tags="shelfd-prompt,memory-permanent,protected",
            file_path="",
            created_at=now,
            updated_at=now,
        )
        db.add(note)
        db.commit()
        db.refresh(note)

        file_path = get_safe_filename(note.title, note.id, note.category)
        markdown = build_markdown(
            note.title,
            note.category,
            note.tags,
            note.created_at,
            note.updated_at,
            DEFAULT_FORMATTING_PROMPT,
        )
        save_markdown(file_path, markdown)
        note.file_path = file_path
        db.commit()
    finally:
        db.close()


@app.on_event("startup")
async def startup_event():
    ensure_dirs()
    init_db()
    _ensure_note_source_column()
    _ensure_shelfd_structuring_columns()
    await _migrate_to_sections()
    # await _seed_shelfd_prompt()  # Disabled: prompt content is preserved in Shelfd note 90's Structuring Prompt page


@app.get("/")
def read_root():
    return {"status": "MegaMind Backend is running"}

app.include_router(router, prefix="/api")
app.include_router(session_router, prefix="/api", dependencies=[Depends(require_api_key)])
app.include_router(shelfd_router)
app.include_router(admin_router)
app.include_router(claud_router, prefix="/api", dependencies=[Depends(require_api_key)])
app.include_router(summarize_router, prefix="/api", dependencies=[Depends(require_api_key)])
