from datetime import datetime, timedelta, timezone
from io import BytesIO
import json

from PIL import Image
from sqlmodel import Session

from app.core.security import create_access_token
from app.models.event import EventSession
from app.models.user import User
from app.services.event_covers import MAX_COVER_BYTES


ENDPOINT = "/api/admin/events"


def headers(db_engine, role):
    with Session(db_engine) as session:
        user = User(
            full_name=role, email=f"{role}@example.com", password_hash="unused",
            is_email_verified=True, role=role,
        )
        session.add(user)
        session.commit()
        return {"Authorization": f"Bearer {create_access_token(user.id)}"}


def event_data():
    now = datetime.now(timezone.utc).replace(microsecond=0)
    start = now + timedelta(days=2)
    middle = start + timedelta(hours=1)
    end = middle + timedelta(hours=1)
    return {
        "slug": "saigon-workshop",
        "title": "Saigon workshop",
        "description": "A workshop with two sessions.",
        "image_url": "/assets/images/events/Ntpmm.webp",
        "venue": "Lá Nhà Garden",
        "address": "Bình Thạnh",
        "starts_at": start.isoformat(),
        "ends_at": end.isoformat(),
        "sales_open_at": (now - timedelta(days=1)).isoformat(),
        "sales_close_at": middle.isoformat(),
        "ticket_price_vnd": 100000,
        "capacity": 30,
        "sessions": [
            {"starts_at": start.isoformat(), "ends_at": middle.isoformat(), "capacity": 15},
            {"starts_at": middle.isoformat(), "ends_at": end.isoformat(), "capacity": 15},
        ],
    }


def test_admin_routes_require_current_database_role(client, db_engine):
    buyer = headers(db_engine, "user")
    admin = headers(db_engine, "admin")
    assert client.get("/api/auth/me", headers=admin).json()["role"] == "admin"
    for method, path in [
        ("GET", ENDPOINT), ("POST", ENDPOINT), ("PUT", f"{ENDPOINT}/1"), ("DELETE", f"{ENDPOINT}/1")
    ]:
        assert client.request(method, path).status_code == 401
        assert client.request(method, path, headers=buyer).status_code == 403
    with Session(db_engine) as session:
        session.get(User, 2).role = "user"
        session.commit()
    assert client.get(ENDPOINT, headers=admin).status_code == 403


def test_admin_create_update_delete_and_public_visibility(client, db_engine):
    admin = headers(db_engine, "admin")
    buyer = headers(db_engine, "user")
    data = event_data()
    assert client.post(ENDPOINT, headers=admin, json={**data, "sessions": []}).status_code == 422
    assert client.post(ENDPOINT, headers=admin, json={**data, "tickets_sold": 1}).status_code == 422
    created = client.post(ENDPOINT, headers=admin, json=data)
    assert created.status_code == 201, created.text
    event = created.json()
    assert event["is_bookable"] and len(event["sessions"]) == 2
    assert client.post(ENDPOINT, headers=admin, json=data).json()["detail"]["code"] == "duplicate_slug"
    path = f"{ENDPOINT}/{event['id']}"
    public_path = f"/api/events/{event['id']}"
    assert client.get(public_path, headers=buyer).json()["title"] == data["title"]
    session_id = event["sessions"][0]["id"]
    data["sessions"] = [{**data["sessions"][0], "id": session_id}]
    data["title"] = "Updated workshop"
    edited = client.put(path, headers=admin, json=data)
    assert edited.status_code == 200, edited.text
    assert [item["id"] for item in edited.json()["sessions"]] == [session_id]
    assert client.get(public_path, headers=buyer).json()["title"] == data["title"]
    assert client.delete(path, headers=admin).status_code == 204
    assert client.get(public_path, headers=buyer).status_code == 404
    with Session(db_engine) as session:
        assert session.get(EventSession, session_id) is None
    replacement = client.post(ENDPOINT, headers=admin, json=event_data()).json()
    assert replacement["id"] != event["id"]
    assert session_id not in [item["id"] for item in replacement["sessions"]]


