# API SPECIFICATION

**Desavii Armenia — Backend ⇄ Frontend Contract**
**Status:** Final · **Version:** 1.0 · **Classification:** Confidential
**Owner:** Chief API Architect
**Depends on (must never be contradicted):** `PROJECT_BIBLE.md` · `UI_UX_GUIDELINES.md` · `DATABASE_ARCHITECTURE.md` · `BOOKING_ENGINE_ARCHITECTURE.md`

---

> "An API is a promise. Every field, every status code, every error shape is a
> promise the backend makes to every client that will ever call it — including
> clients that don't exist yet. We design for Stripe's discipline (predictable,
> versioned, exhaustively documented) and Airbnb's breadth (one contract,
> dozens of very different resource types) at once."

This document is the single source of truth for the Desavii Armenia REST
API. It is binding on both Backend and Frontend teams: no endpoint may ship
that is not described here, and no client may assume behavior not described
here. Every resource and business rule in this document maps directly onto
the schema in `DATABASE_ARCHITECTURE.md` and the state machines in
`BOOKING_ENGINE_ARCHITECTURE.md` — this document does not redefine either; it
exposes them.

No source code, controller logic, or SQL appears anywhere in this document.

---

## Table of Contents

**Part I — Foundations**
1. API Philosophy
2. REST Standards & Resource Modeling
3. Versioning Strategy
4. Authentication
5. Authorization
6. JWT Flow
7. Refresh Tokens
8. API Response Format
9. Error Format
10. Validation Rules
11. Pagination
12. Sorting
13. Filtering
14. Searching
15. Localization
16. Timezone Handling
17. Rate Limiting
18. Caching
19. File Upload
20. Media URLs
21. Status Codes
22. Idempotency
23. Webhook Standards
24. Naming Conventions
25. Folder Structure
26. OpenAPI Architecture

**Part II — API Modules**
27. Authentication · 28. Users · 29. Profiles · 30. Partners · 31. Organizations ·
32. Employees · 33. Roles · 34. Permissions · 35. Countries · 36. Regions ·
37. Cities · 38. Listings · 39. Properties · 40. Hotels · 41. Vacation Houses ·
42. Restaurants · 43. SPA · 44. Car Rentals · 45. Tours · 46. Events ·
47. Bookings · 48. Booking Holds · 49. Availability · 50. Calendar ·
51. Pricing · 52. Coupons · 53. Favorites · 54. Reviews · 55. Notifications ·
56. Messaging · 57. Payments · 58. Refunds · 59. Invoices · 60. Wallet ·
61. Payouts · 62. Analytics · 63. CMS · 64. Advertisements · 65. Support ·
66. Reports · 67. Settings · 68. Admin

**Appendices**
A. Error Code Catalog
B. Permission Key Reference
C. HTTP Status Code Usage Summary

---

# PART I — FOUNDATIONS

## 1. API Philosophy

1. **One contract, every client.** The web app, mobile app, Partner Dashboard,
   Admin Panel, and any future third-party integration all call the *same*
   API — there is no private, undocumented "internal" API. If the Admin Panel
   needs a capability, it is a documented, permission-gated endpoint, not a
   backdoor.
2. **Resources, not actions.** The API is modeled around nouns
   (`/bookings`, `/listings`) with a small, disciplined set of
   verb-like sub-resources for genuine state transitions
   (`/bookings/{id}/cancel`) — never an RPC-style `/doBooking` endpoint.
3. **Predictable beats clever.** Every list endpoint paginates the same way;
   every error looks the same shape; every timestamp is UTC ISO-8601. A
   frontend engineer who has learned one endpoint has effectively learned
   the shape of all of them.
4. **The API never lies about state.** If the Booking Engine's authoritative
   state (per `BOOKING_ENGINE_ARCHITECTURE.md` §3) says a booking is
   `Expired`, the API returns `Expired` — the API layer never smooths over,
   caches past, or reinterprets booking-engine truth.
5. **Backward compatibility is a feature, not an accident.** A field is never
   removed or repurposed within a major version (Section 3). Additive
   changes (new optional fields, new endpoints) ship continuously without a
   version bump.
6. **Security is not bolted on.** Authentication, authorization, and rate
   limiting are enforced at the framework/gateway level for every route by
   default; an endpoint is public only if it is explicitly, deliberately
   marked so (Section 5).

## 2. REST Standards & Resource Modeling

- **Resources are nouns, plural:** `/listings`, `/bookings`, `/refunds`.
- **Standard verbs map onto HTTP methods:**

| Action | Method | Example |
|---|---|---|
| List | GET | `GET /listings` |
| Retrieve one | GET | `GET /listings/{id}` |
| Create | POST | `POST /listings` |
| Full replace | PUT | `PUT /listings/{id}` (rare; most updates are partial) |
| Partial update | PATCH | `PATCH /listings/{id}` |
| Delete (soft) | DELETE | `DELETE /listings/{id}` |

- **State transitions that are not simple field updates are modeled as
  sub-resource actions**, always a POST, never overloading PATCH with a
  hidden "action" field: `POST /bookings/{id}/cancel`,
  `POST /bookings/{id}/check-in`, `POST /booking-holds/{id}/confirm`.
  This mirrors `BOOKING_ENGINE_ARCHITECTURE.md` §3's principle that every
  transition is a deliberate, named operation — the API surface makes that
  principle visible to clients.
- **Nesting is limited to two levels.** `/listings/{id}/media` is allowed;
  `/partners/{id}/listings/{id}/media` is not — deeply nested URLs are
  replaced by top-level resources with filter query parameters instead
  (`/media?listing_id={id}`), keeping every resource independently
  addressable and cacheable.
- **DELETE is always soft-delete**, consistent with
  `DATABASE_ARCHITECTURE.md` §7 — a `DELETE` call sets `deleted_at` and
  returns `200 OK` with the now-inactive resource, never a hard removal.
  Hard purge (compliance-only) is a separate, explicitly named admin
  endpoint (Section 68), never the default `DELETE` behavior.
- **Every resource ID is an opaque, stable identifier** exposed to clients
  as a string, even where the underlying primary key is numeric — this
  gives Backend room to change internal ID strategy (Section 16.4 of
  `DATABASE_ARCHITECTURE.md`, e.g. a future move to Snowflake IDs) without
  a breaking API change.

## 3. Versioning Strategy

- The API is versioned in the **URL path**: `/api/v1/...`. Path-based
  versioning (not header-based) is chosen deliberately for discoverability —
  any engineer can identify a request's version by reading the URL, and
  version-specific documentation, mocks, and monitoring can all key off the
  path directly.
- **v1 is the only version at launch.** A new major version (`/api/v2`) is
  created only for breaking changes (removing a field, changing a field's
  type or meaning, changing an error shape) and both versions are served
  side-by-side for a published deprecation window (minimum 12 months)
  before the old version is retired.
- **Non-breaking changes never bump the version:** adding a new optional
  request field, adding a new response field, adding a new endpoint, or
  adding a new enum value to a lookup table (per
  `DATABASE_ARCHITECTURE.md` §1's "no native ENUM" rule, new statuses are
  additive by nature) all ship within v1.
- Every deprecation is announced via a `Deprecation` and `Sunset` HTTP
  response header (per the IETF draft convention) on the old version's
  responses, in addition to written release notes, for at least 90 days
  before removal.

## 4. Authentication

- All authentication is **token-based (JWT)**, never server-side session
  cookies — this keeps the API stateless (per
  `BOOKING_ENGINE_ARCHITECTURE.md` §16.5's stateless-application-layer
  principle) and equally usable by the web app, mobile app, and any future
  client.
- Every request to a non-public endpoint carries
  `Authorization: Bearer {access_token}`.
- Public endpoints (unauthenticated) are explicitly whitelisted per module
  in Part II — everything else defaults to requiring authentication; there
  is no implicit-public fallback.

## 5. Authorization

- Authorization is enforced via the RBAC model already defined in
  `DATABASE_ARCHITECTURE.md` §4.1 and §9: every authenticated request
  carries the caller's resolved `roles` and `permissions`, and every
  endpoint in Part II declares the specific permission key(s) required
  (Appendix B is the full key reference).
- **Ownership scoping.** Many endpoints additionally require that the
  authenticated principal *own* the resource (a partner may only update
  their own listings, a customer may only view their own bookings) — this
  is enforced as a second check beyond the permission key, and is called
  out explicitly per endpoint as "Owner or `{permission}`."
- **Partner-employee scoping.** Per `DATABASE_ARCHITECTURE.md` §9, a
  `partner_employees` role is scoped to a single `partner_id` — the API
  layer resolves this scope from the token and silently filters every list
  endpoint to that scope; it is never the client's responsibility to pass a
  `partner_id` filter for security purposes (a client-supplied
  `partner_id` on a scoped account is validated against the token's own
  scope and rejected if mismatched, never trusted outright).
- **Public access is a deliberate declaration**, not an absence of a
  permission check — endpoints marked "Authentication Required: No" in
  Part II are the platform's complete public surface (search, listing
  detail, reviews) and are reviewed as a security-relevant list on every
  release.

## 6. JWT Flow

1. **Login** (`POST /auth/login`, Section 27) validates credentials and
   issues a short-lived **access token** (15 minutes) and a long-lived
   **refresh token** (30 days), both JWTs.
2. The access token's payload carries the minimum claims required to
   authorize a request without a database round-trip on every call: user
   ID, active role IDs, and (for partner-scoped accounts) the scoped
   `partner_id` — permissions themselves are resolved from role IDs against
   a short-TTL cache (Section 18), not embedded directly, so a permission
   change takes effect within that cache's TTL rather than only at the
   token's next refresh.
3. Every protected endpoint verifies the access token's signature and
   expiry before any business logic runs; an expired or invalid signature
   returns `401 UNAUTHENTICATED` (Appendix A) immediately.
4. Access tokens are **never** revocable individually before their natural
   15-minute expiry (by design — this is what keeps them stateless and
   fast to verify); anything requiring immediate effect (a banned account,
   a forced logout) is enforced by revoking the *refresh* token (Section 7)
   so no new access token can be issued, combined with the 15-minute
   natural expiry bounding the exposure window.

## 7. Refresh Tokens

- `POST /auth/refresh` exchanges a valid, non-revoked refresh token for a
  new access token (and, per rotation policy below, a new refresh token).
- **Refresh token rotation.** Every successful refresh issues a brand-new
  refresh token and immediately revokes the one just used — refresh tokens
  are strictly single-use. This means a stolen-and-replayed refresh token
  is detectable: if a revoked refresh token is ever presented again, the
  entire token family is revoked and the user is forced to fully
  re-authenticate, treated as a possible compromise (`AUTH_TOKEN_REUSE_DETECTED`,
  Appendix A).
- Refresh tokens are stored server-side (hashed) against the issuing user
  and device, enabling `POST /auth/logout` (revokes the current device's
  token) and `POST /auth/logout-all` (revokes every refresh token for the
  user — the mechanism behind a "log out of all devices" security action).
- Refresh tokens are also the mechanism behind admin-forced session
  termination (an admin suspending a user, Section 68) — suspension
  immediately revokes all of that user's refresh tokens.

## 8. API Response Format

Every response, success or error, shares one envelope:

