# Proposed Database Design

Use SQLite and SQLModel for the first version. This document describes the planned schema; no tables have been created yet.

| Entity | Main fields |
| --- | --- |
| User | id, full_name, email (unique), password_hash, created_at |
| Event | id, title, description, image_url, venue, address, starts_at, ends_at, sales_open_at, sales_close_at, ticket_price_vnd, capacity, tickets_sold |
| Booking | id, reference (unique), user_id, event_id, quantity, attendee_name, attendee_email, attendee_phone, unit_price_vnd, total_price_vnd, status, created_at, paid_at |

## Relationships

- A user has many bookings.
- An event has many bookings.
- Each booking belongs to one user and one event.

## Rules

- Booking status is `pending`, `confirmed`, or `payment_failed`.
- Store the unit price and total on the booking to preserve the price at checkout.
- Use integer VND amounts and positive ticket quantities.
- Available tickets equal `capacity - tickets_sold`; the result must never be negative.
- Pending bookings do not reserve stock in the initial version. Availability can change before payment confirmation.
- Confirm payment and increase `tickets_sold` atomically, guarded by available stock and the booking's current status.
- Derive sale status from sales opening/closing times and remaining tickets instead of storing a status that can become stale.
- Store timestamps consistently in UTC and convert them to the event display timezone.
- Keep the database file local and excluded from Git.
