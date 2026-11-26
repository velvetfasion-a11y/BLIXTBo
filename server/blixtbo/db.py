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
            _ensure_keepalive_columns(conn)
            _widen_notice_kind(conn)
        return
    Base.metadata.create_all(engine)
    _ensure_user_deleted_at(engine)
    _ensure_keepalive_columns(engine)
    _widen_notice_kind(engine)


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


_LOGIN_COLUMNS = (
    ("last_kept_alive_at", "TIMESTAMPTZ", "TIMESTAMP"),
    ("last_keepalive_attempt_at", "TIMESTAMPTZ", "TIMESTAMP"),
    ("next_keepalive_at", "TIMESTAMPTZ", "TIMESTAMP"),
    ("keepalive_failures", "INTEGER DEFAULT 0", "INTEGER DEFAULT 0"),
    ("keepalive_state", "VARCHAR(24)", "VARCHAR(24)"),
    ("last_keepalive_code", "VARCHAR(64)", "VARCHAR(64)"),
    ("fee_due_at", "DATE", "DATE"),
)

_NOTICE_COLUMNS = (
    ("action_label", "VARCHAR(80) DEFAULT ''", "VARCHAR(80) DEFAULT ''"),
    ("action_href", "VARCHAR(500) DEFAULT ''", "VARCHAR(500) DEFAULT ''"),
    ("secondary_label", "VARCHAR(80) DEFAULT ''", "VARCHAR(80) DEFAULT ''"),
    ("secondary_href", "VARCHAR(500) DEFAULT ''", "VARCHAR(500) DEFAULT ''"),
)


def _ensure_keepalive_columns(bind) -> None:
    """Add keep-alive columns that create_all will not put on an existing table."""
    _add_missing(bind, "landlord_logins", _LOGIN_COLUMNS)
    _add_missing(bind, "notices", _NOTICE_COLUMNS)


def _add_missing(bind, table: str, columns) -> None:
    insp = inspect(bind)
    if table not in insp.get_table_names():
        return
    present = {column["name"] for column in insp.get_columns(table)}
    pending = [column for column in columns if column[0] not in present]
    if not pending:
        return
    postgres = bind.dialect.name == "postgresql"

    def run(conn) -> None:
        for name, pg_type, sqlite_type in pending:
            if postgres:
                ddl = f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS {name} {pg_type}"
            else:
                # This SQLite build rejects ADD COLUMN IF NOT EXISTS. The catalog check above is the guard.
                ddl = f"ALTER TABLE {table} ADD COLUMN {name} {sqlite_type}"
            conn.execute(text(ddl))

    if isinstance(bind, Connection):
        run(bind)
        return
    with bind.begin() as conn:
        run(conn)


def _widen_notice_kind(bind) -> None:
    """Keep-alive kinds are keepalive:{source}:{code}. 40 characters is not enough."""
    if bind.dialect.name != "postgresql":
        return
    insp = inspect(bind)
    if "notices" not in insp.get_table_names():
        return
    ddl = "ALTER TABLE notices ALTER COLUMN kind TYPE VARCHAR(80)"
    if isinstance(bind, Connection):
        bind.execute(text(ddl))
        return
    with bind.begin() as conn:
        conn.execute(text(ddl))


def session() -> Session:
    return SessionLocal()
