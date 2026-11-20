# Listing Detail Redesign

The second of three phases (after the shared listing card, before the
category-aware booking / action widget). The goal: when a traveller
opens any listing, the page answers within seconds what it is, where it
is, what guests think, what matters most, and what to do next — truthfully,
in HY / EN / RU, at every width, for all nine categories.

## 1. Pre-implementation gate

| Tool | Used for | What it changed |
|---|---|---|
| Graphify | AST graph of `modules/listings`, `reviews`, `companies`, `favorites`, `utils`, `api` and the API's `listings` / `reviews` / `partners` / `bookings` modules (580 files, 2,695 nodes) | Found the 676-line page orchestrator importing 23 sections and 7 queries, two gallery implementations, and a duplicate categories fetch. Drove the split into a data hook, a section builder and a layout-only page. |
| Context7 | Embla Carousel 8.6, React 18.3, React-Leaflet 4.2 | `select` / `scrollTo` with the reduced-motion jump flag for the gallery; `lazy` and image-priority guidance; the approximate-area circle. |
| 21st.dev | Searches: property gallery + lightbox, hotel detail + booking sidebar, review distribution, amenity grid + show-all, policy / FAQ accordion, location map card, tour itinerary, host / company profile, plus one ranked inspiration query for an editorial travel detail page | See §2. |
| desavii-frontend-design | Before and after implementation | Editorial identity (gold-marked eyebrow, display-face title, no chips), category-aware facts, one card geometry, reduced motion, HY / RU wrapping. |
| frontend-ui-engineering | Before and after implementation | Component size (page 676 → 200 lines), loading / empty / error states, lightbox focus management, touch targets, no layout shift. |

## 2. Pattern decisions

| Pattern | Decision | Why |
|---|---|---|
| Lightbox grid with filters / animated zoom (several gallery entries) | REJECT | Filters and zoom animation add weight without helping a traveller choose. |
| Thumbnail strip viewer | ADAPT | A counter and a keyboard-navigable track, rebuilt on Embla and the shared `Modal`. |
| Count-aware mosaic (hero + supporting tiles) | SELECT | One, two or three photos still look intentional, where a fixed five-tile grid leaves empty blocks. |
| Review filter bars / per-star distribution | REJECT | Demo listings have one or two reviews. A distribution would suggest a precision the data does not have. |
| Rating summary (large average + count) | SELECT | Shown once, with the count of approved reviews. |
| Icon feature grid | ADAPT | Icon facts without chip backgrounds, matching the shared card. |
| Accordion FAQ / policy sections | ADAPT | Kept the existing compact sections; no new accordion primitive was needed. |
| Expanding map card | REJECT | A 3D-tilt map card is decoration; the map stays a plain, honest area or point. |
| Profile cards with follow buttons | REJECT | The company block shows the public identity only, linking to its profile. |
| Booking-calendar widgets | Out of scope | Phase 3. |

## 3. Before — audit ledger (all nine categories, 390 / 1440, EN)

Measured with a real browser on the demo data before any change.

