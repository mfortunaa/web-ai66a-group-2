"""Booking rules. Framework-free; My Bookings must reuse these functions.

State transitions (simulate_payment):
  pending        --success--> confirmed   (sales window, session and stock rechecked atomically)
  pending        --failure--> payment_failed
  payment_failed --success--> confirmed   (same checks), --failure--> payment_failed
  confirmed      --any-----> confirmed    (terminal; stock and paid_at untouched)
Pending / failed bookings never reserve stock. Confirmation increments the selected
session's tickets_sold and the event total in the same transaction.
"""
import hashlib
import json
import secrets
from datetime import datetime

from sqlalchemy import update
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select

from app.models.booking import Booking, BookingStatus, utcnow
from app.models.event import Event, EventSession
from app.schemas.booking import BookingCreate
from app.services.events import as_utc

OPEN_STATES = (BookingStatus.PENDING.value, BookingStatus.PAYMENT_FAILED.value)


class BookingError(Exception):
    def __init__(self, status_code: int, message: str):
        self.status_code, self.message = status_code, message


def _check_bookable(event: Event, event_session: EventSession, now: datetime) -> None:
    if now < as_utc(event.sales_open_at):
        raise BookingError(409, "Ticket sales have not opened for this event")
    if now >= as_utc(event.sales_close_at) or as_utc(event_session.starts_at) <= now:
        raise BookingError(409, "Ticket sales are closed for this session")


def _fingerprint(data: BookingCreate) -> str:
    raw = json.dumps([data.event_session_id, data.quantity, data.attendee_name, data.attendee_email, data.attendee_phone])
    return hashlib.sha256(raw.encode()).hexdigest()


def _by_key(session: Session, user_id: int, key: str) -> Booking | None:
    return session.exec(select(Booking).where(Booking.user_id == user_id, Booking.request_key == key)).first()


def _replay(existing: Booking, fingerprint: str):
    if existing.request_fingerprint != fingerprint:
        raise BookingError(409, "This request key was already used with different booking details")
    return existing, False


def create_booking(session: Session, user_id: int, data: BookingCreate, request_key: str | None):
    """Returns (booking, created). Same key + payload returns the original booking (created=False)."""
    fingerprint = _fingerprint(data)
    if request_key:
        existing = _by_key(session, user_id, request_key)
        if existing:
            return _replay(existing, fingerprint)
    event_session = session.get(EventSession, data.event_session_id)
    event = session.get(Event, event_session.event_id) if event_session else None
    if event_session is None or event is None:
        raise BookingError(404, "Event session not found")
    _check_bookable(event, event_session, utcnow())
    if data.quantity > event_session.capacity - event_session.tickets_sold:
        raise BookingError(409, "Not enough tickets left for this session")
    for _ in range(5):
        booking = Booking(
            reference="BK-" + secrets.token_hex(4).upper(), user_id=user_id, event_id=event.id,
            event_session_id=event_session.id, quantity=data.quantity,
            attendee_name=data.attendee_name, attendee_email=data.attendee_email,
            attendee_phone=data.attendee_phone, unit_price_vnd=event.ticket_price_vnd,
            total_price_vnd=event.ticket_price_vnd * data.quantity,
            request_key=request_key, request_fingerprint=fingerprint if request_key else None,
        )
        session.add(booking)
        try:
            session.commit()  # booking + dedup record are one row: atomic
            session.refresh(booking)
            return booking, True
        except IntegrityError:
            session.rollback()
            if request_key:
                existing = _by_key(session, user_id, request_key)
                if existing:  # concurrent duplicate create
                    return _replay(existing, fingerprint)
            # otherwise: reference collision, retry with a new reference
    raise BookingError(500, "Could not create booking, please try again")


def get_booking(session: Session, user_id: int, booking_id: int) -> Booking:
    booking = session.get(Booking, booking_id)
    if booking is None:
        raise BookingError(404, "Booking not found")
    if booking.user_id != user_id:
        raise BookingError(403, "You do not have access to this booking")
    return booking


