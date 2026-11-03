from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator

_EMAIL = r"^[^\s@]+@[^\s@]+\.[^\s@]+$"
_PHONE = r"^\+?[0-9 .\-]{8,15}$"


class BookingCreate(BaseModel):
    """Unknown fields (e.g. a client-sent price) are ignored; prices are always server-side."""

    event_session_id: int = Field(gt=0, strict=True)
    quantity: int = Field(gt=0, strict=True)
    attendee_name: str = Field(min_length=2, max_length=120)
    attendee_email: str = Field(max_length=254, pattern=_EMAIL)
    attendee_phone: str = Field(pattern=_PHONE)

    @field_validator("attendee_name", "attendee_email", "attendee_phone", mode="before")
    @classmethod
    def _strip(cls, value):
        return value.strip() if isinstance(value, str) else value


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
