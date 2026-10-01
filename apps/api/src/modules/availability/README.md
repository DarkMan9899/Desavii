# Module: availability

**Domain group:** Booking Engine
**Specification:** see `BACKEND_ARCHITECTURE.md` Part XI (Module Catalog) for
this module's Purpose, Responsibilities, Public/Internal Services,
Dependencies, Database Tables, Events, Queue Jobs, Transactions, Caching
Rules, Error Strategy, and Validation Strategy.
**Endpoint contract:** see `API_SPECIFICATION.md` for this module's exact
request/response shapes.

**Status:** implemented — bookable units, the `availability_calendar`
engine, reservation holds, manual blocks, external reservations, the
inventory ledger and connectors (see `services/availabilityService.js`).

**Step L6.2H4:** the one canonical per-range price (`priceUnitRange` /
`quoteUnitRange`, over `core/domain/unitRangePrice.js`) serves hold quotes,
booking charges and public stay totals. Calendar writes change only the
fields they carry (a price is cleared only by an explicit `null` pair), and
`DELETE /availability/{id}` is refused (`CALENDAR_ENTRY_IN_USE`) while the
inventory ledger shows the date consumed. Hold consume/release/expiry
row-lock their hold rows (`lockActiveByIds`, `lockExpiredByIds`) and require
every locked row deleted. See `API_SPECIFICATION.md` §48, §49.2, §51.4.

## Folder contents (per BACKEND_ARCHITECTURE.md §2)

- `controllers/` — HTTP-to-Service translation only (Ch. 5)
- `services/` — Application-layer use cases (Ch. 6)
- `repositories/` — database access, implementing Domain-layer ports (Ch. 7)
- `models/` — domain entities (Ch. 8)
- `dto/` — request/response shapes (Ch. 9)
- `validators/` — Layer 2 structural validation (Ch. 10)
- `events/` — domain events this module publishes
- `jobs/` — BullMQ job definitions this module owns (Ch. 36)
