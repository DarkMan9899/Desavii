# Listing Detail — Category Information Depth

A closure phase of the Listing Detail redesign (`LISTING_DETAIL_REDESIGN.md`), before the category-aware booking / action widget, which has not started.

The owner's finding: the redesigned pages looked right but said too little to decide on. Tours were the clearest case, but the same was true of every category. This phase makes each page answer a traveller's questions before booking. It does that with structured, truthful, category-specific facts, not longer prose. Every fact shown is one a partner can enter and edit.

Builds on `LISTING_DETAIL_FIELD_GAP.md`, from October 2026, and `PARTNER_LISTING_WIZARD_FIELD_GAP.md`.

## 1. Gate — what each tool changed

| Tool | Used for | What it changed |
|---|---|---|
| Graphify | An AST graph of the listings modules: API, seeds 006/007, availability, web listings, utils and api. 277 files, 1,876 nodes, 4,982 edges. Queried for the attribute chain: partner input → `#resolveAttributeValues` / `#checkAttributeConditions` → `replaceAttributeValues` → `toAttributeValueResponse` → `fromAttributeValuesResponse`. | It showed that "does this listing have a value" was decided three times, in key facts, the attributes section and `MetadataValueDisplay`. The section builder never asked, so the nav linked to "Tour details" and "Policies" even when they rendered nothing. The fix: one resolver (`listingFactGroups.js`, `listingRules.js`) feeds both the nav and the sections. |
| Context7 | i18next 23 formatting (`{{val, list}}`, Intl-based). | Lists were first built on i18next's Intl list formatter. A real-browser check then showed that Chromium builds with reduced ICU data have no Armenian patterns: `Intl.ListFormat('hy')` returned "09:00 and 14:00" on an Armenian page. The conjunction now lives in the translations (`pages.listingDetail.valueList`). The wider date-formatting risk is a separate follow-up task. |
| 21st.dev | Searches: "tour activity detail key details grouped sections meeting point included", "product specifications grouped definition list", "event venue good to know accordion", "timeline schedule start times departure list". | See §2. |
| desavii-frontend-design | Before and after implementation. | Groups get quiet sub-headings and hairline dividers. Icon + label/value pairs, no chips. Groups are gated by category, so no field crosses verticals and a car never mentions guests. Start times are a compact list. |
| frontend-ui-engineering | Before and after implementation. | One pure resolver is shared by the nav and the sections. Facts use `dl`/`dt`/`dd`. The heading order is h2 section, then h3 group. There are no new requests, and empty states are gated. |

## 2. Patterns

| Reference | Decision | Why |
|---|---|---|
| Spec Sheet (grouped specification rows, stacked on narrow screens) | ADAPT | Grouped label/value rows that collapse to one column on a phone. No comparison table, no "differences only" toggle. |
| Accessible Accordion (native details/summary) | KEEP AVAILABLE | Groups are short (2–7 facts), so they stay open. FAQ and the cancellation explanation keep their existing disclosure. |
| Departures Board | ADAPT (idea only) | Start times as one compact, tabular list ("09:00 and 14:00"), not a board. |
| Trip Details Card | REJECT | A card per block is the template look the brief rules out. |
| Feature Accordion Section | REJECT | Images and counts per feature add weight, not information. |

## 3. Before — what the pages could say (demo data, 73 published listings)

- Almost no listing carried its structured facts: 63 of 73 had no category attributes at all.
- The fullest tour stated 3 of 9 tour facts: duration, difficulty, group size.
- No listing had any guest notes ("what to bring", "not allowed", "know before you go").
- Restaurants, villas, guest houses and entertainment venues had no fully described listing at all.
- A tour's real departure times (`time_slot_start` on its units) were already loaded by the page but never shown.
- Minimum and maximum stay and advance-booking notice were enforced by the reservation panel but never stated, so a traveller learned the rule only when a date was refused.
- The nav linked to "Tour details" on the richest tour, but that section rendered nothing; the same happened with "Policies" on listings without policy values.
- No tour fact existed for the guide, the transport, food included, weather or where the tour ends.

