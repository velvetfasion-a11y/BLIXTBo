from sqlalchemy import create_engine, inspect, text
from sqlalchemy.engine import Connection
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.schema import CreateIndex, CreateTable

from blixtbo.config import settings
from blixtbo.models import Base

connect_args = {"check_same_thread": False} if settings.database_url.startswith("sqlite") else {}
engine = create_engine(settings.database_url, connect_args=connect_args, pool_pre_ping=True)
SessionLocal = sessionmaker(engine, expire_on_commit=False)


@compiles(CreateTable)
def _create_table_if_not_exists(element, compiler, **kw):
    element.if_not_exists = True
    return compiler.visit_create_table(element, **kw)


@compiles(CreateIndex)
def _create_index_if_not_exists(element, compiler, **kw):
    element.if_not_exists = True
    return compiler.visit_create_index(element, **kw)


def init_db() -> None:
    """Create missing tables, then add columns that create_all will not.

    Support tables live in support_models and use the same CREATE TABLE IF NOT EXISTS hook.

    CREATE TABLE IF NOT EXISTS is not enough when the api and the worker boot
    together: both can pass the catalog check and one then fails on pg_type.
    A transaction advisory lock makes that startup one-at-a-time on PostgreSQL.
    """
    from blixtbo import support_models  # noqa: F401

    if engine.dialect.name == "postgresql":
        with engine.begin() as conn:
            conn.execute(text("SELECT pg_advisory_xact_lock(hashtext('blixtbo-schema'))"))
            Base.metadata.create_all(conn)
            _ensure_user_deleted_at(conn)
        return
    Base.metadata.create_all(engine)
    _ensure_user_deleted_at(engine)


def _ensure_user_deleted_at(bind) -> None:
    """create_all does not add columns to a table that already exists.

    PostgreSQL uses ADD COLUMN IF NOT EXISTS so two starters cannot raise
    DuplicateColumn if they both observe the column as missing.
    """
    insp = inspect(bind)
    if "users" not in insp.get_table_names():
        return
    columns = {column["name"] for column in insp.get_columns("users")}
    if "deleted_at" in columns:
        return
    if bind.dialect.name == "postgresql":
        ddl = "ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ"
    else:
        ddl = "ALTER TABLE users ADD COLUMN deleted_at TIMESTAMP"
    if isinstance(bind, Connection):
        bind.execute(text(ddl))
        return
    with bind.begin() as conn:
        conn.execute(text(ddl))


def session() -> Session:
    return SessionLocal()
