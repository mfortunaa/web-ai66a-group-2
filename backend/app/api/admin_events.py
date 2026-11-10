from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, HTTPException, Response, UploadFile
from pydantic import Json
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select

from app.core.security import require_admin
from app.db.session import begin_read, begin_write, get_session
from app.models.booking import Booking
from app.models.event import Event, EventSession
from app.schemas.admin_event import EventCreate, EventData, SessionData
from app.schemas.event import EventListResponse, EventPublic
from app.services.event_covers import CoverUpload, InvalidCover, is_uploaded_cover, read_cover, remove_cover, save_cover
from app.services.events import as_utc, event_id_counter, events_to_public, utc_database_value

router = APIRouter(
    prefix="/api/admin/events", tags=["Admin Events"], dependencies=[Depends(require_admin)],
)
SessionDep = Annotated[Session, Depends(get_session)]


def conflict(code: str, message: str) -> HTTPException:
    return HTTPException(409, detail={"code": code, "message": message})


def load_event(session: Session, event_id: int) -> Event:
    event = session.get(Event, event_id)
    if event is None:
        raise HTTPException(404, detail="Event not found")
    return event


def event_values(data: EventData) -> dict:
    values = data.model_dump(exclude={"sessions", "image_url"})
    for key in ("starts_at", "ends_at", "sales_open_at", "sales_close_at"):
        values[key] = utc_database_value(values[key])
    return values


def session_values(data: SessionData) -> dict:
    return {
        "starts_at": utc_database_value(data.starts_at),
        "ends_at": utc_database_value(data.ends_at),
        "capacity": data.capacity,
    }


def save_event(session: Session, event: Event) -> EventPublic:
    try:
        # Build the response within the write transaction so a competing delete
        # cannot change which sessions belong to this saved version.
        session.flush()
        result = events_to_public(session, [event])[0]
        session.commit()
    except IntegrityError as error:
        session.rollback()
        raise conflict("schedule_conflict", "The event or session times conflict with existing data") from error
    return result


def check_slug(session: Session, slug: str, event_id: int | None = None) -> None:
    existing_id = session.exec(select(Event.id).where(Event.slug == slug)).first()
    if existing_id is not None and existing_id != event_id:
        raise conflict("duplicate_slug", "This event slug is already in use")


def validate_cover_url(url: str | None, current_url: str | None = None) -> str:
    if not url or (is_uploaded_cover(url) and url != current_url):
        raise HTTPException(422, detail={"code": "cover_required"})
    return url


def cover_from_file(file: UploadFile) -> CoverUpload:
    try:
        return read_cover(file.file)
    except InvalidCover as error:
        status_code = 413 if error.code == "cover_too_large" else 422
        raise HTTPException(status_code, detail={"code": error.code}) from error


@router.get("", response_model=EventListResponse)
def list_events(session: SessionDep):
    begin_read(session)
    events = session.exec(select(Event).order_by(Event.starts_at, Event.id)).all()
    return EventListResponse(items=events_to_public(session, events), total=len(events))


@router.post("", response_model=EventPublic, status_code=201)
def create_event(data: EventCreate, session: SessionDep):
    return insert_event(data, session)


@router.post("/with-cover", response_model=EventPublic, status_code=201)
def create_event_with_cover(
    event: Annotated[Json[EventCreate], Form()],
    cover: Annotated[UploadFile, File()],
    session: SessionDep,
):
    return insert_event(event, session, cover_from_file(cover))


def insert_event(data: EventCreate, session: Session, cover: CoverUpload | None = None):
    image_url = "" if cover else validate_cover_url(data.image_url)
    begin_write(session)
    check_slug(session, data.slug)
    event = Event(id=event_id_counter(session, Event).next_id(), image_url=image_url, **event_values(data))
    session.add(event)
    session.flush()
    if cover:
        event.image_url = save_cover(session, event.id, cover)
    counter = event_id_counter(session, EventSession)
    session.add_all(
        EventSession(id=counter.next_id(), event_id=event.id, **session_values(item)) for item in data.sessions
    )
    return save_event(session, event)