## 4. Field-gap matrices

**Columns:**

- **Why:** why a traveller needs the fact.
- **Source:** where it is stored.
- **Partner:** whether partners can edit it:
  - `Wiz`: the Partner Listing Wizard.
  - `Units`: the rooms / departures page.
  - `Menu` / `Hours`: their own pages.
- **Admin:** whether admins can edit it:
  - `Wiz*`: the same Wizard at `/admin/listings/:id/edit`, while the listing is not under review or published.
  - `View`: read-only.
- **DB / API / Detail:** stored / in the public response / shown on the page.
- **Localized:** how the value is translated:
  - `Struct`: structured, localized automatically.
  - `Per-lang`: the partner writes each language.
  - `Single`: free text entered once.
- **Req:** `R` required at publish, `O` optional, `C` conditional.
- **Action:**
  - `SHOWN`: already right.
  - `NOW SHOWN`: existed, now presented.
  - `ADDED`: new field, full path.
  - `DATA`: complete in the demo listing.
  - `NOT NEEDED`.
  - `DECISION`: an open product decision, not added.

### 4.1 Tours

| Field | Why | Source | Partner | Admin | DB | API | Detail | Localized | Req | Action |
|---|---|---|---|---|---|---|---|---|---|---|
| Tour type | What kind of day it is | Category + description, highlights | Wiz | Wiz* | Y | Y | Y | Per-lang | O | SHOWN (no separate taxonomy, see §10) |
| Duration | Plan the day | `duration_minutes` | Wiz | Wiz* | Y | Y | Key fact | Struct | O | SHOWN |
| Itinerary, stops | What happens, in order | `listing_itinerary_steps` | Wiz | Wiz* | Y | Y | Section | Per-lang | O | SHOWN |
| Meeting point | Where to be | `meeting_point_type` + public place | Wiz | Wiz* | Y | Y | Meeting & pickup | Struct | O | NOW SHOWN (a fixed point reads as the place, not "Fixed location") |
| Pickup availability, conditions | Whether to get to the start | `meeting_point_type = HOTEL_PICKUP`, `pickup_details` | Wiz | Wiz* | Y | Y | Meeting & pickup | Struct; details Single | C | SHOWN |
| Ending point | Plan the way back | `end_point_type`, `end_point_details` | Wiz | Wiz* | Y | Y | Meeting & pickup | Struct; details Single | O; details C | ADDED |
| Start times | Choose a departure | Units `time_slot_start` | Units | View | Y | Y | Meeting & pickup | Struct | O | NOW SHOWN |
| Languages, guide language | Understand the guide | `languages_offered` | Wiz | Wiz* | Y | Y | Key fact | Struct | O | SHOWN |
| Guide | Live, driver, audio or none | `guide_type` | Wiz | Wiz* | Y | Y | How the tour runs | Struct | O | ADDED |
| Private / shared | Group or private | `tour_format` | Wiz | Wiz* | Y | Y | Key fact | Struct | O | SHOWN |
| Group size, minimum and maximum participants | Group feel; will it run | `min_group_size`, `max_group_size` | Wiz | Wiz* | Y | Y | Key fact | Struct | O | SHOWN |
| Age, family suitability | Can children come | `min_age`, Family Friendly amenity, `children_allowed` | Wiz | Wiz* | Y | Y | Key fact, amenities, rules | Struct | O | SHOWN |
| Accessibility | Can I take part | Wheelchair Accessible amenity | Wiz | Wiz* | Y | Y | Amenities | Struct | O | SHOWN |
| Physical difficulty | Fitness needed | `difficulty` | Wiz | Wiz* | Y | Y | Key fact | Struct | O | SHOWN |
| Transportation type | How we move | `transport_modes` (multi) | Wiz | Wiz* | Y | Y | How the tour runs | Struct | O | ADDED |
| Meals | Food and drink included | `meals_included` (multi) | Wiz | Wiz* | Y | Y | How the tour runs | Struct | O | ADDED |
| Included / excluded | What the price covers | `listing_included_items` | Wiz | Wiz* | Y | Y | Section | Per-lang | O | SHOWN |
| Equipment provided | What the operator gives | Included items | Wiz | Wiz* | Y | Y | What's included | Per-lang | O | SHOWN (as included items) |
| What to bring | Pack right | Guest notes `BRING` | Wiz | Wiz* | Y | Y | Good to know | Per-lang | O | SHOWN + DATA |
| Weather dependency | Will it run in rain | `weather_policy` | Wiz | Wiz* | Y | Y | How the tour runs | Struct | O | ADDED |
| Restrictions | Not allowed, know before | Guest notes `NOT_ALLOWED` / `KNOW_BEFORE` | Wiz | Wiz* | Y | Y | Good to know | Per-lang | O | SHOWN + DATA |
| Operating days, seasonal notes | When it runs | Availability calendar; `KNOW_BEFORE` | Calendar / Wiz | View / Wiz* | Y | Y | Booking panel; Good to know | Per-lang | O | SHOWN |
| Cancellation | Risk if plans change | `cancellation_policy` + disclaimer | Wiz | Wiz* | Y | Y | Rules | Struct | R | SHOWN |
| Booking notice | Can I book for tomorrow | `booking_rules.advance_booking_min_hours` | Wiz | Wiz* | Y | Y | Rules ("Book ahead") | Struct | O | NOW SHOWN |
| Price basis | Per person or per group | `pricing.pricing_model` | Wiz | Wiz* | Y | Y | Booking panel, bar | Struct | R | SHOWN |
| Child / adult prices | Family cost | — | — | — | N | N | N | — | — | DECISION (per-group or age-band pricing, §8 of the Wizard gap doc) |

