from datetime import datetime, timezone
from typing import Literal

from pydantic import BaseModel, Field, field_serializer, field_validator

_EMAIL = r"^[^\s@]+@[^\s@]+\.[^\s@]+$"
_PHONE = r"^\+?[0-9 .\-]+$"


class BookingCreate(BaseModel):
    """Unknown fields (e.g. a client-sent price) are ignored; prices are always server-side."""

    event_session_id: int = Field(gt=0, strict=True)
    quantity: int = Field(gt=0, strict=True)
    attendee_name: str = Field(min_length=2, max_length=120)
    attendee_email: str = Field(max_length=254, pattern=_EMAIL)
    attendee_phone: str = Field(min_length=8, max_length=20, pattern=_PHONE)

    @field_validator("attendee_name", "attendee_email", "attendee_phone", mode="before")
    @classmethod
    def _strip(cls, value):
        return value.strip() if isinstance(value, str) else value

    @field_validator("attendee_phone")
    @classmethod
    def _phone_digits(cls, value: str) -> str:
        # Separators are accepted for readability but do not count as digits.
        digits = sum(character in "0123456789" for character in value)
        if not 8 <= digits <= 15:
            raise ValueError("Phone number must contain between 8 and 15 digits")
        return value


class SimulatePaymentRequest(BaseModel):
    outcome: Literal["success", "failure"]


class BookingRead(BaseModel):
    id: int
    reference: str
    event_id: int
    event_title: str
    event_session_id: int
    session_starts_at: datetime
    session_ends_at: datetime
    quantity: int
    unit_price_vnd: int
    total_price_vnd: int
    attendee_name: str
    attendee_email: str
    attendee_phone: str
    status: Literal["pending", "confirmed", "payment_failed"]
    created_at: datetime
    paid_at: datetime | None = None

    @field_validator("session_starts_at", "session_ends_at", "created_at", "paid_at")
    @classmethod
    def normalize_datetime(cls, value: datetime | None) -> datetime | None:
        if value is None:
            return None
        # SQLite returns stored UTC timestamps without timezone information.
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc)

    @field_serializer("session_starts_at", "session_ends_at", "created_at", "paid_at")
    def serialize_datetime(self, value: datetime | None) -> str | None:
        return value.isoformat().replace("+00:00", "Z") if value is not None else None
