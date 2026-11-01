# Proposed API

Authentication endpoints are implemented; event and booking endpoints remain planned. See [setup and authentication examples](SETUP.md). Prefix application routes with `/api`. Require a bearer JWT on event and booking routes.

| Method | Endpoint | Purpose | Success |
| --- | --- | --- | --- |
| POST | `/api/auth/register` | Create an account using a JSON body | 201 |
| POST | `/api/auth/token` | Sign in using OAuth2 username/password form data | 200 |
| GET | `/api/auth/me` | Return the authenticated user's public profile | 200 |
| GET | `/api/events` | List events with optional `sale_status`, `date_from`, `date_to` filters | 200 |
| GET | `/api/events/{event_id}` | Return event details and current availability | 200 |
| POST | `/api/bookings` | Create a pending booking with event ID, quantity, and attendee details | 201 |
| GET | `/api/bookings/{booking_id}` | Return an owned booking and confirmation details | 200 |
| POST | `/api/bookings/{booking_id}/simulate-payment` | Simulate success or failure; confirm and consume stock on success | 200 |

## Conventions

- `sale_status` accepts `on_sale` or `coming_soon` for the catalog sections.
- Date filters use `YYYY-MM-DD` and refer to event dates in Asia/Ho_Chi_Minh.
- Return JSON, except that the token request uses OAuth2 form encoding.
- Return 401 for missing or invalid credentials, 403 for a forbidden booking, 404 for missing resources, 409 for booking conflicts such as insufficient tickets, and 422 for invalid input.
- Return prices as integer VND amounts. Never expose password hashes or secrets.
- Revalidate sale status, quantity, and availability at checkout and payment confirmation.
- A repeated successful payment request returns the existing confirmation without another stock change.
- Enable CORS for the local frontend origin during development.
- FastAPI will provide interactive API documentation at `/docs` once implemented.
