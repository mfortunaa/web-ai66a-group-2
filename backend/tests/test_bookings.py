import threading
from datetime import datetime, timedelta, timezone

import pytest
from sqlmodel import Session, SQLModel, create_engine, select

from app.models.booking import Booking
from app.models.event import Event, EventSession
from app.models.user import User
from app.schemas.booking import BookingCreate, BookingRead
from app.services import bookings as service

ATTENDEE = {"attendee_name": "An Nguyen", "attendee_email": "an@example.com", "attendee_phone": "0901234567"}
PRICE = 499_000


def now() -> datetime:
    return datetime.now(timezone.utc)


def add_event(engine, slug="show", session_capacities=(10,), *, price=PRICE, sales_open=None, sales_close=None,
              first_session_in_days=10) -> tuple[int, list[int]]:
    """Insert an event with sessions; returns (event_id, [session_ids])."""
    with Session(engine) as db:
        start = now() + timedelta(days=first_session_in_days)
        event = Event(
            slug=slug, title=f"Event {slug}", description="d", image_url="/x.webp", venue="v", address="a",
            starts_at=start, ends_at=start + timedelta(days=len(session_capacities), hours=2),
            sales_open_at=sales_open or now() - timedelta(days=1),
            sales_close_at=sales_close or start + timedelta(days=len(session_capacities)),
            ticket_price_vnd=price, capacity=sum(session_capacities), tickets_sold=0,
        )
        db.add(event)
        db.commit()
        ids = []
        for i, cap in enumerate(session_capacities):
            s = EventSession(event_id=event.id, starts_at=start + timedelta(days=i),
                             ends_at=start + timedelta(days=i, hours=2), capacity=cap)
            db.add(s)
            db.commit()
            ids.append(s.id)
        return event.id, ids


def stock(engine, event_id, session_id):
    with Session(engine) as db:
        return db.get(Event, event_id).tickets_sold, db.get(EventSession, session_id).tickets_sold


def login(client, email="buyer@example.com"):
    client.post("/api/auth/register", json={"full_name": "Buyer", "email": email, "password": "password123"})
    token = client.post("/api/auth/token", data={"username": email, "password": "password123"}).json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def book(client, headers, session_id, key=None, **overrides):
    h = dict(headers)
    if key:
        h["Idempotency-Key"] = key
    return client.post("/api/bookings", json={"event_session_id": session_id, "quantity": 2, **ATTENDEE, **overrides}, headers=h)


def pay(client, headers, booking_id, outcome):
    return client.post(f"/api/bookings/{booking_id}/simulate-payment", json={"outcome": outcome}, headers=headers)


@pytest.fixture
def buyer(client):
    return login(client)


@pytest.fixture
def other(client):
    return login(client, "other@example.com")


def test_success_flow_uses_server_price_and_consumes_stock_on_confirm(client, db_engine, buyer):
    event_id, (sid,) = add_event(db_engine)
    r = book(client, buyer, sid, unit_price_vnd=1, total_price_vnd=1, ticket_price_vnd=1)  # client prices ignored
    assert r.status_code == 201
    b = r.json()
    assert (b["status"], b["unit_price_vnd"], b["total_price_vnd"]) == ("pending", PRICE, 2 * PRICE)
    assert (b["event_id"], b["event_session_id"], b["event_title"]) == (event_id, sid, "Event show")
    assert stock(db_engine, event_id, sid) == (0, 0)  # pending does not reserve
    paid = pay(client, buyer, b["id"], "success").json()
    assert paid["status"] == "confirmed" and paid["paid_at"] and paid["reference"].startswith("BK-")
    assert client.get(f"/api/bookings/{b['id']}", headers=buyer).json()["reference"] == paid["reference"]
    assert stock(db_engine, event_id, sid) == (2, 2)


@pytest.mark.parametrize("bad", [{"quantity": 0}, {"quantity": -1}, {"quantity": 1.5}, {"quantity": "2"},
                                 {"attendee_name": " "}, {"attendee_email": "nope"}, {"attendee_phone": "12"}])
