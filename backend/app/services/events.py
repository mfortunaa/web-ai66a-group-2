from datetime import datetime, timezone
from zoneinfo import ZoneInfo

from app.models.event import Event, EventSession
from app.schemas.event import EventPublic, EventSessionPublic, SaleStatus

HO_CHI_MINH = ZoneInfo("Asia/Ho_Chi_Minh")


def as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def utc_database_value(value: datetime) -> datetime:
    return as_utc(value).replace(tzinfo=None)


def get_sale_status(
    event: Event,
    now: datetime | None = None,
    sessions: list[EventSession] | None = None,
) -> SaleStatus:
    current_time = as_utc(now or datetime.now(timezone.utc))
    upcoming_sessions = [
        item for item in sessions or [] if as_utc(item.starts_at) > current_time
    ]
    if sessions and not upcoming_sessions:
        return SaleStatus.CLOSED
    if current_time < as_utc(event.sales_open_at):
        return SaleStatus.COMING_SOON
    if current_time >= as_utc(event.sales_close_at):
        return SaleStatus.CLOSED
    if upcoming_sessions and not any(
        item.tickets_sold < item.capacity for item in upcoming_sessions
    ):
        return SaleStatus.SOLD_OUT
    if event.tickets_sold >= event.capacity:
        return SaleStatus.SOLD_OUT
    return SaleStatus.ON_SALE


def event_to_public(
    event: Event,
    now: datetime | None = None,
    sessions: list[EventSession] | None = None,
) -> EventPublic:
    event_sessions = sessions or []
    current_time = as_utc(now or datetime.now(timezone.utc))
    sale_status = get_sale_status(event, current_time, event_sessions)
    available_tickets = (
        sum(
            max(item.capacity - item.tickets_sold, 0)
            for item in event_sessions
            if as_utc(item.starts_at) > current_time
        )
        if event_sessions
        else 0
    )
    is_bookable = sale_status == SaleStatus.ON_SALE and any(
        as_utc(item.starts_at) > current_time and item.tickets_sold < item.capacity
        for item in event_sessions
    )
    if is_bookable:
        booking_unavailable_reason = None
    elif not event_sessions:
        booking_unavailable_reason = "schedule_not_defined"
    elif sale_status != SaleStatus.ON_SALE:
        booking_unavailable_reason = sale_status.value
    else:
        booking_unavailable_reason = "no_available_sessions"
    return EventPublic(
        id=event.id,
        slug=event.slug,
        title=event.title,
        description=event.description,
        image_url=event.image_url,
        venue=event.venue,
        address=event.address,
        starts_at=event.starts_at,
        ends_at=event.ends_at,
        sales_open_at=event.sales_open_at,
        sales_close_at=event.sales_close_at,
        ticket_price_vnd=event.ticket_price_vnd,
        capacity=event.capacity,
        tickets_sold=event.tickets_sold,
        available_tickets=available_tickets,
        sale_status=sale_status,
        is_bookable=is_bookable,
        booking_unavailable_reason=booking_unavailable_reason,
        sessions=[
            EventSessionPublic(
                id=item.id,
                starts_at=item.starts_at,
                ends_at=item.ends_at,
                capacity=item.capacity,
                tickets_sold=item.tickets_sold,
                available_tickets=max(item.capacity - item.tickets_sold, 0),
                is_bookable=(
                    sale_status == SaleStatus.ON_SALE
                    and as_utc(item.starts_at) > current_time
                    and item.tickets_sold < item.capacity
                ),
            )
            for item in event_sessions
        ],
    )
