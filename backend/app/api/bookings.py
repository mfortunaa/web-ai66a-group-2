from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException, Response
from sqlmodel import Session

from app.core.security import get_current_user
from app.db.session import get_session
from app.models.booking import Booking
from app.models.event import Event, EventSession
from app.models.user import User
from app.schemas.booking import BookingCreate, BookingRead, SimulatePaymentRequest
from app.services import bookings as service

router = APIRouter(prefix="/api/bookings", tags=["Bookings"])

CurrentUser = Annotated[User, Depends(get_current_user)]
DbSession = Annotated[Session, Depends(get_session)]


def _read(session: Session, booking: Booking) -> BookingRead:
    event = session.get(Event, booking.event_id)
    event_session = session.get(EventSession, booking.event_session_id)
    return BookingRead(
        **booking.model_dump(),
        event_title=event.title,
        session_starts_at=event_session.starts_at,
        session_ends_at=event_session.ends_at,
    )


def _http(error: service.BookingError) -> HTTPException:
    return HTTPException(status_code=error.status_code, detail=error.message)


@router.post("", response_model=BookingRead, status_code=201)
def create_booking(
    data: BookingCreate,
    response: Response,
    user: CurrentUser,
    session: DbSession,
    idempotency_key: Annotated[str | None, Header(alias="Idempotency-Key", min_length=8, max_length=128)] = None,
):
    try:
        booking, created = service.create_booking(session, user.id, data, idempotency_key)
    except service.BookingError as error:
        raise _http(error)
    if not created:
        response.status_code = 200  # replay of an earlier identical request
    return _read(session, booking)


@router.get("/{booking_id}", response_model=BookingRead)
def read_booking(booking_id: int, user: CurrentUser, session: DbSession):
    try:
        return _read(session, service.get_booking(session, user.id, booking_id))
    except service.BookingError as error:
        raise _http(error)


@router.post("/{booking_id}/simulate-payment", response_model=BookingRead)
def simulate_payment(booking_id: int, body: SimulatePaymentRequest, user: CurrentUser, session: DbSession):
    try:
        return _read(session, service.simulate_payment(session, user.id, booking_id, body.outcome))
    except service.BookingError as error:
        raise _http(error)
