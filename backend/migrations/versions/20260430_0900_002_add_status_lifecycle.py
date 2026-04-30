"""Add status lifecycle: update expense_reports default and create status_audit_log

Revision ID: 002
Revises: 001
Create Date: 2026-04-30 09:00:00.000000

Migration steps:
1. Alter expense_reports.status server default from "Pending" to "In Progress"
2. UPDATE existing rows: set status = 'In Progress' WHERE status = 'Pending'
3. Create status_audit_log table with FK index on expense_report_id
4. Backfill one audit entry per existing report (using created_at as changed_at)
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '002'
down_revision = '001'
branch_labels = None
depends_on = None


def upgrade():
    # ------------------------------------------------------------------
    # Step 1: Change the server default on expense_reports.status from
    #         "Pending" to "In Progress".
    # SQLite does not support ALTER COLUMN directly, so we use batch mode.
    # ------------------------------------------------------------------
    with op.batch_alter_table('expense_reports', schema=None) as batch_op:
        batch_op.alter_column(
            'status',
            existing_type=sa.String(length=50),
            server_default='In Progress',
            existing_nullable=False,
        )

    # ------------------------------------------------------------------
    # Step 2: Migrate existing "Pending" rows to "In Progress".
    # ------------------------------------------------------------------
    op.execute("UPDATE expense_reports SET status = 'In Progress' WHERE status = 'Pending'")

    # ------------------------------------------------------------------
    # Step 3: Create the status_audit_log table.
    # ------------------------------------------------------------------
    op.create_table(
        'status_audit_log',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            'expense_report_id',
            sa.Integer(),
            sa.ForeignKey('expense_reports.id'),
            nullable=False,
        ),
        sa.Column('status', sa.String(length=50), nullable=False),
        sa.Column('changed_at', sa.DateTime(), nullable=False),
    )
    op.create_index(
        'ix_status_audit_log_expense_report_id',
        'status_audit_log',
        ['expense_report_id'],
    )

    # ------------------------------------------------------------------
    # Step 4: Backfill one audit entry per existing expense report,
    #         using the report's created_at as changed_at and
    #         "In Progress" as the initial status.
    # ------------------------------------------------------------------
    op.execute(
        """
        INSERT INTO status_audit_log (expense_report_id, status, changed_at)
        SELECT id, 'In Progress', created_at
        FROM expense_reports
        """
    )


def downgrade():
    # Remove the audit log table and index.
    op.drop_index('ix_status_audit_log_expense_report_id', table_name='status_audit_log')
    op.drop_table('status_audit_log')

    # Revert the status default back to "Pending".
    with op.batch_alter_table('expense_reports', schema=None) as batch_op:
        batch_op.alter_column(
            'status',
            existing_type=sa.String(length=50),
            server_default='Pending',
            existing_nullable=False,
        )

    # Revert "In Progress" rows back to "Pending".
    op.execute("UPDATE expense_reports SET status = 'Pending' WHERE status = 'In Progress'")
