"""
Seed script — creates default users with roles for local development.

Usage:
    python3 seed.py

Creates users:
    - admin / admin123 (Admin role)
    - user1 / user123 (User role)
    - user2 / user123 (User role)
"""

import sys
import os

# Ensure the app package is importable when run from backend/
sys.path.insert(0, os.path.dirname(__file__))

from app.db.database import SessionLocal, create_tables
from app.models.user import User
from app.services.auth_service import hash_password
from sqlalchemy import text


def seed() -> None:
    create_tables()
    db = SessionLocal()
    try:
        # Query Role table for User and Admin roles
        user_role_result = db.execute(text("SELECT id FROM roles WHERE name = 'User'")).fetchone()
        admin_role_result = db.execute(text("SELECT id FROM roles WHERE name = 'Admin'")).fetchone()
        
        if not user_role_result or not admin_role_result:
            print("Error: Role table not properly initialized. Run migrations first.")
            return
        
        user_role_id = user_role_result[0]
        admin_role_id = admin_role_result[0]
        
        # Define users to create
        users_to_create = [
            {"username": "admin", "password": "admin123", "role_id": admin_role_id},
            {"username": "user1", "password": "user123", "role_id": user_role_id},
            {"username": "user2", "password": "user123", "role_id": user_role_id},
        ]
        
        # Create users if they don't exist (idempotent)
        for user_data in users_to_create:
            existing = db.query(User).filter(User.username == user_data["username"]).first()
            if existing:
                print(f"User '{user_data['username']}' already exists — skipping.")
                continue
            
            user = User(
                username=user_data["username"],
                hashed_password=hash_password(user_data["password"]),
                role_id=user_data["role_id"]
            )
            db.add(user)
            role_name = "Admin" if user_data["role_id"] == admin_role_id else "User"
            print(f"Created user '{user_data['username']}' with password '{user_data['password']}' (role: {role_name}).")
        
        db.commit()
    finally:
        db.close()


if __name__ == "__main__":
    seed()
