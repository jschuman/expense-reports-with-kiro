"""SQLAlchemy ORM model for the Attachment entity.

Each ExpenseLine may have at most one Attachment (one-to-one). The UNIQUE
constraint on expense_report_line_id enforces this at the database level.
Cascade delete ensures the attachment record is removed when its parent
expense line is deleted.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.database import Base

if TYPE_CHECKING:
    from app.models.expense_line import ExpenseLine


class Attachment(Base):
    __tablename__ = "attachments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    expense_report_line_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("expense_lines.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
    )
    file_name: Mapped[str] = mapped_column(String(255), nullable=False)
    file_size: Mapped[int] = mapped_column(Integer, nullable=False)  # bytes
    mime_type: Mapped[str] = mapped_column(String(100), nullable=False)
    storage_path: Mapped[str] = mapped_column(String(500), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )

    # Relationship back to the parent expense line
    expense_report_line: Mapped["ExpenseLine"] = relationship(
        "ExpenseLine", back_populates="attachment"
    )
