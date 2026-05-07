"""Add attachments table

Revision ID: 004
Revises: 003
Create Date: 2026-05-07 09:00:00.000000

Migration steps:
1. Create the attachments table with FK to expense_lines and a UNIQUE constraint
   on expense_report_line_id to enforce the one-to-one relationship.
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '004'
down_revision = '003'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'attachments',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            'expense_report_line_id',
            sa.Integer(),
            sa.ForeignKey('expense_lines.id', ondelete='CASCADE'),
            nullable=False,
            unique=True,
        ),
        sa.Column('file_name', sa.String(255), nullable=False),
        sa.Column('file_size', sa.Integer(), nullable=False),
        sa.Column('mime_type', sa.String(100), nullable=False),
        sa.Column('storage_path', sa.String(500), nullable=False),
        sa.Column(
            'created_at',
            sa.DateTime(timezone=True),
            nullable=False,
        ),
    )
    op.create_index(
        'ix_attachments_expense_report_line_id',
        'attachments',
        ['expense_report_line_id'],
        unique=True,
    )


def downgrade():
    op.drop_index('ix_attachments_expense_report_line_id', table_name='attachments')
    op.drop_table('attachments')
