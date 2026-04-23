"""
Seed script — creates a default user for local development.

Usage:
    python3 seed.py

Creates user: admin / password123
"""

import sys
import os

# Ensure the app package is importable when run from backend/
sys.path.insert(0, os.path.dirname(__file__))

from app.db.database import SessionLocal, create_tables
from app.models.user import User
from app.services.auth_service import hash_password

USERNAME = "admin"
PASSWORD = "password123"


def seed() -> None:
    create_tables()
    db = SessionLocal()
    try:
        existing = db.query(User).filter(User.username == USERNAME).first()
        if existing:
            print(f"User '{USERNAME}' already exists — skipping.")
            return

        user = User(username=USERNAME, hashed_password=hash_password(PASSWORD))
        db.add(user)
        db.commit()
        print(f"Created user '{USERNAME}' with password '{PASSWORD}'.")
    finally:
        db.close()


if __name__ == "__main__":
    seed()
