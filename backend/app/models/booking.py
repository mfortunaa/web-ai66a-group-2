from datetime import datetime, timezone
from enum import Enum

from sqlalchemy import CheckConstraint, DateTime, UniqueConstraint
from sqlmodel import Field, SQLModel


class BookingStatus(str, Enum):
    PENDING = "pending"
    CONFIRMED = "confirmed"
    PAYMENT_FAILED = "payment_failed"


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Booking(SQLModel, table=True):
    __tablename__ = "bookings"
    __table_args__ = (
        # NULL request keys are not deduplicated; the same key may be used by different users.
        UniqueConstraint("user_id", "request_key", name="uq_bookings_user_request_key"),
        CheckConstraint("quantity > 0", name="ck_bookings_positive_quantity"),
        CheckConstraint("unit_price_vnd >= 0 AND total_price_vnd >= 0", name="ck_bookings_nonnegative_price"),
        CheckConstraint("status IN ('pending', 'confirmed', 'payment_failed')", name="ck_bookings_status"),
    )

    id: int | None = Field(default=None, primary_key=True)
    reference: str = Field(unique=True, index=True, max_length=20)
    user_id: int = Field(foreign_key="users.id", index=True)
    event_id: int = Field(foreign_key="events.id", index=True)
    event_session_id: int = Field(foreign_key="event_sessions.id", index=True)
    quantity: int
    attendee_name: str = Field(max_length=120)
    attendee_email: str = Field(max_length=254)
    attendee_phone: str = Field(max_length=20)
    unit_price_vnd: int  # snapshot taken on the server at creation
    total_price_vnd: int  # unit_price_vnd * quantity
    status: str = Field(default=BookingStatus.PENDING.value, index=True)
    request_key: str | None = Field(default=None, max_length=128)
    request_fingerprint: str | None = Field(default=None, max_length=64)
    created_at: datetime = Field(default_factory=utcnow, sa_type=DateTime(timezone=True))
    updated_at: datetime = Field(default_factory=utcnow, sa_type=DateTime(timezone=True))
    paid_at: datetime | None = Field(default=None, sa_type=DateTime(timezone=True))
