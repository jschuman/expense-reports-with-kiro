"""Add roles table and role_id to users

Revision ID: 001
Revises:
Create Date: 2026-04-29 14:00:00.000000

Creates the complete database schema including:
1. users table (base schema)
2. expense_reports table (base schema)
3. roles table with User and Admin roles
4. role_id foreign key on users table
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '001'
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    """Create the full schema: users, expense_reports, roles, and role_id on users."""

    # Create users table (base schema)
    op.create_table(
        'users',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('username', sa.String(length=150), nullable=False, unique=True),
        sa.Column('hashed_password', sa.String(length=255), nullable=False),
        sa.Column('role_id', sa.Integer(), nullable=False),
    )
    op.create_index('ix_users_username', 'users', ['username'])

    # Create expense_reports table (base schema)
    op.create_table(
        'expense_reports',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('title', sa.String(length=255), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('total_amount', sa.Float(), nullable=False),
        sa.Column('status', sa.String(length=50), nullable=False),
        sa.Column('owner_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('reimbursable_from_client', sa.Boolean(), nullable=False),
        sa.Column('client', sa.String(length=255), nullable=True),
        sa.Column('admin_notes', sa.Text(), nullable=True),
    )

    # Create roles table with unique constraint and index on name
    op.create_table(
        'roles',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('name', sa.String(length=50), nullable=False, unique=True),
        sa.UniqueConstraint('name', name='uq_roles_name'),
    )
    op.create_index('ix_roles_name', 'roles', ['name'])

    # Insert default roles: User (id=1) and Admin (id=2)
    op.execute("INSERT INTO roles (id, name) VALUES (1, 'User')")
    op.execute("INSERT INTO roles (id, name) VALUES (2, 'Admin')")

    # Add foreign key constraint from users.role_id to roles.id
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.create_foreign_key(
            'fk_users_role_id_roles',
            'roles',
            ['role_id'],
            ['id']
        )


def downgrade():
    """Drop all tables."""
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.drop_constraint('fk_users_role_id_roles', type_='foreignkey')

    op.drop_index('ix_roles_name', 'roles')
    op.drop_table('roles')
    op.drop_table('expense_reports')
    op.drop_index('ix_users_username', 'users')
    op.drop_table('users')
