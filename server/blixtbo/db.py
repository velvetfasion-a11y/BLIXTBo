from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import Session, sessionmaker

from blixtbo.config import settings
from blixtbo.models import Base

connect_args = {"check_same_thread": False} if settings.database_url.startswith("sqlite") else {}
engine = create_engine(settings.database_url, connect_args=connect_args, pool_pre_ping=True)
SessionLocal = sessionmaker(engine, expire_on_commit=False)


def init_db() -> None:
    Base.metadata.create_all(engine)
    _ensure_user_deleted_at()


def _ensure_user_deleted_at() -> None:
    """create_all does not add columns to a table that already exists."""
    insp = inspect(engine)
    if "users" not in insp.get_table_names():
        return
    columns = {column["name"] for column in insp.get_columns("users")}
    if "deleted_at" in columns:
        return
    ddl = "ALTER TABLE users ADD COLUMN deleted_at TIMESTAMPTZ" if engine.dialect.name == "postgresql" else "ALTER TABLE users ADD COLUMN deleted_at TIMESTAMP"
    with engine.begin() as conn:
        conn.execute(text(ddl))


def session() -> Session:
    return SessionLocal()