### 4.2 Hotels

| Field | Why | Source | Partner | Admin | DB | API | Detail | Localized | Req | Action |
|---|---|---|---|---|---|---|---|---|---|---|
| Class / stars | Expectation of standard | `star_rating` | Wiz | Wiz* | Y | Y | Key fact | Struct | O | SHOWN |
| Style, size, languages | Fit and service | `property_style`, `total_rooms`, `languages_spoken` | Wiz | Wiz* | Y | Y | Key facts, details | Struct | O | SHOWN + DATA |
| Room types, capacity, beds, size, view, bathroom | Choose a room | Units (`HOTEL_ROOM`) | Units | View | Y | Y | Rooms section | Struct + Per-lang | O | SHOWN |
| Breakfast, meal plans | Food cost | Breakfast amenity, room `meal_plan` | Wiz / Units | Wiz* / View | Y | Y | Amenities, rooms | Struct | O | SHOWN |
| Parking, pool, spa, gym, accessibility, family | Facilities | Amenities | Wiz | Wiz* | Y | Y | Amenities | Struct | O | SHOWN |
| Room facilities | In-room comfort | Room amenities | Units | View | Y | Y | Rooms section | Struct | O | SHOWN |
| Check-in / check-out | Arrival planning | Policies | Wiz | Wiz* | Y | Y | Key facts, rules | Struct | R | SHOWN |
| Children, pets, smoking, parties | House rules | Policies | Wiz | Wiz* | Y | Y | Rules | Struct | O | SHOWN |
| Cancellation | Risk | Policy + disclaimer | Wiz | Wiz* | Y | Y | Rules | Struct | R | SHOWN |
| Minimum / maximum stay, notice | Restrictions | `booking_rules` | Wiz | Wiz* | Y | Y | Rules | Struct | O | NOW SHOWN |
| Unit availability | Can I stay these dates | Inventory | Calendar | View | Y | Y | Rooms, panel | Struct | — | SHOWN |
| Nearby / location context | Where it sits | City, address, map, description | Wiz | Wiz* | Y | Y | Location | Per-lang | O | SHOWN (no points-of-interest model, §10) |
| Payment, deposit rules | Money at arrival | — | — | — | N | N | N | — | — | DECISION |

### 4.3 Apartments · Villas · Guest houses

These share one model. A villa and an apartment differ by amenity applicability, not by fields.

