# Home rebuild — premium discovery experience

Visual rebuild of the public Home page (`/:locale`). Product logic is
unchanged: routes, Search semantics and URLs, API contracts, category /
listing / price / rating data, localization, auth and booking flows.
Photo sources and licences: [HOME_IMAGE_SOURCES.md](HOME_IMAGE_SOURCES.md).

## 1. Starting point (audit)

Audited at HEAD `6eee928` in HY / EN / RU at 390, 430, 768, 1024, 1280,
1440 and 1920 px (21 combinations), with a headless audit (overflow,
CLS, API requests, duplicate requests, console / page errors, failed
requests, broken images, screenshots).

| Section | Component | Data | State before | Decision |
| --- | --- | --- | --- | --- |
| Hero | `Hero` + `SearchWidget` | none (search catalogs) | abstract SVG "portal" with pointer parallax and scroll blur, no photography; a large empty gradient band below it; search collapsed into one pill | REBUILD |
| Hero search | `SearchWidget`, `DestinationAutocomplete` | `GET /search/suggestions`, catalogs | a second search implementation: free-text destination instead of `cityId`, always a date range (even single-day categories), guests capped at 8 (Search allows 12), deep imports past the `search` barrel | REPLACE with the Search page's own `PrimarySearchFields` |
| Categories | `Categories`, `CategoryCard` | `GET /search/categories` | icon on gradient, no imagery; oversized featured tile left empty cells on desktop | REBUILD as photo tiles |
| Featured listings | `FeaturedListings` + `Showcase` | `GET /advertising/home-featured` (paid TOP placements) | autoplay, loop and centre-scaling; a clipped sliver of the previous card at the left edge at 1440 | REBUILD on `HomeCarousel` |
| Destinations | `FeaturedDestinations`, `DestinationCard` | `GET /search/destinations` | generated art only | REBUILD with photography (generated art kept as fallback) |
| New on desavii | `PopularExperiences` | `GET /search?sort=newest` | broken at 390: mis-sized cards and an empty block | REBUILD on `HomeCarousel` |
| Why desavii | `WhyDesavii` | static copy | two unverifiable claims ("curated by people who know Armenia", "get help in 3 languages"), one untrue today (payment protection at checkout — payments are paused) | REWRITE copy, restyle |
| Editorial | `EditorialHighlights` | `GET /blog/posts` | one post rendered in a three-column grid (two empty columns); "read more" in gold on white failed contrast | ADAPT |
| Partner CTA | `PartnerCta` | static | a button that navigates (should be a link) | REBUILD |
| Footer (shared) | `Footer` | static | column headings collided at 390 (layout `Grid` pinned the column count) | FIX |

Before baseline: horizontal overflow none, 6 API requests, no duplicate
requests, no console errors, no failed requests, no broken images; CLS
max 0.0599 (RU 390); page height ~6.4k–7.4k px.

## 2. Bug ledger

