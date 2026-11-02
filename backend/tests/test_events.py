from datetime import date, datetime, timedelta, timezone

import pytest
from sqlalchemy import text
from sqlmodel import Session, select

from app.models.event import Event, EventSession
from app.schemas.event import SaleStatus
from app.services.events import get_sale_status

NOW = datetime(2026, 11, 2, 12, 0, tzinfo=timezone.utc)


def create_account(client, email="event-tester@example.com"):
    response = client.post(
        "/api/auth/register",
        json={
            "full_name": "Event Tester",
            "email": email,
            "password": "password123",
        },
    )
    assert response.status_code == 201
    token = client.post(
        "/api/auth/token",
        data={"username": email, "password": "password123"},
    ).json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def make_event(
    slug: str,
    starts_at: datetime,
    *,
    sales_open_at: datetime | None = None,
    sales_close_at: datetime | None = None,
    capacity: int = 20,
    tickets_sold: int = 4,
) -> Event:
    return Event(
        slug=slug,
        title=f"Event {slug}",
        description="A sample event.",
        image_url="/assets/images/events/concert-under-the-stars.svg",
        venue="Demo venue",
        address="Ho Chi Minh City",
        starts_at=starts_at,
        ends_at=starts_at + timedelta(hours=2),
        sales_open_at=sales_open_at or NOW - timedelta(days=2),
        sales_close_at=sales_close_at or NOW + timedelta(days=2),
        ticket_price_vnd=250_000,
        capacity=capacity,
        tickets_sold=tickets_sold,
    )


def add_events(db_engine, *events: Event) -> None:
    with Session(db_engine) as session:
        session.add_all(events)
        session.commit()


def test_event_routes_require_authentication(client):
    assert client.get("/api/events").status_code == 401
    assert client.get("/api/events/1").status_code == 401


def test_event_posters_are_served(client):
    for path in (
        "/assets/images/events/Ntpmm.webp",
        "/assets/images/events/Traditional%20Water%20Puppet%20Show.webp",
        "/assets/images/events/Workshop%20Tranh%20thực%20vật%20ép%20Botanical%20art.jpg",
        "/assets/images/events/MERRY%20DECEMBER%20.jpg",
    ):
        response = client.get(path)
        assert response.status_code == 200
        assert response.headers["content-type"].startswith("image/")


def test_list_events_returns_contract_and_computed_availability(client, db_engine):
    add_events(db_engine, make_event("jazz-night", NOW + timedelta(days=4)))
    headers = create_account(client)

    response = client.get("/api/events", headers=headers)

    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 1
    assert body["items"][0] == {
        "id": 1,
        "slug": "jazz-night",
        "title": "Event jazz-night",
        "description": "A sample event.",
        "image_url": "/assets/images/events/concert-under-the-stars.svg",
        "venue": "Demo venue",
        "address": "Ho Chi Minh City",
        "starts_at": "2026-11-06T12:00:00Z",
        "ends_at": "2026-11-06T14:00:00Z",
        "sales_open_at": "2026-10-31T12:00:00Z",
        "sales_close_at": "2026-11-04T12:00:00Z",
        "ticket_price_vnd": 250_000,
        "capacity": 20,
        "tickets_sold": 4,
        "available_tickets": 16,
        "sale_status": "on_sale",
        "sessions": [],
    }


def test_get_event_returns_details_and_404_for_missing_event(client, db_engine):
    add_events(db_engine, make_event("details", NOW + timedelta(days=1)))
    headers = create_account(client)

    response = client.get("/api/events/1", headers=headers)

    assert response.status_code == 200
    assert response.json()["slug"] == "details"
    assert response.json()["ticket_price_vnd"] == 250_000
    assert client.get("/api/events/999", headers=headers).status_code == 404