| Field | Why | Source | Partner | Admin | DB | API | Detail | Localized | Req | Action |
|---|---|---|---|---|---|---|---|---|---|---|
| Private / shared (space type) | Whole place or a room | `space_type` | Wiz | Wiz* | Y | Y | Key fact | Struct | O | SHOWN + DATA |
| Guests, bedrooms, beds, bathrooms, area | Fits my group | Attributes | Wiz | Wiz* | Y | Y | Key facts | Struct | O | SHOWN + DATA |
| View | Setting | `view_type` | Wiz | Wiz* | Y | Y | Rooms and space | Struct | O | SHOWN + DATA |
| Check-in method, staff languages | Arrival | `check_in_method`, `languages_spoken` | Wiz | Wiz* | Y | Y | Your stay | Struct | O | SHOWN + DATA |
| Kitchen, washing machine, heating / AC, parking, outdoor area, pool, terrace / balcony, fireplace, accessibility | Facilities | Amenities | Wiz | Wiz* | Y | Y | Amenities | Struct | O | SHOWN |
| Children, pets, smoking, parties | House rules | Policies | Wiz | Wiz* | Y | Y | House rules | Struct | O | SHOWN |
| Check-in / check-out | Arrival | Policies | Wiz | Wiz* | Y | Y | Rules | Struct | R | SHOWN |
| Minimum / maximum stay | Restriction | `booking_rules` | Wiz | Wiz* | Y | Y | House rules | Struct | O | NOW SHOWN + DATA |
| Exact address, exact pin | Privacy | Stored, withheld | Wiz | Wiz* | Y | Owner only | Approximate | — | — | SHOWN (withheld) |
| Security deposit | Money at arrival | — | — | — | N | N | N | — | — | DECISION |

### 4.4 Restaurants

| Field | Why | Source | Partner | Admin | DB | API | Detail | Localized | Req | Action |
|---|---|---|---|---|---|---|---|---|---|---|
| Cuisine, dining style, price tier (average spend) | What and how much | Attributes | Wiz | Wiz* | Y | Y | Key facts | Struct | O | SHOWN + DATA |
| Menu, specialties | What to order | Menu | Menu | View | Y | Y | Menu section | Per-lang | O | SHOWN (never invented) |
| Table reservation | Can I book | `RESTAURANT_TABLE` units | Units | View | Y | Y | Key fact "Free reservation" | Struct | O | SHOWN |
| Opening hours | When | Opening hours | Hours | View | Y | Y | Key fact, section | Struct | O | SHOWN |
| Indoor / outdoor seating | Setting | Outdoor Seating amenity | Wiz | Wiz* | Y | Y | Amenities | Struct | O | SHOWN |
| Family suitability | Kids | Kids Menu, High Chairs, Family Friendly, `children_allowed` | Wiz | Wiz* | Y | Y | Amenities, rules | Struct | O | SHOWN + DATA |
| Accessibility | Step-free entry, restroom | Wheelchair Accessible, Step-free Access, Accessible Bathroom | Wiz | Wiz* | Y | Y | Amenities | Struct | O | ADDED (applicability) |
| Dietary options | Can I eat here | `dietary_options` | Wiz | Wiz* | Y | Y | Key fact | Struct | O | SHOWN + DATA |
| Parking | Arrival | Parking amenity | Wiz | Wiz* | Y | Y | Amenities | Struct | O | SHOWN |
| Dress code, seating capacity | Fit | Attributes | Wiz | Wiz* | Y | Y | Details | Struct | O | SHOWN + DATA |
| Service type (takeaway) | Options | Takeaway amenity | Wiz | Wiz* | Y | Y | Amenities | Struct | O | SHOWN |
| Party size limits | Big groups | Table capacity | Units | View | Y | Y | Booking panel | Struct | O | SHOWN |
| Paid reservations, payment methods | Money | — | — | — | N | N | N | — | — | DECISION |

### 4.5 Car rentals

Car rentals never use guests, rooms, nights or bedroom semantics; the minimum and maximum rental read in days.

