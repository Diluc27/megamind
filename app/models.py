from sqlalchemy import Boolean, Column, Integer, String, Text, DateTime, func, JSON
from sqlalchemy.ext.declarative import declarative_base

Base = declarative_base()

class Note(Base):
    __tablename__ = "notes"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    title = Column(String, nullable=False)
    category = Column(String)
    tags = Column(String)
    source = Column(String)
    file_path = Column(String)
    created_at = Column(DateTime, server_default=func.current_timestamp())
    updated_at = Column(DateTime, server_default=func.current_timestamp())


class NotePage(Base):
    """Extra pages attached to a Window Space note."""
    __tablename__ = "note_pages"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    note_id = Column(Integer, index=True, nullable=False)
    title = Column(String, nullable=False)
    tags = Column(String)
    content = Column(Text)
    position = Column(Integer, default=0)
    created_at = Column(DateTime, server_default=func.current_timestamp())
    updated_at = Column(DateTime, server_default=func.current_timestamp())


class Session(Base):
    __tablename__ = "sessions"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    title = Column(String, nullable=False)
    agent = Column(String)
    project = Column(String)
    tags = Column(String)
    file_path = Column(String)
    created_at = Column(DateTime, server_default=func.current_timestamp())
    updated_at = Column(DateTime, server_default=func.current_timestamp())



class SessionPage(Base):
    """Extra pages attached to a MegaCode session."""
    __tablename__ = "session_pages"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    session_id = Column(Integer, index=True, nullable=False)
    title = Column(String, nullable=False)
    tags = Column(String)
    content = Column(Text)
    position = Column(Integer, default=0)
    created_at = Column(DateTime, server_default=func.current_timestamp())
    updated_at = Column(DateTime, server_default=func.current_timestamp())


class Shelfd(Base):
    __tablename__ = "shelfd"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    title = Column(String, nullable=False)
    tags = Column(String)
    file_path = Column(String)
    created_at = Column(DateTime, server_default=func.current_timestamp())
    updated_at = Column(DateTime, server_default=func.current_timestamp())

class ShelfdProject(Base):  # noqa: F821  — Base comes from this models.py
    """
    One Shelfd project synced from the mobile app.

    storage_mode values
    -------------------
    "synced"      — lives on both device and server
    "cloud_only"  — lives on server only; device shows it when connected
    """
    __tablename__ = "shelfd_projects"

    id                = Column(String,  primary_key=True)    # UUID from device
    title             = Column(String,  nullable=False)
    summary           = Column(Text,    nullable=True)
    key_ideas         = Column(JSON,    default=list)         # List[str]
    action_items      = Column(JSON,    default=list)         # List[str]
    sections          = Column(JSON,    default=list)         # [{"title": str, "items": List[str]}]
    raw_text          = Column(Text,    nullable=True)
    storage_mode      = Column(String,  default="synced")
    tags              = Column(String,  nullable=True)
    category          = Column(String,  nullable=True)
    structured        = Column(Boolean, default=False)        # False = needs AI structuring
    structured_at     = Column(String,  nullable=True)        # ISO-8601, set when structured
    created_at        = Column(String,  nullable=False)       # ISO-8601
    updated_at        = Column(String,  nullable=False)       # ISO-8601, from device
    server_updated_at = Column(String,  nullable=False)       # ISO-8601, set by server
    deleted           = Column(Boolean, default=False)        # soft delete flag


class ShelfdPage(Base):
    """Extra pages attached to a Shelfd project."""
    __tablename__ = "shelfd_pages"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    project_id = Column(String, index=True, nullable=False)
    title = Column(String, nullable=False)
    tags = Column(String)
    content = Column(Text)
    position = Column(Integer, default=0)
    created_at = Column(DateTime, server_default=func.current_timestamp())
    updated_at = Column(DateTime, server_default=func.current_timestamp())


class Claud(Base):
    """Agent notes in the Claud space. Accessible to all agents."""
    __tablename__ = "claud"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    title = Column(String, nullable=False)
    agent = Column(String)
    tags = Column(String)
    content = Column(Text)
    file_path = Column(String)
    created_at = Column(DateTime, server_default=func.current_timestamp())
    updated_at = Column(DateTime, server_default=func.current_timestamp())


class ClaudPage(Base):
    """Extra pages attached to a Claud note."""
    __tablename__ = "claud_pages"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    claud_id = Column(Integer, index=True, nullable=False)
    title = Column(String, nullable=False)
    tags = Column(String)
    content = Column(Text)
    position = Column(Integer, default=0)
    created_at = Column(DateTime, server_default=func.current_timestamp())
    updated_at = Column(DateTime, server_default=func.current_timestamp())


class StructuringConfig(Base):
    """
    Single-row config table for the AI structuring system.
    Always has exactly one row (id=1). Create on first access.
    """
    __tablename__ = "structuring_config"

    id                = Column(Integer, primary_key=True, default=1)
    mode              = Column(String,  default="watcher")   # "watcher" | "always_on"
    interval_seconds  = Column(Integer, default=90)          # watcher poll interval
    enabled           = Column(Boolean, default=True)        # master on/off switch
    formatting_prompt = Column(Text,   nullable=True)       # the AI formatting instructions
    last_processed_at = Column(String, nullable=True)       # ISO-8601
    updated_at        = Column(String, nullable=True)       # ISO-8601
