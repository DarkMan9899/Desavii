# Module: home

**Specification:** see `FRONTEND_ARCHITECTURE.md` Chapter 6 (Feature
Module Architecture) for this module's dependency rules, and the
corresponding `API_SPECIFICATION.md` module for the endpoints it
consumes.

**Status:** the public Home page, rebuilt as an image-led discovery page
— see [docs/HOME_REBUILD.md](../../../../../docs/HOME_REBUILD.md) for the
audit, bug ledger, design contract and motion system, and
[docs/HOME_IMAGE_SOURCES.md](../../../../../docs/HOME_IMAGE_SOURCES.md)
for every photo's source and licence.

`pages/HomePage.jsx` composes, in order: Hero (with search) →
Categories → Featured listings → Destinations → New on desavii → Why
desavii → Editorial → Partner CTA → Photo credits.

## Data — everything shown is real

- **Search (Hero):** `useHomeSearch` drives the Search page's own
  `PrimarySearchFields` with the Search page's own rules
  (`useSearchDraft`, `normalizeSearchFilters`, `buildSearchParams`), so
  submitting from Home opens exactly the `/search` URL the Search page
  would build. There is no second search implementation.
- **Ask Desavii (Hero, second tab):** `useAskDesavii` sends the
  traveller's own words to the existing AI search parse, shows what was
  understood (real destination/category/amenity ids from the catalog) as
  removable chips, and opens the same `/search` URL — or fills the fields.
  It is offered only when a real model answers (`GET
/ai/search/availability`); otherwise it says so and hands over to
  Search. See [docs/AI_DISCOVERY.md](../../../../../docs/AI_DISCOVERY.md).
- **Categories:** `GET /search/categories`; the lead tile is the
  category with the most live listings.
- **Featured listings:** paid TOP placements
  (`usePublicHomeFeaturedQuery`, badged as such).
- **Destinations:** `GET /search/destinations`, top six by listings.
- **New on desavii:** `GET /search?sort=newest`.
- **Editorial:** published Blog posts; the section hides when there are
  none.
- **Why desavii:** four static statements, each true of the product
  today (no figures, ratings or awards).

## Imagery

Free-licence, Armenia-specific photographs (Wikimedia Commons), stored
locally in `apps/web/src/assets/images/home/` as responsive AVIF + WebP.
`constants/homeImages.js` maps each key to its sources, aspect ratio and
licence credit; `HomePicture` renders it. A category or destination
without a photo falls back to its icon panel / generated art, never to a
picture of somewhere else. Replacing a photo means dropping new files
under the same key — no component changes.

## Folder contents (per FRONTEND_ARCHITECTURE.md §3.2 / §6.2)

- `components/` — module-owned UI, composing `@desavii/ui` primitives.
  Only the sections `pages/HomePage.jsx` composes are exported from
  `index.js`; the building blocks (`HomeSearch`, `AskDesavii`,
  `ActionLink`, `HomeCarousel`,
  `HomePicture`, `SectionHeader`, `ScrollReveal`, the cards) stay
  module-private. `Showcase` is no longer used on Home; it stays for
  `discovery`'s category pages.
- `hooks/` — `useHomeSearch` (Home's search state and submit) and
  `useAskDesavii` (AI-assisted discovery).
- `constants/` — structural (non-text) data: the photo manifest and the
  Why desavii icon pairing. Copy lives in translations under `home.*`.
- `index.js` — this module's public export surface (Ch. 6.2) — the ONLY
  entry point other modules may import from (Ch. 6.3's cross-module rule)