| Field | Why | Source | Partner | Admin | DB | API | Detail | Localized | Req | Action |
|---|---|---|---|---|---|---|---|---|---|---|
| Make, model, year | Which car | Attributes | Wiz | Wiz* | Y | Y | Key fact | Single (proper names) | O | SHOWN + DATA |
| Class / body, seats, doors, luggage | Fits my trip | Attributes | Wiz | Wiz* | Y | Y | Key facts, Car | Struct | O | SHOWN + DATA |
| Transmission, fuel, drivetrain | Can I drive it | Attributes | Wiz | Wiz* | Y | Y | Key facts, Engine and drive | Struct | O | SHOWN + DATA |
| AC, child seat, GPS, winter tyres | Equipment | Vehicle amenities | Wiz | Wiz* | Y | Y | Vehicle features | Struct | O | SHOWN |
| Mileage policy, daily limit | Cost of distance | Attributes (conditional) | Wiz | Wiz* | Y | Y | Key fact, Driver and mileage | Struct | O / C | SHOWN + DATA |
| Fuel policy | Refuelling | `fuel_policy` | Wiz | Wiz* | Y | Y | Rental terms | Struct | O | SHOWN + DATA |
| Minimum driver age, licence years | Eligibility | Attributes | Wiz | Wiz* | Y | Y | Driver and mileage | Struct | O | SHOWN + DATA |
| Licence / documents to bring | Pick-up | Guest notes `BRING` | Wiz | Wiz* | Y | Y | Good to know | Per-lang | O | SHOWN + DATA |
| Pickup location | Where | Address + pin | Wiz | Wiz* | Y | Y | Pickup location | Struct | R | SHOWN |
| Minimum / maximum rental, notice | Restrictions | `booking_rules` (in days) | Wiz | Wiz* | Y | Y | Rental terms | Struct | O | NOW SHOWN |
| Included / excluded charges | Real cost | Included items | Wiz | Wiz* | Y | Y | What's included | Per-lang | O | SHOWN |
| Cancellation | Risk | Policy | Wiz | Wiz* | Y | Y | Rental terms | Struct | R | SHOWN |
| Price basis | Per day | `pricing_model` | Wiz | Wiz* | Y | Y | Panel | Struct | R | SHOWN |
| Return location, delivery, one-way, late return fees | Logistics | — (`KNOW_BEFORE` text meanwhile) | — | — | N | N | N | — | — | DECISION |
| Deposit, insurance options | Money | — | — | — | N | N | N | — | — | DECISION |

### 4.6 Attractions

| Field | Why | Source | Partner | Admin | DB | API | Detail | Localized | Req | Action |
|---|---|---|---|---|---|---|---|---|---|---|
| Attraction type, guided / self-guided, indoor / outdoor | What visiting is like | Attributes | Wiz | Wiz* | Y | Y | Key facts | Struct | O | SHOWN + DATA |
| Visit duration | Plan | `duration_minutes` | Wiz | Wiz* | Y | Y | Key fact | Struct | O | SHOWN |
| Opening hours, seasonal information | When | Opening hours; `KNOW_BEFORE` | Hours / Wiz | View / Wiz* | Y | Y | Section; Good to know | Struct / Per-lang | O | SHOWN |
| Time slots | Which entry | Units `time_slot_start` | Units | View | Y | Y | How the visit works | Struct | O | NOW SHOWN |
| Ticket / entry information | What I pay for | Price, included / excluded items | Wiz | Wiz* | Y | Y | Panel; What's included | Per-lang | O | SHOWN |
| Age, family suitability | Kids | `min_age`, Family Friendly, `children_allowed` | Wiz | Wiz* | Y | Y | Key fact, amenities, rules | Struct | O | SHOWN |
| Accessibility | Can I enter | Wheelchair, Step-free Access, Accessible Bathroom | Wiz | Wiz* | Y | Y | Amenities | Struct | O | ADDED (applicability) |
| Languages | Guided visits | `languages_offered` | Wiz | Wiz* | Y | Y | Key fact | Struct | O | SHOWN |
| Restrictions, what to bring | Rules | Guest notes | Wiz | Wiz* | Y | Y | Good to know | Per-lang | O | SHOWN + DATA |
| Entrance, parking, transport | Arrival | Address + map; Parking amenity; `KNOW_BEFORE` | Wiz | Wiz* | Y | Y | Location, amenities | Mixed | O | SHOWN |
| Cancellation | Risk | Policy | Wiz | Wiz* | Y | Y | Rules | Struct | R | SHOWN + DATA |
| Ticket types (adult / child / concession) | Price per person type | — | — | — | N | N | N | — | — | DECISION (no ticket-type model) |