```
{
  "success": true | false,
  "data": <object | array | null>,
  "meta": <object | null>,
  "error": <object | null>
}
```

- `data` carries the resource(s) on success, and is `null` on error.
- `meta` carries pagination (Section 11), rate-limit state (Section 17), or
  other response metadata; it is `null` when not applicable.
- `error` is `null` on success and populated per Section 9 on failure —
  `success`, `data`, and `error` are mutually exclusive by convention:
  a response is never both `success: true` and carrying an `error` object.
- Every resource object includes, at minimum: `id`, `created_at`,
  `updated_at`, and — where the underlying table is soft-deletable per
  `DATABASE_ARCHITECTURE.md` §7 — `deleted_at` (null unless the resource
  is inactive, and inactive resources are only ever returned to callers
  with explicit permission to view trashed records).

## 9. Error Format

```
{
  "success": false,
  "data": null,
  "meta": null,
  "error": {
    "code": "BOOKING_HOLD_EXPIRED",
    "message": "This reservation hold has expired. Please search again.",
    "details": [
      { "field": "hold_id", "issue": "expired_at 2026-07-15T10:15:00Z" }
    ],
    "request_id": "req_9f3c2a1b"
  }
}
```

- `code` is a **stable, machine-readable** string from the Error Code
  Catalog (Appendix A) — clients branch on `code`, never on `message`.
- `message` is a human-readable, already-localized (Section 15) string
  safe to display directly to the end user.
- `details` is an optional array used for field-level validation failures
  (Section 10) or additional structured context; omitted when not
  applicable.
- `request_id` is always present, generated per-request, and is the single
  identifier support and engineering use to trace a specific failure
  through logs — every support ticket referencing an API error is expected
  to include it.

## 10. Validation Rules

- All request validation happens at the **API-layer**, per
  `BOOKING_ENGINE_ARCHITECTURE.md` §11.1's layered-validation model — this
  is "Layer 2" of that model; Layer 1 is client-side UX convenience, and
  Layer 3 (transactional/lock-protected) is enforced deeper in the Booking
  Engine for booking-specific writes.
- Validation failures always return `422 UNPROCESSABLE_ENTITY` with
  `error.code = "VALIDATION_FAILED"` and one `details` entry per invalid
  field, each carrying the field path and a specific issue code (e.g.
  `required`, `invalid_format`, `out_of_range`, `already_exists`) — never a
  single flattened message string, so the frontend can highlight the exact
  offending field(s).
- Every module's endpoint tables in Part II list the validation rules
  specific to that resource; universal rules applied everywhere include:
  string fields are trimmed and length-capped, monetary fields must be
  non-negative fixed-point values paired with a valid `currency_id`
  (`DATABASE_ARCHITECTURE.md` §1), and date/time fields must be valid
  ISO-8601 (Section 16).

## 11. Pagination

- All list endpoints are **cursor-paginated**, not offset-paginated —
  offset pagination degrades on large, frequently-changing tables
  (`bookings`, `availability_calendar`) exactly the tables this platform
  has the most of; cursor pagination stays performant and stable
  regardless of table size or concurrent writes.
- Request: `?limit={1-100, default 20}&cursor={opaque_string}`.
- Response `meta`:

```
"meta": {
  "pagination": {
    "next_cursor": "eyJpZCI6MTIzfQ==",
    "has_more": true,
    "limit": 20
  }
}
```

- `next_cursor` is opaque and must not be parsed or constructed by
  clients — only round-tripped from the previous response. A small set of
  reference-data endpoints with genuinely bounded, rarely-changing size
  (Countries, Regions — Sections 35–36) may additionally support classic
  `?page=&per_page=` for simplicity, explicitly called out per-endpoint.

## 12. Sorting

- `?sort={field}` ascending by default; `?sort=-{field}` for descending
  (leading hyphen convention, consistent with Stripe/JSON:API practice).
- Multiple sort keys are comma-separated and applied in order:
  `?sort=-created_at,price`.
- Each endpoint's documentation in Part II lists its **sortable field
  allowlist** — sorting is never permitted on arbitrary/unindexed columns,
  both for performance (Section 6.2 of `DATABASE_ARCHITECTURE.md`'s
  indexing strategy) and to avoid leaking internal-only fields through
  sort-order side channels.

## 13. Filtering

- Filters are expressed as query parameters matching the field name:
  `?status=confirmed&partner_id=prt_123`.
- Range filters use a bracket suffix: `?price[gte]=50&price[lte]=200`,
  `?check_in[gte]=2026-08-01`.
- Multi-value filters accept comma-separated values:
  `?status=confirmed,checked_in`.
- Each endpoint's **filterable field allowlist** is explicit in Part II —
  the same performance/security rationale as Section 12 applies.

## 14. Searching

- Full-text/geo search is exposed exclusively through the dedicated
  `GET /listings/search` endpoint (Section 38), which queries the
  search-optimized index described in `BOOKING_ENGINE_ARCHITECTURE.md`
  §16.3 — **never** a `?q=` parameter bolted onto the generic
  `GET /listings` list endpoint, keeping the fast-but-eventually-consistent
  search path architecturally distinct from the slower-but-authoritative
  listing endpoints.
- Search supports free-text query, geo radius, date range, party size,
  category, amenity, and price-range parameters simultaneously, returning
  results ranked by relevance, with the same cursor-pagination contract
  as Section 11.

## 15. Localization

- Every request may carry `Accept-Language: hy | ru | en` (or a
  `?locale=` override); the response returns translated content
  (`listing_translations`, `cms_page_translations`, etc., per
  `DATABASE_ARCHITECTURE.md` §12) in that locale, falling back to the
  platform default locale for any field without a translation in the
  requested one — never an empty string.
- Locale affects **content**, never **data structure** — a response's JSON
  shape is identical across locales; only translatable string field
  values differ.
- Currency display is a separate, independent concern from language
  locale (Section 3.2 of `UI_UX_GUIDELINES.md`'s multi-language principle
  applied to the API): `?display_currency=` converts *displayed* prices
  using `exchange_rates` for presentation, while the authoritative
  transactional currency (what is actually charged) is always the
  listing's own `currency_id`, never silently swapped.

## 16. Timezone Handling

- Every timestamp in every request and response is **UTC, ISO-8601**
  (`2026-07-15T14:30:00Z`) — no endpoint ever accepts or returns a
  timezone-offset timestamp or a naive/unzoned timestamp.
- Whole-day booking fields (check-in/check-out dates for Hotels, Vacation
  Houses, Camping, Car Rentals) are transmitted as **date-only** strings
  (`2026-07-15`, no time component), consistent with
  `BOOKING_ENGINE_ARCHITECTURE.md` §6.3's treatment of a booking night as a
  calendar-date concept, not a UTC-instant concept.
- Any endpoint returning a listing's local time (e.g., a restaurant's
  opening hours, a SPA's slot times for display) additionally returns the
  listing's IANA timezone identifier (`"timezone": "Asia/Yerevan"`)
  alongside the UTC instant, so the client can render local time without
  guessing — the API never pre-converts to local time itself.

## 17. Rate Limiting

- Enforced per authenticated principal (user or partner) and, for
  unauthenticated traffic, per IP address, using a sliding-window counter.
- Default limits: **300 requests/minute** for authenticated standard
  endpoints, **20 requests/minute** for unauthenticated public search, and
  a stricter **10 requests/minute** on sensitive, abuse-prone endpoints
  (login, password reset, coupon redemption attempts).
- Every response carries rate-limit state headers:
  `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`.
- Exceeding the limit returns `429 TOO_MANY_REQUESTS` with
  `error.code = "RATE_LIMITED"` and a `Retry-After` header.
- Partner and Admin API access (server-to-server, Section 30/68) uses a
  separate, higher-throughput limit tier tied to an API-key-based
  principal rather than a logged-in user session.

## 18. Caching

- **List and search endpoints** are cacheable at the CDN/edge layer for a
  short TTL (seconds) using standard `Cache-Control` and `ETag` headers;
  clients are expected to send `If-None-Match` and handle `304 Not
  Modified`.
- **Booking-mutating endpoints** (holds, confirmation, payment,
  cancellation) are always `Cache-Control: no-store` — never cached at any
  layer, consistent with `BOOKING_ENGINE_ARCHITECTURE.md` §16.3's
  separation of the hot-path cache from authoritative write paths.
- **Permission/role resolution** (Section 6) is cached server-side with a
  short TTL (default 60 seconds) so a permission revocation takes effect
  platform-wide within that bound without requiring full token
  invalidation.

## 19. File Upload

- Media upload is a **two-step, pre-signed-URL flow**, never a direct
  binary POST through the main API tier — this keeps large file transfer
  off the application servers entirely:
  1. `POST /media/upload-intent` — client declares file type, size, and
     the entity it will attach to; server validates constraints (max size,
     allowed MIME types per context — images vs. videos) and returns a
     short-lived, pre-signed upload URL directly to object storage.
  2. Client uploads the binary directly to that pre-signed URL.
  3. `POST /media` — client confirms the upload is complete, referencing
     the same upload-intent token; the server verifies the object exists
     in storage, creates the `media` row (`DATABASE_ARCHITECTURE.md`
     §4.5), and kicks off asynchronous thumbnail/transcoding jobs.
- Maximum sizes: 10 MB per image, 500 MB per video (partner-tier
  dependent); allowed types are validated both by declared MIME type at
  intent time and by inspecting the actual file signature after upload,
  never trusting the client-declared type alone.

## 20. Media URLs

- Every media reference returned by the API is a **fully-qualified CDN
  URL**, never a raw storage path — `DATABASE_ARCHITECTURE.md` §8.1's
  "database stores only metadata and a URL" principle is what this
  guarantees at the API boundary.
- Image responses include a small set of standard, pre-generated
  responsive variants (`thumbnail`, `medium`, `large`, `original`) as a
  `variants` object, so clients never construct resizing URLs themselves.
- Video responses include a `thumbnail_url`, a `playback_url` (adaptive
  streaming manifest where transcoding applies), and `duration_seconds`.

## 21. Status Codes

Full mapping in Appendix C. Summary of the codes used platform-wide:

