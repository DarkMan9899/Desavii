/**
 * Listings query-key factory (FRONTEND_ARCHITECTURE.md §14.1) — every
 * `listings` React Query hook builds its key through this, never an ad
 * hoc array, so cache invalidation can target precisely.
 */

const listingKeys = {
  all: ['listings'],
  lists: () => [...listingKeys.all, 'list'],
  list: (filters) => [...listingKeys.lists(), { filters }],
  // Phase 5 (Partner Listing Wizard): the wizard reads/writes one listing
  // by id (resuming a draft, PATCHing each step) and reads category-scoped
  // metadata — both need their own precise, invalidatable key, per
  // FRONTEND_ARCHITECTURE.md §14.1's `{resource}Keys.detail(id)` pattern.
  details: () => [...listingKeys.all, 'detail'],
  detail: (id) => [...listingKeys.details(), id],
  metadata: (categoryId, locale) => [
    ...listingKeys.all,
    'metadata',
    { categoryId, locale },
  ],
  categories: (locale) => [...listingKeys.all, 'categories', { locale }],
  // Phase 6 (Listing Details): the public 30-day availability read.
  availability: (listingId) => [
    ...listingKeys.details(),
    listingId,
    'availability',
  ],
  // Phase 7 (Booking Flow): the public bookable-units read. `date` (Sprint
  // A, Time-Aware Booking Foundation) is optional and only ever supplied
  // by the customer-facing time-slot picker — every other caller (Admin
  // Inventory, the Partner Bookable Units panel) omits it and keeps the
  // exact same cache key it always had. Sprint C-3 adds `checkIn`/
  // `checkOut` (the Rooms section/Reservation widget's stay-range read) as
  // additional, independent key segments — a plain `date` query and a
  // `checkIn`/`checkOut` query never collide since both are always present
  // in the key (as `undefined` when unused).
  bookableUnits: (listingId, date, checkIn, checkOut) => [
    ...listingKeys.details(),
    listingId,
    'bookableUnits',
    { date, checkIn, checkOut },
  ],
  // Phase 7 (Booking Flow): the explicit-unit, price-aware calendar read
  // `ListingReservationWidget` uses to disable blocked days and estimate
  // a total — distinct from `availability` above (Phase 6's read-only,
  // ranges-fallback display query), which never takes an explicit unitId.
  calendar: (listingId, unitId, from, to) => [
    ...listingKeys.details(),
    listingId,
    'calendar',
    { unitId, from, to },
  ],
  // Phase 17 (Listing Detail): the public, customer-safe bucketed
  // availability summary ("Available"/"Only N left"/"Sold out") — distinct
  // from `availability` above, which is the raw day-by-day calendar this
  // summary is derived from server-side.
  availabilitySummary: (listingId) => [
    ...listingKeys.details(),
    listingId,
    'availabilitySummary',
  ],
  // Phase 18 (Premium Listing Detail, Availability UX fix): the
  // authoritative per-day status read — see `useListingDayStatusQuery.js`'s
  // own header for why this exists alongside `calendar` above.
  dayStatus: (listingId, unitId, from, to) => [
    ...listingKeys.details(),
    listingId,
    'dayStatus',
    { unitId, from, to },
  ],
  // Phase 9 (Partner Dashboard): a partner's own listings across every
  // status (draft/published/unpublished/archived) — distinct from
  // `lists()`/`list()` above, which are the *public* browse endpoint's
  // keys (`GET /listings`, published-only unless explicitly filtered).
  // `useMyListingsQuery` goes through `GET /search` instead (see that
  // hook's own header), so it gets its own key namespace rather than
  // colliding with `list()`'s shape.
  //
  // `mines()`/`mine(filters)` mirrors the `lists()`/`list(filters)` pair
  // above deliberately: a mutation invalidating "every My-Listings query
  // regardless of filters" must target the bare `mines()` prefix, never
  // `mine()` called with no argument. `mine()` with no argument still
  // produces a *3-element* key ending in `{ filters: undefined }`, and
  // TanStack Query's `invalidateQueries` partial-match walks the keys of
  // the *invalidation* key against the *cached* key element-by-element —
  // `{ filters: undefined }` does not partially match a cached
  // `{ filters: { partnerId, status, ... } }` (different `typeof`), so
  // invalidation silently no-ops. `mines()` (2 elements, no trailing
  // filters wrapper) matches any `mine(filters)` key as a true prefix.
  // Caught live in Phase 9's browser verification: Archive/Delete/
  // Publish/Unpublish returned 200 but the Listings Management table
  // never refreshed until a manual reload.
  mines: () => [...listingKeys.all, 'mine'],
  mine: (filters) => [...listingKeys.mines(), { filters }],
  // Phase 18 (Partner wizard extensions): the completeness widget's read.
  completeness: (listingId) => [
    ...listingKeys.details(),
    listingId,
    'completeness',
  ],
  // Pass 3 remediation (Restaurant vertical): the public+Partner-authoring
  // menu tree read, one language at a time.
  menu: (listingId, locale) => [
    ...listingKeys.details(),
    listingId,
    'menu',
    { locale },
  ],
};

export default listingKeys;