### 4.7 Entertainment venues

| Field | Why | Source | Partner | Admin | DB | API | Detail | Localized | Req | Action |
|---|---|---|---|---|---|---|---|---|---|---|
| Venue / activity type | What it is | `venue_type` | Wiz | Wiz* | Y | Y | Key fact | Struct | O | SHOWN + DATA |
| Session duration | Plan | `duration_minutes` | Wiz | Wiz* | Y | Y | Key fact | Struct | O | SHOWN + DATA |
| Session times | When | Units `time_slot_start` | Units | View | Y | Y | How it works (when set) | Struct | O | NOW SHOWN |
| Seating / standing | Comfort | `seating_type` | Wiz | Wiz* | Y | Y | How it works | Struct | O | ADDED |
| Age restriction, family suitability | Kids | `min_age`, `children_allowed`, Family Friendly | Wiz | Wiz* | Y | Y | Key fact, rules | Struct | O | SHOWN |
| Accessibility | Entry | Wheelchair, Step-free Access, Accessible Bathroom | Wiz | Wiz* | Y | Y | Amenities | Struct | O | ADDED (applicability) |
| Language | Shows, escape rooms | `languages_offered` | Wiz | Wiz* | Y | Y | Key fact | Struct | O | SHOWN + DATA |
| Parking | Arrival | Amenity | Wiz | Wiz* | Y | Y | Amenities | Struct | O | SHOWN |
| Entry rules, venue policies | Rules | Guest notes `NOT_ALLOWED` / `KNOW_BEFORE` | Wiz | Wiz* | Y | Y | Good to know | Per-lang | O | SHOWN + DATA |
| Included | What the ticket covers | Included items | Wiz | Wiz* | Y | Y | What's included | Per-lang | O | SHOWN |
| Cancellation / reschedule | Risk | Policy | Wiz | Wiz* | Y | Y | Rules | Struct | R | SHOWN + DATA |
| Dated events, lineups, ticket types | Event booking | — | — | — | N | N | N | — | — | DECISION (venues sell sessions; no event model) |

## 5. New structured fields (full path)

All new fields go through the attribute engine: seed upsert in `seeds/006_search_filters.js`, then `GET /listings/metadata`, the Wizard (`DynamicAttributesStep`, no new component), API validation (`#resolveAttributeValues`, `#checkAttributeConditions`: category scope, option membership, single choice, max 255 characters, conditions), storage, the public and management DTO (`attribute_values`), and Listing Detail.

There is no schema migration: the engine's tables already hold them. Every new field is optional.

| Code | Category | Type | Options (HY / EN / RU labels in `partner.listingWizard.options`) | Rule |
|---|---|---|---|---|
| `guide_type` | Tours | Single choice | Live guide, driver-guide, audio guide, self-guided | O |
| `transport_modes` | Tours | Multiple choice | On foot, car, minibus, coach, off-road vehicle, boat, cable car | O |
| `meals_included` | Tours | Multiple choice | Breakfast, lunch, dinner, snacks, drinks, tasting | O |
| `weather_policy` | Tours | Single choice | Runs in any weather, depends on the weather | O |
| `end_point_type` | Tours | Single choice | Back at the starting point, a different place | O |
| `end_point_details` | Tours | Text, max 255 | — | C: only while `end_point_type = ENDS_ELSEWHERE`; cleared when the answer changes |
| `seating_type` | Entertainment venues | Single choice | Seated, standing, seated and standing | O |
| Step-free Access, Accessible Bathroom | Restaurants, attractions, entertainment venues | Amenities (applicability only) | Existing amenities with existing translations | O |

