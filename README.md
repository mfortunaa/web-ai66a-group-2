# Eventy - Event Discovery & Ticket Booking

A simple web application for discovering events and booking tickets. Users can sign in, browse upcoming events, filter by date, view event details, and complete a ticket booking through simulated payment.

**Assessment:** Midterm Project

**Course:** [Web Design and Programming](https://elearning.fda.edu.vn/course/view.php?id=187)

**Team:** To be added

**Members:** To be added

**Instructor:** To be added

**Class:** To be added

**Academic Year:** To be added

**Project Board:** To be added

**Demo:** To be added

---

## Project Overview

For a Docker demo with persistent SQLite and a local OTP/reset email inbox, follow [Docker Compose setup](docs/SETUP.md#docker-compose-developmentdemo-12). It serves the application at `http://localhost:8080` and Mailpit at `http://localhost:8025`.

On a new machine, start with [getting the project](docs/SETUP.md#1-get-the-project-on-a-new-machine), then configure Docker and choose sample data or [import an existing SQLite database](docs/SETUP.md#import-an-existing-sqlite-database). The guide also covers exporting a backup from the source machine.

Eventy provides a straightforward event discovery and registration experience. The initial version focuses on the main booking journey:

**Login → Event Catalog → Event Details → Booking Form → Simulated Payment → Confirmation**

Events are grouped into **On Sale** and **Coming Soon**. Users can filter events by date and sale status. Each event includes its description, time, location, ticket price, and availability.

**Current status:** FastAPI foundation, SQLite user storage, registration/login, JWT authentication, authenticated event list/detail and booking/payment APIs, and responsive catalog, booking, simulated-payment, and confirmation pages are implemented.

---

## User Stories & Starting Points

The frontend uses physical HTML pages and query parameters; the routes below are conceptual:

| Story ID | User Story                                                                                                  | Starting Point / Screen    | Proposed Route               |   Status    |
| :------: | :---------------------------------------------------------------------------------------------------------- | :------------------------- | :--------------------------- | :---------: |
| **US01** | Create an account and log in. | Login / Registration | `/index.html`, `/pages/register.html` | Implemented |
| **US02** | As a user, I want to browse On Sale and Coming Soon events so that I can find events of interest.           | Event Catalog              | `/events`                    | Implemented |
| **US03** | As a user, I want to filter events by date and sale status so that I can narrow down the list.              | Catalog filters            | `/events`                    | Implemented |
| **US04** | As a user, I want to view an event's description, time, venue, price, and availability before booking.      | Event Details              | `/events/:id`                | Implemented |
| **US05** | As a user, I want to select a ticket quantity and enter attendee information so that I can place a booking. | Buy Tickets / Booking Form | `/events/:id/book`           | Implemented |
| **US06** | As a user, I want to complete a simulated payment so that I can confirm my booking.                         | Checkout                   | `/bookings/:id/payment`      | Implemented |
| **US07** | As a user, I want to see my booking reference and event summary after payment.                              | Booking Confirmation       | `/bookings/:id/confirmation` | Implemented |

Implemented pages use physical HTML files and query parameters: `frontend/pages/events.html`, `frontend/pages/event-detail.html?event_id=<id>`, `frontend/pages/booking.html?event_id=<id>`, `frontend/pages/payment.html?booking_id=<id>`, and `frontend/pages/confirmation.html?booking_id=<id>`.

---

## Initial Scope

- Account registration and login.
- Event listing with date and sale status filters.
- Event details and one ticket type per event.
- Ticket quantity selection and attendee information form.
- Input validation, server-side price calculation, and availability checks.
- Simulated payment and booking confirmation.

Events can be populated with seed data and maintained through the admin event manager. See [admin setup](docs/SETUP.md#admin-event-management) for granting access and signing in. Email verification, password recovery, and persistent auth limits extend the initial scope in #6. Real payment integration and seat selection remain outside the scope. No real payment credentials will be collected.

---

## Technology Stack

| Area            | Planned Technology                         |
| :-------------- | :----------------------------------------- |
| Frontend        | HTML5, CSS3, vanilla JavaScript, Fetch API |
| Backend         | Python, FastAPI, Uvicorn                   |
| Validation      | Pydantic                                   |
| Database        | SQLite, SQLModel                           |
| Authentication  | bcrypt, OAuth2 Password Flow, JWT          |
| Testing         | pytest, FastAPI TestClient                 |
| Version Control | Git, GitHub                                |

---

## Project Structure

```text
web-ai66a-group-2/
|-- frontend/
|   |-- index.html          # Login entry page
|   |-- pages/              # Application pages
|   |-- css/                # Stylesheets
|   |-- js/                 # UI behavior and API calls
|   `-- assets/images/      # Event posters and images
|-- backend/
|   |-- app/
|   |   |-- api/            # API routers
|   |   |-- core/           # Configuration and authentication
|   |   |-- db/             # Database engine and sessions
|   |   |-- models/         # Database tables
|   |   |-- schemas/        # Request and response models
|   |   `-- services/       # Booking and payment logic
|   |-- scripts/            # Seed data and setup helpers
|   `-- tests/              # Backend tests
|-- docs/                   # Project documentation
|-- .gitignore
`-- README.md
```

---

## Documentation

- [Requirements & Acceptance Criteria](docs/requirements.md)
- [Proposed API](docs/api.md)
- [Proposed Database Design](docs/database.md)
- [Backend Structure](backend/README.md)
- [Setup Guide & Authentication Handoff](docs/SETUP.md)
- [Midterm Demo Checklist](docs/demo.md)

---

## Getting Started

### Frontend Preview

With Python 3 installed, run the following command from the repository root:

```sh
python -m http.server 5500 --directory frontend
```

Open [http://localhost:5500](http://localhost:5500) to use the login page. Start the backend and the local SMTP inbox first, then register, verify the emailed OTP, and sign in. See [email setup and database migration](docs/SETUP.md#email-verification-and-password-recovery-6).

### Backend Setup

Follow [docs/SETUP.md](docs/SETUP.md) to install dependencies, configure a local secret, start FastAPI, and run the authentication tests.

### Test Accounts

Create your own account through the registration page. No shared test credentials are committed.

---

## Team Contributions

To be added.