| ID | Area | Problem | Root cause | Width / locale | Severity | Status |
| --- | --- | --- | --- | --- | --- | --- |
| HOME-001 | Hero | No photography; empty gradient band under the hero | Decorative SVG scene sized independently of the content | all | High | FIXED — photo hero, content anchored to the bottom |
| HOME-002 | Hero search | Home search disagreed with `/search` (keyword vs `cityId`, range for single-day categories, guests max 8) | A separate implementation (`SearchWidget`) instead of the canonical fields | all | High | FIXED — `useHomeSearch` uses `PrimarySearchFields`, `useSearchDraft`, `normalizeSearchFilters`, `buildSearchParams` |
| HOME-003 | Hero search | All fields hidden behind a pill | Collapsed-by-default design | ≥768 | Medium | FIXED — inline panel from tablet up, sheet on phones |
| HOME-004 | Hero search | Choosing a category while catalogs load could drop the destination | Empty `[]` catalogs passed to normalisation while loading | all | Medium | FIXED — `undefined` while loading (regression test) |
| HOME-005 | Categories | No imagery; empty cells next to the featured tile | Fixed featured span not matched to column count | ≥1024 | High | FIXED — photo tiles, grid spans per breakpoint |
| HOME-006 | Featured row | Clipped previous card at the left edge | `Showcase` centre alignment + loop | 1440 | High | FIXED — `align: start`, `containScroll: trimSnaps`, no loop |
| HOME-007 | Featured row | Autoplay | `Showcase autoplay` | all | Medium | FIXED — the old clipped, looping autoplay is gone (superseded 2026-10-30 by owner-requested calm autoplay with pause controls, §9) |
| HOME-008 | New row | Mis-sized cards and an empty block | Slide widths not set for phones | 390 / 430 | High | FIXED — `HomeCarousel size` |
| HOME-009 | Card rows | Unequal card heights left a gap | Slides did not stretch their card | 390 | Medium | FIXED — slides are flex, card fills |
| HOME-010 | Editorial | One post in a three-column grid | Column count fixed at 3 | ≥1024 | Medium | FIXED — `grid--1/2/3`, a single post is a wide feature |
| HOME-011 | Editorial | "Read more" contrast | Gold text on white | all | Medium (WCAG) | FIXED — royal blue |
| HOME-012 | Partner CTA / Hero CTA | Buttons that navigate | `onClick → navigate` | all | Low (a11y) | FIXED — links |
| HOME-013 | Motion | Reveal animated `filter: blur` | `ScrollReveal` "depth" variant | all | Low (perf) | FIXED — opacity + transform only |
| HOME-014 | Why desavii | Unverifiable / untrue claims | Copy not checked against the product | all, HY/EN/RU | High (truth) | FIXED — four statements true today |
| HOME-015 | Footer | Column headings collided | Layout `Grid` pinned 4 columns | 390 | Medium | FIXED — responsive column grid |
| HOME-016 | Data | Black test-fixture cards in featured / new rows | Integration-test residue in `travelhub_test` | env | — | NOT A HOME BUG — test DB reset + demo seed |
| HOME-017 | Header (shared) | Nav and actions overlap | The full nav + actions need ~1070 px (EN), ~1148 px (RU), ~1344 px (HY) but showed from 1024 px | 1024 all locales; 1280 HY | Medium | FIXED — priority+ nav (`Header/usePriorityNav.js`): links that do not fit move, in order, into a keyboard-operable "More" menu (collapsed groups keep their label); actions never hidden; link gap `space-4`. Swept on Home, Search, Companies, About, Become a partner, a listing and the account area, signed in and out, 7 widths × 3 locales: 0 overlaps, 0 overflow |
| HOME-018 | Header (shared) | Logo PNG is 718 KB on phones / 359 KB on desktop — the largest download on Home | 1024 px masters sent to a 32 px slot | all | Medium (perf) | FIXED — display-size copies (`public/brand/header/`, 1x/2x/3x, 2–25 KB) derived from the unchanged masters by `npm run generate:favicons`; mark pixel-identical, wordmark visually equivalent at 1x/2x/3x; favicons regenerate byte-identical |
| HOME-019 | Categories | Names split mid-word ("Ավտովարձ/ույթ", "Բնակարան/ներ") | `overflow-wrap: anywhere` with the arrow beside the text | 1024 / 768, HY / RU | Medium | FIXED — arrow in the corner, `break-word` + `hyphens: auto` (RU breaks as "Развлекатель-ные") |
| HOME-020 | Hero | Gold eyebrow and parts of the headline / subtitle below AA over snow and cloud | Scrim too light where the copy sits; 12 px gold text directly on the photo | 390–1024 all locales | High (WCAG) | FIXED — eyebrow on an ink chip; deeper scrim; measured ≥ AA at all 21 combinations |

Retracted during the audit: "New on desavii" mislabelled as popular — its
labels already say *new*.

## 3. Research (live, 2026-10-29)

Each site's current public homepage was opened in a real browser at 1440
and 375 px (en-US, signed out, no consent given). Plain HTTP fetches were
refused by most of them (403 / 429), so the browser was the source.
Turo answered only with a bot check, which was not bypassed — it is not
observed. Only Home / landing patterns were looked at; nothing was copied.

