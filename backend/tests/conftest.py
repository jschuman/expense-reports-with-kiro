"""Shared test fixtures and utilities for all test modules."""

import pytest
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.database import Base
from app.models.role import Role


def seed_roles(session):
    """Seed User and Admin roles into the test database."""
    user_role = Role(id=1, name="User")
    admin_role = Role(id=2, name="Admin")
    session.add(user_role)
    session.add(admin_role)
    session.commit()


@pytest.fixture()
def db_session_with_roles():
    """Provide a fresh in-memory SQLite session with roles seeded."""
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
    )
    
    # Enable FK enforcement
    @event.listens_for(engine, "connect")
    def set_sqlite_pragma(dbapi_connection, _connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()
    
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    
    # Seed roles
    seed_roles(session)
    
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(bind=engine)
        engine.dispose()
