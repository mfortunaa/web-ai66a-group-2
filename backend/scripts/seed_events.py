import argparse
from datetime import datetime, timezone

from sqlalchemy import MetaData, Table, func, inspect, select as sqlalchemy_select
from sqlmodel import Session, select

from app.db.session import create_db_and_tables, engine
from app.models.event import Event, EventSession

LEGACY_SAMPLE_SLUGS = (
    "concert-under-the-stars",
    "saigon-food-festival",
    "creative-weekend",
    "hanoi-night-run",
)


def demo_events() -> list[tuple[Event, list[EventSession]]]:
    music_start = datetime(2027, 1, 17, 9, 0, tzinfo=timezone.utc)
    music_end = datetime(2027, 1, 17, 15, 30, tzinfo=timezone.utc)
    botanical_start = datetime(2026, 11, 1, 17, 0, tzinfo=timezone.utc)
    botanical_end = datetime(2026, 12, 31, 16, 59, tzinfo=timezone.utc)
    merry_start = datetime(2026, 12, 20, 13, 0, tzinfo=timezone.utc)
    merry_end = datetime(2026, 12, 20, 15, 0, tzinfo=timezone.utc)
    puppet_sessions = [
        EventSession(
            starts_at=datetime(2026, 11, 2 + day, 11, 30, tzinfo=timezone.utc),
            ends_at=datetime(2026, 11, 2 + day, 12, 15, tzinfo=timezone.utc),
            capacity=30,
            tickets_sold=0,
        )
        for day in range(29)
    ]
    return [
        (
            Event(
                slug="nhung-thanh-pho-mo-mang-year-end-2026",
                title="Những Thành Phố Mơ Màng Year End 2026",
                description="Đại nhạc hội Những Thành Phố Mơ Màng Year End 2026.",
                image_url="/assets/images/events/Ntpmm.webp",
                venue="Trung tâm Triển lãm Việt Nam (VEC)",
                address="Đường Cầu Tứ Liên, Xã Đông Anh, Thành phố Hà Nội",
                starts_at=music_start,
                ends_at=music_end,
                sales_open_at=datetime(2026, 10, 4, 17, 0, tzinfo=timezone.utc),
                sales_close_at=music_start,
                ticket_price_vnd=499_000,
                capacity=1_000,
                tickets_sold=0,
            ),
            [
                EventSession(
                    starts_at=music_start,
                    ends_at=music_end,
                    capacity=1_000,
                    tickets_sold=0,
                )
            ],
        ),
        (
            Event(
                slug="traditional-water-puppet-show",
                title="The Traditional Water Puppet Show - Múa rối nước",
                description=(
                    "Suất diễn múa rối nước hằng ngày từ 18:30 đến 19:15, "
                    "từ ngày 02/11 đến hết ngày 30/11/2026."
                ),
                image_url=(
                    "/assets/images/events/"
                    "Traditional%20Water%20Puppet%20Show.webp"
                ),
                venue="Cung Văn Hoá Lao Động TP.HCM",
                address=(
                    "55B Nguyễn Thị Minh Khai, Phường Bến Thành, "
                    "Thành phố Hồ Chí Minh"
                ),
                starts_at=puppet_sessions[0].starts_at,
                ends_at=puppet_sessions[-1].ends_at,
                sales_open_at=datetime(2026, 11, 1, 17, 0, tzinfo=timezone.utc),
                sales_close_at=puppet_sessions[-1].starts_at,
                ticket_price_vnd=350_000,
                capacity=30 * len(puppet_sessions),
                tickets_sold=0,
            ),
            puppet_sessions,
        ),
        (
            Event(
                slug="la-nha-garden-botanical-art-workshop",
                title="[LÁ NHÀ GARDEN] Workshop Tranh thực vật ép Botanical art",
                description=(
                    "Người tham gia lựa chọn hoa lá ép, thử nhiều cách sắp xếp "
                    "để xác định bố cục, sau đó cố định từng chi tiết lên nền "
                    "và hoàn thiện khung tranh. Mỗi sản phẩm có bố cục riêng, "
                    "phù hợp làm vật trang trí hoặc quà lưu niệm. Thời gian "
                    "triển khai workshop: 60–90 phút. Công cụ dụng cụ: khung "
                    "tranh, nền tranh, hoa/lá/cành thực vật ép, keo hoặc vật "
                    "liệu cố định, nhíp, kéo và dụng cụ hoàn thiện."
                ),
                image_url=(
                    "/assets/images/events/Workshop%20Tranh%20"
                    "thu%CC%9B%CC%A3c%20va%CC%A3%CC%82t%20e%CC%81p%20"
                    "Botanical%20art.jpg"
                ),
                venue="Lá Nhà Garden",
                address=(
                    "356/6/12 đường Bạch Đằng, Phường Bình Thạnh, "
                    "Thành phố Hồ Chí Minh"
                ),
                starts_at=botanical_start,
                ends_at=botanical_end,
                sales_open_at=botanical_start,
                sales_close_at=botanical_end,
                ticket_price_vnd=305_000,
                capacity=300,
                tickets_sold=0,
            ),
            [],
        ),
        (
            Event(
                slug="merry-december-2026",
                title="MERRY DECEMBER",
                description="MERRY DECEMBER — sự kiện ngày 20/12/2026.",
                image_url="/assets/images/events/MERRY%20DECEMBER%20.jpg",
                venue="Trung tâm TT Sự kiện Cung Xuân",
                address="Số 1 Võ Thị Sáu, Bạch Mai, Hà Nội",
                starts_at=merry_start,
                ends_at=merry_end,
                sales_open_at=botanical_start,
                sales_close_at=merry_start,
                ticket_price_vnd=1_000_000,
                capacity=500,
                tickets_sold=0,
            ),
            [
                EventSession(
                    starts_at=merry_start,
                    ends_at=merry_end,
                    capacity=500,
                    tickets_sold=0,
                )
            ],
        ),
    ]


