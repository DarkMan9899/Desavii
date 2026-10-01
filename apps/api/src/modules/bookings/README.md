# Module: bookings

**Domain group:** Booking Engine
**Specification:** see `BACKEND_ARCHITECTURE.md` Part XI (Module Catalog) for
this module's Purpose, Responsibilities, Public/Internal Services,
Dependencies, Database Tables, Events, Queue Jobs, Transactions, Caching
Rules, Error Strategy, and Validation Strategy.
**Endpoint contract:** see `API_SPECIFICATION.md` for this module's exact
request/response shapes.

**Sprint 10 status:** implemented, scoped down from this catalog entry's
aspirational spec — no Payments/Refunds/Wallet dependency (none of those
modules or tables exist yet); stays inside migration 0008's documented
MVP, offline-payment model. Owns `bookings`/`booking_items`/
`booking_guests`/`booking_status_history`; depends on `AvailabilityService`
(capacity/pricing) and `ListingService` (partner resolution) only — never
a second Repository over their tables. See `services/bookingService.js`
and the approved Sprint 10 architecture proposal for the full design.

**Step L6.2H4 — price integrity:** `POST /bookings` requires each item's
accepted quote (`expectedTotalAmount` + `expectedCurrency`, echoed from the
hold's server quote). It is compared, never charged: every item is repriced
through `AvailabilityService#quoteUnitRange` (the same calculation that
quoted the hold) and booking proceeds only on an exact item-level match of
amount and currency; otherwise `409 PRICE_CHANGED` returns the complete
current quote and the transaction rolls back, keeping every hold. The stored
amounts are the accepted quote. A booking priced in a non-AMD currency keeps
that currency and stores no display FX snapshot. See
`API_SPECIFICATION.md` §48 and §51.4.

## Folder contents (per BACKEND_ARCHITECTURE.md §2)

- `controllers/` — HTTP-to-Service translation only (Ch. 5)
- `services/` — Application-layer use cases (Ch. 6)
- `repositories/` — database access, implementing Domain-layer ports (Ch. 7)
- `models/` — domain entities (Ch. 8)
- `dto/` — request/response shapes (Ch. 9)
- `validators/` — Layer 2 structural validation (Ch. 10)
- `events/` — domain events this module publishes
- `jobs/` — BullMQ job definitions this module owns (Ch. 36)
