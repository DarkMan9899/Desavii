# Listing Cards

One Desavii listing card, used on every surface that lists listings. This
document is the contract for what a card shows, why, and what it may
never show.

## One card, three adapters

| Piece | File | Job |
|---|---|---|
| Card | `apps/web/src/components/ListingCard/ListingCard.jsx` | The only listing-card markup and styles. Takes resolved values, never a DTO. |
| Card model | `apps/web/src/utils/listingCardModel.js` | The only place a card DTO becomes card values: title, category label, city, image, facts, rating, price, `topRated`. |
| Category facts | `apps/web/src/utils/listingCardFacts.js`, `categoryCardConfig.js`, `buildCategoryCardMeta.js` | Each category's fact priorities, the real facts a listing has, and the price basis. |
| Card facts (API) | `apps/api/src/modules/listings/repositories/listingCardMetadataSql.js`, `apps/api/src/modules/listings/dto/listingCardFactsDto.js` | The one SQL fragment and response shape for card facts, shared by Search (list and map), the advertising feeds, Favorites and the Company profile. |
| Feed adapter | `apps/web/src/modules/search/components/SearchResultCard/SearchResultCard.jsx` | Public feeds (`GET /search`, advertising placements): link with booking context, badge, favourite button, impression and click analytics. |
| Favorites adapter | `apps/web/src/modules/favorites/components/FavoriteListingCard/FavoriteListingCard.jsx` | The traveller's saved listings (`GET /favorites`). |
| Map adapter | `apps/web/src/modules/search/components/SearchMap/MapListingPreview.jsx` | The Search map's selected-pin preview (compact layout). |

Surfaces: Search results and map, Category and Destination pages
(including the TOP row), Company profiles, the Home featured and
"New on desavii" rails, Related listings, Favorites and the account
dashboard. Removed in this phase: `FeaturedListingCard` (Home),
`ListingCardBase` and the map preview's own markup.

## Layouts

- **grid** (default): the image first at the locked 4:3 ratio, with the
  badge and the favourite, then the decision layer — the title in the
  display face (two lines at most), category · city, the rating row, up
  to three icon facts, and a footer with the price and a ringed arrow
  cue. Footers sit on the card's bottom edge, so cards in a row share a
  height. Rails set only the width; the card never changes shape for a
  context.
- **compact**: image beside text, the same decision layer with the two
  most decisive facts, and an explicit "Learn more" link instead of the
  whole-card link. Used by the map preview only.

There is no per-category colour, chip tint or layout: the category reads
from its label, facts and price basis.

## What a card shows

A traveller should be able to tell whether a listing is likely relevant
before opening it, without the card becoming a table. Order: image →
badge → title → category · city → rating → facts → price → favourite /
open.

| Field | Rule |
|---|---|
| Category | The precise category ("Villa", "Car rental"), from `listingCard.category.<key>`; falls back to the listing type. |
| City | The public city name only. Never a street address or coordinates. Category · city wraps rather than truncates, so a long category name never hides the city. |
| Title | Trimmed; an empty title reads "Untitled listing". Rendered as text, never HTML. |
| Image | `cover_image_url` through `safeMediaUrl` (root-relative path or http(s) only). Lazy and async by default; only the first, likely-LCP card loads eagerly with high fetch priority. A missing or broken image shows generated `DestinationArt`, never a blank box. Decorative (`alt=""`): the title names the card. |
| Photo count | Shown when there are two or more photos, spoken as "N photos". |
| Rating | Every card has a rating row. With at least one approved review: a gold star, the average to one decimal and the approved-review count ("★ 4.5 · 2 reviews"), spoken as one sentence ("Rated 4.5 out of 5 from 2 reviews"). Without one: "No reviews yet" with an outline star — never 0.0 or empty stars. The "Top guest rating" badge is a separate rule (below). |
| Facts | Up to three (`CARD_FACT_LIMIT`), icon and text, in the category's own priority order (table below). Only values the listing really stored, only while they apply to its category; a value with no translation is skipped, never shown as a code. |
| Price | See below. |

## Facts per category

`categoryCardConfig.js` lists each category's facts, most decisive first;
the card shows the first three the listing has. Attribute values come
from the listing's category attributes, amenities from its card-worthy
amenities (`CARD_AMENITY_CODES`: everyday amenities such as WiFi are left
out because nearly every listing has them). Labels and icons are the ones
Listing Detail uses.

| Category | Priority |
|---|---|
| Hotel | Stars, breakfast included, pool, spa, airport shuttle, parking, pet friendly |
| Apartment | Up to N guests, bedrooms, kitchen, breakfast included, pool, washing machine, dedicated workspace, parking, pet friendly |
| Villa | Up to N guests, bedrooms, pool, jacuzzi, sauna, fireplace, terrace, garden, BBQ, parking, pet friendly |
| Guest house | Up to N guests, bedrooms, breakfast included, garden, kitchen, parking, family friendly |
| Restaurant | Cuisines (two at most, one fact), free table booking (only with a real, undeleted table), outdoor seating, live music, private dining room, kids menu, parking. The average spend is the price line. |
| Tour | Duration, private / small group, languages (named up to two, else a count), up to N people, family friendly, wheelchair accessible |
| Car rental | Transmission, seats, body type, fuel, child seat, GPS navigation, winter tyres. Never guests, nights or bedrooms. |
| Attraction | Type, duration, guided / self-guided, languages, family friendly, wheelchair accessible, parking |
| Entertainment | Venue type, duration, minimum age, languages, family friendly, wheelchair accessible, parking |

Not shown because no structured, current data exists for a card yet:
car pickup / delivery (free text only), event sessions and dates
(availability is per day, not a schedule), ticket types.

