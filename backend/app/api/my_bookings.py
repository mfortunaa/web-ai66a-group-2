from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func
from sqlmodel import Session, select

from app.core.security import get_current_user
from app.db.session import get_session
from app.models.booking import Booking
from app.models.event import Event, EventSession
from app.models.user import User
from app.schemas.my_bookings import MyBookingItem, MyBookingListResponse
from app.services.bookings import payment_retry_status

router = APIRouter(prefix="/api/bookings", tags=["My Bookings"])

CurrentUser = Annotated[User, Depends(get_current_user)]
DbSession = Annotated[Session, Depends(get_session)]


@router.get("", response_model=MyBookingListResponse, summary="List my bookings")
def list_my_bookings(
    user: CurrentUser,
    session: DbSession,
    limit: Annotated[int, Query(ge=1, le=50)] = 10,
    offset: Annotated[int, Query(ge=0, le=10_000)] = 0,
):
    total = session.exec(
        select(func.count())
        .select_from(Booking)
        .where(Booking.user_id == user.id)
    ).one()
    rows = session.exec(
        select(Booking, Event, EventSession)
        .join(Event, Event.id == Booking.event_id)
        .join(EventSession, EventSession.id == Booking.event_session_id)
        .where(Booking.user_id == user.id)
        .order_by(Booking.created_at.desc(), Booking.id.desc())
        .offset(offset)
        .limit(limit)
    ).all()

    items = []
    for booking, event, event_session in rows:
        can_retry, unavailable_reason = payment_retry_status(session, booking)
        items.append(
            MyBookingItem(
                id=booking.id,
                reference=booking.reference,
                event_id=event.id,
                event_title=event.title,
                session_starts_at=event_session.starts_at,
                session_ends_at=event_session.ends_at,
                venue=event.venue,
                quantity=booking.quantity,
                total_price_vnd=booking.total_price_vnd,
                status="cancelled" if booking.cancelled_at else booking.status,
                created_at=booking.created_at,
                can_retry_payment=can_retry,
                retry_unavailable_reason=unavailable_reason,
            )
        )
    return MyBookingListResponse(
        items=items,
        total=total,
        limit=limit,
        offset=offset,
    )