def test_admin_changes_preserve_bookings(client, db_engine):
    admin = headers(db_engine, "admin")
    buyer = headers(db_engine, "user")
    data = event_data()
    data["capacity"] = 16
    event = client.post(ENDPOINT, headers=admin, json=data).json()
    path = f"{ENDPOINT}/{event['id']}"
    data["sessions"] = [
        {**item, "id": saved["id"]} for item, saved in zip(data["sessions"], event["sessions"])
    ]
    booked, other = data["sessions"]

    def stock():
        managed = client.get(ENDPOINT, headers=admin).json()["items"][0]
        customer = client.get(f"/api/events/{event['id']}", headers=buyer).json()
        assert managed == customer
        return managed["tickets_sold"], managed["available_tickets"], [
            item["available_tickets"] for item in managed["sessions"]
        ]

    assert stock() == (0, 16, [15, 15])
    booking = client.post("/api/bookings", headers=buyer, json={
        "event_session_id": booked["id"], "quantity": 3, "attendee_name": "Nguyen An",
        "attendee_email": "user@example.com", "attendee_phone": "0901234567",
    })
    assert booking.status_code == 201, booking.text
    assert stock() == (0, 16, [15, 15])
    assert client.delete(path, headers=admin).json()["detail"]["code"] == "event_has_bookings"
    assert client.put(path, headers=admin, json={**data, "sessions": [other]}).json()["detail"]["code"] == "booked_session"
    new_end = (datetime.fromisoformat(booked["ends_at"]) - timedelta(minutes=5)).isoformat()
    moved = {**data, "sessions": [{**booked, "ends_at": new_end}, other]}
    assert client.put(path, headers=admin, json=moved).json()["detail"]["code"] == "booked_session"
    booking_path = f"/api/bookings/{booking.json()['id']}"
    failed = client.post(f"{booking_path}/simulate-payment", headers=buyer, json={"outcome": "failure"})
    assert failed.status_code == 200, failed.text
    assert stock() == (0, 16, [15, 15])
    paid = client.post(f"{booking_path}/simulate-payment", headers=buyer, json={"outcome": "success"})
    assert paid.status_code == 200, paid.text
    assert stock() == (3, 13, [12, 13])
    exceeds_event_stock = client.post("/api/bookings", headers=buyer, json={
        "event_session_id": other["id"], "quantity": 14, "attendee_name": "Nguyen An",
        "attendee_email": "user@example.com", "attendee_phone": "0901234567",
    })
    assert exceeds_event_stock.status_code == 409
    too_small = {**data, "sessions": [{**booked, "capacity": 2}]}
    assert client.put(path, headers=admin, json=too_small).json()["detail"]["code"] == "capacity_below_sales"
    assert client.get(booking_path, headers=buyer).json()["status"] == "confirmed"
    assert client.post(f"{booking_path}/cancel", headers=buyer).status_code == 200
    assert stock() == (3, 13, [12, 13])


def image_bytes(color):
    with BytesIO() as output:
        Image.new("RGB", (12, 8), color).save(output, format="PNG")
        return output.getvalue()


def test_admin_uploads_replaces_and_removes_event_cover(client, db_engine):
    admin = headers(db_engine, "admin")
    buyer = headers(db_engine, "user")
    data = event_data()
    data.pop("image_url")
    first_cover = image_bytes("blue")

    def upload(method, path, content, auth=admin):
        return client.request(
            method, path, headers=auth, data={"event": json.dumps(data)},
            files={"cover": ("cover.png", content, "image/png")},
        )

    create_path = f"{ENDPOINT}/with-cover"
    assert upload("POST", create_path, first_cover, buyer).status_code == 403
    assert upload("POST", create_path, b"not an image").json()["detail"]["code"] == "cover_format"
    assert upload("POST", create_path, bytes(MAX_COVER_BYTES + 1)).status_code == 413
    assert client.get(ENDPOINT, headers=admin).json()["total"] == 0

    created = upload("POST", create_path, first_cover)
    assert created.status_code == 201, created.text
    event = created.json()
    first_url = event["image_url"]
    public_image = client.get(first_url)
    assert public_image.content == first_cover
    assert public_image.headers["content-type"] == "image/png"

    path = f"{ENDPOINT}/{event['id']}"
    for item, saved in zip(data["sessions"], event["sessions"]):
        item["id"] = saved["id"]
    data["image_url"] = first_url
    assert client.put(path, headers=admin, json=data).status_code == 200
    second_cover = image_bytes("green")
    updated = upload("PUT", f"{path}/with-cover", second_cover)
    assert updated.status_code == 200, updated.text
    second_url = updated.json()["image_url"]
    assert second_url != first_url
    assert client.get(second_url).content == second_cover

    data["image_url"] = "/assets/images/events/Ntpmm.webp"
    assert client.put(path, headers=admin, json=data).status_code == 200
    assert client.get(second_url).status_code == 404
    restored = upload("PUT", f"{path}/with-cover", first_cover)
    assert restored.status_code == 200, restored.text
    assert client.delete(path, headers=admin).status_code == 204
    assert client.get(restored.json()["image_url"]).status_code == 404
