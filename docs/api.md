# Proposed API

Authentication, event and booking endpoints are implemented. See [setup and authentication examples](SETUP.md). Prefix application routes with `/api`. The event catalog, event details and booking endpoints require a bearer JWT.

| Method | Endpoint | Purpose | Success |
| --- | --- | --- | --- |
| POST | `/api/auth/register` | Create an account using a JSON body | 201 |
| POST | `/api/auth/token` | Sign in using OAuth2 username/password form data | 200 |
| GET | `/api/auth/me` | Return the authenticated user's public profile | 200 |
| PATCH | `/api/auth/me` | Update the authenticated user's name and optional profile details; email is not editable | 200 |
| GET | `/api/events` | List events with optional `sale_status`, `date_from`, `date_to` filters | 200 |
| GET | `/api/events/highlights` | Return public previews for the login and registration pages | 200 |
| GET | `/api/events/{event_id}` | Return event details and current availability | 200 |
| POST | `/api/bookings` | Create a pending booking with event session ID, quantity, and attendee details | 201 |
| GET | `/api/bookings` | List the current user's bookings with bounded pagination | 200 |
| GET | `/api/bookings/{booking_id}` | Return an owned booking and confirmation details | 200 |
| POST | `/api/bookings/{booking_id}/simulate-payment` | Simulate success or failure; confirm and consume stock on success | 200 |

## Booking API contract

`POST /api/bookings/{booking_id}/cancel` cancels an owned booking (401 without login, 403 for another owner, 404 if missing). It returns the booking with `status: "cancelled"`, UTC `cancelled_at`, `can_retry_payment: false`, and reason `cancelled`. Repeated cancellation returns the first cancellation timestamp. Cancellation is non-refundable and permanent: stored totals, `paid_at`, and consumed stock remain unchanged. Both payment outcomes return 409 after cancellation. The database preserves the original payment status for audit and exposes the cancelled state when `cancelled_at` is set. Startup migration adds this nullable column without rebuilding or removing existing bookings.

`GET /api/bookings?limit=10&offset=0` requires a bearer JWT and returns only that user's bookings, ordered by `created_at DESC, id DESC`. `limit` defaults to 10 (1–50); `offset` defaults to 0 (0–10000). Optional `status` filters are `confirmed`, `processing` (pending or failed payment), and `cancelled`; optional `period` filters are `upcoming` and `past`, determined by the session start time. `total` counts the matching bookings before pagination. Empty filtered results return `items: []` and `total: 0`.

```json
{
  "items": [{
    "id": 7, "reference": "BK-3F9A1C2D", "event_id": 1,
    "event_title": "Evening show", "venue": "Event venue",
    "session_starts_at": "2027-01-17T09:00:00Z", "session_ends_at": "2027-01-17T15:30:00Z",
    "quantity": 2, "total_price_vnd": 998000, "status": "pending",
    "created_at": "2026-11-05T03:00:00Z", "can_retry_payment": true,
    "retry_unavailable_reason": null
  }],
  "total": 1, "limit": 10, "offset": 0
}
```

`can_retry_payment` and `retry_unavailable_reason` are also returned by booking create, detail, and payment responses. Reasons are `already_confirmed`, `not_retryable`, `event_unavailable`, `sales_not_open`, `sales_closed`, or `tickets_unavailable`. The flag is advisory: payment must reload current booking state and the backend rechecks sales and stock atomically on success. Resume using the original booking ID; do not create another booking. Prices are stored integer VND snapshots; timestamps are UTC and displayed in `Asia/Ho_Chi_Minh`.

`POST /api/bookings` (optional header `Idempotency-Key`, 8–128 chars, unique per user):

```json
{ "event_session_id": 1, "quantity": 2, "attendee_name": "An Nguyen",
  "attendee_email": "an@example.com", "attendee_phone": "0901234567" }
```

Returns 201 with the booking below (200 when the same key and payload replay an existing booking; 409 when the key is reused with a different payload). Prices are always taken from the event; client-sent prices are ignored. Quantity must be a positive integer. Attendee phone numbers must contain 8–15 ASCII digits, with an optional leading `+` and spaces, dots, or hyphens as separators (at most 20 characters after trimming). Separators alone are invalid. All booking timestamps (`session_starts_at`, `session_ends_at`, `created_at`, and non-null `paid_at`) are serialized in UTC with a `Z` suffix; display them in `Asia/Ho_Chi_Minh`.

