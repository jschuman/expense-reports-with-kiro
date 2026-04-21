from typing import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

SQLALCHEMY_DATABASE_URL = "sqlite:///./expense_reports.db"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False},
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def create_tables() -> None:
    """Create all database tables defined by ORM models.

    Import models here (not at module level) to avoid circular imports while
    still ensuring every mapped class is registered with Base.metadata before
    create_all is called.
    """
    import app.models  # noqa: F401 — registers User and ExpenseReport with Base

    Base.metadata.create_all(bind=engine)


def get_db() -> Generator:
    """FastAPI dependency that yields a database session and ensures it is closed after use."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
