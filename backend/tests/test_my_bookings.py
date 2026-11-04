import re
import secrets
from datetime import datetime, timedelta, timezone

from sqlmodel import Session, select

from app.models.booking import Booking, BookingStatus
from app.models.event import Event, EventSession
from app.models.user import User


def create_account(client, email: str) -> dict[str, str]:
    response = client.post(
        "/api/auth/register",
        json={
            "full_name": "Booking Tester",
            "email": email,
            "password": "password123",
        },
    )
    assert response.status_code == 201
    code = re.search(r"\b[0-9]{6}\b", client.outbox[-1][2]).group()
    assert client.post(
        "/api/auth/verify-email",
        json={"email": email, "code": code},
    ).status_code == 200
    token = client.post(
        "/api/auth/token",
        data={"username": email, "password": "password123"},
    ).json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def add_event_and_session(
    db_engine,
    *,
    capacity: int = 20,
    tickets_sold: int = 0,
    sales_close_at: datetime | None = None,
) -> tuple[int, int]:
    now = datetime.now(timezone.utc)
    starts_at = now + timedelta(days=2)
    with Session(db_engine) as session:
        event = Event(
            slug=f"my-bookings-{now.timestamp()}",
            title="Booking event",
            description="Event description",
            image_url="/event.webp",
            venue="Event venue",
            address="Event address",
            starts_at=starts_at,
            ends_at=starts_at + timedelta(hours=2),
            sales_open_at=now - timedelta(days=1),
            sales_close_at=sales_close_at or starts_at,
            ticket_price_vnd=125_000,
            capacity=capacity,
            tickets_sold=tickets_sold,
        )
        session.add(event)
        session.flush()
        event_session = EventSession(
            event_id=event.id,
            starts_at=starts_at,
            ends_at=starts_at + timedelta(hours=2),
            capacity=capacity,
            tickets_sold=tickets_sold,
        )
        session.add(event_session)
        session.commit()
        return event.id, event_session.id


def add_booking(
    db_engine,
    *,
    user_id: int,
    event_id: int,
    event_session_id: int,
    status: str = BookingStatus.PENDING.value,
    quantity: int = 2,
    created_at: datetime | None = None,
) -> int:
    with Session(db_engine) as session:
        booking = Booking(
            reference=f"BK-{secrets.token_hex(8).upper()}",
            user_id=user_id,
            event_id=event_id,
            event_session_id=event_session_id,
            quantity=quantity,
            attendee_name="Booking Tester",
            attendee_email="buyer@example.com",
            attendee_phone="0901234567",
            unit_price_vnd=125_000,
            total_price_vnd=125_000 * quantity,
            status=status,
            created_at=created_at or datetime.now(timezone.utc),
        )
        session.add(booking)
        session.commit()
        return booking.id


def account_id(db_engine, email: str) -> int:
    with Session(db_engine) as session:
        return session.exec(select(User).where(User.email == email)).one().id


def test_my_bookings_requires_authentication(client):
    assert client.get("/api/bookings").status_code == 401


def test_my_bookings_returns_honest_empty_list(client):
    headers = create_account(client, "empty@example.com")

    response = client.get("/api/bookings", headers=headers)

    assert response.status_code == 200
    assert response.json() == {"items": [], "total": 0, "limit": 10, "offset": 0}


def test_my_bookings_are_user_scoped_and_sorted_with_stable_ties(client, db_engine):
    headers_a = create_account(client, "account-a@example.com")
    headers_b = create_account(client, "account-b@example.com")
    user_a = account_id(db_engine, "account-a@example.com")
    user_b = account_id(db_engine, "account-b@example.com")
    event_id, session_id = add_event_and_session(db_engine)
    now = datetime.now(timezone.utc)
    older_id = add_booking(
        db_engine,
        user_id=user_a,
        event_id=event_id,
        event_session_id=session_id,
        created_at=now - timedelta(hours=1),
    )
    tied_first_id = add_booking(
        db_engine,
        user_id=user_a,
        event_id=event_id,
        event_session_id=session_id,
        quantity=3,
        created_at=now,
    )
    tied_second_id = add_booking(
        db_engine,
        user_id=user_a,
        event_id=event_id,
        event_session_id=session_id,
        quantity=1,
        created_at=now,
    )
    add_booking(
        db_engine,
        user_id=user_b,
        event_id=event_id,
        event_session_id=session_id,
    )

    response_a = client.get("/api/bookings", headers=headers_a)
    response_b = client.get("/api/bookings", headers=headers_b)

    assert response_a.status_code == response_b.status_code == 200
    body_a = response_a.json()
    body_b = response_b.json()
    assert body_a["total"] == 3
    assert [item["id"] for item in body_a["items"]] == [
        tied_second_id,
        tied_first_id,
        older_id,
    ]
    assert body_b["total"] == 1
    assert len(body_b["items"]) == 1
    assert body_b["items"][0]["id"] not in {
        older_id,
        tied_first_id,
        tied_second_id,
    }
    item = body_a["items"][1]
    assert item["event_id"] == event_id
    assert item["event_title"] == "Booking event"
    assert item["venue"] == "Event venue"
    assert item["total_price_vnd"] == 375_000
    assert item["session_starts_at"].endswith("Z")
    assert item["session_ends_at"].endswith("Z")
    assert item["created_at"].endswith("Z")