| Code | Meaning | Used for |
|---|---|---|
| 200 | OK | Successful GET, PATCH, DELETE (soft), action endpoints |
| 201 | Created | Successful POST creating a resource |
| 204 | No Content | Successful action with no meaningful response body (rare; most actions return the updated resource with 200) |
| 400 | Bad Request | Malformed request syntax (unparseable JSON, missing required headers) |
| 401 | Unauthenticated | Missing, invalid, or expired token |
| 403 | Forbidden | Valid token, insufficient permission or ownership |
| 404 | Not Found | Resource does not exist or is soft-deleted and caller lacks trashed-view permission |
| 409 | Conflict | State conflict — e.g., availability lost between check and hold (`BOOKING_ENGINE_ARCHITECTURE.md` §5.5) |
| 422 | Unprocessable Entity | Validation failure (Section 10) |
| 429 | Too Many Requests | Rate limit exceeded (Section 17) |
| 500 | Internal Server Error | Unhandled backend fault |
| 503 | Service Unavailable | Planned maintenance or dependency outage (e.g., Redis unavailable, per `BOOKING_ENGINE_ARCHITECTURE.md` §15.2's degraded-mode fallback still returning 200s where correctness is preserved — 503 is reserved for genuine unavailability, not degraded-but-correct operation) |

## 22. Idempotency

- Every `POST` that creates a financially or inventory-significant
  resource (booking holds, payment captures, refunds, payouts) **requires**
  an `Idempotency-Key` request header, generated client-side (a UUID) per
  logical user action.
- The server persists the mapping of (idempotency key → original response)
  for 24 hours; a repeated request with the same key within that window
  returns the **original** response verbatim (same status code, same
  body) without re-executing any side effect — this is the API-facing
  contract behind `BOOKING_ENGINE_ARCHITECTURE.md` §15.5's idempotency
  guarantee.
- A repeated key with a **different** request body is rejected with
  `422` / `IDEMPOTENCY_KEY_CONFLICT` — the same key must always represent
  the same logical request.
- Endpoints requiring an idempotency key are explicitly marked as such in
  Part II; omitting the header on a required endpoint returns
  `400` / `IDEMPOTENCY_KEY_REQUIRED`.

## 23. Webhook Standards

Two distinct webhook directions exist and are architected differently:

**Inbound (third-party → platform).** Payment gateway events (capture
confirmation, refund completion, chargeback notices — per
`BOOKING_ENGINE_ARCHITECTURE.md` §8.7) arrive at a dedicated,
gateway-specific endpoint (e.g., `POST /webhooks/payments/{gateway}`).
Every inbound webhook is verified via the gateway's provided signature
scheme before any processing, and processed idempotently keyed on the
gateway's own event ID (Section 22's model, applied to inbound events).

