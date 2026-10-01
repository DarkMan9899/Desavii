# Module: booking-holds

**Domain group:** Booking Engine
**Specification:** see `BACKEND_ARCHITECTURE.md` Part XI (Module Catalog) for
this module's Purpose, Responsibilities, Public/Internal Services,
Dependencies, Database Tables, Events, Queue Jobs, Transactions, Caching
Rules, Error Strategy, and Validation Strategy.
**Endpoint contract:** see `API_SPECIFICATION.md` for this module's exact
request/response shapes.

**Sprint 10 status:** implemented, scoped down from this catalog entry's
aspirational spec — no Pricing/Payments/`DistributedLockManager`
dependency (none of those exist yet). Owns no table of its own;
`reservation_holds` stays owned by the `availability` module (this
module's only Repository-level dependency, injected as
`AvailabilityService`). See `services/bookingHoldsService.js` and the
approved Sprint 10 architecture proposal for the full design.

**Step L6.2H4 — server quote:** each held item in the `POST /booking-holds`
response carries `quote` (`unit_price_amount`, `total_amount`, `currency` —
decimal strings), and the batch carries `quote_total`; both come from
`AvailabilityService#quoteUnitRange`, the calculation booking conversion
re-checks. `null` when the unit has no complete single-currency price. The
quote is not a price lock (see `API_SPECIFICATION.md` §48, §51.4). Release,
consumption and the expiry sweep row-lock the hold rows first, so exactly
one operation wins a hold.

## Folder contents (per BACKEND_ARCHITECTURE.md §2)

- `controllers/` — HTTP-to-Service translation only (Ch. 5)
- `services/` — Application-layer use cases (Ch. 6)
- `repositories/` — database access, implementing Domain-layer ports (Ch. 7)
- `models/` — domain entities (Ch. 8)
- `dto/` — request/response shapes (Ch. 9)
- `validators/` — Layer 2 structural validation (Ch. 10)
- `events/` — domain events this module publishes
- `jobs/` — BullMQ job definitions this module owns (Ch. 36)