def test_validation_errors(client, db_engine, buyer, bad):
    _, (sid,) = add_event(db_engine)
    assert book(client, buyer, sid, **bad).status_code == 422


def test_missing_session_id_is_422_and_unknown_session_is_404(client, db_engine, buyer):
    add_event(db_engine)
    assert client.post("/api/bookings", json={"quantity": 1, **ATTENDEE}, headers=buyer).status_code == 422
    assert book(client, buyer, 9999).status_code == 404


def test_requires_login(client, db_engine):
    _, (sid,) = add_event(db_engine)
    assert client.post("/api/bookings", json={"event_session_id": sid, "quantity": 1, **ATTENDEE}).status_code == 401
    assert client.get("/api/bookings/1").status_code == 401


def test_rejects_closed_unopened_past_and_sold_out(client, db_engine, buyer):
    _, (ok,) = add_event(db_engine, "ok", (3,))
    assert book(client, buyer, ok, quantity=4).status_code == 409  # more than the session has
    _, (closed,) = add_event(db_engine, "closed", sales_close=now() - timedelta(hours=1))
    assert book(client, buyer, closed).status_code == 409
    _, (soon,) = add_event(db_engine, "soon", sales_open=now() + timedelta(days=1))
    assert book(client, buyer, soon).status_code == 409
    _, (past,) = add_event(db_engine, "past", first_session_in_days=-1, sales_close=now() + timedelta(days=1))
    assert book(client, buyer, past).status_code == 409


def test_sessions_have_independent_stock(client, db_engine, buyer, other):
    event_id, (a, b) = add_event(db_engine, "multi", (2, 5))
    first = book(client, buyer, a).json()
    assert pay(client, buyer, first["id"], "success").status_code == 200
    assert book(client, other, a, quantity=1).status_code == 409  # session A is sold out
    second = book(client, other, b).json()                         # session B is untouched
    assert pay(client, other, second["id"], "success").status_code == 200
    with Session(db_engine) as db:
        assert (db.get(EventSession, a).tickets_sold, db.get(EventSession, b).tickets_sold, db.get(Event, event_id).tickets_sold) == (2, 2, 4)


def test_other_users_booking_is_forbidden(client, db_engine, buyer, other):
    _, (sid,) = add_event(db_engine)
    bid = book(client, buyer, sid).json()["id"]
    assert client.get(f"/api/bookings/{bid}", headers=other).status_code == 403
    assert pay(client, other, bid, "success").status_code == 403
    assert client.get("/api/bookings/9999", headers=buyer).status_code == 404


def test_failure_does_not_consume_stock_and_can_retry(client, db_engine, buyer):
    event_id, (sid,) = add_event(db_engine)
    bid = book(client, buyer, sid).json()["id"]
    assert pay(client, buyer, bid, "failure").json()["status"] == "payment_failed"
    assert stock(db_engine, event_id, sid) == (0, 0)
    assert pay(client, buyer, bid, "failure").json()["status"] == "payment_failed"
    assert pay(client, buyer, bid, "success").json()["status"] == "confirmed"
    assert stock(db_engine, event_id, sid) == (2, 2)


def test_confirmed_is_terminal(client, db_engine, buyer):
    event_id, (sid,) = add_event(db_engine)
    bid = book(client, buyer, sid).json()["id"]
    first = pay(client, buyer, bid, "success").json()
    again = pay(client, buyer, bid, "success").json()
    failed = pay(client, buyer, bid, "failure").json()
    assert again["paid_at"] == first["paid_at"] == failed["paid_at"] and failed["status"] == "confirmed"
    assert stock(db_engine, event_id, sid) == (2, 2)


