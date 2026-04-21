import pytest
from app.services.auth_service import hash_password, verify_password


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
