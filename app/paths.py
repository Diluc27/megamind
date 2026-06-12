import os
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = os.path.join(str(PROJECT_ROOT), "data")
NOTES_DIR = os.path.join(DATA_DIR, "notes")
SESSIONS_DIR = os.path.join(DATA_DIR, "sessions")
SHELFD_DIR = os.path.join(DATA_DIR, "shelfd")
BACKUPS_DIR = os.path.join(str(PROJECT_ROOT), "backups")
DB_PATH = os.path.join(DATA_DIR, "brain.db")
