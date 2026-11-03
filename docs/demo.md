# Midterm Demo Checklist

The demo uses seeded events, a local SQLite database, and simulated payment. It never collects real card or bank details.

## Prerequisites

- Follow [Local Setup & Authentication](SETUP.md) to install backend dependencies, configure `backend/.env`, and set a non-placeholder `SECRET_KEY`.
- Use a disposable demo database when refreshing sample dates or demonstrating sold-out inventory. Do not refresh dates in a database containing bookings; the seed command deliberately blocks changes to booked events.
- For the simplest run, start FastAPI from `backend/` and use its built-in frontend:

  ```sh
  python -m scripts.seed_events --refresh-demo-dates
  python -m uvicorn app.main:app --reload --port 8000 --no-proxy-headers
  ```

- Alternatively, use the [Docker Compose setup](SETUP.md#docker-compose-developmentdemo-12), then seed the container:

  ```sh
  docker compose exec backend python -m scripts.seed_events --refresh-demo-dates
  ```

- Open `http://127.0.0.1:8000` (or `http://localhost:8080` with Docker), register a demo account, read its OTP from Mailpit when using Docker, verify the email, and sign in.
- The standalone frontend option is documented in [Local Setup & Authentication](SETUP.md#3-run-the-frontend-second-terminal-repository-root). Sign-in is required before event, booking, payment, and confirmation APIs can be used.

## Happy path

1. From the catalog, open an event labeled **Đang mở bán** and choose **Mua vé**.
2. Select an available performance, enter a positive ticket quantity and verify the estimated total.
3. Enter or confirm the attendee name, email, and phone. Continue to the simulated payment page.
4. Choose **Mô phỏng thanh toán thành công**. Verify that the confirmation page shows a confirmed status, booking reference, event/session, quantity, attendee summary, and server-calculated total.
5. Reload the confirmation page. The same confirmation should load from the authenticated booking API.

## Failure and sold-out checks

- **Failed payment:** create a booking, choose **Mô phỏng thanh toán thất bại**, and verify the page says it is not confirmed. Reload the payment URL; it must still show `payment_failed`, not a success screen. Retry with simulated success and verify the confirmation.
- **Sold-out event:** use the explicitly labeled `[DEMO] Sold Out` event. Its detail page must show unavailable status and no Buy Tickets action. For a checkout race, open a bookable event in two tabs, create and successfully pay for all remaining tickets in one tab, then submit the stale checkout in the other. The second request should show the API conflict rather than claim success.
- **Duplicate/reload protection:** double-click the create-booking or payment action, reload during checkout, and use browser Back. Checkout retries reuse the stored idempotency key and payload; payment reloads fetch the owned booking. A lost payment response must be reconciled with `GET /api/bookings/{booking_id}` before another payment action appears.
- **Unavailable session:** load a checkout with a stale session or submit more tickets than remain. The API conflict must be shown and must not navigate to a confirmed page.
- **Expired login:** clear the session or wait for the JWT to expire, then reload a booking/payment URL. The app should return to the login entry page.

## If setup or the demo fails

- Check `http://127.0.0.1:8000/health` and `http://127.0.0.1:8000/docs` (Docker: use port `8080`) before debugging the UI.
- If no events are listed, stop the backend and rerun `python -m scripts.seed_events` from `backend/`, then restart it. For current demo dates, use `--refresh-demo-dates` only with a disposable database without bookings.
- If registration cannot be verified, inspect the local Mailpit inbox at `http://localhost:8025` in Docker mode, or the configured development mailbox. Do not disable auth or use shared credentials.
- If stock was consumed during a previous run, re-create a disposable database and seed it again. Keep real/shared databases and booking records intact.
- If the page reports an API error, check the browser's network request and FastAPI logs. Do not interpret a timeout as success; return to the same checkout/payment URL and let it reconcile.

My Bookings is not available yet. Add its navigation link here and in the shared application navigation when that page is delivered.