def payment_retry_status(
    session: Session,
    booking: Booking,
    now: datetime | None = None,
) -> tuple[bool, str | None]:
    if booking.cancelled_at is not None:
        return False, "cancelled"
    if booking.status == BookingStatus.CONFIRMED.value:
        return False, "already_confirmed"
    if booking.status not in OPEN_STATES:
        return False, "not_retryable"

    event = session.get(Event, booking.event_id)
    event_session = session.get(EventSession, booking.event_session_id)
    if event is None or event_session is None:
        return False, "event_unavailable"

    current_time = as_utc(now or utcnow())
    try:
        _check_bookable(event, event_session, current_time)
    except BookingError as error:
        if "not opened" in error.message:
            return False, "sales_not_open"
        return False, "sales_closed"

    if (
        event_session.capacity - event_session.tickets_sold < booking.quantity
        or event.capacity - event.tickets_sold < booking.quantity
    ):
        return False, "tickets_unavailable"
    return True, None


def cancel_booking(session: Session, user_id: int, booking_id: int) -> Booking:
    booking = get_booking(session, user_id, booking_id)
    # No refund or stock release. Repeating this action retains the first timestamp.
    session.execute(
        update(Booking).where(Booking.id == booking.id, Booking.cancelled_at.is_(None))
        .values(cancelled_at=utcnow(), updated_at=utcnow()),
        execution_options={"synchronize_session": False},
    )
    session.commit()
    session.refresh(booking)
    return booking


def simulate_payment(session: Session, user_id: int, booking_id: int, outcome: str) -> Booking:
    booking = get_booking(session, user_id, booking_id)
    if booking.cancelled_at is not None:
        raise BookingError(409, "Cancelled bookings cannot be paid")
    if booking.status == BookingStatus.CONFIRMED.value:
        return booking
    now = utcnow()
    if outcome == "failure":
        # Conditional: can never overwrite a concurrent confirmation.
        session.execute(
            update(Booking).where(Booking.id == booking.id, Booking.status.in_(OPEN_STATES), Booking.cancelled_at.is_(None))
            .values(status=BookingStatus.PAYMENT_FAILED.value, updated_at=now),
            execution_options={"synchronize_session": False},
        )
        session.commit()
        session.refresh(booking)
        if booking.cancelled_at is not None:
            raise BookingError(409, "Cancelled bookings cannot be paid")
        return booking
    event = session.get(Event, booking.event_id)
    event_session = session.get(EventSession, booking.event_session_id)
    if event is None or event_session is None:
        raise BookingError(404, "Event session not found")
    _check_bookable(event, event_session, now)
    claimed = session.execute(
        update(Booking).where(Booking.id == booking.id, Booking.status.in_(OPEN_STATES), Booking.cancelled_at.is_(None))
        .values(status=BookingStatus.CONFIRMED.value, paid_at=now, updated_at=now),
        execution_options={"synchronize_session": False},
    )
    if claimed.rowcount == 0:  # someone else confirmed first: idempotent
        session.rollback()
        session.refresh(booking)
        if booking.cancelled_at is not None:
            raise BookingError(409, "Cancelled bookings cannot be paid")
        return booking
    session_stock = session.execute(
        update(EventSession)
        .where(EventSession.id == booking.event_session_id,
               EventSession.tickets_sold + booking.quantity <= EventSession.capacity)
        .values(tickets_sold=EventSession.tickets_sold + booking.quantity),
        execution_options={"synchronize_session": False},
    )
    event_stock = session.execute(
        update(Event)
        .where(Event.id == booking.event_id, Event.tickets_sold + booking.quantity <= Event.capacity)
        .values(tickets_sold=Event.tickets_sold + booking.quantity),
        execution_options={"synchronize_session": False},
    )
    if session_stock.rowcount == 0 or event_stock.rowcount == 0:
        session.rollback()  # undo the claim: booking stays unconfirmed, no stock consumed
        raise BookingError(409, "Not enough tickets left to confirm this booking")
    session.commit()  # confirm + session stock + event stock in one transaction
    session.refresh(booking)
    return booking
