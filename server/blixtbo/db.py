from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from blixtbo.config import settings
from blixtbo.models import Base

connect_args = {"check_same_thread": False} if settings.database_url.startswith("sqlite") else {}
engine = create_engine(settings.database_url, connect_args=connect_args, pool_pre_ping=True)
SessionLocal = sessionmaker(engine, expire_on_commit=False)


def init_db() -> None:
    Base.metadata.create_all(engine)


def session() -> Session:
    return SessionLocal()