def test_pending_bookings_do_not_reserve_last_ticket(client, db_engine, buyer, other):
    event_id, (sid,) = add_event(db_engine, "last", (1,))
    a = book(client, buyer, sid, quantity=1).json()["id"]
    b = book(client, other, sid, quantity=1).json()["id"]
    assert pay(client, buyer, a, "success").status_code == 200
    assert pay(client, other, b, "success").status_code == 409
    assert client.get(f"/api/bookings/{b}", headers=other).json()["status"] == "pending"
    assert stock(db_engine, event_id, sid) == (1, 1)


def test_payment_rechecks_sales_window(client, db_engine, buyer):
    event_id, (sid,) = add_event(db_engine)
    bid = book(client, buyer, sid).json()["id"]
    with Session(db_engine) as db:
        event = db.get(Event, event_id)
        event.sales_close_at = now() - timedelta(seconds=1)
        db.add(event)
        db.commit()
    assert pay(client, buyer, bid, "success").status_code == 409
    assert stock(db_engine, event_id, sid) == (0, 0)


def test_idempotent_create(client, db_engine, buyer, other):
    _, (sid,) = add_event(db_engine)
    first = book(client, buyer, sid, key="retry-key-1")
    replay = book(client, buyer, sid, key="retry-key-1")  # e.g. retry after the response was lost
    assert (first.status_code, replay.status_code) == (201, 200)
    assert first.json()["id"] == replay.json()["id"] and first.json()["reference"] == replay.json()["reference"]
    assert book(client, buyer, sid, key="retry-key-1", quantity=3).status_code == 409
    assert book(client, other, sid, key="retry-key-1").json()["id"] != first.json()["id"]  # keys are per user
    with Session(db_engine) as db:
        assert len(db.exec(select(Booking)).all()) == 2