```json
{ "id": 7, "reference": "BK-3F9A1C2D", "event_id": 1, "event_title": "...", "event_session_id": 1,
  "session_starts_at": "2027-01-17T09:00:00Z", "session_ends_at": "2027-01-17T15:30:00Z",
  "quantity": 2, "unit_price_vnd": 499000, "total_price_vnd": 998000,
  "attendee_name": "An Nguyen", "attendee_email": "an@example.com", "attendee_phone": "0901234567",
  "status": "pending", "created_at": "...", "paid_at": null }
```

`POST /api/bookings/{id}/simulate-payment` takes `{"outcome": "success" | "failure"}` and returns the booking. `pending → confirmed | payment_failed`; `payment_failed` may retry; `confirmed` is terminal (repeated success or failure returns it unchanged, without another stock change or a new `paid_at`). Success rechecks the sales window, the session start time and the session stock, then updates the booking and stock in one transaction; if tickets ran out it returns 409 and the booking stays unconfirmed. A booking owned by another user returns 403. Errors use `{"detail": "<message>"}`.

## Event API contract

`GET /api/events` returns an envelope with the matching event array and count:

```json
{
  "items": [
    {
      "id": 1,
      "slug": "nhung-thanh-pho-mo-mang-year-end-2026",
      "title": "Những Thành Phố Mơ Màng Year End 2026",
      "description": "Đại nhạc hội Những Thành Phố Mơ Màng Year End 2026.",
      "image_url": "/assets/images/events/Ntpmm.webp",
      "venue": "Trung tâm Triển lãm Việt Nam (VEC)",
      "address": "Đường Cầu Tứ Liên, Xã Đông Anh, Thành phố Hà Nội",
      "starts_at": "2027-01-17T09:00:00Z",
      "ends_at": "2027-01-17T15:30:00Z",
      "sales_open_at": "2026-10-04T17:00:00Z",
      "sales_close_at": "2027-01-17T09:00:00Z",
      "ticket_price_vnd": 499000,
      "capacity": 1000,
      "tickets_sold": 0,
      "available_tickets": 1000,
      "sale_status": "on_sale",
      "is_bookable": true,
      "booking_unavailable_reason": null,
      "sessions": [
        {
          "id": 1,
          "starts_at": "2027-01-17T09:00:00Z",
          "ends_at": "2027-01-17T15:30:00Z",
          "capacity": 1000,
          "tickets_sold": 0,
          "available_tickets": 1000,
          "is_bookable": true
        }
      ]
    }
  ],
  "total": 1
}
```

`GET /api/events/{event_id}` returns one event with the same fields (without the list envelope). `sessions` contains dated performances with independent capacity and availability; each session's `is_bookable` is false for past, sold-out, or not-currently-on-sale sessions. Event-level `is_bookable` is true only when at least one session can currently be booked. When false, `booking_unavailable_reason` explains why (`schedule_not_defined`, `coming_soon`, `sold_out`, `closed`, or `no_available_sessions`). Frontends must use `is_bookable`, not `sale_status` or a positive event capacity by itself, to enable buying. Events with no schedule have `available_tickets: 0` and are not bookable.

The event capacity is a shared limit across its sessions, and confirmed payments update both event and session sold counts. A booking page keeps using `event_id` in its URL to load the event, as specified by issue #4/#5. When creating the booking, issue #3 must send the selected `event_session_id` equal to one of the returned `sessions[].id`; session-based booking is not available for events without sessions. `sale_status` is computed when the request is made and is one of `on_sale`, `coming_soon`, `sold_out`, or `closed`. Event-level `available_tickets` sums remaining tickets for future sessions, up to the remaining event capacity. Each session's available count is also capped by the remaining event capacity. `sale_status` filtering accepts `on_sale` and `coming_soon`; sold-out and closed events remain available in an unfiltered catalog response so the UI can explain why tickets cannot be purchased.

