"""SQLAlchemy ORM model for the ExpenseLine entity."""

from __future__ import annotations

from datetime import date
from typing import TYPE_CHECKING, Optional

from sqlalchemy import Date, Float, ForeignKey, Integer, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.database import Base

if TYPE_CHECKING:
    from app.models.attachment import Attachment
    from app.models.expense_report import ExpenseReport


class ExpenseLine(Base):
    __tablename__ = "expense_lines"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    report_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("expense_reports.id", ondelete="CASCADE"),
        nullable=False,
    )
    description: Mapped[str] = mapped_column(Text, nullable=False)
    amount: Mapped[float] = mapped_column(Float, nullable=False)
    incurred_date: Mapped[date] = mapped_column(Date, nullable=False)

    report: Mapped["ExpenseReport"] = relationship("ExpenseReport", back_populates="lines")
    attachment: Mapped[Optional["Attachment"]] = relationship(
        "Attachment",
        back_populates="expense_report_line",
        uselist=False,
        cascade="all, delete-orphan",
    )
