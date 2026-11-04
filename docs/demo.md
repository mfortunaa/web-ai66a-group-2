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
6. Choose **Về Vé của tôi**, then log out and log back in. From the catalog choose **Vé của tôi** and reopen the same confirmed booking. Verify its reference, quantity and total match the confirmation.

## Failure and sold-out checks

- **Failed payment:** create a booking, choose **Mô phỏng thanh toán thất bại**, and verify the page says it is not confirmed. Reload the payment URL; it must still show `payment_failed`, not a success screen. Retry with simulated success and verify the confirmation.
- **Sold-out event:** use the explicitly labeled `[DEMO] Sold Out` event. Its detail page must show unavailable status and no Buy Tickets action. For a checkout race, open a bookable event in two tabs, create and successfully pay for all remaining tickets in one tab, then submit the stale checkout in the other. The second request should show the API conflict rather than claim success.
- **Duplicate/reload protection:** double-click the create-booking or payment action, reload during checkout, and use browser Back. Checkout retries reuse the stored idempotency key and payload; payment reloads fetch the owned booking. A lost payment response must be reconciled with `GET /api/bookings/{booking_id}` before another payment action appears.
- **Unavailable session:** load a checkout with a stale session or submit more tickets than remain. The API conflict must be shown and must not navigate to a confirmed page.
- **Expired login:** clear the session or wait for the JWT to expire, then reload a booking/payment URL. The app should return to the login entry page.
- **Rejected retry:** after a lost booking response, retry the same request. If the API definitively rejects it (404/409/422), the form must unlock so the attendee can correct the details. Network errors, auth errors, throttling, and server errors must retain the original request key.
- **Switch accounts in the same tab:** create a booking as account A, log out, then sign in as account B and open the same event checkout. B must see a fresh form rather than A's booking or pending request. Signing back in as A must still allow recovery of A's saved request.

Run the checkout recovery regression tests from the repository root with Node.js:

```sh
node --test frontend/tests/booking.test.cjs
```

## If setup or the demo fails

- Check `http://127.0.0.1:8000/health` and `http://127.0.0.1:8000/docs` (Docker: use port `8080`) before debugging the UI.
- If no events are listed, stop the backend and rerun `python -m scripts.seed_events` from `backend/`, then restart it. For current demo dates, use `--refresh-demo-dates` only with a disposable database without bookings.
- If registration cannot be verified, inspect the local Mailpit inbox at `http://localhost:8025` in Docker mode, or the configured development mailbox. Do not disable auth or use shared credentials.
- If stock was consumed during a previous run, re-create a disposable database and seed it again. Keep real/shared databases and booking records intact.
- If the page reports an API error, check the browser's network request and FastAPI logs. Do not interpret a timeout as success; return to the same checkout/payment URL and let it reconcile.

## My Bookings checks

- Choose **Hủy đặt vé** in My Bookings or booking details. The modal must show the booking reference and **Hủy đặt vé không được hoàn tiền**. **Giữ đặt vé** and Escape must close it without sending a cancellation. Only **Xác nhận hủy** submits the action.
- Cancel a pending/failed/confirmed booking. The history and details show **Đã hủy**, no payment or cancellation action remains, refreshing keeps it cancelled, and a stale payment URL cannot resume it. Cancellation never refunds or releases consumed stock. Test both languages/themes and keyboard focus in the modal.

- Use a new account: **Vé của tôi** must show an empty state with a catalog link.
- Fail a simulated payment, open **Vé của tôi**, choose **Thử thanh toán lại**, and complete the original booking. Return to the list (including browser Back); it must refresh to **Đã xác nhận**, without consuming stock twice.
- Open a pending booking after sales close or stock runs out: the list explains why payment is unavailable. Open a stale payment URL directly; it must reload the current eligibility and hide payment actions. The backend still rejects a stale success request.
- Test more than 10 bookings with **Trang trước / Trang sau**. Verify newest-first ordering, totals, timezone and all statuses on desktop/tablet/phone, and use Tab/Enter for navigation.
- Disconnect the API, then choose **Thử lại** after reconnecting. Reload the list URL directly; expired authentication returns to sign-in. Account B must never see account A's list or details.

Automated frontend regression checks: `node --test frontend/tests/*.test.cjs`. The sign-in and registration pages share `css/auth-entry.css`; both preserve the existing email verification and recovery flows.
