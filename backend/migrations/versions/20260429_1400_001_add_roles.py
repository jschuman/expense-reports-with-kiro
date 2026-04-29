"""Add roles table and role_id to users

Revision ID: 001
Revises: 
Create Date: 2026-04-29 14:00:00.000000

This migration introduces role-based access control by:
1. Creating a roles table with User and Admin roles
2. Adding role_id foreign key to users table
3. Assigning default User role to all existing users

Note: Uses batch operations for SQLite compatibility.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import sqlite


# revision identifiers, used by Alembic.
revision = '001'
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    """Apply the migration: add roles table and role_id to users."""
    
    # Create roles table with unique constraint and index on name
    op.create_table(
        'roles',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('name', sa.String(length=50), nullable=False, unique=True),
        sa.UniqueConstraint('name', name='uq_roles_name'),
    )
    
    # Add index on role name
    op.create_index('ix_roles_name', 'roles', ['name'])
    
    # Insert default roles: User (id=1) and Admin (id=2)
    op.execute(
        """
        INSERT INTO roles (id, name) VALUES (1, 'User');
        """
    )
    op.execute(
        """
        INSERT INTO roles (id, name) VALUES (2, 'Admin');
        """
    )
    
    # Use batch operations for SQLite to add role_id column with foreign key
    with op.batch_alter_table('users', schema=None) as batch_op:
        # Add role_id column (nullable initially)
        batch_op.add_column(sa.Column('role_id', sa.Integer(), nullable=True))
    
    # Assign User role (id=1) to all existing users
    op.execute(
        """
        UPDATE users SET role_id = 1;
        """
    )
    
    # Use batch operations to make role_id NOT NULL and add foreign key
    with op.batch_alter_table('users', schema=None) as batch_op:
        # Alter column to be NOT NULL
        batch_op.alter_column('role_id', nullable=False)
        
        # Add foreign key constraint from users.role_id to roles.id
        batch_op.create_foreign_key(
            'fk_users_role_id_roles',
            'roles',
            ['role_id'],
            ['id']
        )


def downgrade():
    """Revert the migration: remove role_id and roles table."""
    
    # Use batch operations for SQLite to drop foreign key and column
    with op.batch_alter_table('users', schema=None) as batch_op:
        # Drop foreign key constraint
        batch_op.drop_constraint('fk_users_role_id_roles', type_='foreignkey')
        
        # Drop role_id column
        batch_op.drop_column('role_id')
    
    # Drop index from roles table
    op.drop_index('ix_roles_name', 'roles')
    
    # Drop roles table (unique constraint will be dropped automatically)
    op.drop_table('roles')