| Source | Observation | Desavii fit | Current Home | Action |
| --- | --- | --- | --- | --- |
| booking.com (1440 / 375) | Solid navy band, headline, then one row: destination · dates · occupancy · Search | YES | ALREADY MATCHES — every field visible from tablet up, in one panel | None |
| airbnb.com (375) | Phone Home is one "Start your search" pill that opens the full search | YES | ALREADY MATCHES — phone trigger opens the fields in a sheet | None |
| airbnb.com (1440) | Vertical tabs (Homes / Experiences / Services) above the search; dense rows of ~7 listing cards per destination | Tabs NO (Desavii's category is a field of the one canonical search — tabs would be a second, competing entry); density NO (image-led, editorial) | REJECT | None — 4 to 4.5 cards per row at 1440 kept |
| expedia.com | Photo-backed hero; search card with tabs per vertical (Stays, Flights, Cars, Packages, Things to do) that change the fields | Photo hero YES; tabs NO (as above) | Photo hero ALREADY MATCHES; tabs REJECT — the canonical fields already change by category (single day, rental, stay) | None |
| getyourguide.com (1440 / 375) | Centred headline + one keyword search; destination photo tiles immediately below, name under the photo, count ("256 activities"); rows with labelled Next / Previous buttons | YES | ALREADY MATCHES — keyword is the first field; destinations are photo cards with real listing counts; labelled arrows | None |
| tripadvisor.com | "Where to?" + one search with Ask AI; interest chips (Outdoors, Food, Culture, Water) right after the hero | YES (discovery by kind right after the hero) | ALREADY MATCHES — the category photo grid is the first section after the hero | None |
| viator.com | Full-bleed photo hero (3-slide rotator), compact where / when search; "Why book with Viator?" (4 points) directly under the hero | Photo hero YES; rotator NO (autoplay motion); trust high on the page NO (owner's rhythm puts trust after the editorial) | Hero ALREADY MATCHES; rotator and trust position REJECT | None |
| klook.com | Photo hero carousel; one keyword search; a row of category tiles (tours, attraction tickets, hotels, transport, car rentals) under it | Category row YES; hero carousel NO | ALREADY MATCHES — category tiles (photos, not icons) under the hero | None |
| opentable.com | One row: date · time · party size · location / restaurant / cuisine | Party size for restaurants — a Search-page capability, not a Home choice | REJECT for Home — Home uses the Search page's own fields; restaurants have no party field there today | None in Home (flag for the Search owner) |
| eventbrite.com | Search in the header (event + location); round category icons; location chips (Today, This weekend) | Location chips NO (Desavii is one country; no "near you" data); icons NO (photo tiles chosen) | REJECT | None |
| feverup.com | Full-bleed photo, left-aligned headline + subtitle + one search; a slim trust strip under the hero | Left-aligned photo hero YES; trust strip NO (would repeat Why desavii) | ALREADY MATCHES (hero); REJECT (strip) | None |
| vrbo.com | Headline + search, then property carousels | YES | ALREADY MATCHES | None |
| All | Deal banners, discount badges, review totals ("300M+ reviews") | NO — Desavii shows only true data; there are no deals or review totals to state | REJECT | None |
| All | No content carousel autoplays; hover motion only; hero rotators where present | YES (no autoplay) | Superseded by owner request (2026-10-30): calm, pausable autoplay (§9); reduced motion honoured | None |

Result: no meaningful gap — no implementation change from the research.
Separately, the section order was brought in line with the brief's own
rhythm (listings → editorial → trust → CTA): Editorial now comes before
Why desavii.

## 4. Component references (21st.dev)

| Pattern | Decision | Why |
| --- | --- | --- |
| Carousel Cards (header arrows, peek) | APPLY | Matches the card-row contract; arrows outside the row avoid covering cards |
| Real Estate Search Hero | ADAPT | Photo hero with search panel; kept the image fade, dropped the floating stats |
| Shop by Category Grid | ADAPT | Photo tiles with a bento lead tile; lead tile chosen by real listing count |
| Destination Card | ADAPT | Portrait photo + name; the 3D tilt is REJECTED (motion for its own sake) |
| Editorial Image Hero | ADAPT | Used for the single-post editorial feature |
| Booking Form | ADAPT | Labelled grouping for the search panel; fields themselves are the canonical ones |
| Neon Hero Carousel (filmstrip) | REJECT | Neon / gaming aesthetic |
| SaaS Bento | REJECT | Generic SaaS look |
| SaaS CTA | REJECT | Generic, not image-led |
| 3D Coverflow | REJECT | Centre-scaling — the clipping problem of HOME-006 |
| Ken-Burns / autoplay carousels | REJECT | Autoplay; movement that is not asked for |

## 5. Final structure (design contract)

Rhythm: strong visual → discovery → listings → editorial → trust → CTA.

| # | Section | Purpose | Data | Phone (390–430) | Tablet (768) | Desktop (1024–1920) |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Hero | Say what this is; start a search | catalogs | photo, h1, one search button → sheet | inline search panel (2 rows) | inline one-row panel; hero `min(78vh, …)`; content in the wide container |
| 2 | Categories | Every category, by photo | categories | 2 cols, lead tile across both | 3 cols, lead tile 2×2 | 4 cols, lead tile 2×2 |
| 3 | Featured | Paid TOP placements (badged) | home-featured | 86% slides, swipe | 44% + arrows | 30% / 23% + arrows |
| 4 | Destinations | Where to go | destinations (top 6 by listings) | 76% portrait slides | 40% | 28% / 22% |
| 5 | New on desavii | What was just published | search `newest` | as Featured, on a soft band | | |
| 6 | Editorial | Stories | blog posts (hidden when none) | stacked | 2 cols | 1 = wide feature, 2–3 = grid |
| 7 | Why desavii | Four true reasons | static copy | list | 2×2 | 4 across, hairline dividers, navy band |
| 8 | Partner CTA | Supply side | static | photo banner + link | | |
| 9 | Photo credits | Licence attribution | `homeImages.js` | native disclosure | | |

Visual treatment: deep navy / ink, royal blue as the only interactive
colour, gold only for small accents (section eyebrow rules, icons, the TOP badge).
Everything from design tokens; no new colours, spacing, radii or
breakpoints were introduced.

States: every data section has loading (skeletons of the final size),
empty, and error states; images that fail or are missing fall back to
the category icon panel / generated destination art; a single blog post
or a short row never leaves empty columns.

Truthfulness: no invented statistics, awards, ratings, prices,
discounts, availability or popularity. The featured lead tile and the
destination order follow real `listing_count`.

## 6. Motion system

| Motion | Where | Timing | Properties |
| --- | --- | --- | --- |
| Photo settle | Hero photo | 1.2 s ease-out | scale 1.04 → 1, opacity |
| Rise | Hero eyebrow / subtitle | `transition-slow` (0.4 s), staggered | translateY `space-3` → 0, opacity (the h1 is not animated — it is the LCP text) |
| Reveal | Section headers, grids | 0.6 s ease-out, 60 ms stagger, once at 15% visible | translateY 16 px → 0, opacity |
| Image hover | Category / destination / editorial cards | `transition-slow` | scale 1.06 (editorial 1.05, plus a lift by `space-1`) |
| Arrow nudge / press | Category card, Partner CTA | `micro` (150 ms) | translate by `space-1`; press scale 0.98 |
| Carousel | Card rows | Embla drag / snap | transform only |

All motion is transform / opacity (the editorial card's hover shadow is
paint-only; nothing animates layout). `prefers-reduced-motion: reduce`
removes every animation and transition (`ScrollReveal` renders plain
wrappers with the same DOM). The only thing that moves on its own is
carousel autoplay, by owner request (§9: 6 s, pausable, off under
reduced motion).

## 7. Accessibility

- One h1, section h2s, card h3s; every section is a labelled region.
- Search is a labelled `search` landmark; on phones the trigger is a
  button with `aria-haspopup="dialog"` opening a labelled modal.
- Carousels: `region` with `aria-roledescription`, slides as "n of m"
  groups, real previous / next buttons disabled at the ends and removed
  when nothing scrolls; tabbing to a card scrolls it into view.
- Photos are decorative (`alt=""`, inside `aria-hidden` media) because
  each card's text names the place.
- Focus rings from the shared mixin; touch targets ≥ 44 px.
- Text over the hero photo is measured, not assumed: with the text
  hidden, the 95th-percentile brightest background pixel behind the
  eyebrow, headline and subtitle is compared with white. Lowest ratios:
  eyebrow 14.8:1, headline 3.75:1 (large text, 3:1 required), subtitle
  4.54:1 — every width and locale passes.
- Automated: axe (serious / critical) clean on Home at 1440, at 390 and
  with the phone search sheet open.

## 8. Performance

Production builds of HEAD `6eee928` and of this tree, served locally:

| Measure | Before | After |
| --- | --- | --- |
| HomePage JS (gzip) | 45.1 KB | 46.9 KB (canonical search fields now ship with Home) |
| HomePage CSS (gzip) | 5.6 KB | 3.6 KB |
| Entry JS (gzip) | 305.8 KB | 306.9 KB |
| JS + CSS transferred on Home | 1586 KB | 1569 KB |
| Photos transferred, phone (whole page) | 0 | ~245 KB (hero 27 KB AVIF) |
| Photos transferred, 1440 (whole page) | 0 | ~490 KB (hero 140 KB AVIF) |
| Header logo transferred (every page) | 718 KB phone / 359 KB desktop | 2–12 KB phone / 4–25 KB desktop (by screen density) |
| Duplicate image / API requests | 0 | 0 |
| API requests on load | 6 | 6 |
| LCP (local) | ~230 ms (text) | ~545 ms (hero photo, preloaded at high priority) |
| CLS, worst of 21 combinations | 0.060 | 0.026 |

Every photo below the hero is lazy-loaded and served at the width its
`sizes` asks for; the hero alone is eager with `fetchpriority="high"`.

The 21-combination matrix (390 / 430 / 768 / 1024 / 1280 / 1440 / 1920 ×
HY / EN / RU) found no horizontal overflow, console or page errors,
unhandled rejections, failed API requests, broken images or clipped
text, and every exercised interaction (search, tiles, arrows, keyboard
focus, swipe, cards, links, CTA — 168 checks) passed. Reduced motion:
no running animations and nothing left hidden.

## 9. Final design pass and AI discovery (2026-10-29)

Audit of the implemented Home (not the pre-rebuild one):

| Component | Before this pass | After |
| --- | --- | --- |
| Hero | GOOD BUT GENERIC — photo, headline, a two-row form card | PREMIUM — one panel, two modes: Search and Ask Desavii (mode tabs) |
| Hero search | GOOD BUT GENERIC | kept (the canonical fields); now the Search mode of the panel |
| AI entry | missing | Ask Desavii — composer, sample requests, interpreted intent, honest unavailable / sign-in / error states ([AI_DISCOVERY.md](AI_DISCOVERY.md)) |
| Carousel controls | PRIMITIVE — 36 px circles stranded under "View all", no position, no progress | PREMIUM — one toolbar: section link, "02 / 03" page counter, joined 44 px controls with a hairline; progress thumb under every row; arrow keys; sideways trackpad scrolling; `duration` 32 glide |
| Section CTAs | PRIMITIVE — text + `→` character | `ActionLink`: label + ringed arrow that fills and nudges; `onImage` and `primary` variants |
| Section headings | repetitive (identical blocks) | three structures: standard, spotlight (heading column beside the row — Featured), ink band (Destinations) |
| Featured listings | lonely single card on a wide field | spotlight layout from laptop up |
| Destination cards | GOOD | own archetype: count label on a gold hairline, large display-face name, ringed arrow cue, caption lift on hover |
| Category cards | PREMIUM | kept (photo bento, solid arrow disc) |
| Listing cards | GOOD BUT GENERIC (shared `SearchResultCard`, demo data without photos) | kept — shared with Search; outside Home's scope |
| Trust band | GOOD | kept |
| Partner CTA | GOOD | `ActionLink onImage` |
| Motion | GOOD | + tab underline growth, control/arrow nudges, chip entrance, progress thumb — transform/opacity only, reduced motion respected |

Control system: Primary / Secondary / Ghost are the shared `Button`
(hover, focus ring, pressed, disabled, loading); Section CTA / On-image /
Primary link are `ActionLink`; carousel controls and mode tabs are their
own components. Every one has hover, focus-visible, pressed and (where it
applies) disabled and loading states.

21st.dev patterns compared (selected → adapted, not pasted):
carousels — Apple Card Carousel (rejected: tiny row arrows), Snap Carousel
(**selected**: counter + paired controls + indicator), Carousel Cards,
Multi-Slide Carousel, Custom Navigation Carousel, Circular / Wheel / 3D
(rejected: novelty motion); cards — Destination Card with tilt (rejected),
Travel Card / Place Card (adapted: caption + ringed action); CTAs —
Interactive Hover Button (adapted: arrow-in-circle fill), Gradient / Tron
CTA banners (rejected: neon, gradients); AI — AI Prompt Input
(**selected**: composer with a toolbar row), Suggestions (**selected**:
sample requests), AI Chat Input / AI Assistant Interface (rejected: chat
framing), Real Estate Search Hero (adapted: search on the photo).

### Carousels and autoplay (2026-10-30)

| Row | Data | Section limit | Demo data today | Autoplay | Loop |
| --- | --- | --- | --- | --- | --- |
| Featured listings (`FeaturedListings`, spotlight) | `GET /advertising/public/home-featured` — active `HOMEPAGE_SECTION` promotions | the placement's `max_concurrent_slots` (6) | 1 active promotion → 1 card | only with 2+ cards | no — promotion priority order |
| Featured destinations (`FeaturedDestinations`, ink band) | `GET /search/destinations`, cities with listings, busiest first | 6 | 22 cities, 8 with listings → 6 cards | yes | no — ranked by listing count |
| New on desavii (`PopularExperiences`) | `GET /search?sort=newest`, first page | one Search page (12) | 73 published → 12 cards | yes | no — newest first |

Categories and Editorial are grids, not carousels; the shared `Showcase`
is not used on Home.

"One large card" in Featured is the real inventory: the demo seed creates
exactly one active Home promotion. Nothing limits the row below its six
slots — with more active promotions it shows one card per promotion
(proven in `tests/e2e/home.spec.js` with two real promotions created and
cancelled through the Admin API). A single card is never repeated, gets no
controls and never autoplays.

Autoplay is the library's own `embla-carousel-autoplay` plugin (8.6,
checked with Context7), every 6 s, added only when a row has two or more
real cards, is not loading, and the visitor has not asked for reduced
motion. Rows stay finite: after the last page the plugin rewinds to the
first, without cloning cards.

| Situation | Behaviour |
| --- | --- |
| Pointer over the row (cards or controls) | paused; resumes with a full 6 s countdown when it leaves |
| Keyboard focus anywhere in the row | paused until focus leaves the row |
| Drag / swipe | paused while dragging; full countdown restarts after |
| Previous / Next | the countdown restarts, so the row never moves right after the visitor did |
| Pause button (beside the progress track, every width) | stops the row until Play is pressed (WCAG 2.2.2) |
| Tab in the background | paused (plugin) |
| Reduced motion | no autoplay, no pause button |
| One card / no cards | no autoplay, no controls / the section's empty or error state |

Slide changes are not announced (no live region) and focus never moves on
its own. The timer belongs to the plugin, which Embla destroys on unmount;
the row's own listeners are removed with it.

## 10. Removed

- `modules/home/components/SearchWidget/*`
- `modules/home/components/DestinationAutocomplete/*`
- `hooks/useTiltEffect.js`, `hooks/usePointerParallax.js`
- `modules/search/queries/useSuggestionsQuery.js` (and `getSuggestions`
  in `api/search.js`, its query key) — Home was its only caller; the API
  endpoint is unchanged
- `FeaturedDestinations.module.scss`, `FeaturedListings.module.scss`
- Locale keys for the removed widget, hero CTAs, old Why desavii items
  and the carousel row label

The shared `Showcase` stays (category pages use it).
