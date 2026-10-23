# Listing Detail & Admin Information — Field-Gap Matrix and Design Contract

Phase: Listing Detail & Admin Information master rebuild (2026-10-23,
baseline `d212a3c`). This document records what each category's public
Listing Detail page should show, what Desavii already stores, who can
edit it, and what this phase changes. It extends
`PARTNER_LISTING_WIZARD_FIELD_GAP.md` (which decided what to **collect**)
with what to **present** and who **maintains** it.

## 1. Starting point (measured, not assumed)

- **The data model is richer than the page.** The Wizard rebuild added
  city, street address, about 30 category attributes, 7 policies and 62
  amenities with per-category applicability. Listing Detail showed most of
  it only in a plain "Details" list near the bottom, so a car's 14
  specifications or a tour's format, difficulty and languages were never
  near the top.
- **Policies** rendered as one large grey card per value: six cards for
  "Pets: No", "Smoking: No", "14:00"…
- **Amenities** were grouped by an incoherent taxonomy (Air Conditioning
  under Connectivity; Parking, Winter Tyres and Lockers under
  Accessibility & Safety; Breakfast and Airport Shuttle under Food
  Service). Amenities had no stable code, so icons were per group, not per
  amenity.
- **Availability** was its own near-empty card ("Only 6 rooms left").
- **1440px gutter (owner report): confirmed, global.** The shared
  `Container` dropped its side padding at ≥1440px. The 1440px-wide
  container used by the header, footer and most pages then touched both
  viewport edges at exactly 1440px.
- **Private-stay map pin:** Search Map approximates private stays to a
  ~1 km grid cell, but Listing Detail still returned exact coordinates.