def test_list_filters_by_sale_status(client, db_engine):
    now = datetime.now(timezone.utc)
    add_events(
        db_engine,
        make_event("on-sale", NOW + timedelta(days=1)),
        make_event(
            "coming-soon",
            NOW + timedelta(days=2),
            sales_open_at=now + timedelta(days=1),
            sales_close_at=now + timedelta(days=30),
            tickets_sold=0,
        ),
        make_event(
            "sold-out",
            NOW + timedelta(days=3),
            capacity=10,
            tickets_sold=10,
        ),
        make_event(
            "closed",
            NOW + timedelta(days=4),
            sales_close_at=now,
        ),
    )
    headers = create_account(client)

    on_sale = client.get("/api/events?sale_status=on_sale", headers=headers)
    coming_soon = client.get("/api/events?sale_status=coming_soon", headers=headers)

    assert [item["slug"] for item in on_sale.json()["items"]] == ["on-sale"]
    assert [item["slug"] for item in coming_soon.json()["items"]] == ["coming-soon"]
    assert on_sale.json()["items"][0]["sale_status"] == "on_sale"
    assert coming_soon.json()["items"][0]["sale_status"] == "coming_soon"


def test_coming_soon_filter_excludes_events_with_closed_sessions(client, db_engine):
    event = make_event(
        "closed-session",
        NOW + timedelta(days=3),
        sales_open_at=datetime.now(timezone.utc) + timedelta(days=1),
        sales_close_at=datetime.now(timezone.utc) + timedelta(days=2),
        tickets_sold=0,
    )
    with Session(db_engine) as session:
        session.add(event)
        session.flush()
        session.add(
            EventSession(
                event_id=event.id,
                starts_at=datetime.now(timezone.utc) - timedelta(days=1),
                ends_at=datetime.now(timezone.utc) - timedelta(hours=23),
                capacity=20,
                tickets_sold=0,
            )
        )
        session.commit()
    headers = create_account(client)

    response = client.get("/api/events?sale_status=coming_soon", headers=headers)

    assert response.status_code == 200
    assert response.json() == {"items": [], "total": 0}


def test_date_filters_are_inclusive_hcm_calendar_days(client, db_engine):
    local_day = date(2026, 11, 10)
    hcm = timezone(timedelta(hours=7))
    at_start = datetime(2026, 11, 10, 0, 0, tzinfo=hcm).astimezone(timezone.utc)
    at_end = datetime(2026, 11, 10, 23, 59, tzinfo=hcm).astimezone(timezone.utc)
    next_day = datetime(2026, 11, 11, 0, 0, tzinfo=hcm).astimezone(timezone.utc)
    add_events(
        db_engine,
        make_event("start-boundary", at_start),
        make_event("end-boundary", at_end),
        make_event("next-day", next_day),
    )
    headers = create_account(client)

    response = client.get(
        f"/api/events?date_from={local_day}&date_to={local_day}",
        headers=headers,
    )

    assert response.status_code == 200
    assert [item["slug"] for item in response.json()["items"]] == [
        "start-boundary",
        "end-boundary",
    ]


def test_recurring_event_exposes_each_session_and_filters_by_session_date(
    client, db_engine
):
    from scripts.seed_events import seed_events

    with Session(db_engine) as session:
        seed_events(session)
    headers = create_account(client)

    detail = client.get("/api/events/2", headers=headers)

    assert detail.status_code == 200
    event = detail.json()
    assert len(event["sessions"]) == 29
    assert event["capacity"] == 870
    assert event["available_tickets"] == sum(
        session["available_tickets"]
        for session in event["sessions"]
        if session["is_bookable"]
    )
    assert event["sessions"][0]["starts_at"] == "2026-11-02T11:30:00Z"
    assert event["sessions"][-1]["ends_at"] == "2026-11-30T12:15:00Z"
    assert all(item["capacity"] == 30 for item in event["sessions"])

    filtered = client.get(
        "/api/events?date_from=2026-11-15&date_to=2026-11-15",
        headers=headers,
    )
    assert [item["slug"] for item in filtered.json()["items"]] == [
        "traditional-water-puppet-show"
    ]