The Wizard's tour order became: the experience, then who it suits, then the logistics.

## 6. Presentation

- **Grouped facts** (`listingFactGroups.js`, `ListingFactGroupsSection`). Each category's facts are grouped as a traveller weighs them:
  - Tours: "How the tour runs" · "Who it's for", plus its own "Meeting and pickup" section (meeting point, pickup details, start times, where it ends).
  - Attractions: "How the visit works" (with time slots) · "Who it's for".
  - Entertainment venues: "How it works" (with session times) · "Who it's for".
  - Car rentals: "Car" · "Engine and drive" · "Driver and mileage".
  - Stays: "Rooms and space" · "Your stay".
  - Hotels and restaurants: one group.

  Facts already shown in the key facts strip are not repeated. A section with one group shows no sub-heading. An attribute no group names still appears, under "More details", so no stored fact is ever hidden.
- **Rules** (`listingRules.js`): the partner's policies plus the booking rules the panel enforces. Stay limits read in the listing's own unit (`resolveBookableUnitProfile`): nights for lodging, days for cars, not at all for tours, tables or tickets.
- **Truthful empty state:** a section, and its nav link, exists only when it has something to show. Both are decided by the same resolver, so a link never leads to an empty section.
- **Meeting point:** a fixed meeting point reads as the listing's public place (street when public, then city), not "Fixed location". A private stay's street can never reach it, because the public DTO strips it.
- **Lists:** "A, B and C" with the conjunction from the translations (§1, Context7).
- **Tour reading order:** About → Itinerary → What's included → Meeting and pickup → Tour details → Good to know → Amenities → Rules → Reviews → Location → Company → FAQ.

## 7. Demo data

`seeds/demo/seedDemoListingInformationDepth.js` completes one representative listing per category, through the same tables the Wizard writes:

| Category | Listing |
|---|---|
| Hotels | `demo-vendor-boutique-yerevan-hotel` |
| Apartments | `demo-vendor-yerevan-city-loft` |
| Villas | `sprintj-dilijan-forest-villa` |
| Guest houses | `sprintj-goris-cave-country-guesthouse` |
| Restaurants | `sprintj-toros-armenian-kitchen` |
| Tours | `demo-vendor-dilijan-trail-tour` |
| Car rentals | `demo-vendor-ararat-valley-fleet` |
| Attractions | `demo-vendor-certified-yerevan-city-guide` |
| Entertainment venues | `sprintj-labyrinth-escape-rooms` |

Every value agrees with what the listing already said. For example:

- The hike's FAQ says it "runs in light rain", so it is weather-dependent.
- The fleet hands over a full tank and charges the refill, so its fuel policy is full-to-full.
- The fleet's description names Toyota RAV4 SUVs.

Guest notes are written in EN, HY and RU. The other demo listings stay as thin as before: they are the legacy-listing case.

## 8. Security

The public listing response keeps the same field set. The new facts are public by nature and travel in `attribute_values`. Verified by integration tests (`listingInformationDepth.test.js`, `listingDetailPublicDto.test.js`):

- **Who can edit:** anonymous `401`; customer `403`; another company's owner `403`; another company's assigned Manager `403`. The listing's own assigned Manager `200`.
- **Cross-tenant reads:** another company's owner or Manager reads exactly the public shape of a published listing (no `partner_id`, moderation fields or audit timestamps) and gets `404` for a draft.
- **Validation:** an unknown option, two options for a single choice, another category's attribute, a condition that does not hold, and text over 255 characters are all refused (`422`). Changing the controlling answer clears a stale dependent.
- **Unsafe text:** script-shaped text is stored and returned as plain data, and renders as text (unit and component tests). No raw code reaches the page: the e2e matrix checks the main text in HY, EN and RU.
- **Unchanged guarantees:** private address and coordinates, drafts, reviewer privacy and company contact data are as `LISTING_DETAIL_REDESIGN.md` §6 describes, and their tests still pass.