| # | Finding | Severity | Fix |
|---|---|---|---|
| D-01 | The price never appeared in the first screen: 1,188–3,257 px down on desktop, 1,168–4,264 px on a phone. | High | The reservation panel is pinned beside the header from the first screen; on a phone the fixed booking bar shows it. |
| D-02 | Four stacked strips (highlights, facts, company, section nav) pushed all content down. | Medium | One header: category · place, title, rating + actions, highlights, key facts, features. The company moves to its own section. |
| D-03 | The eyebrow showed the plural category name ("HOTELS"). | Low | The precise singular label the card uses. |
| D-04 | "1 reviews" / "1 отзывов" — no plural forms. | Low | Plural-correct rating line, shared with the card; `hero.reviewsLink` fixed for the Company page too. |
| D-05 | The hero mosaic left an empty block with three photos, gave photos without alt text an empty `alt`, and had no counter, swipe or "show all". | Medium | One count-aware gallery: a mosaic from tablet, a swipeable strip with a counter on a phone, alt-text fallback, "View all N photos". |
| D-06 | Two gallery implementations (the hero's `@desavii/ui` Gallery and the rooms' `ListingGallery`). | Medium | One `ListingGallery` (hero and room-grid variants). The admin page keeps the UI-package gallery. |
| D-07 | The review rating was shown twice (summary + list header). | Low | One summary. |
| D-08 | Twelve related cards stacked on a phone (about half the page). | Medium | At most six; a swipeable rail on a phone, a grid from tablet. |
| D-09 | The About section showed the short summary, not the description. | Medium | The full description (the summary stays the SEO description). |
| D-10 | Categories fetched twice per page (header and page used different cache keys). | Low | One shared cache entry. |
| D-11 | The public Detail DTO carried internal and moderation fields. | Medium (security) | Minimal public DTO (§6). |
| D-12 | Public reviews carried the reviewer's user id, booking id and full name. | Medium (privacy) | Minimal public review shape, "Anna K." (§6). |
| D-13 | City and country names were never localized ("Vanadzor, Armenia" in HY). | Medium | `location.name_translations`; the page picks its locale. |
| D-14 | Menu section titles: gold 12 px text on white, contrast 2.39:1. | Medium (WCAG AA) | Strong gold, about 4.6:1. |
| D-15 | Phone booking bar: a long RU / HY CTA squeezed the price to 6 px. | High (clipped price) | The price never shrinks; a long CTA moves to its own row. |
| D-16 | Phone CLS 0.27–0.32: the short loading frame let the footer flash into the first screen. | High (CLS) | The loading frame is at least one screen tall. CLS is now 0.002. |
| D-17 | The verified company shield was drawn but never announced. | Low (a11y) | "Verified company" is spoken. |

## 4. Final structure

Order at every width: gallery → header → in-page navigation → the
category's own sections → reviews → the place → the company → FAQ →
related listings. From laptop, the reservation panel is pinned beside it
all from the first screen.

