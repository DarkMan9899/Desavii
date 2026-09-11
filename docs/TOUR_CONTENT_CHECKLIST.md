# Real Tour Content Checklist

## ⚠ Correction — production is NOT actually empty (checked live this pass)

Earlier passes (and this brief) assumed production has zero Tour listings
because the demo/seed catalog is correctly refused against a production
database (`config.isProduction` guard in `seedDemoSprintJCatalog.js` etc.).
**That guard is real and still intact** — but a live check of
`https://desavii.com/en/categories/tours` and `.../categories/hotels` this
pass found **9 listings in each**, with titles, cities, prices, and
summaries that are byte-for-byte identical to this session's own local demo
catalog — e.g. production's "Boutique Yerevan Hotel" carries the exact
summary "A design-forward boutique hotel moments from Republic Square, with
Standard Rooms and Deluxe Suites," and every other row follows the same
templated `"{Adjective} {City} {Category}"` / `"{Category} located in
{City}, Armenia."` pattern this session's own `seedDemoSprintJCatalog.js`
generates.

**This was not caused by this pass** — no demo seed script was run against
production, and the guard that refuses to do so was not touched or
bypassed. But it means the demo/templated catalog is genuinely live on
desavii.com right now, however it got there (a prior session/incident, a
one-time manual production seed, or a database that was never fully
replaced with real content after initial setup — this pass has no way to
determine which). This is a real product-content issue independent of the
Tours-specific question the brief asked about, and is flagged here rather
than fixed unilaterally: removing or replacing production listings is a
destructive, business-visible action this pass explicitly does not have
authorization to take.

**Recommended next step:** confirm with the user whether this templated
catalog is expected (e.g., deliberately used as placeholder inventory until
real partners onboard) or not, before any cleanup action.

---

This checklist is the exact minimum information needed to publish a
credible, real Tour listing through the normal Partner (or Admin-on-behalf-
of-partner) onboarding path once a real tour provider is available. No
"DEMO" labeling, no placeholder operator — every field below must be real,
whether the goal is adding genuinely new Tours or replacing the templated
ones found above.

## Required fields (mirrors the Partner Listing Wizard's own steps)

1. **Provider / company** — real, verifiable operator name and contact
   details (Company Profile step).
2. **Verified title** — the tour's actual public-facing name, not a
   generic placeholder ("Half-Day Dilijan Hike," not "Tour #1").
3. **Route / itinerary** — real stops in real order, each with a
   description and (where relevant) a duration — the existing
   `listing_itinerary_steps` table already supports this with zero new
   schema.
4. **Meeting point** — a real, specific location (address or landmark),
   with real coordinates — required at publish already (`listingService.js`'s
   `#checkPublishReadiness`, `COMPLETE_LOCATION_REQUIRED`).
5. **Duration** — total tour length.
6. **Group size** — minimum/maximum participants.
7. **Inclusions / exclusions** — what's genuinely provided vs. not
   (`listing_included_items`, already generic and reusable).
8. **Language(s) offered** — which language(s) the guide actually speaks.
9. **Schedule / departures** — real recurring or one-off departure
   times, via the existing `TOUR_DEPARTURE` bookable-unit mechanism
   (`bookable_units.time_slot_start`/`time_slot_end`) — no new scheduling
   engine needed.
10. **Price** — real, current pricing per person (or per group, if that's
    the actual model).
11. **Cancellation policy** — the operator's real policy, not a copied
    default.
12. **Media** — real photos of the actual route/experience, not stock
    imagery presented as the tour itself.
13. **Exact coordinates** — for the meeting point and, where meaningful,
    key itinerary stops.
14. **Contact / organizer details** — how a customer or desavii support
    can reach the operator.

## What this pass explicitly did NOT do

- Did not seed demo Tour content into production.
- Did not invent a fake tour operator or fabricate any of the fields
  above.
- Did not silently work around the demo-seed production guard (it's still
  intact and was not touched).
- Did not delete, hide, or modify the templated listings already live on
  production, found by the live check above — that's a destructive,
  business-visible action outside this pass's authorization.

## Recommended next step (supersedes the original "empty state" framing)

Since production is not actually empty, the choice isn't "empty state vs.
real content" — it's what to do about the templated catalog already live:
keep it as deliberate interim placeholder inventory (in which case it
should probably read as such, e.g. a "New listings arriving soon" framing
rather than presenting `"{Adjective} {City} {Category}"` titles as if
they were real, distinct properties), or begin replacing it with real
content per the checklist above, category by category. Either way, this is
a product/content decision for the user, not something this pass should
resolve unilaterally.