## Price

The amount comes from the API's shared `listingCardPriceSql.js`
(`CARD_PRICE_SELECT`), used by Search, the advertising feeds, Favorites
and the Company profile, so the same listing shows the same price
everywhere:

- the cheapest unit base price when all priced units share one currency;
- otherwise the listing-level price, only when no unit has a price;
- otherwise no price.

Wording:

| Listing | Card reads |
|---|---|
| Hotel, apartment, villa, guest house | From AMD 42,000 / night |
| Tour, attraction, entertainment | From AMD 15,000 / person |
| Car rental | From AMD 25,000 / day |
| Restaurant | Avg. AMD 9,000 / person (average spend; reserving is free) |
| A pricing model with no basis (legacy per-hour) | From AMD 5,000 |
| No amount, a negative or malformed amount, or no currency | Price not listed |

The basis is the listing's own pricing model where it has one, else the
category default. AMD amounts render through `Money` (converted to the
visitor's currency); any other stored currency renders as stored.

## Badges

One badge at most, in this order:

| Badge | Tone | When |
|---|---|---|
| TOP | navy, gold label | A paid TOP placement, set only by a caller rendering a promotions feed (`highlight="top"`). Spoken as "TOP (promoted listing)". |
| Top guest rating | white, gold hairline | Average ≥ 4.5 (`TOP_RATING_MIN`, the top step of the Search guest-rating filter) from ≥ 3 approved reviews (`TOP_RATING_MIN_REVIEWS`). |
| New | white, grey hairline | The Home featured rail's newest-per-category fill only (`highlight="new"`). |

No other badge exists. Nothing is labelled "popular", "guest favourite"
or "deal" without a product rule behind it.

## Semantics and interaction

- An `<article>` named by its title (`aria-labelledby`).
- The title's link is the card's only link and stretches over the whole
  card (`::after`): click anywhere, middle-click or open in a new tab, one
  tab stop, an accessible name that is just the title.
- The favourite button sits above the link, never inside it (no nested
  interactive elements). It renders only for a signed-in traveller.
- Keyboard focus draws a 2px royal-blue ring around the whole card.
- Hover (only on devices that can hover) and focus lift the card one
  spacing step, ease the photo in and fill the arrow cue: transform,
  opacity and colour only. Nothing moves under `prefers-reduced-motion`.
- The map preview's title is focusable (`tabindex="-1"`) so the map can
  move focus to it when a pin opens the preview.

## Security

- Cards render only fields the public card DTOs return
  (`apps/api/src/modules/search/dto/searchDto.js`,
  `apps/api/src/modules/favorites/dto/favoriteDto.js`), and the card
  model reads a fixed whitelist of those. Hiding a field in the UI is
  never relied on: anything that must stay private is never in the DTO.
- Public feeds return published, visible listings only
  (`listingVisibilitySql.js`); an anonymous request cannot widen that
  with `status` or `partnerId` parameters.
- `GET /favorites` requires a signed-in user and returns only that
  user's own rows.
- Map pins for private stays use approximate coordinates; the preview
  says "approximate location".
- All text renders as React text (no `dangerouslySetInnerHTML`); media
  URLs pass `safeMediaUrl`.
- Malformed listing ids and invalid query parameters return 4xx without
  internal details.

The public card DTO is minimal: it no longer sends `partner_id`,
`status`, `summary`, `city_id` or `country_id`, which no public consumer
used. `created_at` stays because the sitemap build uses it as `lastmod`,
which `sitemap.xml` already publishes. Only the owner view (the listing's
own partner, or an admin/moderator) gets `status` and the lifecycle
fields. Tests pin the exact field set (see Tests).

## Tests

- `apps/web/src/utils/listingCardModel.test.js` — price wording per
  category, unlisted prices, the rating and Top guest rating rules,
  category labels, fact limit, untitled and script-shaped titles, the
  field whitelist, `safeMediaUrl`.
- `apps/web/src/utils/listingCardFacts.test.js` — the facts each of the
  nine categories shows, the three-fact limit and priority order, missing,
  zero and untranslated values, car rentals never showing guest facts,
  shared icons, Russian plurals and Armenian labels.
- `apps/web/src/components/ListingCard/ListingCard.test.jsx` — decision
  order, the rating row and its spoken sentence, the no-review state, the
  single link, the favourite outside the link, image loading,
  broken-image fallback, badge speech, missing data, the compact layout.
- `apps/api/tests/unit/modules/listings/listingCardMetadataSql.test.js`
  and `apps/api/tests/integration/search/searchListingCardMetadata.test.js`
  — the card-facts SQL: no bound parameters, category applicability for
  attributes and amenities, card-worthy amenities only, reservable only
  with an undeleted table, and the row mapper.
- `apps/web/tests/e2e/listingCards.spec.js` — all nine categories (precise
  label, truthful price, title before category, the rating row against the
  API's approved-review count, at most three facts, no guest wording on
  car rentals; the facts shown are written to `facts-<category>.json`);
  every category at 390 px in HY and RU (no overflow, no serious axe
  issue); Search and a Category page with its TOP row in
  HY / EN / RU at 390, 430, 768, 1024, 1280, 1440 and 1920 px (one link
  per card, no overflow, no console errors); keyboard focus and Enter;
  the signed-in favourite toggle; and the API boundary checks above.
  Screenshots: `apps/web/test-results/visual-qa/listing-cards/`.
- The Home rail, Favorites and the map preview keep their own unit and
  e2e tests (`FeaturedListings.test.jsx`, `home.spec.js`,
  `MapListingPreview.test.jsx`, `SearchMapPanel.test.jsx`).
