# Requirements

## Purpose

Allow signed-in users to discover events and book tickets through a simple checkout flow.

## Pages

| Page | Main content |
| --- | --- |
| Login / registration | Credentials, validation messages, account creation |
| Event catalog | On Sale and Coming Soon sections, event date filters |
| Event details | Poster, description, date/time, venue, price, availability, Buy Tickets |
| Booking / checkout | Quantity, attendee name, email, phone, total, simulated payment |
| Confirmation | Booking reference, event summary, quantity, payment status |

## Acceptance criteria

- Visitors must sign in before accessing the catalog and booking flow.
- Invalid credentials show a clear error; passwords are stored only as hashes.
- Date filters apply to the event date, support inclusive start/end dates, and can be reset.
- An empty filter result shows an informative message.
- Coming Soon events cannot be purchased before their sales opening time.
- Sales close at the configured closing time. Closed and sold-out events cannot be purchased.
- Each event has one ticket type with a fixed price and limited capacity.
- Quantity must be a positive integer and cannot exceed available stock.
- Name, email, and phone are required; both frontend and backend validate input.
- The backend calculates the total using stored prices rather than trusting client input.
- A booking starts as pending. Only a successful simulated payment confirms it and consumes tickets.
- Payment confirmation checks availability and updates stock and booking status in one database transaction.
- Repeating payment confirmation for an already confirmed booking must not consume tickets again.
- Failed simulated payments leave the booking unconfirmed and do not consume tickets.
- Users can access only their own bookings.
- Store and return timestamps with a timezone; display event times in Asia/Ho_Chi_Minh.

## Proposed first-version limits

Payment is simulated, with no real money transfer or sensitive payment details. Event management uses seed data. Admin screens, seat maps, discount codes, refunds, email tickets, and check-in are deferred.