def _ensure_unreferenced_events(session: Session, slugs: tuple[str, ...]) -> None:
    if not inspect(session.connection()).has_table("bookings"):
        return

    event_ids = session.exec(
        select(Event.id).where(Event.slug.in_(slugs))
    ).all()
    event_ids = [event_id for event_id in event_ids if event_id is not None]
    if not event_ids:
        return

    bookings = Table("bookings", MetaData(), autoload_with=session.connection())
    reference_count = session.execute(
        sqlalchemy_select(func.count())
        .select_from(bookings)
        .where(bookings.c.event_id.in_(event_ids))
    ).scalar_one()
    if reference_count:
        raise RuntimeError(
            "Cannot replace seeded events while bookings reference them. "
            "Keep the existing events or use a separate disposable demo database."
        )


def _normalized_datetime(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _seed_changes_event(
    existing: Event,
    sample: Event,
    existing_sessions: list[EventSession],
    sample_sessions: list[EventSession],
) -> bool:
    fields = (
        "title",
        "description",
        "image_url",
        "venue",
        "address",
        "starts_at",
        "ends_at",
        "sales_open_at",
        "sales_close_at",
        "ticket_price_vnd",
        "capacity",
    )
    for field in fields:
        existing_value = getattr(existing, field)
        sample_value = getattr(sample, field)
        if isinstance(existing_value, datetime):
            existing_value = _normalized_datetime(existing_value)
            sample_value = _normalized_datetime(sample_value)
        if existing_value != sample_value:
            return True

    existing_by_start = {
        _normalized_datetime(item.starts_at): item for item in existing_sessions
    }
    sample_by_start = {
        _normalized_datetime(item.starts_at): item for item in sample_sessions
    }
    if existing_by_start.keys() != sample_by_start.keys():
        return True
    if sample_sessions:
        expected_tickets_sold = sum(
            existing_by_start[start].tickets_sold
            for start in sample_by_start
            if start in existing_by_start
        )
        if existing.tickets_sold != expected_tickets_sold:
            return True
    return any(
        _normalized_datetime(existing_by_start[start].ends_at)
        != _normalized_datetime(sample_session.ends_at)
        or existing_by_start[start].capacity != sample_session.capacity
        for start, sample_session in sample_by_start.items()
    )


def _ensure_seed_update_safe(
    session: Session,
    existing: Event,
    sample: Event,
    sample_sessions: list[EventSession],
) -> list[EventSession]:
    existing_sessions = session.exec(
        select(EventSession).where(EventSession.event_id == existing.id)
    ).all()
    if not inspect(session.connection()).has_table("bookings"):
        return existing_sessions

    bookings = Table("bookings", MetaData(), autoload_with=session.connection())
    if "event_id" not in bookings.c:
        return existing_sessions
    reference_count = session.execute(
        sqlalchemy_select(func.count())
        .select_from(bookings)
        .where(bookings.c.event_id == existing.id)
    ).scalar_one()
    if reference_count and _seed_changes_event(
        existing, sample, existing_sessions, sample_sessions
    ):
        raise RuntimeError(
            f"Cannot update event {existing.slug!r} while bookings reference it. "
            "Preserve the booked event data or use a separate demo database."
        )
    return existing_sessions


def seed_events(session: Session, replace_old_samples: bool = False) -> int:
    changed = 0
    if replace_old_samples:
        _ensure_unreferenced_events(session, LEGACY_SAMPLE_SLUGS)
        old_events = session.exec(
            select(Event).where(Event.slug.in_(LEGACY_SAMPLE_SLUGS))
        ).all()
        for event in old_events:
            session.delete(event)
            changed += 1

    for sample, sample_sessions in demo_events():
        existing = session.exec(
            select(Event).where(Event.slug == sample.slug)
        ).first()
        if existing is None:
            existing = sample
            session.add(existing)
            session.flush()
            changed += 1
            existing_sessions = []
        else:
            existing_sessions = _ensure_seed_update_safe(
                session, existing, sample, sample_sessions
            )
            for field in (
                "title",
                "description",
                "image_url",
                "venue",
                "address",
                "starts_at",
                "ends_at",
                "sales_open_at",
                "sales_close_at",
                "ticket_price_vnd",
                "capacity",
            ):
                setattr(existing, field, getattr(sample, field))

        sample_starts = {
            _normalized_datetime(item.starts_at) for item in sample_sessions
        }
        for existing_session in existing_sessions:
            if _normalized_datetime(existing_session.starts_at) not in sample_starts:
                session.delete(existing_session)

        existing_by_start = {
            _normalized_datetime(item.starts_at): item for item in existing_sessions
        }
        for sample_session in sample_sessions:
            existing_session = existing_by_start.get(
                _normalized_datetime(sample_session.starts_at)
            )
            if existing_session is None:
                sample_session.event_id = existing.id
                session.add(sample_session)
                changed += 1
            else:
                existing_session.ends_at = sample_session.ends_at
                existing_session.capacity = sample_session.capacity

        session.flush()
        stored_sessions = session.exec(
            select(EventSession).where(EventSession.event_id == existing.id)
        ).all()
        if stored_sessions:
            existing.capacity = sum(item.capacity for item in stored_sessions)
            existing.tickets_sold = sum(item.tickets_sold for item in stored_sessions)

    session.commit()
    return changed


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed Eventy's sample event catalog.")
    parser.add_argument(
        "--replace-old-samples",
        action="store_true",
        help="Remove previous built-in sample events before seeding the selected events.",
    )
    args = parser.parse_args()

    create_db_and_tables()
    with Session(engine) as session:
        changed = seed_events(session, replace_old_samples=args.replace_old_samples)
    print(f"Event seed complete; added or removed {changed} event/session record(s).")


if __name__ == "__main__":
    main()
