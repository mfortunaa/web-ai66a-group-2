from datetime import datetime, timezone
from enum import Enum

from pydantic import (
    BaseModel,
    ConfigDict,
    field_serializer,
    field_validator,
)


class SaleStatus(str, Enum):
    ON_SALE = "on_sale"
    COMING_SOON = "coming_soon"
    SOLD_OUT = "sold_out"
    CLOSED = "closed"


class SaleStatusFilter(str, Enum):
    ON_SALE = "on_sale"
    COMING_SOON = "coming_soon"


class EventSessionPublic(BaseModel):
    id: int
    starts_at: datetime
    ends_at: datetime
    capacity: int
    tickets_sold: int
    available_tickets: int
    is_bookable: bool

    @field_validator("starts_at", "ends_at")
    @classmethod
    def normalize_datetime(cls, value: datetime) -> datetime:
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc)

    @field_serializer("starts_at", "ends_at")
    def serialize_datetime(self, value: datetime) -> str:
        return value.isoformat(timespec="seconds").replace("+00:00", "Z")


class EventPublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    slug: str
    title: str
    description: str
    image_url: str
    venue: str
    address: str
    starts_at: datetime
    ends_at: datetime
    sales_open_at: datetime
    sales_close_at: datetime
    ticket_price_vnd: int
    capacity: int
    tickets_sold: int
    available_tickets: int
    sale_status: SaleStatus
    is_bookable: bool
    booking_unavailable_reason: str | None
    sessions: list[EventSessionPublic]

    @field_validator("starts_at", "ends_at", "sales_open_at", "sales_close_at")
    @classmethod
    def normalize_datetime(cls, value: datetime) -> datetime:
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc)

    @field_serializer("starts_at", "ends_at", "sales_open_at", "sales_close_at")
    def serialize_datetime(self, value: datetime) -> str:
        return value.isoformat(timespec="seconds").replace("+00:00", "Z")


class EventListResponse(BaseModel):
    items: list[EventPublic]
    total: int


class EventHighlight(BaseModel):
    title: str
    venue: str
    image_url: str
    is_past: bool