def test_my_bookings_pagination_is_bounded_and_reports_total(client, db_engine):
    headers = create_account(client, "pagination@example.com")
    user_id = account_id(db_engine, "pagination@example.com")
    event_id, session_id = add_event_and_session(db_engine)
    now = datetime.now(timezone.utc)
    booking_ids = [
        add_booking(
            db_engine,
            user_id=user_id,
            event_id=event_id,
            event_session_id=session_id,
            created_at=now - timedelta(minutes=index),
        )
        for index in range(3)
    ]

    first_page = client.get("/api/bookings?limit=2&offset=0", headers=headers)
    second_page = client.get("/api/bookings?limit=2&offset=2", headers=headers)

    assert first_page.status_code == second_page.status_code == 200
    assert first_page.json()["total"] == second_page.json()["total"] == 3
    assert first_page.json()["limit"] == 2
    assert first_page.json()["offset"] == 0
    assert len(first_page.json()["items"]) == 2
    assert [item["id"] for item in second_page.json()["items"]] == [booking_ids[2]]
    for query in ("limit=0", "limit=51", "offset=-1", "offset=10001"):
        assert client.get(f"/api/bookings?{query}", headers=headers).status_code == 422


def test_my_bookings_reports_retryability_for_status_sales_and_stock(client, db_engine):
    headers = create_account(client, "retry-status@example.com")
    user_id = account_id(db_engine, "retry-status@example.com")
    event_id, session_id = add_event_and_session(db_engine, capacity=10)
    pending_id = add_booking(
        db_engine,
        user_id=user_id,
        event_id=event_id,
        event_session_id=session_id,
        status=BookingStatus.PENDING.value,
    )
    failed_id = add_booking(
        db_engine,
        user_id=user_id,
        event_id=event_id,
        event_session_id=session_id,
        status=BookingStatus.PAYMENT_FAILED.value,
    )
    confirmed_id = add_booking(
        db_engine,
        user_id=user_id,
        event_id=event_id,
        event_session_id=session_id,
        status=BookingStatus.CONFIRMED.value,
    )

    items = {
        item["id"]: item
        for item in client.get("/api/bookings", headers=headers).json()["items"]
    }
    assert items[pending_id]["can_retry_payment"] is True
    assert items[pending_id]["retry_unavailable_reason"] is None
    assert items[failed_id]["can_retry_payment"] is True
    assert items[confirmed_id]["can_retry_payment"] is False
    assert items[confirmed_id]["retry_unavailable_reason"] == "already_confirmed"

    pending_detail = client.get(f"/api/bookings/{pending_id}", headers=headers)
    assert pending_detail.status_code == 200
    assert pending_detail.json()["can_retry_payment"] is True
    assert pending_detail.json()["retry_unavailable_reason"] is None

    with Session(db_engine) as session:
        event = session.get(Event, event_id)
        event_session = session.get(EventSession, session_id)
        event.tickets_sold = event_session.tickets_sold = 9
        session.add(event)
        session.add(event_session)
        session.commit()

    items = {
        item["id"]: item
        for item in client.get("/api/bookings", headers=headers).json()["items"]
    }
    assert items[pending_id]["can_retry_payment"] is False
    assert items[pending_id]["retry_unavailable_reason"] == "tickets_unavailable"

    closed_event_id, closed_session_id = add_event_and_session(
        db_engine,
        sales_close_at=datetime.now(timezone.utc) - timedelta(minutes=1),
    )
    closed_id = add_booking(
        db_engine,
        user_id=user_id,
        event_id=closed_event_id,
        event_session_id=closed_session_id,
    )
    items = {
        item["id"]: item
        for item in client.get("/api/bookings", headers=headers).json()["items"]
    }
    assert items[closed_id]["can_retry_payment"] is False
    assert items[closed_id]["retry_unavailable_reason"] == "sales_closed"
