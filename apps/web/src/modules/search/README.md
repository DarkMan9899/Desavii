# Module: search

**Specification:** see `FRONTEND_ARCHITECTURE.md` Chapter 6 (Feature
Module Architecture) for this module's dependency rules, and the
corresponding `API_SPECIFICATION.md` module for the endpoints it will
consume.

**Application Foundation status:** `SearchPageContent` still renders
`UnderConstructionPage` at the real `/:locale/search` route — no search
_results_ logic yet, that's a later phase.

**Phase 3 addition (Premium Homepage):** `useCategoriesQuery`
(`GET /search/categories`) and `useSuggestionsQuery`
(`GET /search/suggestions`) are real, live query hooks, consumed by the
`home` module's Categories section and Hero search bar respectively
(§6.3's cross-module export rule) — not placeholders.

**Phase 4 (Search & Discovery):** `SearchPageContent` now renders real
`GET /search` results — `UnderConstructionPage` is retired from this
route. Classic-search filter state lives in the URL
(`hooks/useSearchFilters.js` + `schemas/searchParams.js`); results come
from `queries/useSearchListingsQuery.js`, a `useInfiniteQuery` over the
backend's own cursor pagination (`meta.next_cursor`/`meta.has_more` —
`apps/api/src/infrastructure/database/pagination.js`), rendered as a
"Load more" grid rather than numbered pages, since the backend has no
total-count concept to number pages against.

Only filters the backend actually supports are exposed
(`apps/api/src/modules/search/validators/searchValidators.js`):

- **Destination / keyword** — free text, debounced, maps to the
  backend's `keyword` FULLTEXT param. The URL param is named
  `destination` (not `keyword`) to match what the Homepage's
  `SearchWidget` already sends when it links here.
- **Category** — a real `Select`, options from the existing
  `useCategoriesQuery` (`GET /search/categories`).
