from datetime import date, datetime, time, timedelta, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import and_
from sqlmodel import Session, select

from app.core.security import get_current_user
from app.db.session import begin_read, get_session
from app.models.event import Event, EventCover, EventSession
from app.models.user import User
from app.schemas.event import EventHighlight, EventListResponse, EventPublic, SaleStatusFilter
from app.services.events import HO_CHI_MINH, events_to_public, utc_database_value

router = APIRouter(prefix="/api/events", tags=["Events"])
SessionDep = Annotated[Session, Depends(get_session)]
CurrentUser = Annotated[User, Depends(get_current_user)]
HIGHLIGHT_LIMIT = 8


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

    begin_read(session)
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
    public_events = events_to_public(session, events, now)
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


@router.get("/highlights", response_model=list[EventHighlight])
def list_event_highlights(session: SessionDep):
    begin_read(session)
    now = utc_database_value(datetime.now(timezone.utc))
    previews = select(Event.title, Event.venue, Event.image_url)
    current = session.exec(
        previews.where(Event.ends_at > now).order_by(Event.starts_at, Event.id).limit(HIGHLIGHT_LIMIT)
    ).all()
    past = session.exec(
        previews.where(Event.ends_at <= now)
        .order_by(Event.ends_at.desc(), Event.id.desc())
        .limit(HIGHLIGHT_LIMIT - len(current))
    ).all()
    return [
        EventHighlight(title=title, venue=venue, image_url=image_url, is_past=is_past)
        for rows, is_past in ((current, False), (past, True))
        for title, venue, image_url in rows
    ]


@router.get("/{event_id}", response_model=EventPublic)
def get_event(
    event_id: int,
    session: SessionDep,
    _current_user: CurrentUser,
):
    begin_read(session)
    event = session.get(Event, event_id)
    if event is None:
        raise HTTPException(status_code=404, detail="Event not found")
    return events_to_public(session, [event])[0]


@router.get("/{event_id}/cover")
def get_event_cover(event_id: int, session: SessionDep):
    cover = session.get(EventCover, event_id)
    if cover is None:
        raise HTTPException(404, detail="Event cover not found")
    return Response(
        content=cover.content,
        media_type=cover.content_type,
        headers={"X-Content-Type-Options": "nosniff", "Cache-Control": "no-cache"},
    )
