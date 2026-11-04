import pytest
from sqlalchemy import text
from sqlmodel import Session, create_engine
from app.models.booking import Booking
from app.models.event import Event, EventSession
from app.db.migrate_auth import migrate_booking_cancellation
from tests.test_my_bookings import create_account, add_event_and_session, account_id, add_booking


@pytest.mark.parametrize("status", ["pending", "payment_failed", "confirmed"])
def test_cancel_is_terminal_idempotent_and_preserves_payment_and_stock(client, db_engine, status):
    headers = create_account(client, "cancel@example.com")
    event_id, session_id = add_event_and_session(db_engine)
    booking_id = add_booking(db_engine, user_id=account_id(db_engine, "cancel@example.com"),
                             event_id=event_id, event_session_id=session_id)
    if status != "pending":
        outcome = "success" if status == "confirmed" else "failure"
        before = client.post(f"/api/bookings/{booking_id}/simulate-payment", headers=headers,
                             json={"outcome": outcome}).json()
    else:
        before = client.get(f"/api/bookings/{booking_id}", headers=headers).json()
    response = client.post(f"/api/bookings/{booking_id}/cancel", headers=headers)
    assert response.status_code == 200
    cancelled = response.json()
    assert cancelled["status"] == "cancelled"
    assert cancelled["cancelled_at"].endswith("Z")
    assert cancelled["paid_at"] == before["paid_at"]
    assert cancelled["total_price_vnd"] == before["total_price_vnd"]
    assert cancelled["can_retry_payment"] is False
    assert cancelled["retry_unavailable_reason"] == "cancelled"
    again = client.post(f"/api/bookings/{booking_id}/cancel", headers=headers).json()
    assert again["cancelled_at"] == cancelled["cancelled_at"]
    assert client.get("/api/bookings", headers=headers).json()["items"][0]["status"] == "cancelled"
    assert client.get(f"/api/bookings/{booking_id}", headers=headers).json()["status"] == "cancelled"
    for outcome in ["success", "failure"]:
        assert client.post(f"/api/bookings/{booking_id}/simulate-payment", headers=headers,
                           json={"outcome": outcome}).status_code == 409
    with Session(db_engine) as session:
        expected = 2 if status == "confirmed" else 0
        assert session.get(Event, event_id).tickets_sold == expected
        assert session.get(EventSession, session_id).tickets_sold == expected
        assert session.get(Booking, booking_id).status == status


def test_cancel_requires_owner_and_does_not_change_other_account(client, db_engine):
    owner = create_account(client, "owner-cancel@example.com")
    other = create_account(client, "other-cancel@example.com")
    event_id, session_id = add_event_and_session(db_engine)
    booking_id = add_booking(db_engine, user_id=account_id(db_engine, "owner-cancel@example.com"),
                             event_id=event_id, event_session_id=session_id)
    path = f"/api/bookings/{booking_id}/cancel"
    assert client.post(path).status_code == 401
    assert client.post(path, headers=other).status_code == 403
    assert client.post("/api/bookings/999999/cancel", headers=owner).status_code == 404
    assert client.get(f"/api/bookings/{booking_id}", headers=owner).json()["status"] == "pending"


def test_cancellation_migration_preserves_legacy_rows_and_is_repeatable():
    engine = create_engine("sqlite://")
    with engine.begin() as connection:
        connection.execute(text("CREATE TABLE bookings (id INTEGER PRIMARY KEY, status TEXT, paid_at DATETIME)"))
        connection.execute(text("INSERT INTO bookings VALUES (1, 'confirmed', '2026-11-05 00:00:00')"))
        migrate_booking_cancellation(connection)
        migrate_booking_cancellation(connection)
        assert connection.execute(text("SELECT status, paid_at, cancelled_at FROM bookings")).one() == ("confirmed", "2026-11-05 00:00:00", None)
    engine.dispose()