The current sample catalog also contains “[LÁ NHÀ GARDEN] Workshop Tranh thực vật ép Botanical art” and “MERRY DECEMBER”. The workshop is listed across 2 November–31 December 2026 without individual session times because none were provided; its 300-ticket capacity is a demo estimate, `available_tickets` is 0, `is_bookable` is false, and `booking_unavailable_reason` is `schedule_not_defined`. Provide its actual schedule before enabling session-based booking. “MERRY DECEMBER” is scheduled for 20 December 2026, 20:00–22:00 at Trung tâm TT Sự kiện Cung Xuân, with 500 demo tickets. These local schedules are returned as UTC timestamps; display them in `Asia/Ho_Chi_Minh`.

The seed also includes explicitly labeled `[DEMO]` events for the `coming_soon`, `sold_out`, and `closed` states. They exist only to demonstrate catalog states and are not real event listings. Before a presentation, run `python -m scripts.seed_events --refresh-demo-dates` from `backend/` to shift event/session dates to the current Ho Chi Minh City date while preserving those states. This command refuses to shift dates when doing so would alter an event referenced by a booking.

## Conventions

- `GET /api/events?sale_status=on_sale` and `GET /api/events?sale_status=coming_soon` return the two catalog sections.
- `date_from` and `date_to` use `YYYY-MM-DD`, refer to the event start date in `Asia/Ho_Chi_Minh`, and include both boundary dates. A range where `date_from` is after `date_to` returns 422.
- Event timestamps are returned in UTC ISO 8601 format with a `Z` suffix; display them in `Asia/Ho_Chi_Minh`. Prices and stock counts are integers.
- Date filters match an event if its own start date or at least one of its session dates falls in the inclusive local date range.
- Booking creation in issue #3 must accept `event_session_id` (not only `event_id`) so recurring performances keep independent ticket stock.
- Return JSON, except that the token request uses OAuth2 form encoding.
- Event read routes return 401 for missing or invalid credentials, 404 for a missing event, and 422 for invalid filters. Booking routes return 403 for a forbidden booking, 404 for missing resources, 409 for booking conflicts such as insufficient tickets, and 422 for invalid input.
- Return prices as integer VND amounts. Never expose password hashes or secrets.
- Revalidate sale status, quantity, and availability at checkout and payment confirmation.
- A repeated successful payment request returns the existing confirmation without another stock change.
- Enable CORS for the local frontend origin during development.
- FastAPI provides interactive API documentation at `/docs`.

## Authentication verification and recovery (#6)

The final request/response examples, defaults and error contracts are in [auth-contract.md](auth-contract.md). Registration returns the public user plus `is_email_verified: false` and `verification_delivery: "sent" | "retry"`; `/me` includes `is_email_verified`. Clients must verify email before requesting a token.

- `POST /api/auth/verify-email`: JSON `{ "email": "an@example.com", "code": "123456" }`.
- `POST /api/auth/resend-verification`: JSON `{ "email": "an@example.com" }`.
- `POST /api/auth/forgot-password`: JSON `{ "email": "an@example.com" }`.
- `POST /api/auth/reset-password`: JSON `{ "token": "emailed-token", "password": "replacement123" }`.
- `PATCH /api/auth/me`: JSON `{ "full_name": "New Name", "date_of_birth": "2000-02-29", "phone_number": "+84 901 234 567" }`. Birthday and phone are optional and can be cleared with `null` or an empty string. Email and unknown fields are rejected.

Wrong credentials return 401. Only correct credentials can return 403 with `detail.code=email_not_verified` and `detail.action=verify-email`. Invalid/expired/used challenges return 400 with `detail.code=invalid_challenge`. Rate limits return 429 with `detail.code=rate_limited`, integer `detail.retry_after` seconds and the exposed `Retry-After` header. An eligible resend whose SMTP send fails returns 503 `delivery_failed`; registration remains saved if delivery fails. Recovery requests always return the same 200 message for known/unknown emails and SMTP failures. Reset uses registration's password rules, revokes all earlier JWTs, and does not log in automatically.

Registration and password reset require at least eight characters with no application-level maximum. New hashes use Argon2id; existing bcrypt hashes remain verifiable for migrated accounts. Profile updates accept `full_name` only, so email remains immutable.
