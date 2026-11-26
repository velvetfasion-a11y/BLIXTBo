"""Support tickets and chats. Tables are created with IF NOT EXISTS via db.py."""

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, String, Text, or_
from sqlalchemy.orm import Mapped, Session, mapped_column

from blixtbo.models import Base, utcnow


class SupportTicket(Base):
    __tablename__ = "support_tickets"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    type: Mapped[str] = mapped_column(String(16))
    status: Mapped[str] = mapped_column(String(16), default="ny")
    user_id: Mapped[str] = mapped_column(String(36), default="", index=True)
    firebase_uid: Mapped[str] = mapped_column(String(128), default="", index=True)
    email: Mapped[str] = mapped_column(String(320), default="")
    subject: Mapped[str] = mapped_column(String(200), default="")
    message: Mapped[str] = mapped_column(Text, default="")
    metadata_json: Mapped[str] = mapped_column(Text, default="{}")
    transcript_json: Mapped[str] = mapped_column(Text, default="[]")
    chat_id: Mapped[str] = mapped_column(String(36), default="", index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
    status_changed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    unread: Mapped[bool] = mapped_column(Boolean, default=True)


class SupportChat(Base):
    __tablename__ = "support_chats"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(String(36), default="", index=True)
    firebase_uid: Mapped[str] = mapped_column(String(128), default="", index=True)
    email: Mapped[str] = mapped_column(String(320), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class SupportMessage(Base):
    __tablename__ = "support_messages"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    chat_id: Mapped[str] = mapped_column(String(36), index=True)
    role: Mapped[str] = mapped_column(String(16))
    body: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)


def purge_support(db: Session, *, user_id: str = "", firebase_uid: str = "", emails: set[str] | None = None) -> None:
    """Delete tickets, chats and messages that belong to a deleted account."""
    email_values = {item.strip().lower() for item in (emails or set()) if item and "@" in item}
    chat_filters = []
    ticket_filters = []
    if user_id:
        chat_filters.append(SupportChat.user_id == user_id)
        ticket_filters.append(SupportTicket.user_id == user_id)
    if firebase_uid:
        chat_filters.append(SupportChat.firebase_uid == firebase_uid)
        ticket_filters.append(SupportTicket.firebase_uid == firebase_uid)
    if email_values:
        chat_filters.append(SupportChat.email.in_(email_values))
        ticket_filters.append(SupportTicket.email.in_(email_values))
    if not chat_filters:
        return
    chats = db.query(SupportChat.id).filter(or_(*chat_filters)).all()
    chat_ids = [row.id for row in chats]
    if chat_ids:
        db.query(SupportMessage).filter(SupportMessage.chat_id.in_(chat_ids)).delete(synchronize_session=False)
        db.query(SupportChat).filter(SupportChat.id.in_(chat_ids)).delete(synchronize_session=False)
    db.query(SupportTicket).filter(or_(*ticket_filters)).delete(synchronize_session=False)