@router.put("/{event_id}", response_model=EventPublic)
def update_event(event_id: int, data: EventData, session: SessionDep):
    return edit_event(event_id, data, session)


@router.put("/{event_id}/with-cover", response_model=EventPublic)
def update_event_with_cover(
    event_id: int,
    event: Annotated[Json[EventData], Form()],
    cover: Annotated[UploadFile, File()],
    session: SessionDep,
):
    return edit_event(event_id, event, session, cover_from_file(cover))


def edit_event(event_id: int, data: EventData, session: Session, cover: CoverUpload | None = None):
    begin_write(session)
    event = load_event(session, event_id)
    image_url = event.image_url if cover else validate_cover_url(data.image_url, event.image_url)
    check_slug(session, data.slug, event_id)
    if data.capacity < event.tickets_sold:
        raise conflict("capacity_below_sales", "Event capacity cannot be lower than tickets already sold")

    current = {
        item.id: item for item in session.exec(select(EventSession).where(EventSession.event_id == event_id))
    }
    retained = {item.id: item for item in data.sessions if item.id is not None}
    if retained.keys() - current.keys():
        raise conflict("session_changed", "A session no longer belongs to this event")
    booked_ids = set(session.exec(
        select(Booking.event_session_id).where(Booking.event_id == event_id).distinct()
    ))
    counter = event_id_counter(session, EventSession)
    rescheduled = {}
    for item_id, previous in current.items():
        updated = retained.get(item_id)
        if updated is None:
            if item_id in booked_ids or previous.tickets_sold:
                raise conflict("booked_session", "A session with bookings cannot be removed or rescheduled")
            session.delete(previous)
            continue
        if updated.capacity < previous.tickets_sold:
            raise conflict("capacity_below_sales", "Session capacity cannot be lower than tickets already sold")
        start_changed = updated.starts_at != as_utc(previous.starts_at)
        if item_id in booked_ids and (start_changed or updated.ends_at != as_utc(previous.ends_at)):
            raise conflict("booked_session", "A session with bookings cannot be removed or rescheduled")
        if start_changed:
            rescheduled[item_id] = previous.tickets_sold
            session.delete(previous)

    # Release the old slots first so unbooked sessions can exchange start times.
    session.flush()
    event.sqlmodel_update(event_values(data))
    if cover:
        image_url = save_cover(session, event_id, cover)
    elif image_url != event.image_url and is_uploaded_cover(event.image_url):
        remove_cover(session, event_id)
    event.image_url = image_url
    for item in data.sessions:
        values = session_values(item)
        if item.id is None:
            session.add(EventSession(id=counter.next_id(), event_id=event_id, **values))
        elif item.id in rescheduled:
            session.add(EventSession(id=item.id, event_id=event_id, tickets_sold=rescheduled[item.id], **values))
        else:
            current[item.id].sqlmodel_update(values)
    return save_event(session, event)


@router.delete("/{event_id}", status_code=204)
def delete_event(event_id: int, session: SessionDep):
    begin_write(session)
    event = load_event(session, event_id)
    has_bookings = session.exec(select(Booking.id).where(Booking.event_id == event_id).limit(1)).first()
    if has_bookings is not None or event.tickets_sold:
        raise conflict("event_has_bookings", "An event with bookings cannot be deleted")
    sessions = session.exec(select(EventSession).where(EventSession.event_id == event_id)).all()
    if any(item.tickets_sold for item in sessions):
        raise conflict("event_has_bookings", "An event with tickets sold cannot be deleted")
    event_id_counter(session, Event)
    event_id_counter(session, EventSession)
    for item in sessions:
        session.delete(item)
    session.flush()
    if is_uploaded_cover(event.image_url):
        remove_cover(session, event_id)
    session.delete(event)
    session.commit()
    return Response(status_code=204)