**Outbound (platform → partner systems).** Partners integrating their own
systems (a hotel's PMS, an external booking tool) can register a webhook
URL per event category (`booking.confirmed`, `booking.cancelled`,
`availability.updated`, `payout.processed`) via
`POST /partners/{id}/webhooks` (Section 30). Every outbound delivery:

- Carries a `X-Webhook-Signature` header — an HMAC-SHA256 signature of the
  payload body using a per-partner secret, so the receiver can verify
  authenticity without a callback to the platform.
- Uses the same envelope as Section 8's response format, with an
  additional `event` object: `{ "event_type": "booking.confirmed",
  "event_id": "evt_...", "occurred_at": "...", "data": {...} }`.
- Retries on non-2xx response with exponential backoff, up to a bounded
  number of attempts over 24 hours, after which the event is marked
  permanently failed and surfaced in the Partner Dashboard's webhook-log
  view for manual inspection — never retried indefinitely.
- Is itself idempotent by `event_id`, so a partner's receiver is expected
  to (and is documented to) tolerate at-least-once delivery.

## 24. Naming Conventions

- URL paths: lowercase, kebab-case for multi-word resources
  (`/vacation-houses`, `/booking-holds`, `/tour-departures`).
- Query parameters and JSON field names: `snake_case`, matching
  `DATABASE_ARCHITECTURE.md` §2's column naming exactly, so a field never
  needs to be renamed crossing from database to API to frontend.
- Boolean fields: `is_` / `has_` prefix, mirroring the database convention.
- Enum-like string fields (status values, types) use the same lowercase
  token stored in the corresponding lookup table (e.g., `"status":
  "confirmed"`) — never a differently-cased or differently-worded
  API-layer alias of the same underlying value.
- Action sub-resources are verbs describing the transition, not the
  mechanism: `/cancel`, `/check-in`, `/check-out`, `/confirm`, `/refund` —
  never generic terms like `/update-status`.
- Every ID referenced in a URL is prefixed with a short, resource-specific
  code for human readability in logs and support tooling (`bkg_` for
  bookings, `lst_` for listings, `usr_` for users, `prt_` for partners),
  even though the underlying primary key (per
  `DATABASE_ARCHITECTURE.md` §1) is a plain auto-increment integer — the
  prefix is an API-layer presentation convention, not a schema change.

## 25. Folder Structure

The backend codebase mirrors the module boundaries defined in Part II, so
navigating the API specification and navigating the codebase feel like the
same activity. At the architecture level (no code, directory names only):

```
api/
  v1/
    modules/
      authentication/
      users/
      profiles/
      partners/
      organizations/
      employees/
      roles/
      permissions/
      geo/                 (countries, regions, cities)
      listings/
      properties/
      hotels/
      vacation-houses/
      restaurants/
      spa/
      car-rentals/
      tours/
      events/
      bookings/
      booking-holds/
      availability/
      calendar/
      pricing/
      coupons/
      favorites/
      reviews/
      notifications/
      messaging/
      payments/
      refunds/
      invoices/
      wallet/
      payouts/
      analytics/
      cms/
      advertisements/
      support/
      reports/
      settings/
      admin/
    shared/
      middleware/          (auth, rate-limit, locale, idempotency)
      validation/
      serialization/
      errors/
    webhooks/
      inbound/
      outbound/
  v2/                       (created only when a breaking version is needed)
docs/
  openapi/                  (see Section 26)
```

Each module directory owns its own request validators, response
serializers, and business-rule enforcement for that resource — cross-module
logic (e.g., a booking touching listings, availability, and pricing
simultaneously) lives in the `bookings` and `booking-holds` modules, which
are permitted to depend on `listings`, `availability`, and `pricing`, but
never the reverse — dependencies flow in one direction, matching the
domain layering already established in `DATABASE_ARCHITECTURE.md` §3.

## 26. OpenAPI Architecture

- The API is specified in **OpenAPI 3.1**, authored as one YAML file **per
  module** (mirroring Section 25's folder structure exactly —
  `docs/openapi/bookings.yaml`, `docs/openapi/payments.yaml`, etc.)
  rather than one monolithic file, so module owners can evolve their
  section independently without merge conflicts across the whole team.
- A build step bundles all per-module files into one resolved
  specification (`docs/openapi/bundled/v1.yaml`) referenced by tooling —
  this bundled file, never the per-module sources, is what is published to
  the interactive API documentation portal and used to generate client
  SDKs.
- **Shared components** (the response envelope, the error object, common
  parameters like pagination and locale) are defined once in a
  `components.yaml` and referenced (`$ref`) from every module file —
  never duplicated, so a change to the error shape (Section 9) updates
  every endpoint's documented error response simultaneously.
- The bundled specification is the **single source of truth for contract
  testing**: a CI step validates that actual API responses conform to the
  published schema on every deploy, and that no endpoint exists in code
  without a corresponding OpenAPI entry (and vice versa) — the
  specification and the implementation are checked to never drift apart.
- Client SDKs (TypeScript for web/mobile, used by Partner Dashboard and
  Admin Panel) are generated directly from the bundled specification,
  so a frontend engineer never hand-writes a request/response type that
  could diverge from this document.


---

# PART II — API MODULES

> **Format key.** Every endpoint below is documented as: **Method + URL**,
> description, Auth Required, Permission (per Appendix B; "Public" = no
> permission needed beyond Section 5's default), then **Request**,
> **Response**, **Validation**, **Errors** (codes beyond the universal set
> in Appendix A — every endpoint can additionally return `VALIDATION_FAILED`,
> `UNAUTHENTICATED`, `FORBIDDEN`, `RATE_LIMITED`, and `INTERNAL_ERROR`, which
> are not re-listed per endpoint), and **Business Rules**.

## 27. Authentication

Base path: `/api/v1/auth`. Maps to `users`, `login_history`
(`DATABASE_ARCHITECTURE.md` §4.1). Fully specified in Sections 4–7 above;
this section is the endpoint reference.

#### POST /auth/register
Create a new customer account · Auth: No · Permission: Public
- **Request:** `email`, `password`, `full_name`, `phone?`, `locale?`
- **Response:** `user` object, `access_token`, `refresh_token`
- **Validation:** valid email format; password meets minimum strength policy (length + character variety); email not already registered
- **Errors:** `EMAIL_ALREADY_EXISTS` (409), `WEAK_PASSWORD` (422)
- **Business Rules:** account created with `status = unverified`; a verification email is enqueued (Section 10 of `BOOKING_ENGINE_ARCHITECTURE.md`'s notification pattern applied to identity events); login is still permitted before verification, with reduced privileges (cannot complete a booking) until verified

#### POST /auth/login
Authenticate with email/password · Auth: No · Permission: Public
- **Request:** `email`, `password`
- **Response:** `user`, `access_token`, `refresh_token`
- **Validation:** both fields required
- **Errors:** `INVALID_CREDENTIALS` (401), `ACCOUNT_SUSPENDED` (403), `ACCOUNT_UNVERIFIED` (403, only for actions requiring verification)
- **Business Rules:** writes a `login_history` row (success or failure) every attempt; 5 consecutive failures within 15 minutes triggers a temporary lockout (`ACCOUNT_LOCKED`, 423) independent of the general rate limit

#### POST /auth/refresh
Exchange a refresh token for a new access token · Auth: No (token in body) · Permission: Public
- **Request:** `refresh_token`
- **Response:** `access_token`, `refresh_token` (rotated, Section 7)
- **Errors:** `INVALID_REFRESH_TOKEN` (401), `AUTH_TOKEN_REUSE_DETECTED` (401, revokes full token family)

#### POST /auth/logout
Revoke the current device's refresh token · Auth: Required · Permission: Public (any authenticated user)
- **Request:** none (token identified from the session)
- **Response:** `{ "revoked": true }`

#### POST /auth/logout-all
Revoke every refresh token for the account · Auth: Required · Permission: Public
- **Response:** `{ "revoked_count": <int> }`
- **Business Rules:** used after a suspected compromise or a password change

#### POST /auth/forgot-password
Request a password reset email · Auth: No · Permission: Public
- **Request:** `email`
- **Response:** generic success regardless of whether the email exists (`{ "message": "..." }`) — never reveals account existence
- **Business Rules:** rate-limited more aggressively than default (Section 17) to prevent enumeration/abuse

#### POST /auth/reset-password
Complete a password reset · Auth: No · Permission: Public
- **Request:** `reset_token`, `new_password`
- **Errors:** `INVALID_OR_EXPIRED_TOKEN` (401), `WEAK_PASSWORD` (422)
- **Business Rules:** on success, all existing refresh tokens for the account are revoked (Section 7)

#### POST /auth/verify-email · POST /auth/verify-phone
Confirm ownership of email/phone via a code · Auth: Required · Permission: Public
- **Request:** `code`
- **Errors:** `INVALID_OR_EXPIRED_CODE` (401)

#### GET /auth/me
Return the authenticated principal's identity and resolved permissions · Auth: Required · Permission: Public
- **Response:** `user`, `roles`, `permissions`, `partner_scope?` (if applicable)
- **Business Rules:** the canonical endpoint any client calls on app launch to hydrate session state; never cached client-side beyond the access token's own 15-minute lifetime

## 28. Users

Base path: `/api/v1/users`. Maps to `users`, `addresses`.

| Method | URL | Description | Auth | Permission |
|---|---|---|---|---|
| GET | `/users` | List/search users | Required | `user.list` (admin) |
| GET | `/users/{id}` | Get a user | Required | Owner or `user.view` |
| PATCH | `/users/{id}` | Update account fields (email, phone) | Required | Owner or `user.update` |
| DELETE | `/users/{id}` | Deactivate account (soft delete) | Required | Owner or `user.delete` |
| POST | `/users/{id}/change-password` | Change password (requires current password) | Required | Owner |
| POST | `/users/{id}/suspend` | Admin suspension | Required | `user.suspend` |

**Validation:** email/phone changes trigger re-verification (Section 27) before the new value is considered confirmed; the old value remains active until confirmed. **Business Rules:** `DELETE` never removes booking history or reviews — per `DATABASE_ARCHITECTURE.md` §7, historical `bookings` rows are preserved and simply lose their live account association for future logins; `POST /suspend` immediately revokes all refresh tokens (Section 7) and writes an `audit_logs` entry.

## 29. Profiles

Base path: `/api/v1/profiles`. Maps to `user_profiles`.

| Method | URL | Description | Auth | Permission |
|---|---|---|---|---|
| GET | `/profiles/me` | Get own extended profile | Required | Owner |
| PATCH | `/profiles/me` | Update extended profile (DOB, avatar, locale) | Required | Owner |
| GET | `/profiles/{user_id}` | Get another user's public profile | Optional | Public (limited fields) |

**Business Rules:** `/profiles/{user_id}` returns only fields the platform considers public (display name, avatar, join date, review count) — never email, phone, or address, regardless of caller's permissions, unless the caller is the owner or has `user.view`.

## 30. Partners

Base path: `/api/v1/partners`. Maps to `partners`.

| Method | URL | Description | Auth | Permission |
|---|---|---|---|---|
| GET | `/partners` | List partners | Required | `partner.list` (admin) |
| GET | `/partners/{id}` | Get partner public profile | Optional | Public (profile fields) |
| POST | `/partners` | Apply to become a partner | Required | Public (any authenticated user) |
| PATCH | `/partners/{id}` | Update partner profile | Required | Owner or `partner.update` |
| POST | `/partners/{id}/verify` | Approve/verify a partner application | Required | `partner.verify` (admin) |
| GET | `/partners/{id}/listings` | List a partner's listings | Optional | Public (published only) or Owner (all statuses) |
| POST | `/partners/{id}/webhooks` | Register an outbound webhook (Section 23) | Required | Owner (`partner_admin` role) |
| GET / DELETE | `/partners/{id}/webhooks/{webhook_id}` | Manage a registered webhook | Required | Owner |

**Validation (POST /partners):** `business_name` required; a `legal_name` and tax identifier are required before the partner can publish any listing, though the application itself may be submitted without them (captured as a follow-up step). **Business Rules:** a new partner's `status` starts as `pending_verification`; `POST /verify` is what moves it to `active` and is the trigger that allows `POST /listings` (Section 38) to succeed for that partner — an unverified partner's listing-creation attempts fail with `PARTNER_NOT_VERIFIED` (403).

## 31. Organizations

Base path: `/api/v1/organizations`. Maps to `partners` (the account/billing-entity
view of the same table Section 30 exposes as a public-facing profile — these
two modules read and write the *same* underlying resource from two different
perspectives, never two different tables).

| Method | URL | Description | Auth | Permission |
|---|---|---|---|---|
| GET | `/organizations/me` | Get own organization's account settings (billing, payout details, commission plan) | Required | `partner_owner` role |
| PATCH | `/organizations/me` | Update billing/payout details | Required | `partner_owner` role |
| GET | `/organizations/me/commission-plan` | View assigned commission plan (read-only) | Required | `partner_owner` role |

**Business Rules:** `commission_plan_id` is never editable by the partner
directly (Section 68's Admin module owns commission-plan assignment) — this
module is deliberately read-only for that field, exposing only the resolved
current rate for transparency.

## 32. Employees

Base path: `/api/v1/partners/{partner_id}/employees`. Maps to `partner_employees`.

| Method | URL | Description | Auth | Permission |
|---|---|---|---|---|
| GET | `/partners/{partner_id}/employees` | List staff | Required | `partner_owner`, `partner_manager` |
| POST | `/partners/{partner_id}/employees` | Invite a staff member by email | Required | `partner_owner`, `partner_manager` |
| PATCH | `/partners/{partner_id}/employees/{id}` | Change a staff member's role | Required | `partner_owner` |
| DELETE | `/partners/{partner_id}/employees/{id}` | Remove staff access | Required | `partner_owner` |

**Validation:** an invited email that already has any platform account is
linked to it directly; one without triggers the standard registration flow
(Section 27) pre-scoped to that partner. **Business Rules:** a
`partner_owner` role cannot be removed via `DELETE` if it is the partner's
last remaining owner — this is a hard business rule enforced at the API
layer (`LAST_OWNER_CANNOT_BE_REMOVED`, 422), preventing an orphaned
partner account.

## 33. Roles

Base path: `/api/v1/roles`. Maps to `roles`, `role_user`.

| Method | URL | Description | Auth | Permission |
|---|---|---|---|---|
| GET | `/roles` | List all roles | Required | `role.list` (admin) |
| POST | `/roles` | Create a new role | Required | `role.manage` (super_admin only) |
| PATCH | `/roles/{id}` | Update a role's permission set | Required | `role.manage` |
| DELETE | `/roles/{id}` | Retire a role | Required | `role.manage` |
| POST | `/roles/{id}/assign` | Assign a role to a user | Required | `role.assign` |

**Business Rules:** the platform's core global roles (`super_admin`, `admin`,
`moderator`, `customer`) and partner-scoped roles (`partner_owner`,
`partner_manager`, `partner_staff`) are seeded and protected — `DELETE`
against any of these seven is rejected (`PROTECTED_ROLE`, 403) regardless of
caller permission; only custom roles created via this endpoint can be
retired.

## 34. Permissions

Base path: `/api/v1/permissions`. Maps to `permissions`, `permission_role`.

| Method | URL | Description | Auth | Permission |
|---|---|---|---|---|
| GET | `/permissions` | List all permission keys, grouped by module | Required | `role.manage` |

**Business Rules:** read-only by design — new permission keys are introduced
through a platform release (a data migration, per
`DATABASE_ARCHITECTURE.md` §15.5's schema-evolution discipline), never
created ad hoc through the API, since a permission key must correspond to
an actual enforcement point already deployed in the codebase.

## 35. Countries

Base path: `/api/v1/countries`. Maps to `countries`.

| Method | URL | Description | Auth | Permission |
|---|---|---|---|---|
| GET | `/countries` | List all countries | No | Public |

**Business Rules:** classic offset pagination is permitted here (Section 11
exception) given the small, near-static size of this dataset; response is
aggressively cacheable (Section 18) with a long TTL (hours).

## 36. Regions

Base path: `/api/v1/regions`. Maps to `regions`.

| Method | URL | Description | Auth | Permission |
|---|---|---|---|---|
| GET | `/regions?country_id=` | List regions within a country | No | Public |

## 37. Cities

Base path: `/api/v1/cities`. Maps to `cities`.

| Method | URL | Description | Auth | Permission |
|---|---|---|---|---|
| GET | `/cities?region_id=` | List cities within a region | No | Public |
| GET | `/cities/search?q=` | Typeahead city search (for search-bar autocomplete, `UI_UX_GUIDELINES.md` §9.2) | No | Public |

**Business Rules:** `/cities/search` is backed by the same search-index
infrastructure as Section 14, not a direct database query, since it must
serve typeahead-speed latency at high frequency.


## 38. Listings

Base path: `/api/v1/listings`. Maps to `listings`, `listing_translations`,
`listing_categories`, `listing_amenities`, `listing_locations`, `media`
(polymorphic). This is the parent resource every module in Sections 40–46
extends — per `BOOKING_ENGINE_ARCHITECTURE.md` §1.1, the engine (and
therefore the API) treats all bookable modules as one resource wearing
different costumes.

| Method | URL | Description | Auth | Permission |
|---|---|---|---|---|
| GET | `/listings` | List/filter listings (authoritative, not search-ranked) | No | Public (published only) or Owner |
| GET | `/listings/search` | Full-text/geo/faceted search (Section 14) | No | Public |
| GET | `/listings/{id}` | Get full listing detail | No | Public (published) or Owner |
| POST | `/listings` | Create a new listing (any `listing_type`) | Required | `listing.create` (verified partner) |
| PATCH | `/listings/{id}` | Update listing fields | Required | Owner or `listing.update` |
| DELETE | `/listings/{id}` | Deactivate a listing (soft delete) | Required | Owner or `listing.delete` |
| POST | `/listings/{id}/publish` | Move from `draft` to `published` | Required | Owner or `listing.publish` |
| GET / POST | `/listings/{id}/media` | List / attach media | Required for POST | Owner |
| PATCH / DELETE | `/listings/{id}/media/{media_id}` | Reorder or remove media | Required | Owner |

**Request (POST /listings):** `listing_type` (one of the registered module
keys, Appendix A of `BOOKING_ENGINE_ARCHITECTURE.md`), `partner_id`
(resolved from token for non-admin callers), `base_price`, `currency_id`,
`translations[]` (per-locale `name`/`description`), `category_ids[]`,
`amenity_ids[]`, plus a `type_specific` object whose shape is defined by the
corresponding module section (40–46) — e.g. for `listing_type: "hotel"`,
`type_specific` follows Section 40's schema.

**Validation:** `listing_type` must be a currently registered module key;
`type_specific` is validated against that module's own schema (composed
validation, not hardcoded per listing type in this shared endpoint);
`base_price` non-negative; at least one translation required in the
platform's default locale.

**Errors:** `UNKNOWN_LISTING_TYPE` (422), `PARTNER_NOT_VERIFIED` (403,
Section 30), `INVALID_TYPE_SPECIFIC_FIELDS` (422, with `details` scoped to
the offending nested fields).

**Business Rules:** creation always starts in `status: draft` — a listing
is never publicly visible until `POST /publish` succeeds, and publish is
itself gated on required fields being complete (at least one image, a
complete address/location, and — for bookable-unit-bearing modules — at
least one `bookable_unit` already defined via that module's own endpoint).
`GET /listings` (the plain list, not `/search`) always reflects the
authoritative, current database state and is what the Partner Dashboard
and Admin Panel use — `/search` is what the public-facing search experience
uses and may lag by seconds (`BOOKING_ENGINE_ARCHITECTURE.md` §16.3).

## 39. Properties

Base path: `/api/v1/properties`. A convenience, read-only aggregation over
`listings` filtered to the lodging-type modules (Hotels, Vacation Houses,
Apartments, Camping) — not a separate table.

| Method | URL | Description | Auth | Permission |
|---|---|---|---|---|
| GET | `/properties` | List/filter across all lodging-type listings | No | Public |
| GET | `/properties/{id}` | Get lodging-type listing detail (identical shape to `GET /listings/{id}` for those types) | No | Public |

**Business Rules:** exists purely so a frontend building a unified "Stays"
experience does not need to separately call Hotels, Vacation Houses, and
Camping endpoints and merge results client-side — it is equivalent to
`GET /listings?listing_type=hotel,vacation_house,apartment,camping`
pre-composed as a named, documented endpoint for that common case.

## 40. Hotels

Base path: `/api/v1/hotels`. Maps to `hotels`, `hotel_room_types`,
`hotel_rooms` (`DATABASE_ARCHITECTURE.md` §4.4). A hotel is a `listings` row
with `listing_type = "hotel"`; this module manages its extension data and
inventory structure.

| Method | URL | Description | Auth | Permission |
|---|---|---|---|---|
| GET | `/hotels/{listing_id}` | Get hotel-specific attributes (star rating, check-in/out times) | No | Public |
| PATCH | `/hotels/{listing_id}` | Update hotel-specific attributes | Required | Owner |
| GET / POST | `/hotels/{listing_id}/room-types` | List / create room types | Required for POST | Owner |
| PATCH / DELETE | `/hotels/{listing_id}/room-types/{id}` | Update / retire a room type | Required | Owner |
| GET / POST | `/hotels/{listing_id}/room-types/{id}/rooms` | List / create individual rooms | Required for POST | Owner |
| DELETE | `/hotels/{listing_id}/rooms/{id}` | Retire a room | Required | Owner |

**Business Rules:** creating a room (`POST .../rooms`) is what creates the
corresponding `bookable_units` row (`BOOKING_ENGINE_ARCHITECTURE.md`
Appendix A) — this endpoint is a thin, module-specific wrapper around the
shared bookable-unit creation the Availability module (Section 49) reads
from; a room cannot be booked until it exists here, and retiring a room
here immediately removes it from future availability (existing confirmed
bookings against it are unaffected).

## 41. Vacation Houses

Base path: `/api/v1/vacation-houses`. Maps to `vacation_houses`. Applies
identically to Apartments and Camping, which share the same 1:1
shared-primary-key extension pattern (`BOOKING_ENGINE_ARCHITECTURE.md`
Appendix A) under their own `listing_type` values and, where a dedicated
extension table is warranted, their own module path
(`/api/v1/apartments`, `/api/v1/camping`) — documented here once since the
endpoint shape is identical across all three.

| Method | URL | Description | Auth | Permission |
|---|---|---|---|---|
| GET | `/vacation-houses/{listing_id}` | Get whole-property attributes (bedrooms, bathrooms, max guests) | No | Public |
| PATCH | `/vacation-houses/{listing_id}` | Update whole-property attributes | Required | Owner |

**Business Rules:** unlike Hotels, a vacation house/apartment/campsite
typically has exactly **one** `bookable_unit` per listing (the whole
property or single site) — created automatically when the listing is
published (Section 38) rather than through a separate sub-resource, since
there is no room-type hierarchy to manage.

## 42. Restaurants

Base path: `/api/v1/restaurants`. Maps to `restaurants`, `restaurant_tables`.

| Method | URL | Description | Auth | Permission |
|---|---|---|---|---|
| GET | `/restaurants/{listing_id}` | Get cuisine, price tier, seating attributes | No | Public |
| PATCH | `/restaurants/{listing_id}` | Update restaurant attributes | Required | Owner |
| GET / POST | `/restaurants/{listing_id}/tables` | List / create bookable tables | Required for POST | Owner |
| PATCH / DELETE | `/restaurants/{listing_id}/tables/{id}` | Update / retire a table | Required | Owner |

**Business Rules:** each table is a `bookable_unit` using Availability
Algorithm 2 (time-slot, exclusive — `BOOKING_ENGINE_ARCHITECTURE.md` §4.2);
`capacity` on a table constrains the `party_size` accepted by Booking
Holds (Section 48) for that unit.

## 43. SPA

Base path: `/api/v1/spa`. Maps to `spas`, `spa_services`.

| Method | URL | Description | Auth | Permission |
|---|---|---|---|---|
| GET | `/spa/{listing_id}` | Get facility attributes | No | Public |
| PATCH | `/spa/{listing_id}` | Update facility attributes | Required | Owner |
| GET / POST | `/spa/{listing_id}/services` | List / create bookable services (each a `bookable_unit`) | Required for POST | Owner |
| PATCH / DELETE | `/spa/{listing_id}/services/{id}` | Update / retire a service | Required | Owner |

**Business Rules:** `duration_minutes` on a service directly parameterizes
the time-slot width the Availability Engine reserves (Algorithm 2); changing
it does not retroactively resize already-confirmed bookings.

## 44. Car Rentals

Base path: `/api/v1/car-rentals`. Maps to `car_rentals`, `vehicle_categories`.

| Method | URL | Description | Auth | Permission |
|---|---|---|---|---|
| GET | `/car-rentals/{listing_id}` | Get vehicle attributes (make, model, transmission, seats) | No | Public |
| PATCH | `/car-rentals/{listing_id}` | Update vehicle attributes | Required | Owner |
| GET | `/car-rentals/categories` | List vehicle category reference data | No | Public |

**Business Rules:** uses Availability Algorithm 1 (exclusive, daily grain)
with an additional pickup-time/drop-off-time component captured at the
`booking_items` level (Section 47) rather than the calendar-row level,
since pickup/drop-off hour does not itself need its own calendar row —
only the date range needs exclusivity; the specific hour is a
booking-instance detail validated against the listing's operating hours.

## 45. Tours

Base path: `/api/v1/tours`. Maps to `tours`, `tour_departures`.

| Method | URL | Description | Auth | Permission |
|---|---|---|---|---|
| GET | `/tours/{listing_id}` | Get tour attributes (duration, difficulty, group size) | No | Public |
| PATCH | `/tours/{listing_id}` | Update tour attributes | Required | Owner |
| GET / POST | `/tours/{listing_id}/departures` | List / schedule departures | Required for POST | Owner |
| PATCH / DELETE | `/tours/{listing_id}/departures/{id}` | Reschedule / cancel a departure | Required | Owner |

**Validation (POST departures):** `departure_at` must be in the future;
`seats_available` must not exceed the tour's configured `max_group_size`.
**Business Rules:** each departure is a `bookable_unit` using Algorithm 2
(small, seat-assigned groups) or Algorithm 3 (large, capacity-only groups)
per the tour's configured seating mode (Appendix A of
`BOOKING_ENGINE_ARCHITECTURE.md`); `DELETE` on a departure with existing
confirmed bookings requires confirmation and triggers the Cancellation
Engine's partner-initiated path (`BOOKING_ENGINE_ARCHITECTURE.md` §9.5,
100% refund) for every affected booking rather than a silent removal.

## 46. Events

Base path: `/api/v1/events`. Maps to `events`, `event_sessions`.

| Method | URL | Description | Auth | Permission |
|---|---|---|---|---|
| GET | `/events/{listing_id}` | Get event attributes | No | Public |
| PATCH | `/events/{listing_id}` | Update event attributes | Required | Owner |
| GET / POST | `/events/{listing_id}/sessions` | List / create sessions | Required for POST | Owner |
| PATCH / DELETE | `/events/{listing_id}/sessions/{id}` | Update / cancel a session | Required | Owner |

**Business Rules:** identical seating-mode duality and cancellation
behavior as Tours (Section 45); general-admission sessions use Algorithm 3,
assigned-seating sessions use Algorithm 4.


## 47. Bookings

Base path: `/api/v1/bookings`. Maps to `bookings`, `booking_items`,
`booking_guests`, `booking_status_history`
(`DATABASE_ARCHITECTURE.md` §4.8). This module is the API surface over the
status machine defined in `BOOKING_ENGINE_ARCHITECTURE.md` §3 — every
transition documented there is one of the endpoints below.

| Method | URL | Description | Auth | Permission |
|---|---|---|---|---|
| GET | `/bookings` | List own bookings ("My Trips") | Required | Owner |
| GET | `/bookings` (partner/admin scope) | List bookings for a partner's listings, or platform-wide | Required | `booking.list` (partner-scoped) or `booking.list.all` (admin) |
| GET | `/bookings/{id}` | Get full booking detail, including items and status history | Required | Owner, Partner (of an included listing), or `booking.view` |
| POST | `/bookings/{id}/cancel` | Cancel a booking (Section 9 of the Booking Engine doc) | Required | Owner or `booking.cancel` |
| POST | `/bookings/{id}/check-in` | Check in (Section 12 of the Booking Engine doc) | Required | Partner staff or `booking.check-in` |
| POST | `/bookings/{id}/check-out` | Check out, settle extra charges (Section 13) | Required | Partner staff or `booking.check-out` |
| GET / POST | `/bookings/{id}/guests` | List / add traveler details to a booking item | Required | Owner |

**Response (GET /bookings/{id}):** `id`, `status`, `total_amount`,
`currency_id`, `items[]` (each with `bookable_unit`, `listing_summary`,
`date_from`/`date_to` or `slot_start`/`slot_end`, `unit_price`,
`rate_plan`), `status_history[]` (每 entry: `from_status`, `to_status`,
`changed_by`, `created_at`), `invoice_id`.

**POST /bookings/{id}/cancel — Request:** `reason?` (free text, optional,
support/analytics only). **Response:** updated `booking` plus a
`refund_summary` object (`refund_percentage`, `refund_amount`,
`policy_tier_applied` — the exact output of
`BOOKING_ENGINE_ARCHITECTURE.md` §9.2's resolution algorithm, returned
transparently rather than only implied).
**Errors:** `BOOKING_NOT_CANCELLABLE` (409, already terminal),
`ALREADY_CHECKED_IN` (409, routes to the Late Cancellation path per §9.4
rather than failing outright — the cancellation still succeeds, with
`policy_tier_applied: "late_cancellation"`).
**Business Rules:** this endpoint is the API entry point to the entire
Cancellation Engine (§9) — it never accepts a client-supplied refund amount;
the amount is always server-computed from the listing's policy.

**POST /bookings/{id}/check-in — Request:** `method` (`qr` | `pin` |
`manual`), `code?` (required for `qr`/`pin`), `booking_item_id?` (for
multi-item bookings, which item is being checked in — a Mixed Booking's
hotel room and rental car check in independently).
**Errors:** `INVALID_OR_EXPIRED_CODE` (401), `TOO_EARLY_FOR_CHECK_IN`
(409), `BOOKING_NOT_CONFIRMED` (409). **Business Rules:** implements
`BOOKING_ENGINE_ARCHITECTURE.md` §12.3's validation exactly; a QR/PIN code
is single-use and invalidated on this call's success regardless of method.

**POST /bookings/{id}/check-out — Request:** `extra_charges[]?` (each:
`description`, `amount`), `damage_note?`, `late_checkout?` (boolean).
**Response:** updated `booking`, updated `invoice` reflecting any new
`invoice_items`. **Business Rules:** implements §13.1; a `late_checkout`
request is validated against the next confirmed booking on the same unit
(re-running Availability, §4.2) before being granted — rejected with
`LATE_CHECKOUT_CONFLICT` (409) if it would collide.

## 48. Booking Holds

Base path: `/api/v1/booking-holds`. Maps to `reservation_holds`. The API
surface over `BOOKING_ENGINE_ARCHITECTURE.md` §5 in its entirety — every
endpoint here requires `Idempotency-Key` (Section 22).

| Method | URL | Description | Auth | Permission |
|---|---|---|---|---|
| POST | `/booking-holds` | Create a hold on one or more bookable units (Mixed Booking supported) | Required | Public (any authenticated customer) |
| GET | `/booking-holds/{id}` | Get hold status and remaining TTL | Required | Owner |
| POST | `/booking-holds/{id}/confirm` | Convert a hold into a confirmed booking, attaching payment | Required | Owner |
| DELETE | `/booking-holds/{id}` | Voluntarily release a hold before it expires | Required | Owner |

**Request (POST /booking-holds):** `items[]`, each: `bookable_unit_id`,
`date_from`/`date_to` **or** `slot_start`/`slot_end` (per the unit's
granularity), `party_size`, `rate_plan_id?`.
**Response:** `id`, `status: "held"`, `expires_at` (now + 15 minutes,
`BOOKING_ENGINE_ARCHITECTURE.md` §5.2), `items[]` with each item's
`resolved_price` (full Pricing pipeline output, Section 51), `total_amount`.
**Validation:** every `bookable_unit_id` must belong to a currently
published listing; `party_size` within the unit's configured bounds
(Section 11.3 of the Booking Engine doc).
**Errors:** `AVAILABILITY_CONFLICT` (409 — the unit was claimed between
the client's last availability check and this request, §5.5),
`BLACKOUT_DATE` (422, §11.5), `HOLD_LIMIT_EXCEEDED` (429 — a per-customer
cap on simultaneous open holds, preventing inventory hoarding).
**Business Rules:** every item in the request is evaluated and locked
within **one** database transaction (§4.3's Mixed Booking guarantee) — a
conflict on any single item fails the entire hold request; no partial
hold is ever created.

**Base customer-hold contract (Step L6.2E, implemented):** checked before
any capacity is reserved; each rejection is `422 VALIDATION_FAILED` with
`details[{ field: 'items', issue }]` and reserves nothing.

| `issue` | When |
|---|---|
| `ZERO_NIGHT_STAY` | a `HOTEL_ROOM`/`PROPERTY_UNIT` hold with `dateFrom === dateTo` — a stay is `dateTo > dateFrom` nights |
| `INCOMPLETE_RENTAL_INTERVAL` | a `VEHICLE` hold without both `startTime` (pickup) and `endTime` (return) |
| `RETURN_NOT_AFTER_PICKUP` | a `VEHICLE` return not after its pickup |
| `RESERVATION_TIME_REQUIRED` | a `RESTAURANT_TABLE` hold without `startTime` |
| `BOOKING_IN_PAST` | the booking starts before now, in Asia/Yerevan business time on the DB clock — a timed start (pickup, reservation time, a departure's `time_slot_start`) against the current time, a date-only start (lodging, untimed departures) only once its date is before today's Asia/Yerevan date |

Untimed tour/attraction departures stay date-only. `expires_at` is DB UTC
(`UTC_TIMESTAMP(3)`) plus the configured hold TTL, independent of the API
host's timezone. Partner inventory writes (manual blocks, external
reservations, CSV import, connector sync) are not customer holds and are
not subject to this contract.

**Partner booking rules (Step L6.2F, implemented):** every customer hold is
also checked against the listing's own `bookingRules` (`listing_booking_rules`),
on the same DB clock and before any capacity is reserved
(`core/domain/bookingRuleEvaluation.js`). Each violation is a `422
VALIDATION_FAILED` detail on `items`; a request with several items is
rejected whole — nothing is held for any of them.

| Rule | Applies to | Meaning | `issue` (metadata) |
|---|---|---|---|
| `minimumStayNights` / `maximumStayNights` | HOTEL, PROPERTY | lodging nights = `dateTo − dateFrom` (checkout excluded) | `MINIMUM_STAY_NOT_MET` (`minimum`, `unit: "nights"`) / `MAXIMUM_STAY_EXCEEDED` (`maximum`, `unit: "nights"`) |
| same fields | CAR_RENTAL | inclusive rental days = `dateTo − dateFrom + 1`; pickup/return times never change the count | same issues with `unit: "days"` |
| same fields | RESTAURANT, TOUR, ATTRACTION | ignored, even when a legacy value is stored | — |
| `advanceBookingMinHours` | every type | the start must be at least N hours after now; the exact boundary is accepted; `0` = no lead time | `BOOKING_TOO_SOON` (`minimumHours`) |
| `advanceBookingMaxDays` | every type | a calendar-day horizon: the start date must be on or before today (Asia/Yerevan) + N; `0` = today only | `BOOKING_TOO_FAR_AHEAD` (`maximumDays`) |

`null` means no restriction. The start is the pickup time (VEHICLE), the
reservation time (RESTAURANT_TABLE), the unit's `time_slot_start` (a timed
TOUR_DEPARTURE), otherwise 00:00 Asia/Yerevan on `dateFrom` (lodging,
untimed departures/sessions — the free-text `check_in_time` policy is never
parsed). Partner inventory writes bypass the rules. **An active hold keeps
the rules it was granted under:** `POST /bookings` never re-checks the
Partner's rules (a rule edit during the hold's lifetime can't fail its
checkout); it only refuses a booking whose start has already passed
(`BOOKING_IN_PAST`), rolling back so the hold stays active.

**Request (POST /booking-holds/{id}/confirm):** `payment_method_id` (or
`payment_token` for a not-yet-saved method), `coupon_code?`,
`wallet_amount?` (Section 8.3).
**Response:** the created `booking` (Section 47's shape), `status:
"confirmed"` (or `"reserved"` for delayed-capture policies, §8.2).
**Errors:** `HOLD_EXPIRED` (409 — the 15-minute window lapsed; client must
restart from Availability), `PAYMENT_FAILED` (402, with a nested
`payment_error` detail from Section 57), `COUPON_INVALID` (422).
**Business Rules:** this single endpoint executes the entire
Reserved/Pending → Confirmed transaction described in
`BOOKING_ENGINE_ARCHITECTURE.md` §3.3 and §15.3 — hold deletion, calendar
commitment, invoice generation, and notification enqueueing all happen
atomically as one API call's side effect; the client never orchestrates
these steps individually.

## 49. Availability

Base path: `/api/v1/availability`. Maps to `availability_calendar`,
`reservation_holds`. Read-only; the authoritative check described in
`BOOKING_ENGINE_ARCHITECTURE.md` §4.5 — distinct from, and never backed by,
the search index (Section 14).

| Method | URL | Description | Auth | Permission |
|---|---|---|---|---|
| GET | `/availability?bookable_unit_id=&date_from=&date_to=` | Real-time availability check for one unit over a range | No | Public |
| POST | `/availability/batch` | Check multiple units at once (e.g., an entire hotel's room types for a date range) | No | Public |

**Response:** per date (or per slot, for time-grain units): `status`
(`available` | `booked` | `held` | `blocked`), and, for shared-capacity
units, `quantity_available`.
**Business Rules:** this endpoint is what backs the customer calendar
component's live availability rendering (`UI_UX_GUIDELINES.md` §9.2); it is
explicitly documented as **advisory at read time** — the only fully
authoritative check happens inside `POST /booking-holds` itself
(Section 5.5 of the Booking Engine doc), so a client must never assume a
green calendar day guarantees a subsequent hold will succeed.

### 49.1 Bookable units — listing type → unit model

`POST /availability/units` registers a unit; `PATCH /availability/units/{id}`
edits one; `PATCH …/{id}/description`, `PATCH …/{id}/amenities` and
`POST …/{id}/media` manage room details. The listing type decides the one
unit type it may register (`core/domain/listingTypeBookableUnitTypes.js`):

| Listing type | Unit type | Notes |
|---|---|---|
| `HOTEL` | `HOTEL_ROOM` | one unit per room type |
| `PROPERTY` | `PROPERTY_UNIT` | |
| `RESTAURANT` | `RESTAURANT_TABLE` | |
| `TOUR` | `TOUR_DEPARTURE` | |
| `ATTRACTION` | `TOUR_DEPARTURE` | attractions and entertainment venues |
| `CAR_RENTAL` | `VEHICLE` | exactly one unit; its capacity is the fleet size |

Type-specific fields follow the unit type
(`core/domain/bookableUnitFieldApplicability.js`): `maxGuests` and
`bedConfiguration` apply to `HOTEL_ROOM` and `PROPERTY_UNIT`;
`timeSlotStart`/`timeSlotEnd` to `TOUR_DEPARTURE`; `roomSizeSqm`,
`bathroomType`, `viewType`, `smokingPolicy` and room description, amenities
and photos to `HOTEL_ROOM` only. A unit's type never changes, so an existing
unit is judged by its own stored type. Every rejection is a `422
VALIDATION_FAILED` raised before any write:

| `details[].field` | `details[].issue` | When |
|---|---|---|
| `bookableUnitType` | `UNIT_TYPE_NOT_ALLOWED` | the unit type doesn't match the listing type |
| `bookableUnitType` | `ONE_VEHICLE_PER_LISTING` | a second, different active unit on a Car Rental listing (an identical re-registration still returns the existing unit; a retired unit doesn't count, so it can be replaced). Registration is serialized on the listing row, so concurrent requests can never create a second vehicle |
| the field sent | `NOT_APPLICABLE_FOR_UNIT_TYPE` | a type-specific field the unit type doesn't use |
| `bookableUnitType` | `ROOM_DETAILS_NOT_APPLICABLE` | adding a description, amenities or a photo to a non-`HOTEL_ROOM` unit (clearing or removing stays allowed) |

## 50. Calendar

Base path: `/api/v1/calendar`. Maps to `blackout_dates`, plus the iCal/Google
sync configuration described in `BOOKING_ENGINE_ARCHITECTURE.md` §6.2.

| Method | URL | Description | Auth | Permission |
|---|---|---|---|---|
| GET / POST | `/calendar/{listing_id}/blackouts` | List / create partner-defined blocked dates | Required for POST | Owner |
| DELETE | `/calendar/{listing_id}/blackouts/{id}` | Remove a blackout | Required | Owner |
| GET | `/calendar/{listing_id}/export.ics` | Public iCal export feed URL | No (unguessable URL token) | Public |
| POST | `/calendar/{listing_id}/import` | Register an external iCal feed URL to poll | Required | Owner |
| DELETE | `/calendar/{listing_id}/import/{id}` | Remove an import source | Required | Owner |
| POST | `/calendar/{listing_id}/google-connect` | Begin Google Calendar OAuth connection | Required | Owner |

**Business Rules:** `export.ics` is intentionally unauthenticated but
protected by an unguessable, per-listing token embedded in the URL path
(consistent with standard iCal feed practice) rather than a bearer token,
since calendar client software cannot supply custom headers.

## 51. Pricing

Base path: `/api/v1/pricing`. Maps to `rate_plans`, `rate_plan_prices`,
`price_rules`, `taxes`, `tax_rules`. The API surface over the full pipeline
in `BOOKING_ENGINE_ARCHITECTURE.md` §7.

| Method | URL | Description | Auth | Permission |
|---|---|---|---|---|
| POST | `/pricing/quote` | Resolve a full price breakdown for a prospective booking, without creating a hold | No | Public |
| GET / POST | `/pricing/{listing_id}/rate-plans` | List / create rate plans | Required for POST | Owner |
| PATCH / DELETE | `/pricing/rate-plans/{id}` | Update / retire a rate plan | Required | Owner |
| GET / POST | `/pricing/rate-plans/{id}/prices` | List / create seasonal/holiday/special date-range overrides | Required for POST | Owner |
| GET / POST | `/pricing/{listing_id}/rules` | List / create length-of-stay and day-of-week rules | Required for POST | Owner |

**Request (POST /pricing/quote):** identical shape to a `booking-holds`
item (`bookable_unit_id`, dates/slot, `party_size`, `rate_plan_id?`,
`coupon_code?`). **Response:** the full itemized breakdown — every stage
of §7.1's pipeline as its own labeled line (`base_price`,
`seasonal_adjustment`, `dynamic_pricing_adjustment`, `discount`,
`coupon_discount`, `subtotal`, `taxes[]`, `service_fee`, `total`).
**Business Rules:** this is the exact same pipeline `POST /booking-holds`
runs internally to snapshot a price (§7.7) — exposing it as its own
endpoint lets the frontend show a live price breakdown *before* the
customer commits to creating a hold, without side effects and without
consuming inventory.

## 52. Coupons

Base path: `/api/v1/coupons`. Maps to `coupons`, `coupon_redemptions`.

| Method | URL | Description | Auth | Permission |
|---|---|---|---|---|
| GET | `/coupons` | List a partner's or platform's coupons | Required | Owner or `coupon.list` |
| POST | `/coupons` | Create a coupon | Required | Owner or `coupon.create` |
| PATCH / DELETE | `/coupons/{id}` | Update / deactivate a coupon | Required | Owner |
| POST | `/coupons/validate` | Check a code's validity for a given customer/cart, without redeeming it | Required | Public (any authenticated customer) |

**Request (POST /coupons/validate):** `code`, `listing_id?`, `subtotal`.
**Response:** `valid: boolean`, `discount_amount` (if valid),
`reason?` (if invalid — `expired`, `usage_limit_reached`,
`not_applicable_to_listing`, `already_redeemed_by_user`).
**Business Rules:** actual redemption (writing a `coupon_redemptions` row)
only ever happens as a side effect of `POST /booking-holds/{id}/confirm`
(Section 48) succeeding — this endpoint never redeems on its own, so a
customer can check a code's validity repeatedly without consuming its
usage limit.


## 53. Favorites

Base path: `/api/v1/favorites`. Maps to `favorites`.

| Method | URL | Description | Auth | Permission |
|---|---|---|---|---|
| GET | `/favorites` | List own saved listings | Required | Owner |
| POST | `/favorites` | Save a listing | Required | Owner |
| DELETE | `/favorites/{id}` | Remove a saved listing | Required | Owner |

**Request (POST):** `favorable_type` (currently always `"listing"`, kept
generic per `DATABASE_ARCHITECTURE.md` §4.9's polymorphic design for future
favorable types), `favorable_id`.
**Errors:** `ALREADY_FAVORITED` (409 — the composite unique constraint
means a duplicate save is a conflict, not a silent no-op, so the client can
distinguish "already saved" in its own UI state).
**Business Rules:** favoriting is a lightweight, high-frequency toggle
action — this endpoint is explicitly excluded from the stricter rate-limit
tiers (Section 17) applied to sensitive actions.

## 54. Reviews

Base path: `/api/v1/reviews`. Maps to `reviews`, `review_replies`.

| Method | URL | Description | Auth | Permission |
|---|---|---|---|---|
| GET | `/reviews?reviewable_id=` | List reviews for a listing/partner | No | Public |
| POST | `/reviews` | Submit a review | Required | Owner of a `Completed` booking for that listing |
| POST | `/reviews/{id}/reply` | Partner reply to a review | Required | Owner (of the reviewed listing/partner) |
| POST | `/reviews/{id}/moderate` | Hide/restore a review | Required | `review.moderate` (admin) |

**Validation (POST /reviews):** the caller must have at least one
`Completed` booking (`BOOKING_ENGINE_ARCHITECTURE.md` §3.4) against the
`reviewable_id` — enforced server-side, never trusted from the client;
one review per completed booking (not per listing overall — a repeat
guest may review each stay).
**Errors:** `NOT_ELIGIBLE_TO_REVIEW` (403), `ALREADY_REVIEWED` (409).
**Business Rules:** a review is soft-deletable (moderation) but never
hard-deleted by a partner disputing it — only `review.moderate`
(admin/moderator) can hide a review, and doing so is captured in
`audit_logs`.

## 55. Notifications

Base path: `/api/v1/notifications`. Maps to `notifications`,
`notification_preferences`. The API surface over
`BOOKING_ENGINE_ARCHITECTURE.md` §10.

| Method | URL | Description | Auth | Permission |
|---|---|---|---|---|
| GET | `/notifications` | List own notifications (paginated, newest first) | Required | Owner |
| POST | `/notifications/{id}/read` | Mark one notification read | Required | Owner |
| POST | `/notifications/read-all` | Mark all read | Required | Owner |
| GET / PATCH | `/notifications/preferences` | Get / update per-channel, per-category opt-in settings | Required | Owner |

**Response (GET /notifications):** each item includes `type`,
`data` (event-specific payload, e.g. a `booking_id` for a confirmation
notification), `read_at`, `created_at`. **Business Rules:** this endpoint
is the durable record described in §10.2 — it always reflects every event
regardless of the customer's channel preferences elsewhere; `preferences`
only controls whether Email/SMS/Push are *additionally* sent, never
whether the in-app record is created.

## 56. Messaging

Base path: `/api/v1/messaging`. Maps to `conversations`,
`conversation_participants`, `messages`.

| Method | URL | Description | Auth | Permission |
|---|---|---|---|---|
| GET | `/messaging/conversations` | List own conversations | Required | Owner (participant) |
| POST | `/messaging/conversations` | Start a conversation (e.g., guest-to-partner inquiry) | Required | Owner |
| GET | `/messaging/conversations/{id}/messages` | List messages in a thread | Required | Owner (participant) |
| POST | `/messaging/conversations/{id}/messages` | Send a message | Required | Owner (participant) |

**Validation:** the caller must be a `conversation_participants` row for
the target conversation on every read/write — enforced independent of
general authentication, since a valid token alone does not imply
membership in a specific thread.
**Business Rules:** sending a message enqueues a notification (Section 10)
to the other participant(s) via their preferred channel; message content is
never edited or hard-deleted once sent (a "delete" only removes it from
the sender's own view, preserving the record for the recipient and for
support/dispute review).


## 57. Payments

Base path: `/api/v1/payments`. Maps to `payments`, `payment_methods`,
`payment_transactions`. The API surface over
`BOOKING_ENGINE_ARCHITECTURE.md` §8.

| Method | URL | Description | Auth | Permission |
|---|---|---|---|---|
| GET | `/payments/{id}` | Get a payment's status and transaction log | Required | Owner or `payment.view` |
| GET | `/payments?booking_id=` | List payments for a booking (supports split/retry history) | Required | Owner or `payment.view` |
| GET / POST | `/payments/methods` | List / save a payment method (tokenized, PCI-scope stays with the gateway) | Required | Owner |
| DELETE | `/payments/methods/{id}` | Remove a saved method | Required | Owner |
| POST | `/webhooks/payments/{gateway}` | Inbound gateway webhook receiver (Section 23) | Gateway-signature verified, not user-authenticated | N/A |

**Business Rules:** this module never exposes a raw "charge a card"
endpoint directly — every payment is created as a side effect of
`POST /booking-holds/{id}/confirm` (Section 48) or a check-out extra
charge (Section 47); `payment_methods` stores only a gateway-provided
token reference, never raw card data, keeping PCI-DSS scope confined to the
gateway. `POST /payments/methods` request/response bodies pass through a
gateway-hosted tokenization step client-side before this endpoint is ever
called, consistent with Section 19's "never a direct binary/sensitive
payload through the main API tier" principle applied to payment data.

## 58. Refunds

Base path: `/api/v1/refunds`. Maps to `refunds`. The API surface over
`BOOKING_ENGINE_ARCHITECTURE.md` §8.5 and §9.

| Method | URL | Description | Auth | Permission |
|---|---|---|---|---|
| GET | `/refunds?booking_id=` | List refunds for a booking | Required | Owner or `refund.view` |
| GET | `/refunds/{id}` | Get refund detail and status | Required | Owner or `refund.view` |
| POST | `/refunds` | Issue a goodwill/manual refund (outside the standard cancellation flow) | Required | `refund.issue` (admin/support only) |

**Request (POST /refunds — manual only):** `payment_id`, `amount`,
`reason_code` (required, closed vocabulary — never free text alone).
**Business Rules:** the overwhelming majority of refunds are never created
through this `POST` directly — they are the automatic output of
`POST /bookings/{id}/cancel` (Section 47). This `POST` exists specifically
for the manual, `audit_logs`-tracked exception path
(`BOOKING_ENGINE_ARCHITECTURE.md` §8.5) and always requires a reason code
for accountability.

## 59. Invoices

Base path: `/api/v1/invoices`. Maps to `invoices`, `invoice_items`.

| Method | URL | Description | Auth | Permission |
|---|---|---|---|---|
| GET | `/invoices?booking_id=` | Get the invoice for a booking | Required | Owner or `invoice.view` |
| GET | `/invoices/{id}` | Get invoice detail with full itemized breakdown | Required | Owner or `invoice.view` |
| GET | `/invoices/{id}/download` | Download a PDF rendering | Required | Owner |

**Response:** every `invoice_items` row from every pricing pipeline stage
(Section 51/7.1) individually — base price, each adjustment, each tax line,
service fee, and (on the partner-facing variant, gated by `invoice.view`
scoped to the owning partner) the commission deduction.
**Business Rules:** invoices are immutable once issued at confirmation
time (`BOOKING_ENGINE_ARCHITECTURE.md` §3.3) — a post-confirmation charge
(Section 47's check-out extra charges, or a manual refund) is always a
**new, additional** `invoice_items` entry referencing the same invoice,
never a rewrite of an existing line, preserving a fully honest historical
record.

## 60. Wallet

Base path: `/api/v1/wallet`. Maps to `payment_methods` (wallet type) and a
running balance derived from wallet-tagged `payments`/`refunds` entries.

| Method | URL | Description | Auth | Permission |
|---|---|---|---|---|
| GET | `/wallet` | Get current balance | Required | Owner |
| GET | `/wallet/transactions` | List wallet credit/debit history | Required | Owner |

**Business Rules:** the wallet is credited automatically by certain
refund outcomes (platform-initiated goodwill credit) and by promotional
grants (Section 68's Admin module); it is debited automatically at
`POST /booking-holds/{id}/confirm` time when a customer elects to apply
wallet balance (Section 8.3) — there is no direct "add funds to wallet"
consumer-facing endpoint at this stage of the platform's scope.

## 61. Payouts

Base path: `/api/v1/payouts`. Maps to `payouts`. The API surface over
`BOOKING_ENGINE_ARCHITECTURE.md` §8.6.

| Method | URL | Description | Auth | Permission |
|---|---|---|---|---|
| GET | `/payouts` | List a partner's payout batches | Required | Owner (`partner_owner`) |
| GET | `/payouts/{id}` | Get a payout's full underlying booking list for reconciliation | Required | Owner |
| POST | `/payouts/{id}/trigger` | Manually trigger an out-of-cycle payout (exception handling) | Required | `payout.trigger` (admin/finance) |

**Business Rules:** payouts are batch-generated by the scheduled job
described in `BOOKING_ENGINE_ARCHITECTURE.md` §16.2, not created via this
API in the normal course of business — `POST /trigger` exists solely for
finance-team exception handling and is always `audit_logs`-tracked.


## 62. Analytics

Base path: `/api/v1/analytics`. Read-only aggregation endpoints over
`invoice_items`, `availability_calendar`, and `booking_status_history` — the
API surface over `BOOKING_ENGINE_ARCHITECTURE.md` §14.

| Method | URL | Description | Auth | Permission |
|---|---|---|---|---|
| GET | `/analytics/revenue` | Revenue breakdown by period/module/rate-plan | Required | Owner (scoped) or `analytics.view.all` |
| GET | `/analytics/occupancy` | Occupancy rate by listing/period | Required | Owner or `analytics.view.all` |
| GET | `/analytics/adr-revpar` | ADR and RevPAR by listing/period | Required | Owner or `analytics.view.all` |
| GET | `/analytics/cancellation-rate` | Cancellation rate, split by type (§14.5) | Required | Owner or `analytics.view.all` |
| GET | `/analytics/conversion` | Funnel conversion (search → hold → confirmed) | Required | `analytics.view.all` (platform-wide only; not meaningful per-partner) |

**Business Rules:** every metric here is computed directly from the same
source tables the Booking Engine itself writes — never from a separate
event-tracking pipeline (`BOOKING_ENGINE_ARCHITECTURE.md` §14.6) — so
analytics numbers can never drift from the operational booking data a
support agent sees on an individual booking.

## 63. CMS

Base path: `/api/v1/cms`. Maps to `cms_pages`, `cms_page_translations`.

| Method | URL | Description | Auth | Permission |
|---|---|---|---|---|
| GET | `/cms/pages/{slug}` | Get a published page's localized content | No | Public |
| GET | `/cms/pages` | List pages (admin view, all statuses) | Required | `cms.manage` |
| POST | `/cms/pages` | Create a page | Required | `cms.manage` |
| PATCH / DELETE | `/cms/pages/{id}` | Update / retire a page | Required | `cms.manage` |

## 64. Advertisements

Base path: `/api/v1/advertisements`. Maps to a dedicated `advertisements`
table (placements, target listing/partner, schedule, creative media)
introduced under `DATABASE_ARCHITECTURE.md` §4.3's Catalog domain pattern —
premium-listing and sponsored-placement records, distinct from organic
`listings`.

| Method | URL | Description | Auth | Permission |
|---|---|---|---|---|
| GET | `/advertisements/active` | Get currently active placements for a page/context | No | Public |
| GET | `/advertisements` | List all campaigns | Required | Owner or `advertisement.manage` |
| POST | `/advertisements` | Create a campaign (premium listing / featured placement) | Required | Owner or `advertisement.manage` |
| PATCH / DELETE | `/advertisements/{id}` | Update / stop a campaign | Required | Owner or `advertisement.manage` |

**Business Rules:** partner-purchased placements are always
`admin`-approved before going live (`status: pending_review →
active`), consistent with `PROJECT_BIBLE.md`'s "Premium Listings /
Advertisements" business model — a paid placement is never shown until an
admin (or an automated content-safety check, at a later platform stage)
clears it.

## 65. Support

Base path: `/api/v1/support`. Maps to a `support_tickets` /
`support_messages` pairing, structurally analogous to Messaging (Section
56) but scoped to platform support staff rather than peer-to-peer
conversation.

| Method | URL | Description | Auth | Permission |
|---|---|---|---|---|
| GET | `/support/tickets` | List own tickets (customer/partner) or assigned queue (staff) | Required | Owner or `support.view` |
| POST | `/support/tickets` | Open a ticket, optionally linked to a `booking_id` | Required | Owner |
| GET | `/support/tickets/{id}` | Get ticket detail and thread | Required | Owner or `support.view` |
| POST | `/support/tickets/{id}/reply` | Add a message to a ticket | Required | Owner or `support.respond` |
| POST | `/support/tickets/{id}/close` | Close a resolved ticket | Required | `support.respond` |

**Business Rules:** a ticket linked to a `booking_id` surfaces that
booking's full status history (Section 47) directly in the staff view, so
support never has to separately query the Bookings module while assisting
a customer.

## 66. Reports

Base path: `/api/v1/reports`. Asynchronous, generated-file exports built on
top of the same data Section 62 (Analytics) exposes live, for cases needing
a downloadable, point-in-time artifact (finance reconciliation, compliance).

| Method | URL | Description | Auth | Permission |
|---|---|---|---|---|
| POST | `/reports` | Request a report generation job (type, date range, format) | Required | `report.generate` |
| GET | `/reports` | List previously generated reports | Required | Owner (scoped) |
| GET | `/reports/{id}/download` | Download a completed report file | Required | Owner |

**Business Rules:** report generation is always asynchronous
(Section 15.4-style queueing) — `POST /reports` returns
`202 Accepted` immediately with a `status: "processing"` report record;
the client polls `GET /reports/{id}` (or receives a notification, Section
55) when `status` becomes `"ready"`.

## 67. Settings

Base path: `/api/v1/settings`. Maps to `system_settings`, `feature_flags`.

| Method | URL | Description | Auth | Permission |
|---|---|---|---|---|
| GET | `/settings/public` | Get the subset of settings marked public (e.g., supported locales, hold duration) | No | Public |
| GET | `/settings` | Get all platform settings | Required | `settings.manage` (admin) |
| PATCH | `/settings/{key}` | Update a setting value | Required | `settings.manage` |
| GET | `/settings/feature-flags` | List feature flags and rollout state | Required | `settings.manage` |
| PATCH | `/settings/feature-flags/{key}` | Toggle / adjust rollout percentage | Required | `settings.manage` |

**Business Rules:** `GET /settings/public` is what a client reads to learn
platform-wide constants without hardcoding them — e.g., the 15-minute hold
duration (`BOOKING_ENGINE_ARCHITECTURE.md` §5.2) is sourced from here so a
future change to that value takes effect for clients without an app
release.

## 68. Admin

Base path: `/api/v1/admin`. A cross-cutting module composing capabilities
already defined in other sections under one privilege tier, plus a small
number of admin-only primitives not otherwise exposed.

| Method | URL | Description | Auth | Permission |
|---|---|---|---|---|
| GET | `/admin/dashboard` | Platform-wide KPI summary (bookings, revenue, active partners) | Required | `admin.dashboard.view` |
| GET | `/admin/audit-logs` | Search the audit log (`DATABASE_ARCHITECTURE.md` §4.10) | Required | `audit.view` |
| POST | `/admin/users/{id}/impersonate` | Start a support-impersonation session (time-boxed, fully audited) | Required | `user.impersonate` (senior support/admin only) |
| POST | `/admin/commission-plans` | Create/assign a commission plan to a partner | Required | `commission.manage` |
| DELETE | `/admin/users/{id}/purge` | Hard-delete a user's data (compliance/GDPR-style request) | Required | `user.purge` (super_admin only) |
| GET | `/admin/moderation-queue` | List content pending review (reviews, advertisements, listings) | Required | `moderation.view` |

**Business Rules (impersonation):** every impersonation session is itself
a distinct, time-boxed access token (max 30 minutes, single-use, cannot be
refreshed) that is flagged in every subsequent request's audit log entry
as `acted_as: <admin_user_id>` so no action taken during impersonation is
ever indistinguishable from the customer's own action.
**Business Rules (purge):** the one deliberate exception to
`DATABASE_ARCHITECTURE.md` §7's soft-delete-only default — reserved
exclusively for compliance-mandated erasure, requires `super_admin`, and is
itself logged in a *separate*, tamper-evident compliance log outside the
normal `audit_logs` table (since the whole point is that the underlying
record will no longer exist to audit against).

---

## Appendix A — Error Code Catalog

| Code | HTTP Status | Domain |
|---|---|---|
| `VALIDATION_FAILED` | 422 | Universal |
| `UNAUTHENTICATED` | 401 | Universal |
| `FORBIDDEN` | 403 | Universal |
| `NOT_FOUND` | 404 | Universal |
| `RATE_LIMITED` | 429 | Universal |
| `IDEMPOTENCY_KEY_REQUIRED` | 400 | Universal |
| `IDEMPOTENCY_KEY_CONFLICT` | 422 | Universal |
| `INTERNAL_ERROR` | 500 | Universal |
| `EMAIL_ALREADY_EXISTS` | 409 | Authentication |
| `INVALID_CREDENTIALS` | 401 | Authentication |
| `ACCOUNT_SUSPENDED` | 403 | Authentication |
| `ACCOUNT_LOCKED` | 423 | Authentication |
| `AUTH_TOKEN_REUSE_DETECTED` | 401 | Authentication |
| `INVALID_REFRESH_TOKEN` | 401 | Authentication |
| `WEAK_PASSWORD` | 422 | Authentication |
| `PARTNER_NOT_VERIFIED` | 403 | Partners |
| `LAST_OWNER_CANNOT_BE_REMOVED` | 422 | Employees |
| `PROTECTED_ROLE` | 403 | Roles |
| `UNKNOWN_LISTING_TYPE` | 422 | Listings |
| `INVALID_TYPE_SPECIFIC_FIELDS` | 422 | Listings |
| `AVAILABILITY_CONFLICT` | 409 | Booking Holds |
| `BLACKOUT_DATE` | 422 | Booking Holds |
| `HOLD_LIMIT_EXCEEDED` | 429 | Booking Holds |
| `HOLD_EXPIRED` | 409 | Booking Holds |
| `PAYMENT_FAILED` | 402 | Payments |
| `PAYMENTS_DISABLED` | 503 | Payments |
| `COUPON_INVALID` | 422 | Coupons |
| `BOOKING_NOT_CANCELLABLE` | 409 | Bookings |
| `INVALID_OR_EXPIRED_CODE` | 401 | Check-In |
| `TOO_EARLY_FOR_CHECK_IN` | 409 | Check-In |
| `BOOKING_NOT_CONFIRMED` | 409 | Check-In |
| `LATE_CHECKOUT_CONFLICT` | 409 | Check-Out |
| `NOT_ELIGIBLE_TO_REVIEW` | 403 | Reviews |
| `ALREADY_REVIEWED` | 409 | Reviews |
| `ALREADY_FAVORITED` | 409 | Favorites |

## Appendix B — Permission Key Reference (Representative Set)

Permission keys follow `{module}.{action}` naming, matching Section 24's
conventions and `DATABASE_ARCHITECTURE.md` §4.1's `permissions` table.
Representative examples referenced throughout Part II:
`listing.create`, `listing.update`, `listing.delete`, `listing.publish`,
`booking.cancel`, `booking.check-in`, `booking.check-out`,
`booking.list.all`, `refund.issue`, `payout.trigger`, `role.manage`,
`role.assign`, `user.suspend`, `user.purge`, `user.impersonate`,
`audit.view`, `analytics.view.all`, `cms.manage`, `moderation.view`,
`settings.manage`, `commission.manage`. The full, exhaustive key list is
maintained as living data in the `permissions` table itself (Section 34)
rather than duplicated in this document, since it is queried directly at
runtime and this document would otherwise drift from it.

## Appendix C — HTTP Status Code Usage Summary

See Section 21 for the full table and rationale. In short: **2xx** always
carries a populated `data` field per Section 8; **4xx** always carries a
populated `error` field per Section 9 and indicates the caller can take a
corrective action; **5xx** indicates a platform-side fault the caller
cannot resolve and should retry (idempotently, Section 22) or report via
`request_id`.

---

*— End of API_SPECIFICATION.md —*