## 9. Performance

| Measure | Before | After |
|---|---|---|
| API GETs, a full load of the Dilijan tour | 10, with `/availability/83/units` fetched twice | 9, no duplicates. Start times come from the units the page already loads, the facts from the listing response. The duplicate came from the reservation panel's not-yet-dated read (`date: null`) hashing to a different cache key than the page's (`date` undefined) for the same URL; `useListingBookableUnitsQuery` now treats both as "no date". |
| SQL statements per `GET /listings/:id` | 24 | 24, for a fully described tour and for a bare legacy tour alike (MySQL `Questions` counter): constant, no N+1 |
| Response size, Dilijan tour | 13,128 characters (derived: this phase's demo values removed) | 15,773 |
| Response size, Ararat Valley fleet | 9,479 (derived) | 11,546 |
| Response size, a bare legacy tour | 1,940 | 1,940 |

## 10. Per-category answers

| Category | What it is | Who it's for | Features | Restrictions | Included | Location / meeting / pickup | Price basis | Still missing |
|---|---|---|---|---|---|---|---|---|
| Hotel | YES | YES | YES | YES | YES | YES | YES | Payment / deposit rules (decision); nearby points of interest (no model) |
| Apartment | YES | YES | YES | YES | YES | YES (approximate, by design) | YES | Security deposit (decision) |
| Villa | YES | YES | YES | YES | N/A (demo villa has no included list; shown when a partner adds one) | YES (approximate) | YES | Security deposit (decision) |
| Guest house | YES | YES | YES | YES | N/A (as villa) | YES (approximate) | YES | Security deposit (decision) |
| Restaurant | YES | YES | YES | YES | N/A | YES | YES | Paid reservations, payment methods (decision) |
| Tour | YES | YES | YES | YES | YES | YES | YES | Child / adult prices (decision); a tour-type taxonomy beyond the category (none exists; the description and highlights carry it) |
| Car rental | YES | YES | YES | YES | YES | YES (pickup) | YES | Deposit, insurance options, return location, delivery, one-way (decisions) |
| Attraction | YES | YES | YES | YES | YES | YES | YES | Ticket types by age (no ticket-type model) |
| Entertainment | YES | YES | YES | YES | N/A (demo venue has none) | YES | YES | Dated events, lineups, ticket types (no event model) |

## 11. Known limitations

- **Single-language free text:** `pickup_details`, `end_point_details`, and the vehicle make and model are entered once and shown as entered in every language. This is the engine's model for text attributes (`LISTING_DETAIL_FIELD_GAP.md` §9). Choices, which are most of the new facts, are localized automatically.
- **Edit lock:** rich content (guest notes, itinerary…) can still be replaced on a published listing, while attributes follow the publish edit lock. This is unchanged and recorded there too.

## 12. Tests

- **Web unit:**
  - `listingFactGroups.test.js`: grouping, the meeting section, conditions, key-fact de-duplication, legacy listings, unsafe text, other categories, the "More details" fallback.
  - `listingRules.test.js`: order, booking rules in nights or days, none for tours, plurals.
  - `metadataValueFormat.test.js`: list grammar in HY, EN and RU, durations, labels.
  - `ListingFactGroupsSection.test.jsx`.
  - Updated: `listingDetailSections.test.js` (nav integrity, tour order), `listingKeyFacts.test.js`, `MetadataValueDisplay.test.jsx`, `listingWizardVocabulary.test.js` (new codes need labels in all three languages).
- **API integration:** `listingInformationDepth.test.js` (19 tests: metadata, input → public response, validation, conditions, optional legacy, permissions, cross-tenant isolation).
- **E2E:** `listingDetail.spec.js`:
  - The matrix of 9 categories × HY/EN/RU × 7 widths now runs on the fully described listings. It checks that every nav link has content and that no raw codes appear, in addition to the overflow, image, booking-bar, axe, console and 5xx checks.
  - 18 decisive-fact checks.
  - A legacy listing with no fact sections.