def test_cors_allows_idempotency_key_header(client):
    r = client.options("/api/bookings", headers={
        "Origin": "http://localhost:5500", "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "idempotency-key,authorization,content-type"})
    assert r.status_code == 200 and "idempotency-key" in r.headers["access-control-allow-headers"].lower()


# ---- concurrency: real file-based SQLite, one Session per thread, service layer ----

@pytest.fixture
def race_engine(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 'race.db'}", connect_args={"check_same_thread": False, "timeout": 30})
    SQLModel.metadata.create_all(engine)
    with Session(engine) as db:
        db.add_all([User(id=1, full_name="A", email="a@x.vn", password_hash="x"),
                    User(id=2, full_name="B", email="b@x.vn", password_hash="x")])
        db.commit()
    return engine


def race(engine, functions):
    errors = []

    def run(fn):
        try:
            with Session(engine) as db:
                fn(db)
        except service.BookingError:
            pass
        except Exception as exc:  # anything else is a real failure
            errors.append(exc)

    threads = [threading.Thread(target=run, args=(fn,)) for fn in functions]
    [t.start() for t in threads]
    [t.join() for t in threads]
    assert not errors, errors


def make_pending(engine, sid, count, quantity=1):
    ids = []
    with Session(engine) as db:
        for i in range(count):
            data = BookingCreate(event_session_id=sid, quantity=quantity, **ATTENDEE)
            ids.append(service.create_booking(db, 1, data, f"setup-key-{i:04d}")[0].id)
    return ids


def test_concurrent_confirmations_never_oversell(race_engine):
    event_id, (sid,) = add_event(race_engine, "race", (1,))
    ids = make_pending(race_engine, sid, 6)
    race(race_engine, [lambda db, i=i: service.simulate_payment(db, 1, i, "success") for i in ids])
    with Session(race_engine) as db:
        assert sum(db.get(Booking, i).status == "confirmed" for i in ids) == 1
    assert stock(race_engine, event_id, sid) == (1, 1)


def test_concurrent_confirmation_of_same_booking_consumes_stock_once(race_engine):
    event_id, (sid,) = add_event(race_engine, "same", (10,))
    (bid,) = make_pending(race_engine, sid, 1, quantity=2)
    race(race_engine, [lambda db: service.simulate_payment(db, 1, bid, "success") for _ in range(8)])
    assert stock(race_engine, event_id, sid) == (2, 2)


def test_concurrent_success_and_failure_never_leave_inconsistent_stock(race_engine):
    event_id, (sid,) = add_event(race_engine, "mix", (10,))
    (bid,) = make_pending(race_engine, sid, 1, quantity=2)
    race(race_engine, [lambda db: service.simulate_payment(db, 1, bid, "success"),
                       lambda db: service.simulate_payment(db, 1, bid, "failure")] * 3)
    with Session(race_engine) as db:
        status = db.get(Booking, bid).status
    assert (status == "confirmed") == (stock(race_engine, event_id, sid) == (2, 2))


def test_concurrent_duplicate_creates_make_one_booking(race_engine):
    _, (sid,) = add_event(race_engine, "dup", (10,))
    ids = []
    data = BookingCreate(event_session_id=sid, quantity=1, **ATTENDEE)
    race(race_engine, [lambda db: ids.append(service.create_booking(db, 1, data, "race-key-01")[0].id)] * 8)
    assert len(set(ids)) == 1
    with Session(race_engine) as db:
        assert len(db.exec(select(Booking)).all()) == 1


@pytest.mark.parametrize("phone", ["........", "--------", "+........", "123-4567", "1234567890123456", "090ABC1234"])
def test_rejects_phone_without_enough_real_digits(client, db_engine, buyer, phone):
    _, (sid,) = add_event(db_engine)
    response = book(client, buyer, sid, attendee_phone=phone)
    assert response.status_code == 422
    with Session(db_engine) as db:
        assert db.exec(select(Booking)).all() == []


@pytest.mark.parametrize("phone", ["0901234567", "090 123 4567", "+84 901.234-567", "+123456789012345"])
def test_accepts_formatted_phone_and_optional_country_prefix(client, db_engine, buyer, phone):
    _, (sid,) = add_event(db_engine)
    response = book(client, buyer, sid, attendee_phone="  " + phone + "  ")
    assert response.status_code == 201
    assert response.json()["attendee_phone"] == phone


def test_booking_timestamps_keep_utc_through_create_read_and_payment(client, db_engine, buyer):
    event_id, (sid,) = add_event(db_engine)
    event = client.get(f"/api/events/{event_id}", headers=buyer).json()
    event_session = next(item for item in event["sessions"] if item["id"] == sid)
    created = book(client, buyer, sid).json()
    assert created["paid_at"] is None
    read = client.get(f"/api/bookings/{created['id']}", headers=buyer).json()
    paid = pay(client, buyer, created["id"], "success").json()
    reread = client.get(f"/api/bookings/{created['id']}", headers=buyer).json()
    for body in (created, read, paid, reread):
        for name in ("session_starts_at", "session_ends_at", "created_at", "paid_at"):
            if body[name] is not None:
                assert body[name].endswith("Z"), (name, body[name])
                assert datetime.fromisoformat(body[name]).utcoffset() == timedelta(0)
        for booking_name, event_name in (("session_starts_at", "starts_at"), ("session_ends_at", "ends_at")):
            assert datetime.fromisoformat(body[booking_name]).replace(microsecond=0) == datetime.fromisoformat(event_session[event_name])
    assert paid["paid_at"] == reread["paid_at"]


@pytest.mark.parametrize("timestamp", [datetime(2026, 11, 10, 12, 0), datetime(2026, 11, 10, 19, 0, tzinfo=timezone(timedelta(hours=7)))])
def test_booking_response_normalizes_naive_and_offset_timestamps(timestamp):
    data = dict(id=1, reference="BK-TEST", event_id=1, event_title="Evening show", event_session_id=1,
                quantity=1, unit_price_vnd=100000, total_price_vnd=100000, **ATTENDEE,
                status="confirmed", session_starts_at=timestamp, session_ends_at=timestamp,
                created_at=timestamp, paid_at=timestamp)
    body = BookingRead(**data).model_dump(mode="json")
    for name in ("session_starts_at", "session_ends_at", "created_at", "paid_at"):
        assert body[name] == "2026-11-10T12:00:00Z"
