# Proposed Database Design

Use SQLite and SQLModel for the first version. The User table is implemented as `users`, and the Event table is implemented as `events`. Booking is implemented as `bookings`. User profile and authentication are documented in [SETUP.md](SETUP.md).

| Entity | Main fields |
| --- | --- |
| User | id, full_name, email (unique), password_hash, created_at |
| Event | id, slug (unique), title, description, image_url, venue, address, starts_at, ends_at, sales_open_at, sales_close_at, ticket_price_vnd, total capacity, total tickets_sold |
| EventSession | id, event_id, starts_at, ends_at, capacity, tickets_sold |
| Booking | id, reference (unique), user_id, event_id, event_session_id, quantity, attendee_name, attendee_email, attendee_phone, unit_price_vnd, total_price_vnd, status, request_key (nullable), request_fingerprint (nullable), created_at, updated_at, paid_at |

## Relationships

- A user has many bookings.
- An event has many bookings.
- Each booking belongs to one user and one event.
- An event can have one or more dated sessions; booking requires a selected session. Events without a defined schedule are not ready for booking.

## Rules

- Booking status is `pending`, `confirmed`, or `payment_failed`.
- `(user_id, request_key)` is unique when a key is sent, so a retried creation request returns the same booking instead of a duplicate.
- Confirmation increases `tickets_sold` on both the selected `event_sessions` row and the `events` total in one transaction.
- Store the unit price and total on the booking to preserve the price at checkout.
- Use integer VND amounts and positive ticket quantities.
- Available tickets equal `capacity - tickets_sold`; the result must never be negative.
- Pending bookings do not reserve stock in the initial version. Availability can change before payment confirmation.
- Confirm payment and increase `tickets_sold` atomically, guarded by available stock and the booking's current status.
- Derive sale status from sales opening/closing times and remaining tickets instead of storing a status that can become stale.
- Store timestamps consistently in UTC and convert them to the event display timezone.
- Keep the database file local and excluded from Git.
- Event `slug` is a stable identifier used by the repeatable sample-data script; API clients should use the numeric `id` for detail routes and booking references.
- Event timestamps are stored as UTC. SQLite may return timezone-naive values, which the API interprets as UTC and serializes with a `Z` suffix.
- `capacity` must be positive, `tickets_sold` must be between zero and capacity, and event/sales end times must be later than their respective start times.
- Event capacity and sold counts are totals across its sessions. Each session has its own capacity and sold count so the same event can run on multiple dates without sharing ticket stock between performances.

## Sample events

The seed contains the four events provided for the project: “Những Thành Phố Mơ Màng Year End 2026”, a daily “The Traditional Water Puppet Show - Múa rối nước” with 29 separate performances, “[LÁ NHÀ GARDEN] Workshop Tranh thực vật ép Botanical art”, and “MERRY DECEMBER”. The water-puppet show has 30 tickets per performance (870 total); each date has independent availability. The workshop has no session schedule yet and uses a 300-ticket demo capacity estimate; its API availability is zero and it is not bookable until sessions are defined. “MERRY DECEMBER” has one session and 500 demo tickets. Three explicitly labeled `[DEMO]` events illustrate `coming_soon`, `sold_out`, and `closed`; they are not real listings. Sale status is derived at request time from the sales window and stock; it is not stored in the database.

Run `python -m scripts.seed_events` from the `backend/` directory to add/update these events and synchronize their performance sessions. To shift all sample event and session dates to today while preserving their relative schedule and sale states, run `python -m scripts.seed_events --refresh-demo-dates`. Date refresh is blocked if it would change an event referenced by a booking; use a disposable demo database when bookings already exist. If a database contains the earlier built-in fictional samples, `python -m scripts.seed_events --replace-old-samples` removes only those known samples and refuses to remove any referenced by a booking.
