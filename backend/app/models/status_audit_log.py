"""SQLAlchemy ORM model for the StatusAuditLog entity.

Every status change applied to an ExpenseReport — including the initial
creation — is recorded here with the new status value and a UTC timestamp.
"""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.database import Base

if TYPE_CHECKING:
    from app.models.expense_report import ExpenseReport


class StatusAuditLog(Base):
    __tablename__ = "status_audit_log"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    expense_report_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("expense_reports.id"),
        nullable=False,
        index=True,
    )
    status: Mapped[str] = mapped_column(String(50), nullable=False)
    changed_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)

    report: Mapped["ExpenseReport"] = relationship(
        "ExpenseReport", back_populates="audit_log"
    )