**Header** (`ListingHeader`): category · city, country (with "Approximate
area" for a private stay), the title in the display face, the
approved-review rating (or "No reviews yet") linking to the reviews, the
page actions (Ask AI, share, favourite), the partner's highlights, the
category's key facts (`listingKeyFacts.js`) and up to four top features —
the card's own decision-relevant amenities for that category. No price in
the header: the pinned panel and the booking bar own it, so the page never
shows two prices that could disagree.

**Sections per category** (`categoryPresentation.js`, content-gated by
`listingDetailSections.js` — a section exists only when the listing has
real content for it):

| Category | After the description |
|---|---|
| Hotel | Rooms (only with real room units), amenities, house rules, included, property details |
| Apartment / Villa / Guest house | Amenities, house rules, included, space details |
| Restaurant | Menu (only an active one), opening hours, amenities, policies |
| Tour | Itinerary, included, good to know, tour details, amenities, policies |
| Car rental | Vehicle details, included, amenities, rental terms, good to know |
| Attraction | Details, itinerary, included, good to know, opening hours, amenities, policies |
| Entertainment | Availability (sessions first), details, included, good to know, policies, amenities |

Then, for every category: reviews, the place (pickup point for a car),
the company, FAQ.

Not shown, because no structured, current data exists for it: car
pickup / delivery (free text only), event sessions as a schedule,
ticket types, and a per-star review distribution.

## 5. Architecture

| Piece | Job |
|---|---|
| `hooks/useListingDetail.js` | Every query and everything the page shows: localized content and place, category, key facts, rating, features, sections, reservation state. |
| `hooks/useListingDetailSeo.js` | Title, description, canonical slug, social image, JSON-LD (built from the public DTO, so a private stay's JSON-LD is approximate too). |
| `utils/listingDetailSections.js` | Which sections exist, in the category's order. |
| `components/ListingDetailPageContent/*` | Layout only: `ListingDetailPageContent`, `ListingDetailSection`, `ListingHeader`, `ListingGallery` (+ `GalleryStrip`, `GalleryLightbox`, `useGalleryCarousel`), `ListingPartnerSection`, `ListingDetailSkeleton`, `ListingDetailActions`. |
| `components/ListingRating`, `components/ListingPrice` | The rating and price rendering shared by the card and Detail. |

Removed: `ListingHero` (replaced by the gallery and `ListingHeader`).

## 6. Data, privacy and security

- **Public Detail DTO** (`toPublicListingResponse`, API_SPECIFICATION
  §38.2): only what the public page renders. Internal ids, moderation
  state, contact / feature / sitemap flags, lifecycle and audit
  timestamps, the address row id and media upload internals are absent.
  The listing's owner, an assigned Manager or a moderator get the
  management shape.
- **Private stays:** the approximate grid-cell point and no street
  address, everywhere the public sees the place — the page, the map,
  JSON-LD and the network response (verified over HTTP: the stored
  coordinates and street never appear in the body).
- **Reviews:** the public list carries no user id, booking or status, and
  names reviewers "Anna K.". Partner staff are recognised for replies by
  the public company slug, never an internal id.
- **Company:** public identity only (name, logo, verified), never email,
  phone or internal ids.
- **Content:** everything renders as React text; media URLs pass
  `safeMediaUrl` (no `javascript:`, protocol-relative or malformed URLs).
- **Abuse:** a draft is a plain 404; malformed, traversal-shaped,
  SQL-shaped and oversized ids are refused without internals.

## 7. Performance (dev server, demo data)

| Measure | Before | After |
|---|---|---|
| API requests per page (GET) | 11–14, one duplicate (categories) | 12–13, no duplicates |
| Price in the first screen | Never | Desktop: the pinned panel at about 565 px of 900; phone: the fixed bar |
| Title position, desktop / phone | 525 / 377 px | 593 / 430 px (taller, intentional gallery; capped at 48vh) |
| Page length on a phone | 5,549–13,064 px | 3,031–7,881 px |
| CLS, phone / desktop | not measured before | 0.002 / about 0.05 |
| LCP (dev, unminified) | not measured before | 0.67–1.34 s |
| Main bundle (production build) | 1,065.06 kB, gzip 308.35 kB | 1,068.03 kB, gzip 309.29 kB |

Only the lead photo loads eagerly with high priority. Tiles, strip
slides, room thumbnails and lightbox slides load lazily. The phone strip
and the lightbox are separate chunks (`GalleryStrip`, `GalleryLightbox`),
so the carousel library never enters the first-load bundle; while the
strip loads, its lead photo already shows in the same 4:3 frame, so
neither the LCP nor the layout waits for it. The lightbox mounts only
when opened.

Information depth (the closure pass that follows this redesign) is in
`LISTING_DETAIL_INFORMATION_DEPTH.md`: grouped category facts, the tour's
"Meeting and pickup" section, booking rules among the rules, and the new
tour and venue facts.

## 8. Phase 3 — booking / action widget notes

Found during this phase and deliberately left for the widget rebuild:

- The panel and the phone bar show the listing-level price ("$60.00 Per
  night"), while cards show the card price ("From $60 / night"). The two
  agree on the demo data but come from different rules; align them in
  Phase 3.
- Availability is read twice with overlapping ranges (the section's 30
  days, the panel's 6 months).
- The car-rental panel's field labels are uppercase in Armenian
  ("ՍՏԱՑՈՒՄ"), which reads poorly.
- The phone bar's CTA labels are long in RU / HY. They now wrap onto
  their own row; shorter category-aware labels would keep one row.

## 9. Tests

- Web unit: `ListingGallery.test.jsx`, `ListingHeader.test.jsx`,
  `ListingPartnerSection.test.jsx`, `ListingReviewsSection.test.jsx`,
  `listingDetailSections.test.js`, `detailCardDto.test.js`,
  `localizeLocation.test.js`, `listingCardFacts.test.js`
  (`resolveDetailFeatures`), the updated page, reviews and ordering tests.
- API unit: `listingPublicDto.test.js` (exact public field set, media,
  private-stay location, company).
- API integration: `listingDetailPublicDto.test.js` (anonymous / customer
  vs owner shape, private-stay privacy over HTTP, draft 404, malformed
  ids, script-shaped content), `reviews.test.js` (public review shape).
- E2E: `listingDetail.spec.js` — the first screen for all nine
  categories; every category × HY / EN / RU at 390, 430, 768, 1024, 1280,
  1440 and 1920 px (overflow, broken images, booking-bar clipping, console
  errors, failed API calls, serious axe issues; screenshots in
  `apps/web/test-results/visual-qa/listing-detail/`); the lightbox by
  keyboard; private-stay privacy; localized place names; reviewer privacy;
  related listings.
