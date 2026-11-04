from datetime import datetime, timezone
from typing import Literal

from pydantic import BaseModel, field_serializer, field_validator


class MyBookingItem(BaseModel):
    id: int
    reference: str
    event_id: int
    event_title: str
    session_starts_at: datetime
    session_ends_at: datetime
    venue: str
    quantity: int
    total_price_vnd: int
    status: Literal["pending", "confirmed", "payment_failed"]
    created_at: datetime
    can_retry_payment: bool
    retry_unavailable_reason: str | None

    @field_validator(
        "session_starts_at", "session_ends_at", "created_at"
    )
    @classmethod
    def normalize_datetime(cls, value: datetime) -> datetime:
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc)

    @field_serializer("session_starts_at", "session_ends_at", "created_at")
    def serialize_datetime(self, value: datetime) -> str:
        return value.isoformat().replace("+00:00", "Z")


class MyBookingListResponse(BaseModel):
    items: list[MyBookingItem]
    total: int
    limit: int
    offset: int