- **Sort** — `newest`/`oldest`/`alphabetical`/`relevance`, mirroring
  `apps/api/src/core/domain/sortOptions.js`'s real enum. Lives at the
  top-level `src/constants/sortOptions.js` (Phase 9), not inside this
  module, since `modules/listings` also needs it for its own "My
  Listings" sort control and may not depend on `search`
  (FRONTEND_ARCHITECTURE.md §6.3's dependency direction). `relevance` is
  only offered once a destination/keyword is present — it's a no-op
  without one, and the backend itself silently downgrades to `newest`
  in that case.

Deliberately **not** built, and why:

- **City / Country / Region** — `GET /search` accepts `cityId`/
  `countryId`, but no endpoint anywhere in `apps/api/src/routes/v1.js`
  enumerates real cities/countries to populate a picker from. Building
  a dropdown here would mean hardcoding a fake option list against a
  real filter param — the exact "invented functionality" this phase's
  brief rules out. These two params stay deep-link-only.
- **Property type** (`listingType`) — accepted by the backend, but
  (like city/country) has no enumeration endpoint; `listing_types` is a
  small seeded reference table with no `GET` route. `categoryId` already
  covers materially the same "kind of place" concept via a real,
  localized, endpoint-backed list, so it isn't duplicated here.

**Correction (P1.1 / Phase 4.2 / P2.2D — this section previously said
the following were deliberately not built; they now are):**

- **Dates / guests** — real `GET /search` params
  (`dateFrom`/`dateTo`/`guests`, `SearchFilters.jsx`'s own date-range
  picker and guest-count `Select`, backed by `useSearchFilters`/
  `schemas/searchParams.js`), filtering against the real Inventory
  Engine (`bookable_units`/`availability_calendar`/`blackout_dates`), not
  a no-op. `dateFrom`/`dateTo` are checkout-exclusive nights for
  `HOTEL_ROOM`/`PROPERTY_UNIT` units and inclusive-both-ends for every
  other type (`accommodationDateSemantics.js`, applied per-unit inside
  the same query, not a second definition). `guests` is checked against
  a unit's real `max_guests` occupancy, never against room inventory
  quantity.
- **Rating / amenities / price tier / bedrooms / star rating / etc.** —
  real, catalog-driven dynamic filters (`DynamicFilterPanel`,
  `GET /search/filters`), not hardcoded. `rating_average`/`review_count`
  are real DTO fields, aggregated from approved reviews.
- **Price** — `toSearchResultResponse`'s `price_amount`/
  `price_currency_code` is a per-listing "from" price: the cheapest real
  `bookable_units.base_price_amount` among a listing's units when they
  all share one currency, falling back to the legacy per-listing
  `listing_pricing` row, and `null` (never a fabricated/mismatched
  number) when a listing's units are priced in more than one currency.
  The full current DTO field list is
  `id, partner_id, listing_type, slug, status, title, summary, city_id,
city_name, country_id, cover_image_url, price_amount,
price_currency_code, media_count, rating_average, review_count,
created_at`.

**Search & Discovery rebuild (2026-10) — supersedes the "not built"
notes above where they disagree:**

- **Page:** title → search panel (`SearchFilters`) → active-filter chips
  (`ActiveFilters`) → total + sort (`SearchToolbar`) → results
  (`SearchResults`). Compact page spacing, AI search collapsed behind a
  toggle, and a one-line summary instead of five stacked fields on
  phones — the old stack pushed the first result below the first
  screen (the reported "white area").
- **Apply model:** the primary fields (`SearchForm` from Tablet, the
  `SearchFiltersDrawer` on phones) and the drawer's price/category
  filters edit a local draft (`useSearchDraft`, `utils/searchDraft.js`)
  and apply as one search on Search / Show results. Sort and chip
  removal apply at once. The old bar wrote every change straight to the
  URL, so the first click of a date range was written, dropped as an
  unpaired date and reset the calendar — the date filter could never
  be set.
- **URL state:** `schemas/searchParams.js` parses structurally (real
  calendar dates not in the past, ≤ 90 days; integer ids/prices; well-
  formed `attr_*`/`amenityIds`), then `normalizeSearchFilters` applies
  the catalogs (`?category=<slug>` → `categoryId`, unknown ids dropped)
  and the category rules. `useSearchFilters` waits for the catalogs a
  URL depends on (`isResolved`) and replaces a messy URL with its
  canonical form, which maps to the same request — one request per
  search, reload/Back/copied links reopen the same state.
- **Destination** is now a real city (`cityId`, from
  `GET /search/destinations`, only cities with listings). The free-text
  field is the keyword (URL param still `destination`, for old links).
- **Category rules** (`utils/categoryFilterCapabilities.js`):
  stays — check-in/check-out; car rentals — pick-up/return, no party;
  restaurants — one date, no party (a table's availability never
  depends on party size, so the filter would do nothing); tours /
  attractions / entertainment venues — one date, party named
  Travelers / Visitors / Participants. Changing category drops the old
  category's attribute filters.
- **Price:** min/max in AMD against the card's "from" price — prices are
  authored in AMD and the filter never converts currencies.
- **Sort:** adds `price_asc` / `price_desc`.
- **Count:** the toolbar shows the whole filtered total (`meta.total`),
  not the number of cards loaded so far.

**Search & Discovery remediation (2026-10) — supersedes the "Apply
model" and "Page" notes above:**

- **Page:** a navy search console (`SearchFilters`): the search bar with
  its Search button in the same row (`SearchForm` from Tablet, a summary
  button on phones), then `QuickFilters` (Price, the category's quick
  filters, "All filters") → total + sort → active chips → results.
- **Live filtering:** a discrete choice (category, destination, party,
  chip, checkbox, toggle, stepper, rating) applies at once; keyword,
  price and range sliders apply once input pauses
  (`hooks/useDebouncedCommit.js`, 400 ms); a date range applies only
  when complete, a one-day category's date at once. Search / "Show N
  results" apply whatever is still pending (`useSearchDraft#flush`) and
  never re-send an unchanged search — `useSearchFilters#writeFilters`
  skips a URL identical to the current one. Closing the panel discards
  unapplied typing. Requests are aborted when superseded (the React
  Query `signal`), and the previous results stay on screen meanwhile.
- **Filter catalog:** everything after the primary fields comes from
  `GET /search/filters` for the chosen category and language — attribute
  filters, localized amenities (`AmenityChecklist`, grouped, searchable),
  category policies (`policy_*`), room facts (`room_meal_plan`,
  `room_hourly_stays`) and guest rating (`ratingMin`). The API returns
  only filters some listing in scope can match, each with its own URL
  `param`, quick/advanced placement and option counts; an option with no
  listing is hidden unless an old link already selected it.
  `useRenderableFilterGroups` is shared with the Category page's
  `DynamicFilterPanel`.
- **Vocabulary:** `utils/filterVocabulary.js` is the one place that
  labels a filter — the partner catalog's own translated attribute,
  policy, option, meal-plan and unit names (`partner.listingWizard.*`),
  the API's localized amenity names, and `search.dynamicFilters.*` for
  Search-only names. No DB-driven record is translated in the frontend.
- **URL:** `normalizeSearchFilters` also prunes filter keys the chosen
  category's catalog does not declare (waiting for the catalog first);
  changing category drops every category filter except the guest rating
  (`GLOBAL_DYNAMIC_KEYS`).
- **Sort:** adds `rating_desc`.
- **Bar geometry:** every control in the search bar is the design
  system's field height (`$input-height-md`), the Search button included;
  a long selected value ends in an ellipsis instead of growing its field
  (the full value stays in the DOM and in the active chips). Tablet: two
  columns. Laptop and up: three equal columns over two rows — a single
  row cannot hold real HY/RU values in the ~1120px content width (a RU
  date range alone needs ~300px), so it is not used.
- **Dropdowns:** Selects and the calendar use the shared portaled,
  viewport-clamped panels (a bottom sheet on phones). Quick-filter panels
  use the shared `Popover`, which keeps itself inside the viewport
  horizontally and scrolls into view when it opens below the fold.
  `tests/e2e/searchResponsive.spec.js` asserts both structurally.

**Map Search (2026-10):**

- **View:** `view=map` in the URL (List is the default and never
  written); the List/Map switch (`ResultsViewToggle`) sits in the
  toolbar. `view` is never sent to the API.
- **Data:** `useSearchMapQuery` → `GET /search/map`, built from the same
  committed filters as the List (`toSearchQueryParams`), so the Map and
  the List are one search. Up to 500 markers; `meta.truncated` and
  results without a location are stated on the map.
- **Area:** "Search this area" appears only after the visitor pans or
  zooms the map themselves, and commits the visible area as `bbox`
  (`utils/mapArea.js`: `west,south,east,north`, 5 decimals, so the same
  area is always the same URL). The area filters the List too, shows as a
  "Map area" chip, and survives reload, Back/Forward and copied links.
  "Clear map area" and the chip remove it; "Clear filters" removes it but
  stays on the Map; a category change keeps it; a destination change
  drops it.
- **Markers:** `supercluster` clusters only the current search's markers
  (a changed search's markers are withdrawn until the new ones arrive).
  Listings stacked at one point are offered as a list. Markers are
  keyboard buttons (Enter/Space); private stays are dashed pills at their
  approximate point (the API's `location_precision`).
- **Preview:** a marker opens a preview built from the marker's own data
  (no listing request per marker; facts from `buildCategoryCardMeta`,
  never invented) — a card over the map on laptop+, a bottom sheet on
  phones. "Learn more" (`buildListingHref`) opens the listing with the
  search's `dateFrom`/`dateTo`/`guests`; the listing page re-checks them.
  Nothing on the map navigates or books by itself.
- **Layout:** laptop+ — List left, Map right and sticky; the card hovered
  or focused highlights its marker, and the marker selected outlines and
  scrolls to its card. Below laptop — the Map alone. Leaflet and the map
  code load lazily, only when the Map is opened.
- **Structure:** `useSearchMapResults` holds the state (current markers,
  the search they belong to, the selection or group); `SearchMapPanel`
  composes the lazy `SearchMap` (Leaflet + `ClusterLayer`),
  `MapMessages` and `MapPreview` (card or bottom sheet).
- **Tests:** `SearchMapPanel.test.jsx`, `MapListingPreview.test.jsx`,
  `useSearchMapQuery.test.jsx`, `mapArea.test.js`, and end to end
  `tests/e2e/searchMap.spec.js`.

**Future AI Search preparation:** `SearchResults` takes a plain
`results` array plus loading/error/pagination props — it has no
knowledge of `useSearchListingsQuery`, `useSearchFilters`, or "classic"
vs. a future AI-search mode. `SearchPageContent` is the intended seam:
a later AI-search input would be a sibling to `SearchFilters` with its
own state/query hook, both ultimately feeding the same `SearchResults`,
rather than a rewrite of it.

## Folder contents (per FRONTEND_ARCHITECTURE.md §3.2 / §6.2)

- `components/` — module-owned UI, composing `@desavii/ui` primitives
- `hooks/` — module-specific custom hooks
- `queries/` — React Query query definitions (Ch. 14)
- `mutations/` — React Query mutation definitions (Ch. 14)
- `schemas/` — React Hook Form validation schemas (Ch. 15)
- `utils/` — module-specific pure helpers
- `constants/` — module-specific enums/constants
- `index.js` — this module's public export surface (Ch. 6.2) — the ONLY
  entry point other modules may import from (Ch. 6.3's cross-module rule)
