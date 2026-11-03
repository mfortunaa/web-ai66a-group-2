from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, UniqueConstraint
from sqlmodel import Field, SQLModel


class Event(SQLModel, table=True):
    __tablename__ = "events"
    __table_args__ = (
        CheckConstraint("starts_at < ends_at", name="ck_events_start_before_end"),
        CheckConstraint("sales_open_at < sales_close_at", name="ck_events_sales_window"),
        CheckConstraint("ticket_price_vnd >= 0", name="ck_events_nonnegative_price"),
        CheckConstraint("capacity > 0", name="ck_events_positive_capacity"),
        CheckConstraint(
            "tickets_sold >= 0 AND tickets_sold <= capacity",
            name="ck_events_valid_tickets_sold",
        ),
    )

    id: int | None = Field(default=None, primary_key=True)
    slug: str = Field(unique=True, index=True, max_length=100)
    title: str = Field(max_length=200)
    description: str
    image_url: str = Field(max_length=500)
    venue: str = Field(max_length=200)
    address: str = Field(max_length=300)
    starts_at: datetime = Field(sa_type=DateTime(timezone=True))
    ends_at: datetime = Field(sa_type=DateTime(timezone=True))
    sales_open_at: datetime = Field(sa_type=DateTime(timezone=True))
    sales_close_at: datetime = Field(sa_type=DateTime(timezone=True))
    ticket_price_vnd: int = Field(ge=0)
    capacity: int = Field(gt=0)
    tickets_sold: int = Field(default=0, ge=0)


class EventSession(SQLModel, table=True):
    __tablename__ = "event_sessions"
    __table_args__ = (
        UniqueConstraint("event_id", "starts_at", name="uq_event_sessions_start"),
        CheckConstraint("starts_at < ends_at", name="ck_event_sessions_start_before_end"),
        CheckConstraint("capacity > 0", name="ck_event_sessions_positive_capacity"),
        CheckConstraint(
            "tickets_sold >= 0 AND tickets_sold <= capacity",
            name="ck_event_sessions_valid_tickets_sold",
        ),
    )

    id: int | None = Field(default=None, primary_key=True)
    event_id: int = Field(foreign_key="events.id", index=True)
    starts_at: datetime = Field(sa_type=DateTime(timezone=True))
    ends_at: datetime = Field(sa_type=DateTime(timezone=True))
    capacity: int = Field(gt=0)
    tickets_sold: int = Field(default=0, ge=0)
