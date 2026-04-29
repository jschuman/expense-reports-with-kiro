import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.database import Base
from app.models.role import Role
from app.models.user import User
from app.services.auth_service import authenticate_user, hash_password, verify_password

# ---------------------------------------------------------------------------
# Shared in-memory DB fixture
# ---------------------------------------------------------------------------


@pytest.fixture()
def db_session():
    """Provide a fresh in-memory SQLite session for each test."""
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    
    # Seed roles for tests
    user_role = Role(id=1, name="User")
    admin_role = Role(id=2, name="Admin")
    session.add(user_role)
    session.add(admin_role)
    session.commit()
    
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(bind=engine)


# ---------------------------------------------------------------------------
# hash_password / verify_password tests (pre-existing)
# ---------------------------------------------------------------------------


def test_verify_password_returns_true_for_correct_password():
    """verify_password returns True when the plain password matches the hash."""
    password = "supersecret123"
    hashed = hash_password(password)
    assert verify_password(password, hashed) is True


def test_verify_password_returns_false_for_incorrect_password():
    """verify_password returns False when the plain password does not match the hash."""
    hashed = hash_password("correctpassword")
    assert verify_password("wrongpassword", hashed) is False


def test_hash_password_never_returns_plaintext():
    """hash_password must never return the original plaintext password."""
    password = "plaintextpassword"
    hashed = hash_password(password)
    assert hashed != password


# ---------------------------------------------------------------------------
# authenticate_user tests
# ---------------------------------------------------------------------------


def test_authenticate_user_returns_user_when_credentials_are_valid(db_session):
    """authenticate_user returns the User object when username exists and password matches."""
    user = User(username="alice", hashed_password=hash_password("secret"), role_id=1)
    db_session.add(user)
    db_session.commit()

    result = authenticate_user(db_session, "alice", "secret")

    assert result is not None
    assert result.username == "alice"


def test_authenticate_user_returns_none_when_username_does_not_exist(db_session):
    """authenticate_user returns None when no user with the given username exists."""
    result = authenticate_user(db_session, "nonexistent", "anypassword")

    assert result is None


def test_authenticate_user_returns_none_when_password_does_not_match(db_session):
    """authenticate_user returns None when the password does not match the stored hash."""
    user = User(username="bob", hashed_password=hash_password("correctpassword"), role_id=1)
    db_session.add(user)
    db_session.commit()

    result = authenticate_user(db_session, "bob", "wrongpassword")

    assert result is None
