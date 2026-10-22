# Partner Listing Wizard — Field-Gap Research and Domain Proposal

Phase A of the Partner Listing Creation Wizard rebuild (2026-10-22):
current-repo inventory, competitor/industry research per category, the
field-gap matrix, and the domain/Wizard proposal the implementation follows.

Evidence classes used throughout:
**A** Desavii domain requirement · **B** multiple-marketplace pattern ·
**C** booking requirement · **D** search/discovery · **E** safety/legal/
accessibility · **F** partner operations · **G** nice-to-have only.

---

## 1. Sources reviewed

| Area | Source (official unless noted) | What it established |
| --- | --- | --- |
| Accommodation | [Booking.com Facilities API](https://developers.booking.com/connectivity/docs/content-api-modules/facilities-api/introduction-to-facilities-api) | Facilities live at property **and** room level; some carry details (parking instances); bathrooms are their own resource. |
| Accommodation | [Booking.com Property Settings](https://developers.booking.com/connectivity/docs/content-api-modules/property-details-api/property-settings-api-self-assessment-tutorial) | Structured policies: pets, smoking, children (`allow_children` + `min_age`), damage deposit, check-in/out on the property. |
| Accommodation | [Airbnb — standard house rules](https://airbnb.com/help/article/2894) | Fixed-option rules: pets, events/parties, smoking, quiet hours, check-in/out times, max guests; free-text extra rules. |
| Accommodation | Airbnb host guides (third-party: [Guesty](https://www.guesty.com/blog/step-by-step-guide-how-to-list-on-airbnb/)) | Space type (entire place / private room / shared room); bedrooms, beds, bathrooms; bathroom privacy. |
| Accommodation | [schema.org LodgingBusiness](https://schema.org/LodgingBusiness) | `availableLanguage`, `checkinTime`, `checkoutTime`, `petsAllowed`, `starRating`, `numberOfRooms`, `amenityFeature`. |
| Restaurants | [Google Business Profile attributes](https://support.google.com/business/answer/9049526) | Structured accessibility (wheelchair entrance/restroom/seating/parking), amenities, payments, dining options. |
| Restaurants | OpenTable listing pages ([example](https://www.opentable.com/restaurant-gordon-ramsay)); [OpenTable profile guidance](https://restaurant.opentable.com/resources/value-opentable-profile/) | Dining style, cuisines, dress code, payment options, parking details, private dining capacity. |
| Restaurants | [schema.org Restaurant](https://schema.org/Restaurant) | `servesCuisine`, `acceptsReservations`, `priceRange`, `hasMenu`, opening hours. |
| Tours | [GetYourGuide — Describing your product](https://supply.getyourguide.support/hc/en-us/articles/13980969821469-Describing-your-product) | Short/full description, 3–5 highlights, inclusions/exclusions, guide type, food & drinks (+ dietary), transportation, not suitable for, not allowed, what to bring, know before you go. |
| Tours | [GetYourGuide — Creating a new product](https://supply.getyourguide.support/hc/en-us/articles/13980977168413-Creating-a-new-product); [itineraries](https://supply.getyourguide.support/hc/en-us/articles/14198398866077-Creating-and-editing-an-itinerary) | Category first; meeting point & pickup per option; itinerary optional but valuable. |
| Tours / attractions | [Viator Partner API](https://docs.viator.com/partner-api/merchant/technical/) (+ [spec mirror](https://api.apis.guru/v2/specs/viator.com/1.0.0.json)) | Supplier-defined age bands with min/max travelers; per-person vs per-group/vehicle pricing; booking cutoff; free-sale vs on-request. |
| Activities | Klook onboarding (third-party summaries) | Meeting point, language, inclusions and per-listing cancellation terms are buyer-critical. |
| Car rental | [Turo — distance limits](https://help.turo.com/en_us/distance-limits-and-additional-distance-SkWUrEgVc.md); [trip costs](https://help.turo.com/en_us/trip-costs-Syxm4NeNq.md); [driver eligibility](https://help.turo.com/en_us/age-requirements-for-drivers-HJXlV4l45.md) | Daily distance limit or unlimited; young-driver rules; minimum age per country. |
| Car rental | ACRISS/SIPP ([acriss.org FAQ](https://www.acriss.org/travel-industry/faqs/), [Sixt](https://www.sixt.co.uk/faqs/acriss-code)) | Industry vehicle classification: class, **body type**, transmission/**drive**, fuel/air-con; renters book a class "or similar". |
| Entertainment | [Eventbrite — organizing an event](https://www.eventbrite.com/help/en-us/articles/454084/) | Event type/category, age limits, refund window, per-slot tickets. |
| Entertainment | Fever venue pages ([example](https://feverup.com/immersive/624265)) | Minimum age and accompaniment rules, accessibility notes, time-slot changes, duration incl. check-in. |

Research was complete for every category. Official supplier documentation
is gated behind partner logins for Booking.com Extranet, Viator, Klook and
Fever; where only third-party or public-listing evidence existed it is
marked as such above and no field rests on a single competitor.

---

## 2. Current-repo inventory (traced, not just the visible form)

**Pipeline.** `listing_categories` → `categoryListingTypeMapping.js`
(hotels → HOTEL; apartments/villas/guest-houses → PROPERTY; restaurants →
RESTAURANT; tours → TOUR; car-rentals → CAR_RENTAL; attractions and
entertainment-venues → ATTRACTION) → `listingTypeBookableUnitTypes.js`
(HOTEL_ROOM / PROPERTY_UNIT / RESTAURANT_TABLE / TOUR_DEPARTURE / VEHICLE;
ATTRACTION uses TOUR_DEPARTURE) → `bookableUnitTypeToBookingType.js`.
Restaurant reservations are payment-exempt (`bookingPaymentRequirement.js`).

**Taxonomy (DB, seeded idempotently by `seeds/006`, `seeds/007`).**
Attribute engine supports INTEGER / DECIMAL / BOOLEAN / STRING / DATE /
ENUM / MULTI_ENUM; per-category applicability and `is_required`; labels by
code in the web locales; amenities are DB-translated with per-category
applicability (`amenity_category_applicability`, enforced server-side).

| Category | Attributes today | Policies today | Pricing |
| --- | --- | --- | --- |
| hotels | star_rating, property_style, total_rooms | pets, smoking, children, **cancellation\***, **check-in\***, **check-out\*** | PER_NIGHT |
| apartments / villas / guest-houses | bedrooms, bathrooms, beds, max_guests, view_type, floor_area_sqm | same as hotels | PER_NIGHT |
| restaurants | cuisine (6 options), price_tier | smoking, children | PER_PERSON (free reservation) |
| tours | duration_minutes, difficulty, max_group_size, languages_offered (EN/HY/RU), meeting_point_type | **cancellation\***, children | PER_PERSON |
| car-rentals | transmission, seats, fuel_type, doors, luggage_capacity, min_driver_age, mileage_policy | smoking, **cancellation\*** | PER_DAY |
| attractions | duration_minutes, languages_offered, max_group_size | children | PER_PERSON |
| entertainment-venues | duration_minutes, max_group_size | children | PER_PERSON |

\* required at publish.

**Units (rooms).** `bookable_units`: capacity (inventory), max guests, bed
configuration (10 bed types incl. extra bed/child bed/crib), room size,
bathroom type, view, smoking, meal plan, hourly stays; departures carry
time slots. **Rich content:** highlights, itinerary steps, included/not
included, FAQs — per language. **Restaurant extras:** menus and opening
hours (own pages). **Publish readiness** (`ListingService.
#checkPublishReadiness`): a translation, ≥1 image, coordinates, required
attributes/policies, ≥1 bookable unit, a supported pricing model.

**Wizard today: 11 steps** — Category, Basic Information, Location,
Details, Amenities, Gallery, Pricing, Availability, Policies, Content,
Review. URL-persisted (`?step`, `?listingId`, `?categoryId`,
`?contentLocale`), listing created at Basic Information, per-step PATCH
autosave, edit = the same Wizard with `?listingId=` (create/edit parity by
construction), category immutable after creation.

---

## 3. Cross-category findings (verified in the running app)

| # | Finding | Severity | Evidence |
| --- | --- | --- | --- |
| X1 | **The Wizard never sets a city.** Location collects only a map pin; `cityId` stays null for every Wizard-created listing, so Search's destination filter never matches it, cards/map preview show no city, Listing Detail shows no "City, Country". A city source now exists (`GET /search/destinations`). | **Critical** | A, D |
| X2 | Only 8 cities are seeded — Garni, Tatev, Tsaghkadzor, Kapan, Sisian, Stepanavan, Ijevan, Areni, Yeghegnadzor… have no correct choice, though most tours/attractions are there. | High | A, D |
| X3 | No street address is collected for public venues (hotels, restaurants, attractions, entertainment, car pickup) — the `addresses` table exists but is unused by the Wizard. | High | B, C |
| X4 | Content step offers **Itinerary** to hotels, properties, restaurants and cars (category leakage). | Medium | A |
| X5 | Structured facts end up in free-text FAQs (demo data: check-in time, breakfast, pets, parking, cancellation) because structured fields are missing or scattered. | Medium | A, D |
| X6 | Paid attractions/entertainment bookings carry **no cancellation policy** (tours and cars require one; same booking type as tours). | High | C, E |
| X7 | Progress bar at 1440px is cut after step 8 — Policies/Content/Review not visible; forms span the full content width. | Medium | UX |
| X8 | Pricing and Availability are two steps for one decision (what is sold, at what base price, under which booking rules); room/unit prices already live on units. | Medium | UX |

---

## 4. Per-category checkpoint

### 4.1 Hotels
- **Current:** star rating, property style, total rooms; 35 amenities (property + in-room mixed in one list); pets/smoking/children/cancellation/check-in/out; rooms with beds, size, bathroom, view, smoking, meal plan, hourly.
- **Missing, high value:** city + street address (X1–X3, A/B/D); languages spoken (B: Booking.com, schema.org `availableLanguage`; D for HY/RU/EN market); parties/events rule (B: Airbnb, Booking.com house rules); property services as amenities — 24-hour front desk, restaurant, bar, room service, luggage storage, spa, laundry service (B: Booking.com facilities).
- **Improve:** amenities shown grouped (property vs in-room already exist as groups) with group headings; check-in/out times stay required.
- **Remove/merge:** none — `Breakfast Included` amenity overlaps room meal plans; kept (Search filter) and documented as "any room includes breakfast".
- **Not worth adding now:** brand/chain (G), reception hours (G — 24-hour desk amenity covers the decision), payment methods (product decision, §8), damage deposit (product decision), quiet hours (G).
- **Search-worthy:** star rating, property style, amenities, meal plan (existing); none new.
- **Booking-worthy:** rooms, occupancy, beds, meal plan, check-in/out, cancellation, children, booking rules.
- **Detail-worthy:** all of the above + languages spoken (primary fact), parties rule (policy).
- **Required:** title, city, pin, ≥1 photo, ≥1 room, cancellation, check-in/out. **Optional:** everything else. **Conditional:** street address shown publicly (exact category).
- **Sections:** Basics · Location · Details · Amenities · Photos · Rooms & pricing · Policies · Guest information · Review.

### 4.2 Apartments · 4.3 Villas · 4.4 Guest houses (PROPERTY)
- **Current:** bedrooms, bathrooms, beds, max guests, view, floor area; amenities per category; same policies as hotels; units.
- **Missing, high value:** **space type** — entire place / private room / shared room (B: Airbnb; D: core accommodation filter; especially guest houses, which are usually private rooms); check-in method — in person / self check-in (B: Airbnb; F); languages spoken (B); parties/events rule (B: Airbnb; E: villas); amenities — dedicated workspace, TV, heating, dishwasher, hair dryer, iron (apartments/villas/guest houses as applicable) (B).
- **Differences:** villas keep outdoor/wellness amenities (pool, sauna, jacuzzi, BBQ, garden, terrace); guest houses keep garden/kitchen/breakfast; apartments keep elevator/EV charger.
- **Privacy:** exact address never public for private stays (Search map already approximates; Listing Detail exact pin remains tracked privacy debt).
- **Not worth adding now:** security deposit (product decision), floor number (G — elevator amenity covers accessibility), infants count (G — children policy + crib bed type cover it).
- **Search-worthy:** space type (new filter), bedrooms/beds/max guests (existing).
- **Required:** as hotels; space type optional (legacy listings have none).

### 4.5 Restaurants
- **Current:** cuisine (6 options), price tier; smoking/children; menus and opening hours (own pages); free reservations (payment-exempt, no cancellation needed — correct).
- **Missing, high value:** dietary options — vegetarian, vegan, gluten-free, halal, kosher (B: Google, Tripadvisor "special diets"; D); dining style — fine dining, casual dining, café, bistro, wine bar, pub, fast casual (B: OpenTable; D); cuisine coverage — Middle Eastern, Russian, French, Japanese, Chinese, Indian, American, Fusion, Seafood, Steakhouse (D: 6 options cannot describe Yerevan's market); seating capacity (B: OpenTable private-party capacity; F); dress code (B: OpenTable; G-leaning, detail only); amenities — private dining, takeaway, kids menu, highchairs (B: Google/OpenTable).
- **Not worth adding now:** delivery (no Desavii product direction), paid reservations/deposits (not supported by booking model), payment methods (product decision).
- **Search-worthy:** cuisine (existing), price tier (existing), dietary options (new), dining style (new).

### 4.6 Tours
- **Current:** duration, difficulty, max group size, languages (EN/HY/RU only), meeting point type; cancellation required; departures; itinerary; included items.
- **Missing, high value:** tour format — private / shared (B: Viator per-group vs per-person options, GetYourGuide options; D); minimum age (B: Viator age bands; E); minimum group size (B: Viator min travelers; F: operator guarantee); pickup details when hotel pickup is offered (B: GetYourGuide "meeting point & pickup" — **conditional** on meeting_point_type = HOTEL_PICKUP); wider guide languages — FR, DE, IT, ES, FA, AR, ZH (D).
- **Keep as free text (already structured lists):** inclusions/exclusions, what to bring, know-before-you-go (GetYourGuide treats these as bullet lists, not taxonomy).
- **Not worth adding now:** per-group pricing (PER_PERSON only is supported by the booking engine — §7), optional extras (no add-on model).
- **Search-worthy:** tour format (new), languages, difficulty, duration (existing).

### 4.7 Car rentals
- **Current:** transmission, seats, fuel type, doors, luggage, min driver age, mileage policy; smoking/cancellation; one VEHICLE unit; PER_DAY.
- **Missing, high value:** body type — sedan, hatchback, SUV, minivan, van, pickup, coupe, convertible, wagon (B: ACRISS/SIPP 2nd letter; D); drive type — 2WD / 4WD-AWD (B: ACRISS 3rd letter; D: Armenian mountain roads); make, model, year (B: Turo; detail primary fact; free text for make/model, number for year); daily distance limit in km — **conditional** on mileage_policy = LIMITED (B: Turo distance limits); fuel policy — full-to-full / same-to-same (B: rental-supplier standard; C: guest charge expectation); minimum licence years (B; E); amenities — GPS/navigation, Bluetooth/CarPlay, child seat available, winter tyres (B).
- **Not worth adding now:** engine power, colour (no guest value); one-way returns, delivery, extra driver fees (no booking-model support); deposit and insurance (product decision).
- **Search-worthy:** body type, drive type (new); transmission, seats, fuel (existing).

### 4.8 Attractions
- **Current:** duration, languages, max group size; children; sessions (TOUR_DEPARTURE); no cancellation.
- **Missing, high value:** attraction type — museum, historic site, religious site, nature, park, gallery, landmark/viewpoint, winery (B: Tripadvisor/Klook categories; D); visit format — guided / self-guided / both (B: GetYourGuide guide information); setting — indoor / outdoor / mixed (B; weather expectation); minimum age (B; E); **cancellation policy, required** (X6; C/E).
- **Not worth adding now:** visitor capacity (operational — session capacity already models it), photography rules (free text in Guest information).
- **Search-worthy:** attraction type (new).

### 4.9 Entertainment venues
- **Current:** duration, max group size; children; sessions; no type, no age rule, no cancellation.
- **Missing, high value:** venue type — escape room, bowling, VR arena, karting, arcade, billiards, theatre, cinema, club (B: Fever/Eventbrite categories; D); minimum age (B: Fever; E); setting — indoor/outdoor/mixed; languages offered (escape rooms/shows; B); **cancellation policy, required** (X6).
- **Not worth adding now:** private events (G — FAQ), dress requirements (free text).
- **Search-worthy:** venue type (new).

---

## 5. Field-gap matrix (new and changed fields)

Legend — Exists: N new · P partial. Struct: B boolean · E enum · M multi ·
I integer · S string. Req: Y/N/C (conditional). Search: filter yes/no.
Detail: PF primary fact · AM amenity · PO policy · SP specification.

| Cat | Field | Exists | Struct | Req | Search | Detail | Booking | Moderation | Evidence | Value | Action |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| all | city (`cityId`) | P (DB, not Wizard) | E (FK) | **Y** (publish) | yes (destination) | PF | — | yes | A, D | HIGH | IMPROVE: Wizard select + publish rule |
| all exact | street address | P (table unused) | S | N | no | PF (exact categories only) | — | yes | B, C | HIGH | ADD NOW |
| all | coordinates | yes | GEO | Y | map | map | — | yes | A | HIGH | KEEP |
| hotels+PROPERTY | languages_spoken | N | M | N | no | PF | — | yes | B, D | MEDIUM | ADD NOW |
| hotels+PROPERTY | parties_allowed | N | B (policy) | N | no | PO | yes (rules) | yes | B, E | MEDIUM | ADD NOW |
| PROPERTY | space_type | N | E | N | **yes** | PF | yes (expectation) | yes | B, D | HIGH | ADD NOW |
| PROPERTY | check_in_method | N | E | N | no | PF | — | yes | B, F | MEDIUM | ADD NOW |
| hotels | 7 service amenities | N | AM | N | yes (amenity) | AM | — | — | B | MEDIUM | ADD NOW |
| PROPERTY | 6 home amenities | N | AM | N | yes (amenity) | AM | — | — | B | MEDIUM | ADD NOW |
| restaurants | cuisine options (+10) | P | M | N | yes | PF | — | yes | D | HIGH | IMPROVE |
| restaurants | dietary_options | N | M | N | **yes** | PF | — | yes | B, D | HIGH | ADD NOW |
| restaurants | dining_style | N | E | N | **yes** | PF | — | yes | B, D | MEDIUM | ADD NOW |
| restaurants | seating_capacity | N | I | N | no | SP | — | yes | B, F | LOW-MEDIUM | ADD NOW |
| restaurants | dress_code | N | E | N | no | PO | — | yes | B | LOW | ADD NOW (optional) |
| restaurants | 4 service amenities | N | AM | N | yes | AM | — | — | B | MEDIUM | ADD NOW |
| tours (+entertainment) | languages_offered options (+7) | P | M | N | yes | PF | — | yes | D | MEDIUM | IMPROVE |
| tours | tour_format | N | E | N | **yes** | PF | yes (expectation) | yes | B, D | HIGH | ADD NOW |
| tours/attr/ent | min_age | N | I | N | no | PO | yes (eligibility) | yes | B, E | HIGH | ADD NOW |
| tours | min_group_size | N | I | N | no | SP | yes (operation) | yes | B, F | MEDIUM | ADD NOW |
| tours | pickup_details | N | S | **C** (meeting_point_type = HOTEL_PICKUP) | no | PF | yes | yes | B | MEDIUM | ADD NOW (conditional) |
| car-rentals | body_type | N | E | N | **yes** | PF | — | yes | B, D | HIGH | ADD NOW |
| car-rentals | drive_type | N | E | N | **yes** | SP | — | yes | B, D | MEDIUM | ADD NOW |
| car-rentals | vehicle_make / vehicle_model | N | S | N | no | PF | — | yes | B | HIGH | ADD NOW |
| car-rentals | vehicle_year | N | I | N | no | SP | — | yes | B | MEDIUM | ADD NOW |
| car-rentals | daily_distance_limit_km | N | I | **C** (mileage_policy = LIMITED) | no | PO | yes (charges) | yes | B, C | HIGH | ADD NOW (conditional) |
| car-rentals | fuel_policy | N | E (policy) | N | no | PO | yes | yes | B, C | HIGH | ADD NOW |
| car-rentals | min_license_years | N | I | N | no | PO | yes (eligibility) | yes | B, E | MEDIUM | ADD NOW |
| car-rentals | 4 vehicle amenities | N | AM | N | yes | AM | — | — | B | MEDIUM | ADD NOW |
| attractions | attraction_type | N | E | N | **yes** | PF | — | yes | B, D | HIGH | ADD NOW |
| attractions | visit_format | N | E | N | no | PF | — | yes | B | MEDIUM | ADD NOW |
| attr/ent | setting (indoor/outdoor/mixed) | N | E | N | no | PF | — | yes | B | MEDIUM | ADD NOW |
| entertainment | venue_type | N | E | N | **yes** | PF | — | yes | B, D | HIGH | ADD NOW |
| entertainment | languages_offered | N (for category) | M | N | no | PF | — | yes | B | MEDIUM | ADD NOW |
| attr/ent | cancellation_policy | N (for category) | E (policy) | **Y** | no | PO | yes | yes | C, E | HIGH | ADD NOW |
| content | itinerary (non-itinerary categories) | yes | list | N | no | — | — | — | A | — | MAKE CONDITIONAL (tours, attractions, entertainment only) |
| all | brand/chain, quiet hours, colour, engine power, delivery, extra driver, private events | N | — | — | — | — | — | — | G | LOW | DO NOT ADD |
| all | payment methods, security/damage deposit, licence/permit numbers, paid restaurant reservations | N | — | — | — | — | — | — | product | — | DO NOT ADD (§8 product decisions) |

Existing fields not listed are **KEEP** (verified wired DB → API → Wizard →
Edit → Detail; search-enabled where the filter catalog already offers them).

---

## 6. Wizard information architecture

**Old: 11 steps. New: 10 steps.**

| # | Step | Contents | Category-aware |
| --- | --- | --- | --- |
| 1 | Category | card picker (pre-creation only; immutable after) | — |
| 2 | Basic information | title, summary, description per language (creates the listing) | — |
| 3 | Location | **city** (required) · **street address** · map pin · privacy note for private stays | address public only for exact categories |
| 4 | Details | category attributes, with **conditional fields** | per category |
| 5 | Amenities | grouped catalog for the category | per category |
| 6 | Gallery | photos, cover, order, alt text | — |
| 7 | **Booking & pricing** | rooms/units/departures/vehicle · base price · booking rules · blackout dates | unit type per listing type |
| 8 | Policies | house/booking rules, cancellation | per category |
| 9 | Guest information | highlights, **itinerary (tours/attractions/entertainment only)**, included/not included, FAQs | itinerary gated |
| 10 | Review & publish | readiness, translations, publication period | — |

**Why 10:** Pricing and Availability merge into one "Booking & pricing"
step — both answer "what exactly is sold, at what base price, under which
rules" and unit prices already live on units (X8). Category stays its own
step (a card choice that fixes the listing type before anything is
created). Details and Policies stay separate: facts guests filter on vs.
rules they agree to. Guest information stays late and optional.
Blackout dates stay in the Wizard until the Calendar phase owns them
(the partner Calendar has no blackout editing yet).

**Conditional fields** are data, not frontend code: an applicability row
can name a controlling attribute and value (`depends_on_attribute_code`,
`depends_on_option_code`). The API returns it in metadata, the Wizard
shows the field only when the condition holds, and the service clears a
dependent value whose condition no longer holds — so a hidden value can
never reach Search, Booking or Detail.

---

## 7. Booking semantics per category (Wizard produces → Calendar consumes)

| Category | Booking mode | Date mode | Quantity | Capacity | Availability | Price | Cancellation |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Hotels | instant/confirm | date range (nights) | rooms | room max guests | per room type inventory | per night (room base price; listing fallback) | policy (required) |
| Apartments / villas / guest houses | instant/confirm | date range (nights) | units | unit max guests | per unit | per night | policy (required) |
| Restaurants | free reservation | date + time | party | table capacity | opening hours + tables | none charged | none (payment-exempt) |
| Tours | paid | date + departure | people | departure capacity, group min/max | departures | per person | policy (required) |
| Car rentals | paid | date range (days) | 1 vehicle | seats | single vehicle | per day | policy (required) |
| Attractions / entertainment | paid | date + session | people | session capacity | sessions | per person | policy (**required — new**) |

**Wizard produces for Calendar:** unit/departure/vehicle records with
capacity, time slots and base prices; booking rules (min/max stay or
rental days, advance-booking min hours/max days); blackout ranges;
cancellation policy; tour `min_group_size`; car `daily_distance_limit_km`,
`fuel_policy`. **Calendar later consumes:** the same unit ids, capacities,
rules and blackouts — no calendar logic is added to the Wizard.

---

## 8. Product decisions (flagged, not invented)

1. **Cancellation required for attractions and entertainment** — taken:
   required, like tours (same paid booking type). Existing published
   listings are unaffected until their next publish/renewal.
2. **City required at publish** — taken: required (Search destinations,
   cards, Detail depend on it). Existing listings without a city are asked
   for one at their next publish/renewal; no automatic backfill guesses a
   city.
3. **Street address visibility** — taken: shown publicly only for
   exact-location categories; private stays keep it owner/admin-only,
   consistent with the Search map privacy policy.
4. **Not decided — not added:** payment methods accepted on site,
   security/damage deposits, insurance, licence/permit numbers, paid
   restaurant reservations, per-group tour pricing, zero-price semantics
   (open since Step L4).

---

## 9. Delivery and compatibility

- **Taxonomy** (attributes, options, amenities, policies, filter
  definitions, cities) follows the repo's established path: idempotent
  seed upserts (`seeds/002`, `seeds/006`, `seeds/007`) — run
  `npm run db:seed --workspace apps/api` after deploying.
- **Schema:** one migration adds the nullable conditional-applicability
  columns; nothing is dropped or rewritten.
- **Legacy listings:** every new field is optional except the two
  publish rules in §8, which apply only at the next publish/renewal.
  Existing values, units, prices and search results are unchanged.
- **Out of scope here (tracked):** Listing Detail exact pin for private
  stays; Listing Detail UTC/Yerevan calendar 422 (00:00–04:00); ~30
  browser-native date screens; repo-wide dependency audit.

---

## 10. Implementation notes

- **Step URLs:** `?step=pricing` and `?step=availability` (bookmarks,
  in-flight drafts) resolve to `?step=booking`
  (`wizardSteps.js` `LEGACY_STEP_IDS`).
- **Progress bar (X7):** `WizardProgress` uses a container query on its
  own width. When it is at least the laptop breakpoint wide, every step
  gets an equal column with its label wrapped under its number. When
  narrower, it is one scrolling row with the current step scrolled into
  view.
- **Itinerary (X4):** only `TOUR` and `ATTRACTION` listing types
  (attractions and entertainment venues) render or save an itinerary.
- **Search filters:** the new filter definitions (space type, dietary
  options, dining style, tour format, attraction type, venue type, body
  type, drive type) are data-driven. They appear in Search only once
  published listings carry those values. The demo dataset predates them,
  so it does not show them yet.
- **Superseded files:** `steps/PricingStep.jsx`, `steps/AvailabilityStep.jsx`
  and their tests are no longer imported by the Wizard. Their behaviour
  and tests moved to `steps/BookingStep.jsx`,
  `BookingStep.pricing.test.jsx` and `BookingStep.availability.test.jsx`.
  They are left for the owner to remove, because the project rules forbid
  deleting files without an explicit instruction.
- **Private address default:** `toListingResponse` withholds a private
  stay's street address unless a caller opts in
  (`includePrivateAddress: true`). Only callers already authorized to
  manage the listing opt in: the owner/moderator read of
  `GET /listings/:id`, the owner's own mutation responses, and the admin
  detail. No public read discloses it: by id or slug, as a customer, in
  the plain list, in Search, or on the partner page (integration-tested).
- **Concurrent creation:** creating a listing used to run replace-style
  `DELETE`s on the brand-new id. Their gap locks deadlocked two Partners
  creating at the same moment (500, reproduced on HEAD e03e120: 70 of 80
  parallel creates). Creation now inserts category, amenity and option
  links without the `DELETE` (`insertCategoryLinks`, `insertAmenityLinks`,
  `replaceAttributeValues(..., { isNewListing: true })`).
- **Units:** `min_license_years` uses its own duration unit
  (`years_experience`), because Armenian words an age ("տարեկան") and a
  span ("տարի") differently.
- **Layout:** Details and Policies share `MetadataFieldGrid`, with two
  columns from tablet width and wide types (choice groups, free text)
  taking a whole row. The price row fits all three fields on one line only
  from laptop width.
- **Design polish (final review):**
  - A refused Continue moves focus to the step's first invalid field
    (`WizardStepActions`).
  - Review summarises the location as the street address plus the city in
    the page language. It shows coordinates only when no city is set.
  - Short free-text facts (make, model, pickup details) sit in the
    two-column grid; only multi-choice groups take a whole row.
  - An unset number shows an empty field instead of its minimum (which
    read as a saved "1990" or "1 year"), and clearing a number unsets it.
- **Tests:** API integration `listings/listingWizardFields.test.js`; web
  unit tests beside each step; Playwright
  `tests/e2e/partnerListingWizard.spec.js` creates a real draft for every
  category.

---

## 11. Final per-category matrix (closure)

Applies to every category: **city (required to publish)**, street address
(optional; public except for private stays), pin (required), title (one
language required), at least one photo and one bookable unit (required).
"Detail" means Listing Detail shows it through the metadata-driven Details,
Amenities or Policies sections. Every new field is optional unless marked.

### Hotels
- **Current:** star rating, property style, total rooms; pets, smoking,
  children, cancellation\*, check-in\*, check-out\*; rooms with beds,
  size, bathroom, view, smoking, meal plan, hourly stays.
- **Missing, high value:** city/address (X1–X3), staff languages, parties
  rule, service amenities.
- **Added now:** `languages_spoken`; `parties_allowed` (policy); 24-hour
  front desk, restaurant, bar, room service, luggage storage, spa, laundry
  service (amenities).
- **Deferred:** payment methods, damage deposit (product decisions §8).
- **Not worth adding:** brand/chain, reception hours, quiet hours.
- **Required:** cancellation, check-in/out. **Optional:** the rest.
  **Conditional:** none.
- **Search:** star rating, property style, amenities, meal plan
  (existing).
- **Booking:** rooms, occupancy, beds, meal plan, check-in/out,
  cancellation, booking rules.
- **Detail:** all of the above plus staff languages and the parties rule.
- **Rationale:** hotels already had a strong room model. The gap was
  location truth and the facts multilingual travellers filter or decide on.

### Apartments · Villas · Guest houses (PROPERTY)
- **Current:** bedrooms, bathrooms, beds, max guests, view, floor area;
  hotel policies; units.
- **Missing, high value:** space type, check-in method, staff languages,
  parties rule, home amenities.
- **Added now:** `space_type`, `check_in_method`, `languages_spoken`;
  `parties_allowed`; dedicated workspace and dishwasher amenities (per
  category applicability).
- **Deferred:** security deposit (§8).
- **Not worth adding:** floor number, infant count.
- **Required:** cancellation, check-in/out. **Optional:** the rest.
  **Conditional:** none.
- **Search:** `space_type` (new, quick filter); bedrooms, beds, guests.
- **Booking:** units, occupancy, nights rules, cancellation.
- **Detail:** facts and rules. The street address is **never public**,
  only owner/admin.
- **Rationale:** "entire place vs room" is the first accommodation filter
  on every marketplace. Home privacy outranks guest convenience.

### Restaurants
- **Current:** cuisine (6), price tier; smoking, children; menus, opening
  hours; free reservations.
- **Missing, high value:** dietary options, dining style, cuisine coverage,
  capacity, dress code, service amenities.
- **Added now:** `dietary_options`, `dining_style`, `seating_capacity`,
  `dress_code`; 10 more cuisines; private dining room, takeaway, kids menu,
  high chairs.
- **Deferred:** paid reservations/deposits (no booking-model support),
  payment methods (§8).
- **Not worth adding:** delivery.
- **Required:** none beyond common. **Optional:** all.
  **Conditional:** none.
- **Search:** cuisine, price tier (existing); `dietary_options`,
  `dining_style` (new).
- **Booking:** party size and table capacity (payment-exempt).
- **Detail:** all new facts. The address is public.
- **Rationale:** diners filter by diet and style first. Six cuisines could
  not describe Yerevan's market.

### Tours
- **Current:** duration, difficulty, max group, languages (3), meeting
  point; cancellation\*; departures; itinerary.
- **Missing, high value:** format, minimum age, minimum group, pickup
  details, more guide languages.
- **Added now:** `tour_format`, `min_age`, `min_group_size`,
  `pickup_details` (**conditional** on `meeting_point_type =
  HOTEL_PICKUP`), +7 languages.
- **Deferred:** per-group pricing and optional extras (booking engine is
  per-person only).
- **Not worth adding:** what-to-bring taxonomy (kept as Guest
  information lists).
- **Required:** cancellation. **Conditional:** pickup details.
- **Search:** `tour_format` (new); languages, difficulty, duration.
- **Booking:** departures, capacity, minimum group, age.
- **Detail:** all, with the itinerary shown only for tours and attractions.
- **Rationale:** private vs shared, age and pickup are the questions
  guests ask before booking a tour.

### Car rentals
- **Current:** transmission, seats, fuel, doors, luggage, min driver age,
  mileage policy; smoking, cancellation\*.
- **Missing, high value:** make/model/year, body type, drive, distance
  limit, fuel policy, licence years, vehicle amenities.
- **Added now:** `vehicle_make`, `vehicle_model`, `vehicle_year`,
  `body_type`, `drive_type`, `min_license_years`,
  `daily_distance_limit_km` (**conditional** on `mileage_policy =
  LIMITED`); `fuel_policy` (policy); GPS, Bluetooth audio, child seat,
  winter tyres.
- **Deferred:** deposit, insurance (§8); one-way, delivery, extra drivers
  (no booking support).
- **Not worth adding:** colour, engine power.
- **Required:** cancellation. **Conditional:** distance limit.
- **Search:** `body_type`, `drive_type` (new); transmission, seats, fuel.
- **Booking:** a single vehicle, rental days, eligibility (age, licence),
  distance limit, fuel policy.
- **Detail:** all.
- **Rationale:** renters choose a vehicle class (ACRISS) and need to know
  the charges (distance, fuel) up front.

### Attractions
- **Current:** duration, languages, max group; children; sessions.
- **Missing, high value:** type, visit format, setting, minimum age,
  cancellation.
- **Added now:** `attraction_type`, `visit_format`, `setting`, `min_age`;
  `cancellation_policy` **required**; lockers and café amenities.
- **Deferred:** none.
- **Not worth adding:** visitor capacity (session capacity covers it),
  photography rules (Guest information).
- **Required:** cancellation. **Conditional:** none.
- **Search:** `attraction_type` (new, quick filter).
- **Booking:** sessions, capacity, age, cancellation.
- **Detail:** all; itinerary allowed.
- **Rationale:** paid sessions need a cancellation rule like tours, and
  type is how visitors browse.

### Entertainment venues
- **Current:** duration, max group; children; sessions.
- **Missing, high value:** venue type, minimum age, setting, languages,
  cancellation.
- **Added now:** `venue_type`, `setting`, `min_age`, `languages_offered`;
  `cancellation_policy` **required**; lockers and café amenities.
- **Deferred:** none.
- **Not worth adding:** private events, dress requirements (FAQ/free
  text).
- **Required:** cancellation. **Conditional:** none.
- **Search:** `venue_type` (new, quick filter).
- **Booking:** sessions, capacity, age, cancellation.
- **Detail:** all; itinerary allowed.
- **Rationale:** escape rooms, karting and shows share the session model
  but differ in type, language and age rules.

