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

Eventy provides a straightforward event discovery and registration experience. The initial version focuses on the main booking journey:

**Login → Event Catalog → Event Details → Booking Form → Simulated Payment → Confirmation**

Events are grouped into **On Sale** and **Coming Soon**. Users can filter events by date and sale status. Each event includes its description, time, location, ticket price, and availability.

**Current status:** Planning and initial repository setup. The features below have not been implemented yet.

---

## User Stories & Starting Points

The routes below are proposed frontend routes and may change during implementation.

| Story ID | User Story                                                                                                  | Starting Point / Screen    | Proposed Route               |   Status    |
| :------: | :---------------------------------------------------------------------------------------------------------- | :------------------------- | :--------------------------- | :---------: |
| **US01** | As a visitor, I want to create an account and log in so that I can access the event catalog.                | Login / Registration       | `/login`, `/register`        | Not started |
| **US02** | As a user, I want to browse On Sale and Coming Soon events so that I can find events of interest.           | Event Catalog              | `/events`                    | Not started |
| **US03** | As a user, I want to filter events by date and sale status so that I can narrow down the list.              | Catalog filters            | `/events`                    | Not started |
| **US04** | As a user, I want to view an event's description, time, venue, price, and availability before booking.      | Event Details              | `/events/:id`                | Not started |
| **US05** | As a user, I want to select a ticket quantity and enter attendee information so that I can place a booking. | Buy Tickets / Booking Form | `/events/:id/book`           | Not started |
| **US06** | As a user, I want to complete a simulated payment so that I can confirm my booking.                         | Checkout                   | `/bookings/:id/payment`      | Not started |
| **US07** | As a user, I want to see my booking reference and event summary after payment.                              | Booking Confirmation       | `/bookings/:id/confirmation` | Not started |

---

## Initial Scope

- Account registration and login.
- Event listing with date and sale status filters.
- Event details and one ticket type per event.
- Ticket quantity selection and attendee information form.
- Input validation, server-side price calculation, and availability checks.
- Simulated payment and booking confirmation.

Events will initially be populated using seed data. Real payment integration, seat selection, email delivery, and an admin dashboard are outside the initial scope. No real payment credentials will be collected.

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
|   |-- index.html          # Entry page (currently a sample)
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

---

## Getting Started

### Frontend Preview

With Python 3 installed, run the following command from the repository root:

```sh
python -m http.server 5500 --directory frontend
```

Open [http://localhost:5500](http://localhost:5500) to view the current sample page.

### Backend Setup

To be added once the FastAPI application and dependencies are implemented.

### Test Accounts

To be added when authentication is available.

---

## Team Contributions

To be added.
