import uuid
from datetime import date, datetime, timezone

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, LargeBinary, String, Text, UniqueConstraint
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    google_sub: Mapped[str | None] = mapped_column(String(128), unique=True)
    firebase_uid: Mapped[str | None] = mapped_column(String(128), unique=True)
    email: Mapped[str] = mapped_column(String(320), unique=True)
    name: Mapped[str] = mapped_column(String(200), default="")
    auth_method: Mapped[str] = mapped_column(String(20))
    dek_nonce: Mapped[bytes | None] = mapped_column(LargeBinary)
    dek_wrapped: Mapped[bytes | None] = mapped_column(LargeBinary)
    totp_secret: Mapped[str | None] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class LandlordLogin(Base):
    __tablename__ = "landlord_logins"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    source_id: Mapped[str] = mapped_column(String(64))
    status: Mapped[str] = mapped_column(String(32), default="pending_approval")
    username: Mapped[str] = mapped_column(String(320), default="")
    secret_nonce: Mapped[bytes | None] = mapped_column(LargeBinary)
    secret_ciphertext: Mapped[bytes | None] = mapped_column(LargeBinary)
    landlord_requires_bankid: Mapped[bool] = mapped_column(Boolean, default=False)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_error: Mapped[str | None] = mapped_column(String(64))
    next_renewal_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_kept_alive_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_keepalive_attempt_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    next_keepalive_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    keepalive_failures: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    keepalive_state: Mapped[str | None] = mapped_column(String(24))
    last_keepalive_code: Mapped[str | None] = mapped_column(String(64))
    fee_due_at: Mapped[date | None] = mapped_column(Date)


class Approval(Base):
    __tablename__ = "approvals"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    source_id: Mapped[str] = mapped_column(String(64))
    method: Mapped[str] = mapped_column(String(20))
    purpose: Mapped[str] = mapped_column(String(32))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    consumed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Job(Base):
    __tablename__ = "jobs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    source_id: Mapped[str] = mapped_column(String(64))
    kind: Mapped[str] = mapped_column(String(32))
    status: Mapped[str] = mapped_column(String(20), default="queued")
    payload: Mapped[str] = mapped_column(Text, default="{}")
    run_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    last_error: Mapped[str | None] = mapped_column(Text)


class Notice(Base):
    __tablename__ = "notices"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    kind: Mapped[str] = mapped_column(String(80))
    title: Mapped[str] = mapped_column(String(160))
    body: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    read: Mapped[bool] = mapped_column(Boolean, default=False)
    action_label: Mapped[str] = mapped_column(String(80), default="", server_default="")
    action_href: Mapped[str] = mapped_column(String(500), default="", server_default="")
    secondary_label: Mapped[str] = mapped_column(String(80), default="", server_default="")
    secondary_href: Mapped[str] = mapped_column(String(500), default="", server_default="")


class AuditLog(Base):
    __tablename__ = "audit_log"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    actor_email: Mapped[str] = mapped_column(String(320))
    action: Mapped[str] = mapped_column(String(80))
    target: Mapped[str] = mapped_column(String(200), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Review(Base):
    """One review per user and obtained apartment. Editable in place."""

    __tablename__ = "reviews"
    __table_args__ = (UniqueConstraint("user_id", "application_id", name="uq_review_user_application"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    firebase_uid: Mapped[str] = mapped_column(String(128), default="", index=True)
    application_id: Mapped[str] = mapped_column(String(80))
    listing_id: Mapped[str] = mapped_column(String(80), default="")
    rating: Mapped[int] = mapped_column(Integer)
    text: Mapped[str] = mapped_column(Text, default="")
    landlord: Mapped[str] = mapped_column(String(200), default="")
    publish_consent: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class DeletionJournal(Base):
    """Crash-recovery record for account deletion. No card data. The email is cleared when erasure finishes."""

    __tablename__ = "deletion_journal"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    firebase_uid: Mapped[str] = mapped_column(String(128), index=True)
    user_id: Mapped[str] = mapped_column(String(36), default="")
    scope: Mapped[str] = mapped_column(String(20))
    prior_email: Mapped[str] = mapped_column(String(320), default="")
    stripe_customer_id: Mapped[str] = mapped_column(String(64), default="")
    phase: Mapped[str] = mapped_column(String(32), default="started")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class AppleAccount(Base):
    """Maps an App Store appAccountToken and original transaction to a Firebase user."""

    __tablename__ = "apple_accounts"

    firebase_uid: Mapped[str] = mapped_column(String(128), primary_key=True)
    app_account_token: Mapped[str] = mapped_column(String(36), unique=True)
    original_transaction_id: Mapped[str | None] = mapped_column(String(64), unique=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class AppleNotification(Base):
    """Processed App Store Server Notification UUID. Retries are acknowledged and ignored."""

    __tablename__ = "apple_notifications"

    notification_uuid: Mapped[str] = mapped_column(String(64), primary_key=True)
    firebase_uid: Mapped[str] = mapped_column(String(128), default="")
    notification_type: Mapped[str] = mapped_column(String(64), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class DeviceToken(Base):
    """APNs or Expo push token for one iOS install. Not a landlord secret."""

    __tablename__ = "device_tokens"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    token: Mapped[str] = mapped_column(String(4096), unique=True)
    platform: Mapped[str] = mapped_column(String(16), default="ios")
    kind: Mapped[str] = mapped_column(String(16), default="apns")
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
