# Proposed API

Authentication and event endpoints are implemented; booking endpoints remain planned. See [setup and authentication examples](SETUP.md). Prefix application routes with `/api`. Require a bearer JWT on event and booking routes.

| Method | Endpoint | Purpose | Success |
| --- | --- | --- | --- |
| POST | `/api/auth/register` | Create an account using a JSON body | 201 |
| POST | `/api/auth/token` | Sign in using OAuth2 username/password form data | 200 |
| GET | `/api/auth/me` | Return the authenticated user's public profile | 200 |
| GET | `/api/events` | List events with optional `sale_status`, `date_from`, `date_to` filters | 200 |
| GET | `/api/events/{event_id}` | Return event details and current availability | 200 |
| POST | `/api/bookings` | Create a pending booking with event session ID, quantity, and attendee details | 201 |
| GET | `/api/bookings/{booking_id}` | Return an owned booking and confirmation details | 200 |
| POST | `/api/bookings/{booking_id}/simulate-payment` | Simulate success or failure; confirm and consume stock on success | 200 |

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

`GET /api/events/{event_id}` returns one event with the same fields (without the list envelope). `sessions` contains the dated performances with independent capacity and availability; `is_bookable` is false for past, sold-out, or not-currently-on-sale sessions. A single-date event has one session. Event-level capacity and sold counts total its sessions when sessions are defined. A booking must send the chosen `event_session_id` so tickets are counted against the correct performance; events without a defined session schedule are not ready for session-based booking. `sale_status` is computed when the request is made and is one of `on_sale`, `coming_soon`, `sold_out`, or `closed`. Event-level `available_tickets` sums remaining tickets for future sessions; when an event has no sessions yet, it uses the event-level capacity and sold count. `sale_status` filtering accepts `on_sale` and `coming_soon`; sold-out and closed events remain available in an unfiltered catalog response so the UI can explain why tickets cannot be purchased.

The current sample catalog also contains “[LÁ NHÀ GARDEN] Workshop Tranh thực vật ép Botanical art” and “MERRY DECEMBER”. The workshop is listed across 2 November–31 December 2026 without individual session times because none were provided; its 300-ticket capacity is a demo estimate. It currently has no bookable sessions, so provide its actual schedule before enabling session-based booking. “MERRY DECEMBER” is scheduled for 20 December 2026, 20:00–22:00 at Trung tâm TT Sự kiện Cung Xuân, with 500 demo tickets. These local schedules are returned as UTC timestamps; display them in `Asia/Ho_Chi_Minh`.

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