def test_invalid_date_range_and_sale_status_are_rejected(client):
    headers = create_account(client)

    assert client.get(
        "/api/events?date_from=2026-11-11&date_to=2026-11-10",
        headers=headers,
    ).status_code == 422
    assert client.get(
        "/api/events?date_from=not-a-date",
        headers=headers,
    ).status_code == 422
    assert client.get(
        "/api/events?sale_status=closed",
        headers=headers,
    ).status_code == 422


@pytest.mark.parametrize(
    ("sales_open_at", "sales_close_at", "capacity", "tickets_sold", "expected"),
    [
        (NOW + timedelta(seconds=1), NOW + timedelta(days=1), 10, 0, SaleStatus.COMING_SOON),
        (NOW - timedelta(days=1), NOW, 10, 0, SaleStatus.CLOSED),
        (NOW - timedelta(days=1), NOW + timedelta(days=1), 10, 10, SaleStatus.SOLD_OUT),
        (NOW - timedelta(days=1), NOW + timedelta(days=1), 10, 9, SaleStatus.ON_SALE),
    ],
)
def test_sale_status_is_derived_from_window_and_stock(
    sales_open_at, sales_close_at, capacity, tickets_sold, expected
):
    event = make_event(
        "derived-status",
        NOW + timedelta(days=1),
        sales_open_at=sales_open_at,
        sales_close_at=sales_close_at,
        capacity=capacity,
        tickets_sold=tickets_sold,
    )

    assert get_sale_status(event, NOW) == expected


def test_seed_events_is_repeatable(db_engine):
    from scripts.seed_events import seed_events

    with Session(db_engine) as session:
        assert seed_events(session) == 35
        assert seed_events(session) == 0

    with Session(db_engine) as session:
        events = session.exec(select(Event)).all()
        assert len(events) == 4
        on_sale = session.exec(
            select(Event).where(
                Event.slug == "nhung-thanh-pho-mo-mang-year-end-2026"
            )
        ).one()
        assert on_sale.title == "Những Thành Phố Mơ Màng Year End 2026"
        assert on_sale.ticket_price_vnd == 499_000
        assert on_sale.capacity == 1_000
        assert on_sale.tickets_sold == 0
        assert on_sale.starts_at.replace(tzinfo=timezone.utc) == datetime(
            2027, 1, 17, 9, 0, tzinfo=timezone.utc
        )
        assert on_sale.image_url == "/assets/images/events/Ntpmm.webp"
        puppet = session.exec(
            select(Event).where(Event.slug == "traditional-water-puppet-show")
        ).one()
        assert puppet.title == "The Traditional Water Puppet Show - Múa rối nước"
        assert puppet.image_url == (
            "/assets/images/events/Traditional%20Water%20Puppet%20Show.webp"
        )
        assert puppet.ticket_price_vnd == 350_000
        assert puppet.capacity == 870
        assert puppet.tickets_sold == 0
        puppet_sessions = session.exec(
            select(EventSession)
            .where(EventSession.event_id == puppet.id)
            .order_by(EventSession.starts_at)
        ).all()
        assert len(puppet_sessions) == 29
        assert puppet_sessions[0].starts_at.replace(tzinfo=timezone.utc) == datetime(
            2026, 11, 2, 11, 30, tzinfo=timezone.utc
        )
        assert puppet_sessions[-1].ends_at.replace(tzinfo=timezone.utc) == datetime(
            2026, 11, 30, 12, 15, tzinfo=timezone.utc
        )
        assert all(item.capacity == 30 for item in puppet_sessions)
        botanical = session.exec(
            select(Event).where(
                Event.slug == "la-nha-garden-botanical-art-workshop"
            )
        ).one()
        assert botanical.ticket_price_vnd == 305_000
        assert botanical.capacity == 300
        assert botanical.image_url == (
            "/assets/images/events/Workshop%20Tranh%20"
            "thu%CC%9B%CC%A3c%20va%CC%A3%CC%82t%20e%CC%81p%20"
            "Botanical%20art.jpg"
        )
        assert botanical.starts_at.replace(tzinfo=timezone.utc) == datetime(
            2026, 11, 1, 17, 0, tzinfo=timezone.utc
        )
        assert botanical.ends_at.replace(tzinfo=timezone.utc) == datetime(
            2026, 12, 31, 16, 59, tzinfo=timezone.utc
        )
        assert session.exec(
            select(EventSession).where(EventSession.event_id == botanical.id)
        ).all() == []
        merry = session.exec(
            select(Event).where(Event.slug == "merry-december-2026")
        ).one()
        assert merry.ticket_price_vnd == 1_000_000
        assert merry.capacity == 500
        assert merry.image_url == "/assets/images/events/MERRY%20DECEMBER%20.jpg"
        merry_session = session.exec(
            select(EventSession).where(EventSession.event_id == merry.id)
        ).one()
        assert merry_session.starts_at.replace(tzinfo=timezone.utc) == datetime(
            2026, 12, 20, 13, 0, tzinfo=timezone.utc
        )
        assert merry_session.capacity == 500