- **Demo data is thin** (it predates the Wizard's new fields), so
  verification uses rich disposable listings created through the API.

## 2. Sources

Official supplier/developer documentation was preferred. Some live
marketplace pages refuse automated fetching (GetYourGuide and Turo
returned HTTP 403, OpenTable timed out); their structure is taken from
search-indexed listing pages and is marked as such.

| Area | Source | Learned |
| --- | --- | --- |
| Tours / activities | [GetYourGuide — Describing your product](https://supply.getyourguide.support/hc/en-us/articles/13980969821469-Describing-your-product) (official) | Short + full description, 3–5 highlights, included / not included, guide type, food & drinks, transportation, **not suitable for**, **what's not allowed**, **mandatory items to bring**, **know before you go**. |
| Tours / activities | [Viator — Front-End Guide for API Partners](https://partnerresources.viator.com/travel-commerce/front-end/) (official) | One unified product page: title, overview, reviews + average, photos, "price from", booking widget, cancellation policy, **key details (duration, ticket type, languages)**, inclusions/exclusions, departure/pickup, itinerary, additional info. No mandated order. |
| Tours / activities | GetYourGuide listing pages (search-indexed: [Antwerp](https://www.getyourguide.com/antwerp-l1028/antwerp-historical-walking-tour-and-pub-crawl-t585332/), [Taipei](https://www.getyourguide.com/taipei-city-l190/taipei-like-a-local-customized-guided-tour-t99288/)) | Key facts block at the top: free cancellation window, duration, live guide, group size; "Know before you go" section. |
| Tours / activities | Klook (third-party reviews only) | Package details, meeting point, language, inclusions and confirmation type are buyer-critical. |
| Accommodation | [Booking.com Facilities API](https://developers.booking.com/connectivity/docs/content-api-modules/facilities-api/introduction-to-facilities-api) (official) | Facilities exist at property **and** room level; some carry details (parking); bathrooms are their own resource. |
| Accommodation | [Booking.com house rules API](https://developers.booking.com/connectivity/docs/get-house-rules) (official); [Holidu guest guide](https://www.holidu.com/help/guest/property-information/where-can-i-find-details-about-the-property-before-booking-my-stay-on-bookingcom) (secondary) | Most important facilities shown near the photos, the full list later; a "house rules / fine print" block for check-in/out, rules, fees and cancellation. |
| Accommodation | [Airbnb — listing accuracy standards](https://www.airbnb.com/help/article/2895) (official); [publish & safety disclosures](https://www.airbnb.com/resources/hosting-homes/a/how-to-finish-review-and-publish-your-listing-371) (official) | Amenities must be accurate and complete; house rules in a dedicated section; safety information disclosed. "What this place offers" plus "Things to know" (house rules, safety, cancellation). |
| Accommodation | [Hotels.com (Expedia Group) property page](https://au.hotels.com/ho1253767328) | A short "Popular amenities" block above a full amenities list; "Fees & policies". |
| Restaurants | OpenTable profiles (search-indexed: [Mariposa](https://www.opentable.ie/mariposa-sedona), [Table Asheville](https://www.opentable.com/table-asheville), [Southern Table](https://www.opentable.ie/r/southern-table-pleasantville)) | Fixed fact set: dining style, price, cuisines, hours, payment options, dress code, parking details, additional features (patio, gluten-free…). |
| Restaurants | [Google Business Profile attributes](https://support.google.com/business/answer/9049526) (official) | Structured accessibility (wheelchair entrance, restroom, seating, parking), amenities, payments. |
| Car rental | Turo listing pages (search-indexed, e.g. [Portland Fiat 500](https://turo.com/us/en/car-rental/united-states/portland-or/fiat/500/2684236)) | Vehicle facts first (seats, fuel, economy), features list, "Rules of the road" (smoking, cleanliness, refuelling), mileage terms. |
| Events / venues | [Eventbrite — Organizing an event](https://www.eventbrite.com/help/en-us/articles/454084/) (official) | Age restrictions, parking and refund policy highlighted; agenda/lineup and FAQs. |
| Events / venues | Fever event pages (search-indexed) | Duration, minimum age and accompaniment, accessibility notes, getting there. |

Prior research for the same categories (schema.org types, ACRISS,
Turo eligibility, Viator age bands) is in
`PARTNER_LISTING_WIZARD_FIELD_GAP.md` §1 and is not repeated.

## 3. Design contract

**Page job:** let a traveller decide, in the first screen, whether this
place fits — then confirm details without hunting through prose.

| Source | Recommendation | Desavii fit | Decision |
| --- | --- | --- | --- |
| Viator front-end guide, GetYourGuide pages | A **key facts** row under the title (duration, languages, cancellation, group size). | Yes — every category has 3–6 decisive structured facts. | **APPLY**: category-aware key facts strip, from real attributes/policies/units only. |
| Hotels.com, Booking.com | **Popular amenities** first, full list behind "Show all". | Yes — long amenity lists are the norm for hotels/villas. | **APPLY**: up to 8 popular amenities inline, the full grouped list in an accessible dialog. |
| Airbnb "Things to know", Booking.com fine print | Rules as a compact, scannable list, not cards. | Yes — policies are short values. | **APPLY**: two-column icon list (icon · title · short value), cancellation explanation expandable. |
| GetYourGuide supplier fields | "What to bring", "Not allowed", "Know before you go" as their own lists. | Yes for tours, attractions, entertainment and car rentals. | **APPLY** (new data, §5). |
| Booking.com room-level facilities | Rich room cards with size, beds, occupancy, room amenities, price, availability. | Yes — already built (Sprint C-2/C-3). | **KEEP**, restyled only where the shared system changes. |
| OpenTable fixed fact set | Restaurant facts: style, price, cuisines, hours, dress code, dietary options. | Yes. | **APPLY** through the key facts strip and the specification groups. |
| Turo "Rules of the road" | Car rules near specs (fuel policy, mileage, smoking). | Yes. | **APPLY** via policies + key facts (mileage, fuel policy). |
| Generic AI layouts | Card per value, giant grey surfaces, emoji markers. | No. | **REJECT**. |
| 21st.dev reference catalogue | Component references for detail pages. | — | **NOT AVAILABLE**: 6 of 6 searches returned "catalog search failed"; no references used. |

Visual language: navy/royal-blue text and icons, gold only for the
rating star and the booking accent, white sections separated by hairline
rules (no card per section), Armenian/Russian-safe wrapping, motion via
existing `ScrollReveal` (opacity/transform, reduced-motion aware).

## 4. Field-gap matrix

Legend:
- **Exists**: Y yes · P partial · N no.
- **Wiz** (Wizard collects) and **Partner** (owner edit): via the Wizard sections; P means a dedicated page (rooms, menu, opening hours).
- **Admin**: Y\* is new this phase (Admin opens the same Wizard on any non-published listing).
- **Public**: before → after.
- **Search**: filter exists. **Book**: booking-relevant. **Val**: public value H/M/L.

Everything the owner maintains is editable by the owner through the
Wizard (published listings: unpublish → edit → resubmit, the moderation
rule `LISTING_PUBLISHED_EDIT_BLOCKED`, kept). System-computed fields are
marked SYS and are never editable.

### 4.1 Shared across categories

| Field / section | Exists | Wiz | Partner | Admin | Public | Search | Book | Evidence | Val | Decision |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Title, summary, full description (HY/EN/RU) | Y | Y | Y | Y\* | Y → Y | text | N | all | H | SHOW EXISTING |
| Highlights | Y | Y | Y | Y\* | hero → hero | N | N | GYG, Viator | H | SHOW EXISTING |
| Photos, cover, order, alt text | Y | Y | Y | Y\* (view + moderation) | Y → Y | N | N | all | H | SHOW EXISTING |
| City, country | Y | Y | Y | Y\* | Y → Y | Y | N | all | H | SHOW EXISTING |
| Street address | Y | Y | Y | Y\* | N → Y (exact categories only) | N | N | OpenTable, Eventbrite | H | SHOW EXISTING (Location) |
| Map position | Y | Y | Y | Y\* | exact → exact / **approximate for private stays** | map | N | Search Map policy | H | REDESIGN (privacy parity) |
| Amenities | Y | Y | Y | Y\* | grouped rows → popular + dialog | Y | N | Booking.com, Hotels.com | H | REDESIGN + taxonomy regroup + stable codes |
| Cancellation policy | Y | Y | Y | Y\* | card → key fact + rule | Y (computed) | Y | Viator, GYG | H | REDESIGN |
| Children allowed | Y | Y | Y | Y\* | card → rule | Y (house rules) | Y | Booking.com, Airbnb | M | REDESIGN |
| Included / not included | Y | Y | Y | Y\* | Y → Y | N | N | GYG, Viator | H | SHOW EXISTING |
| What to bring / not allowed / know before you go | N | N | N | N | N → Y | N | N | GYG (official), Viator "additional info", Eventbrite | H | **ADD DATA** (tours, attractions, entertainment, car rentals) |
| FAQs | Y | Y | Y | Y\* | Y → Y | N | N | Eventbrite | M | SHOW EXISTING |
| Operator (company, verified) | Y | Partner profile | Y | partner admin | Y → Y | N | N | Viator "supplier" | M | SHOW EXISTING |
| Rating, review count, reviews | Y | — | — | moderation | Y → Y | Y | N | all | H | SYS — SHOW EXISTING |
| Price from + basis | Y | Y | Y | Y\* | sidebar → sidebar | Y | Y | Viator "price from" | H | SHOW EXISTING |
| Availability summary | Y | — | Calendar | Calendar | own card → compact | Y | Y | — | M | SYS — REDESIGN (no empty card) |
| Related listings | Y | — | — | — | Y → Y | — | N | all | L | SYS — KEEP |
| Payment methods, deposits | N | N | N | N | N | N | — | product | — | DO NOT ADD (open product decision, `PARTNER_LISTING_WIZARD_FIELD_GAP.md` §8) |
| Accessibility features | P (amenities) | Y | Y | Y\* | amenities | Y | N | Google, Airbnb | H | SHOW EXISTING as its own amenity group |

### 4.2 Hotels

| Field | Exists | Wiz | Partner | Admin | Public | Search | Book | Evidence | Val | Decision |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Star rating | Y | Y | Y | Y\* | bottom list → **key fact** | Y | N | Booking.com | H | REDESIGN |
| Property style | Y | Y | Y | Y\* | bottom list → spec | Y | N | Booking.com | M | REDESIGN |
| Total rooms / room types | Y + SYS | Y | Y | Y\* | bottom list → key fact (room types from units) | N | N | schema.org | M | REDESIGN |
| Languages spoken | Y | Y | Y | Y\* | bottom list → key fact | N | N | Booking.com | M | REDESIGN |
| Check-in / check-out | Y | Y | Y | Y\* | cards → **key fact** + rule | N | Y | all | H | REDESIGN |
| Pets / smoking / parties / children | Y | Y | Y | Y\* | cards → rules list | Y (house rules) | Y | Airbnb, Booking.com | H | REDESIGN |
| Breakfast | Y (amenity + room meal plan) | Y | Y | Y\* | amenity → popular amenity, room cards | Y | Y | Booking.com | H | SHOW EXISTING |
| Rooms (size, beds, occupancy, bathroom, view, meal plan, room amenities, price, hourly, availability) | Y | P (rooms page) | Y | view | rich cards → rich cards | Y | Y | Booking.com | H | KEEP |
| Brand/chain, reception hours, quiet hours | N | — | — | — | — | — | — | G | L | DO NOT ADD |

### 4.3 Apartments · Villas · Guest houses (PROPERTY)

| Field | Exists | Wiz | Partner | Admin | Public | Search | Book | Evidence | Val | Decision |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Space type | Y | Y | Y | Y\* | bottom list → **key fact** | Y | Y | Airbnb | H | REDESIGN |
| Bedrooms / beds / bathrooms / max guests | Y | Y | Y | Y\* | bottom list → **key facts** | Y | Y | Airbnb | H | REDESIGN |
| Floor area | Y | Y | Y | Y\* | bottom list → spec | Y | N | Airbnb | M | REDESIGN |
| View | Y | Y | Y | Y\* | bottom list → spec | Y | N | Booking.com | M | REDESIGN |
| Check-in method | Y | Y | Y | Y\* | bottom list → spec | N | N | Airbnb | M | REDESIGN |
| Languages spoken | Y | Y | Y | Y\* | bottom list → spec | N | N | Booking.com | M | REDESIGN |
| House rules (pets, smoking, parties, children), check-in/out, cancellation | Y | Y | Y | Y\* | cards → rules list + key facts | Y | Y | Airbnb | H | REDESIGN |
| Street address | Y | Y | Y | Y\* | withheld → withheld | N | N | privacy policy | — | KEEP WITHHELD |
| Map pin | Y | Y | Y | Y\* | exact → **approximate** | map | N | Search Map policy | — | REDESIGN (privacy) |
| Security deposit | N | — | — | — | — | — | — | product | — | DO NOT ADD (§8) |

Villas lean on outdoor and wellness amenities (pool, garden, BBQ,
terrace); guest houses on breakfast and garden; apartments on workspace,
elevator and kitchen. One shared information model (the attributes are
identical), with differences carried by each category's amenity
applicability, so no field is reused where it does not belong.

### 4.4 Restaurants

| Field | Exists | Wiz | Partner | Admin | Public | Search | Book | Evidence | Val | Decision |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Cuisine(s) | Y | Y | Y | Y\* | bottom list → **key fact** | Y | N | OpenTable | H | REDESIGN |
| Dining style | Y | Y | Y | Y\* | bottom list → **key fact** | Y | N | OpenTable | H | REDESIGN |
| Price tier | Y | Y | Y | Y\* | bottom list → **key fact** | Y | N | OpenTable | H | REDESIGN |
| Dietary options | Y | Y | Y | Y\* | bottom list → key fact | Y | N | OpenTable, Google | H | REDESIGN |
| Seating capacity | Y | Y | Y | Y\* | bottom list → spec | N | N | OpenTable | L | REDESIGN |
| Dress code | Y | Y | Y | Y\* | bottom list → spec | N | N | OpenTable | M | REDESIGN |
| Opening hours (+ open now) | Y | P (page) | Y | view | own section → section + key fact "Open today" | N | Y | OpenTable, Google | H | REDESIGN |
| Menu (sections, items, prices) | Y | P (page) | Y | view | own section → own section | N | N | Google menus | H | KEEP |
| Reservation model (free, party size) | Y (booking type) | — | — | — | sidebar → key fact "Free reservation" | N | Y | OpenTable | H | REDESIGN |
| Smoking / children | Y | Y | Y | Y\* | cards → rules | N | N | Google | M | REDESIGN |
| Payment methods, delivery, paid reservations | N | — | — | — | — | — | — | product | — | DO NOT ADD (§8) |

### 4.5 Tours

| Field | Exists | Wiz | Partner | Admin | Public | Search | Book | Evidence | Val | Decision |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Duration | Y | Y | Y | Y\* | bottom list → **key fact** | Y | Y | Viator, GYG | H | REDESIGN |
| Format (private / shared) | Y | Y | Y | Y\* | bottom list → **key fact** | Y | Y | Viator, GYG | H | REDESIGN |
| Languages | Y | Y | Y | Y\* | bottom list → **key fact** | Y | N | Viator key details | H | REDESIGN |
| Group size min/max | Y | Y | Y | Y\* | bottom list → key fact | Y | Y | GYG | H | REDESIGN |
| Difficulty | Y | Y | Y | Y\* | bottom list → key fact | Y | N | Klook, GYG | M | REDESIGN |
| Minimum age | Y | Y | Y | Y\* | bottom list → spec | N | Y | Viator age bands | H | REDESIGN |
| Meeting point / pickup details | Y | Y | Y | Y\* | bottom list → spec ("Meeting point") | Y | Y | GYG, Viator | H | REDESIGN |
| Itinerary | Y | Y | Y | Y\* | Y → Y | N | N | Viator | H | KEEP |
| What to bring / not allowed / know before you go | N | N | N | N | N → Y | N | N | GYG (official) | H | **ADD DATA** |
| Cancellation | Y | Y | Y | Y\* | card → key fact | Y | Y | Viator, GYG | H | REDESIGN |

### 4.6 Car rentals

| Field | Exists | Wiz | Partner | Admin | Public | Search | Book | Evidence | Val | Decision |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Make, model, year | Y | Y | Y | Y\* | bottom list → **key fact (vehicle)** | N | N | Turo | H | REDESIGN |
| Body type, transmission, fuel, drive | Y | Y | Y | Y\* | bottom list → **key facts** | Y | N | ACRISS, Turo | H | REDESIGN |
| Seats, doors, luggage | Y | Y | Y | Y\* | bottom list → key facts / specs | Y | N | Turo | H | REDESIGN |
| Mileage policy + daily limit | Y | Y | Y | Y\* | bottom list → key fact | Y | Y | Turo | H | REDESIGN |
| Fuel policy | Y | Y | Y | Y\* | card → rule | N | Y | Turo rules of the road | H | REDESIGN |
| Minimum driver age, licence years | Y | Y | Y | Y\* | bottom list → rules ("Driver requirements") | Y (age) | Y | Turo | H | REDESIGN |
| Vehicle features (GPS, Bluetooth, child seat, winter tyres) | Y (amenities) | Y | Y | Y\* | amenity rows → "Vehicle features" group | Y | N | Turo | M | REDESIGN (regroup) |
| Pickup location | Y (address + pin) | Y | Y | Y\* | location → location ("Pickup point") | N | Y | Turo | H | REDESIGN (label) |
| What to bring (licence, passport) / not allowed | N | N | N | N | N → Y | N | N | Turo rules | M | **ADD DATA** |
| Deposit, insurance, extras, delivery, one-way | N | — | — | — | — | — | — | product | — | DO NOT ADD (§8) |

### 4.7 Attractions

| Field | Exists | Wiz | Partner | Admin | Public | Search | Book | Evidence | Val | Decision |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Attraction type | Y | Y | Y | Y\* | bottom list → **key fact** | Y | N | GYG, Viator categories | H | REDESIGN |
| Visit format (guided / self) | Y | Y | Y | Y\* | bottom list → key fact | N | N | GYG guide info | M | REDESIGN |
| Setting (indoor/outdoor) | Y | Y | Y | Y\* | bottom list → key fact | N | N | Fever | M | REDESIGN |
| Duration | Y | Y | Y | Y\* | bottom list → **key fact** | Y | N | Viator | H | REDESIGN |
| Languages | Y | Y | Y | Y\* | bottom list → key fact | Y | N | Viator | M | REDESIGN |
| Minimum age, group size | Y | Y | Y | Y\* | bottom list → spec | Y (group) | Y | Fever, Viator | M | REDESIGN |
| Opening hours | Y | P (page) | Y | view | section → section | N | Y | Google | H | KEEP |
| What to bring / not allowed / know before you go | N | N | N | N | N → Y | N | N | GYG, Fever | H | **ADD DATA** |
| Cancellation | Y | Y | Y | Y\* | card → key fact | N | Y | Viator | H | REDESIGN |
| Photography rules | N | — | — | — | — | — | — | — | L | Covered by "Not allowed" |

### 4.8 Entertainment venues

| Field | Exists | Wiz | Partner | Admin | Public | Search | Book | Evidence | Val | Decision |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Venue type | Y | Y | Y | Y\* | bottom list → **key fact** | Y | N | Fever, Eventbrite | H | REDESIGN |
| Setting, duration, minimum age, languages, group size | Y | Y | Y | Y\* | bottom list → key facts / spec | Y (some) | Y (age) | Fever, Eventbrite | H | REDESIGN |
| Sessions / schedule | Y (departures) | P (rooms page) | Y | view | booking widget → booking widget | N | Y | Fever | H | KEEP |
| Know before you go / not allowed | N | N | N | N | N → Y | N | N | Eventbrite, Fever | H | **ADD DATA** |
| Cancellation | Y | Y | Y | Y\* | card → key fact | N | Y | Eventbrite refund policy | H | REDESIGN |
| Lineup / performers / ticket tiers | N | — | — | — | — | — | — | Eventbrite | L | DEFER — venues sell sessions, not events; no ticket-type model |

## 5. Data added this phase

1. **Guest guidance lists** — `listing_guest_notes` (per language):
   - **Kinds:**
     - `BRING` (what to bring);
     - `NOT_ALLOWED`;
     - `KNOW_BEFORE` (know before you go).
   - **Categories:** tours, attractions, entertainment venues and car rentals. Accommodation and restaurants keep policies and FAQs.
   - **Data path:** the Wizard's Guest information step, then a full-replace endpoint, then the public DTO, the Detail section and the Admin view.
2. **Amenity taxonomy.**
   - Each amenity gets a stable `code`. It is set from the canonical English name by an idempotent seed, and existing ids are unchanged.
   - Amenities are regrouped into guest-meaningful groups (§6).
   - The metadata response carries the `code`, so the page shows one icon per amenity.
3. **Public location precision.**
   - The public listing response approximates a private stay's coordinates to the Search Map grid cell, using the same function the search SQL mirrors.
   - It also returns `location_precision`.
   - Owners and admins still see the exact point.

## 6. Amenity groups (new)

| Group | Amenities |
| --- | --- |
| Internet & work | WiFi, Dedicated Workspace, Business Center |
| Heating & cooling | Air Conditioning, Heating, Fireplace |
| Bedroom & living | TV, Desk, Wardrobe, Safe, Soundproofing, Iron, Minibar |
| Bathroom | Shower, Bathtub, Hair Dryer, Toiletries |
| Kitchen & laundry | Kitchen, Kitchenette, Coffee Maker, Kettle, Dishwasher, Washing Machine |
| Food & drink | Breakfast Included, Restaurant, Bar, Café, Room Service, Outdoor Seating, Private Dining Room, Takeaway |
| Services | 24-hour Front Desk, Luggage Storage, Laundry Service, Non-Smoking Rooms |
| Wellness | Pool, Spa, Sauna, Jacuzzi, Gym |
| Outdoor | Garden, Terrace, Balcony, BBQ |
| Parking & transport | Parking, EV Charger, Airport Shuttle |
| Family & pets | Family Friendly, Pet Friendly, Kids Menu, High Chairs, Child Seat |
| Accessibility | Wheelchair Accessible, Step-free Access, Accessible Bathroom, Elevator |
| Safety & security | Security, Lockers |
| Entertainment | Live Music |
| Vehicle features | GPS Navigation, Bluetooth Audio, Winter Tyres |

## 7. Editability

| Surface | Before | After |
| --- | --- | --- |
| Partner | Wizard edit (`?listingId=&step=`), rooms, menu and opening-hours pages | Same; the Guest information step also edits the new lists. |
| Admin | Read-only detail (attributes, amenities and policies shown) | A role holding `listing.update` gets **Edit listing**, which opens the same Wizard at `/admin/listings/:id/edit` and returns to the admin detail page. Offered whenever the API accepts the edit: not while the listing is under review or published. Those two states show a sentence explaining the lock instead (moderation rule kept). The localized review also shows the guest notes. |
| Manager | Wizard, but publishing sent the manager to the partner workspace | Publishing now returns the manager to `/manager/listings` (the Wizard's new `exitPath`). |
| System | rating, reviews, availability, price from, related listings | unchanged — never editable |

## 8. Out of scope (recorded)

- **Lineup and ticket tiers for entertainment:** no event model exists.
- **Payment methods, deposits, insurance and delivery:** open product decisions.
- **The visibility check's query count:** measured on the running test API from MySQL's `Questions` counter. `GET /listings/{id}` costs **23 statements** for every category, whether the listing has 6 amenities or 40, and takes 6–10 ms locally with a 6–8 KB response. It is a constant cost, not N+1, so it was not optimized. An unpublished listing also pays the full 23 before its 404, because visibility is checked after the listing is assembled. That is cheap enough to leave as it is.

## 9. Observations from QA (not changed)

- **Free-text attributes are single-language.** `pickup_details`, the vehicle make and model, and the address are entered once and shown as entered in every language. Making them per-language is a schema change for a later phase.
- **The rich-content endpoints ignore the edit lock.** Highlights, itinerary, included items, FAQs and guest notes can be replaced on a published listing; only `PATCH /listings/{id}` is locked. This predates this phase, and guest notes follow the existing behaviour. Whether to lock them is a product decision.
- **`/search/categories` is fetched twice** when the Detail page loads (two parallel identical requests from existing code).
- **At 390 px the footer column headings run together** on one line. This is pre-existing, outside the Listing Detail page.
