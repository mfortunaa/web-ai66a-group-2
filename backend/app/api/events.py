from datetime import date, datetime, time, timedelta, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import and_
from sqlmodel import Session, select

from app.core.security import get_current_user
from app.db.session import get_session
from app.models.event import Event, EventSession
from app.models.user import User
from app.schemas.event import EventListResponse, EventPublic, SaleStatusFilter
from app.services.events import HO_CHI_MINH, event_to_public, utc_database_value

router = APIRouter(prefix="/api/events", tags=["Events"])
SessionDep = Annotated[Session, Depends(get_session)]
CurrentUser = Annotated[User, Depends(get_current_user)]


@router.get("", response_model=EventListResponse)
def list_events(
    session: SessionDep,
    _current_user: CurrentUser,
    sale_status: Annotated[SaleStatusFilter | None, Query()] = None,
    date_from: Annotated[date | None, Query()] = None,
    date_to: Annotated[date | None, Query()] = None,
):
    if date_from is not None and date_to is not None and date_from > date_to:
        raise HTTPException(status_code=422, detail="date_from must be on or before date_to")

    statement = select(Event)
    local_start = None
    local_end_exclusive = None
    if date_from is not None:
        local_start = datetime.combine(date_from, time.min, tzinfo=HO_CHI_MINH)
    if date_to is not None:
        local_end_exclusive = datetime.combine(
            date_to + timedelta(days=1), time.min, tzinfo=HO_CHI_MINH
        )
    if local_start is not None or local_end_exclusive is not None:
        session_dates = select(EventSession.event_id)
        event_dates = []
        if local_start is not None:
            start_utc = utc_database_value(local_start)
            session_dates = session_dates.where(EventSession.starts_at >= start_utc)
            event_dates.append(Event.starts_at >= start_utc)
        if local_end_exclusive is not None:
            end_utc = utc_database_value(local_end_exclusive)
            session_dates = session_dates.where(EventSession.starts_at < end_utc)
            event_dates.append(Event.starts_at < end_utc)
        statement = statement.where(
            Event.id.in_(session_dates) | and_(*event_dates)
        )

    now = datetime.now(timezone.utc)
    database_now = utc_database_value(now)
    if sale_status == SaleStatusFilter.ON_SALE:
        statement = statement.where(
            Event.sales_open_at <= database_now,
            Event.sales_close_at > database_now,
        )
    elif sale_status == SaleStatusFilter.COMING_SOON:
        statement = statement.where(Event.sales_open_at > database_now)

    statement = statement.order_by(Event.starts_at, Event.id)
    events = session.exec(statement).all()
    event_ids = [event.id for event in events]
    sessions_by_event: dict[int, list[EventSession]] = {event_id: [] for event_id in event_ids}
    if event_ids:
        sessions = session.exec(
            select(EventSession)
            .where(EventSession.event_id.in_(event_ids))
            .order_by(EventSession.starts_at, EventSession.id)
        ).all()
        for event_session in sessions:
            sessions_by_event[event_session.event_id].append(event_session)
    public_events = [
        event_to_public(event, now, sessions_by_event[event.id])
        for event in events
    ]
    if sale_status == SaleStatusFilter.ON_SALE:
        public_events = [
            event for event in public_events if event.sale_status.value == "on_sale"
        ]
    elif sale_status == SaleStatusFilter.COMING_SOON:
        public_events = [
            event
            for event in public_events
            if event.sale_status.value == "coming_soon"
        ]
    return EventListResponse(items=public_events, total=len(public_events))


@router.get("/{event_id}", response_model=EventPublic)
def get_event(
    event_id: int,
    session: SessionDep,
    _current_user: CurrentUser,
):
    event = session.get(Event, event_id)
    if event is None:
        raise HTTPException(status_code=404, detail="Event not found")
    sessions = session.exec(
        select(EventSession)
        .where(EventSession.event_id == event_id)
        .order_by(EventSession.starts_at, EventSession.id)
    ).all()
    return event_to_public(event, sessions=sessions)
