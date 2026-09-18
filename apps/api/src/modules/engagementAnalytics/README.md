# Module: engagementAnalytics

**Domain group:** Platform
**Specification:** see the "Listing Lifetime / Renewal"-adjacent Engagement
Analytics A0/A0.1 architecture audits for this module's full Purpose,
Event Taxonomy, Identity/Privacy model, Data Model, Ingestion contract,
Partner Metric definitions, and GA4 mapping.

**Not the same module as** `apps/api/src/modules/analytics/` (still an
untouched scaffold). That module is reserved for booking/revenue business
intelligence — revenue, occupancy, ADR/RevPAR, cancellation-rate,
conversion-funnel queries read from existing Booking/Payment/Availability
tables, owning none of its own (`BACKEND_ARCHITECTURE.md` §29). This
module instead owns the visitor/engagement event pipeline: impressions,
views, favorites, contact clicks, the booking funnel, search, and
promotion events, for DESAVII-owned Partner-facing analytics (a
separate concern from GA4, which covers owner/admin site-wide aggregate
behavior). The two module names/domains must never be merged.

**A1 status:** schema/domain foundation only.

- Owns 4 tables (migration `0049_engagement_analytics_foundation`):
  `analytics_events` (raw, append-only) plus `listing_analytics_daily`,
  `company_analytics_daily`, `promotion_analytics_daily` (rollups).
- No foreign keys from any of the four tables to `listings`/`partners`/
  `advertisements`/`bookings`/`users` — all references are historical/
  denormalized analytics fields, never able to block a listing's
  lifecycle, soft-deletion, or any future business-row cleanup.
- `analytics_events.occurred_at` is always the server's own
  `UTC_TIMESTAMP(3)` at write time — never a client-supplied timestamp.
- The three daily rollup tables' `day` column is the **Asia/Yerevan**
  business date (not a UTC calendar date) — the future aggregation job
  (A4) is responsible for computing each Yerevan day's UTC instant
  boundaries; this module makes no MySQL-local-timezone assumption
  anywhere in its schema.
- Retention policy (constants only in A1 — no purge worker exists yet):
  raw events 90 days (hard delete), daily aggregates 24 months.
- Canonical event names live in `@desavii/types`'
  `packages/types/src/analyticsEvents.js` (`ANALYTICS_EVENTS`), reused
  here rather than duplicated.

**Not yet implemented (A2 onward):**

- `POST /analytics/events` ingestion endpoint
- frontend event tracker / `IntersectionObserver` impression detection
- server-authoritative event writes (favorite/booking service hooks)
- the daily aggregation BullMQ job
- the raw-event retention-purge job
- `GET /partner/analytics/*` read endpoints
- Partner-facing analytics dashboard UI
- GA4 integration
- any production analytics collection (stays feature-flagged off until
  the legal/consent dependency is resolved)

## Folder contents (per BACKEND_ARCHITECTURE.md §2)

- `controllers/` — HTTP-to-Service translation only (Ch. 5)
- `services/` — Application-layer use cases (Ch. 6)
- `repositories/` — database access, implementing Domain-layer ports (Ch. 7)
- `models/` — domain entities (Ch. 8)
- `dto/` — request/response shapes (Ch. 9)
- `validators/` — Layer 2 structural validation (Ch. 10)
- `events/` — domain events this module publishes
- `jobs/` — BullMQ job definitions this module owns (Ch. 36)
- `constants/` — small, fixed, app-level domain value sets not worth a DB
  lookup table (placements, contact methods, retention policy, ingestion
  limits) — same convention as `modules/ai/constants/featureCodes.js`.