def test_seed_replacement_removes_old_samples_and_keeps_real_event(db_engine):
    from scripts.seed_events import seed_events

    with Session(db_engine) as session:
        session.add_all(
            [
                make_event("concert-under-the-stars", NOW + timedelta(days=1)),
                make_event("saigon-food-festival", NOW + timedelta(days=2)),
            ]
        )
        session.commit()

        assert seed_events(session, replace_old_samples=True) == 37
        assert seed_events(session, replace_old_samples=True) == 0

        events = session.exec(select(Event)).all()
        assert {event.slug for event in events} == {
            "nhung-thanh-pho-mo-mang-year-end-2026",
            "traditional-water-puppet-show",
            "la-nha-garden-botanical-art-workshop",
            "merry-december-2026",
        }


def test_seed_replacement_refuses_to_remove_samples_with_bookings(db_engine):
    from scripts.seed_events import seed_events

    with Session(db_engine) as session:
        old_event = make_event("concert-under-the-stars", NOW + timedelta(days=1))
        session.add(old_event)
        session.commit()
        original_start = old_event.starts_at
        session.execute(
            text(
                "CREATE TABLE bookings ("
                "id INTEGER PRIMARY KEY, event_id INTEGER NOT NULL "
                "REFERENCES events(id))"
            )
        )
        session.execute(
            text("INSERT INTO bookings (event_id) VALUES (:event_id)"),
            {"event_id": old_event.id},
        )
        session.commit()

        with pytest.raises(RuntimeError, match="bookings reference them"):
            seed_events(session, replace_old_samples=True)

        session.refresh(old_event)
        assert old_event.starts_at == original_start


def test_seed_refuses_to_change_event_referenced_by_bookings(db_engine):
    from scripts.seed_events import seed_events

    with Session(db_engine) as session:
        seed_events(session)
        event = session.exec(
            select(Event).where(
                Event.slug == "nhung-thanh-pho-mo-mang-year-end-2026"
            )
        ).one()
        original_title = event.title
        session.execute(
            text(
                "CREATE TABLE bookings ("
                "id INTEGER PRIMARY KEY, event_id INTEGER NOT NULL "
                "REFERENCES events(id))"
            )
        )
        session.execute(
            text("INSERT INTO bookings (event_id) VALUES (:event_id)"),
            {"event_id": event.id},
        )
        event.ticket_price_vnd += 1
        session.commit()

        with pytest.raises(RuntimeError, match="bookings reference it"):
            seed_events(session)

        session.refresh(event)
        assert event.ticket_price_vnd == 499_001
        assert event.title == original_title
