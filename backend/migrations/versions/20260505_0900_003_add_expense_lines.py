"""Add expense_lines table and remove total_amount from expense_reports

Revision ID: 003
Revises: 002
Create Date: 2026-05-05 09:00:00.000000

Migration steps:
1. Remove the total_amount column from expense_reports (SQLite requires batch mode)
2. Create the expense_lines table with all columns and a FK index on report_id
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '003'
down_revision = '002'
branch_labels = None
depends_on = None


def upgrade():
    # ------------------------------------------------------------------
    # Step 1: Remove total_amount from expense_reports.
    # SQLite does not support DROP COLUMN directly, so we use batch mode.
    # ------------------------------------------------------------------
    with op.batch_alter_table('expense_reports', schema=None) as batch_op:
        batch_op.drop_column('total_amount')

    # ------------------------------------------------------------------
    # Step 2: Create the expense_lines table.
    # ------------------------------------------------------------------
    op.create_table(
        'expense_lines',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            'report_id',
            sa.Integer(),
            sa.ForeignKey('expense_reports.id', ondelete='CASCADE'),
            nullable=False,
        ),
        sa.Column('description', sa.Text(), nullable=False),
        sa.Column('amount', sa.Float(), nullable=False),
        sa.Column('incurred_date', sa.Date(), nullable=False),
    )
    op.create_index(
        'ix_expense_lines_report_id',
        'expense_lines',
        ['report_id'],
    )


def downgrade():
    # ------------------------------------------------------------------
    # Step 1: Drop the expense_lines table and its index.
    # ------------------------------------------------------------------
    op.drop_index('ix_expense_lines_report_id', table_name='expense_lines')
    op.drop_table('expense_lines')

    # ------------------------------------------------------------------
    # Step 2: Re-add total_amount to expense_reports.
    # Use batch mode for SQLite compatibility.
    # ------------------------------------------------------------------
    with op.batch_alter_table('expense_reports', schema=None) as batch_op:
        batch_op.add_column(
            sa.Column('total_amount', sa.Float(), nullable=False, server_default='0.0')
        )
