# Category-Aware Booking / Action Widget and Restaurant Menu Pre-order

The third phase after the shared listing card and the Listing Detail redesign. It rebuilds the reservation panel on Listing Detail as one shared booking framework with explicit per-category configuration. It also adds a restaurant menu pre-order: the customer reserves a table together with real dishes from the partner's menu, and the partner sees exactly what was ordered.

Base: `main` at `d644800` (= `origin/main`).

## 1. Gate

| Tool | Inspected | Decision it drove |
|---|---|---|
| Graphify | An AST graph of the booking chain: the API's bookings, booking-holds, availability, pricing, payments and listings (menu) modules and `core`; on the web, the widget, checkout, bookings, booking-holds, payments, partner booking detail and the menu manager. 391 files, 2,432 nodes, 5,962 edges. | `ListingReservationWidget` is one 1,403-line component (36 functions, 77 imports) with the categories as inline conditionals. That is the split target. The server path (`createHolds` → `reserveCapacity` under row locks → `createBooking` → `#resolveItem` → `isAcceptedQuoteCurrent`) is already authoritative for price and capacity, so the rebuild keeps it. The menu domain (`restaurantMenuService`) has no edge to bookings: the pre-order is new. |
| Context7 | TanStack Query v5: query cancellation (`queryFn({ signal })`), `placeholderData: keepPreviousData` / `isPlaceholderData`. | The units read passes the query's `signal` to axios, so a superseded date or stay-range read is cancelled. Each date and stay range is its own cache key and no placeholder data is used: a late answer can never overwrite the current selection, and while the new answer loads the panel shows no total and keeps the CTA gated (§6). |
| 21st.dev | Searches: hotel booking sidebar, restaurant table reservation, menu order stepper + subtotal, guest/traveller selector, event ticket/session selection, mobile sticky bar / bottom sheet. Compared: Booking Calendar (nights count), Two-Month Range Picker, pricing calendar, Time Slot Picker (radio groups), Booking Slot Calendar, Slot Week Picker, Table Floor, Quantity / Quantity Stepper, Checkout Summary, Order Summary Separator, Food carousel, Sushi conveyor, Guest Selector, User Schedule (multi-step), Drawer / Bottom Sheet, Smooth Drawer, Glass Checkout Card. | §4. |
| desavii-frontend-design | Before and after. | Navy text, gold only on the CTA accent and the selected state; no chips; no field crosses verticals (a car never shows guests); HY/RU wrapping; reduced motion. |
| frontend-ui-engineering | Before and after. | Shell plus strategies instead of a mega-component; steppers and radio-group slots instead of raw number/time inputs where it helps; the menu sheet traps focus and returns it; errors announced. |
| security-and-hardening, api-and-interface-design | Before implementation. | The pre-order threat model (§6). An additive `menuSelections` on the restaurant booking item. The single-use hold kept as the booking's natural idempotency token, rather than a second key system. |
| Strix | `strix` 1.7.0 is installed and Docker runs, but no LLM key is configured and the cloud account is not signed in. It was **not run**: requesting real secrets is out of bounds for this phase. Security is covered by the targeted adversarial and concurrency tests in §8. | |

## 2. Architecture before

```
Listing Detail ─ ListingReservationWidget (1,403 lines, all categories)
   ├─ useListingBookableUnitsQuery(listing)               units
   ├─ useListingBookableUnitsQuery(listing, {date})        departures on a date
   ├─ useListingBookableUnitsQuery(listing, {checkIn,checkOut}) stay quote per room
   ├─ useListingCalendarQuery / useListingDayStatusQuery   per-day price / sold-out
   ├─ useListingHourlyAvailabilityQuery                    hourly rooms
   ├─ estimate: computeEstimatedTotal (client) or stay_total_amount (server)
   └─ POST /booking-holds → navigate(checkout, state)
Checkout ─ useCheckoutQuote → POST /bookings {items[holdIds, guestCount, expectedTotalAmount, expectedCurrency]}
Server ─ reserveCapacity (row-locked availability_calendar, booking rules, past-start)
       ─ createBooking: lock + delete own active holds (FOR UPDATE), reprice, 409 PRICE_CHANGED on mismatch
Restaurant ─ RESTAURANT_TABLE unit, one reservation = quantity 1, guest_count = party size,
             charge = 0 AMD (payment-exempt RESTAURANT_RESERVATION); menus are display-only.
```

Category → unit type: hotels `HOTEL_ROOM`; apartments, villas and guest houses `PROPERTY_UNIT`; restaurants `RESTAURANT_TABLE`; tours, attractions and entertainment venues `TOUR_DEPARTURE` (a time slot when set); car rentals `VEHICLE`.

## 3. Bug ledger (before)

Measured on the representative listings (`seedDemoListingInformationDepth.js`) in HY / EN / RU at 390–1920 px, then by driving each flow at 1440 px.

| # | Finding | Category | Severity |
|---|---|---|---|
| W-01 | A car rental shows a **Guests** field. | Car | High (forbidden foreign semantics) |
| W-02 | "PICKUP" / "RETURN" labels are CSS-uppercased in all three languages ("ՍՏԱՑՈՒՄ"). | Car | Medium |
| W-03 | Every category's CTA reads "Request to book", including a free table reservation. | All | Medium |
| W-04 | Entertainment and attraction sessions without a fixed time open a **date range** picker ("Nov 30 – …") for a single visit. | Attraction, Entertainment | High (wrong semantics) |
| W-05 | The attraction's date control did not open from its first trigger. | Attraction | Medium |
| W-06 | The hotel room selector is labelled "Unit"; the guest house's room count is labelled "Quantity". | Hotel, Guest house | Low |
| W-07 | Totals appear as one number ("$70.00 estimated total") with no breakdown: no "2 nights × $35", no "3 days × $33.75" for the car's inclusive rental days. | Stays, Car | Medium |
| W-08 | A tour shows no traveller count until a departure is chosen; the count is "Quantity" under the hood. | Tour | Medium |
| W-09 | Restaurant: a raw `type=time` input with no slot guidance; no way to see or pre-order the menu. | Restaurant | High (feature gap) |
| W-10 | Party size, guests, visitors and participants are raw `type=number` inputs (free typing, spin buttons). | Several | Low |
| W-11 | The RU CTA "Отправить запрос на бронирование" is long on a phone bar (it wraps since the Detail phase; still heavy). | All (RU) | Low |
| W-12 | The panel price wording ("$46.25 Per night") differs from the card ("From $46 / night") for the same rule. | Stays | Low (recorded in the Detail phase) |
| W-13 | The panel does not state what happens on submit (request to the partner, nothing charged). | All | Medium |
| W-14 | No restaurant menu pre-order exists anywhere: no storage, no API, no partner view. | Restaurant | High (required feature) |
| W-15 | The public menu tree includes inactive items and menus; a pre-order must never offer them. | Restaurant | High (if reused naively) |
| W-16 | Menu items are hard-deleted; a pre-order that referenced them must keep its own snapshot. | Restaurant | High (history) |

Verified correct before changes: no horizontal overflow at any width, no clipped bar content, no console errors. There were no duplicate API reads on load or during date selection: 9–13 GETs per page, after the Detail phase's units-key fix.

Server guarantees already present:
- Capacity is row-locked at hold time.
- Holds are single-use, consumed `FOR UPDATE` inside the booking transaction.
- Every item is repriced at booking (`409 PRICE_CHANGED`).
- Past-start and booking rules are enforced server-side.
- A restaurant reservation is free and payment-exempt.

## 4. The rebuilt panel

### Flows, not categories

`apps/web/src/modules/listings/utils/bookingFlows.js` resolves one flow from the listing's real bookable units, never from its category name, and states what that flow means:

| Flow | Units | Dates | Count | Separate guests | Length | Action (EN / HY / RU) |
|---|---|---|---|---|---|---|
| STAY | `HOTEL_ROOM` | check-in → check-out | rooms | guests | nights | Reserve / Ամրագրել / Забронировать |
| HOME | `PROPERTY_UNIT` | check-in → check-out | rooms | guests | nights | Reserve / Ամրագրել / Забронировать |
| DEPARTURE | `TOUR_DEPARTURE` | one date (+ its departure time when timed) | travelers / visitors / participants | — | — | Book tour / Ամրագրել տուրը / Забронировать тур; Book visit / Ամրագրել այցը / Забронировать посещение; Book session / Ամրագրել սեանսը / Забронировать сеанс |
| VEHICLE | `VEHICLE` | pickup → return, with times | cars | — | calendar rental days, both ends inclusive (§11) | Rent this car / Վարձակալել մեքենան / Арендовать автомобиль |
| RESTAURANT | `RESTAURANT_TABLE` | one date, one time | — | party size | — | Reserve a table / Ամրագրել սեղան / Забронировать столик; with dishes: Reserve with pre-order / Ամրագրել նախապատվերով / Забронировать с предзаказом |
| GENERIC | none known | range | units | guests | — | Request to book |

A departure's action names what is booked from its category: tours → tour, attractions → visit, entertainment venues → session. The listing type decides only when it is unambiguous (TOUR → tour). An ATTRACTION-type departure whose category is not known yet (the categories read is still loading, or the category is not offered in that locale) gets the neutral "Request to book", never a guessed "Book tour" (§12). The mobile bar reads the same cached units query and shows the same action.

### Composition

```
ListingReservationWidget (shell: price → flow fields → counts → summary → action)
├─ renderStayFields        dates first, room type, hourly mode (unchanged contract)
├─ renderDepartureFields   one date; timed → departure chips, untimed → option + date
├─ RestaurantReservationFields   date, open times, party size, table only / + pre-order
│   └─ MenuPreorderPicker  (Modal on the desktop panel; in-place step in the sheet)
├─ VehicleRentalFields     pickup and return legs, sentence case
├─ QuantityStepper         rooms / cars / people / party size (−, typed value, +)
├─ ReservationSummary      nights or rental days, rooms or cars, people, estimate
└─ action + "You won't be charged now — the partner confirms your request first."
```

Pure modules carry the rules and are unit-tested on their own: `bookingFlows.js`, `restaurantTimeSlots.js`, `menuPreorder.js`, `reservationSummaryRows.js`; `useMenuPreorder` holds only quantities and derives every title and price from the menu itself.

### Bug ledger (after)

| # | Resolution |
|---|---|
| W-01 | VEHICLE has no guest field (`FLOW_CONFIG.VEHICLE.guests = null`); checkout receives no guest count for a rental. |
| W-02 | Pickup / Return titles are sentence case (`text-transform` removed). |
| W-03 | Action per flow, in all three languages, on the panel and the mobile bar. The old `requestToBookByGroup` keys, `resolveBookingCtaKey(group)` and `resolveBookingCtaLabel` are removed. |
| W-04 | An untimed departure has one date (`dateFrom = dateTo`); its option stays selected when the date changes. |
| W-05 | The single date picker is the standard `DatePicker`; it opens from its trigger in the matrix at every width. |
| W-06 | The option list is named per flow: Room type, Accommodation, Option, Car, Dining area. The count is Rooms or Cars. |
| W-07 | `ReservationSummary`: nights or rental days, rooms or cars, people, then "Estimated total". |
| W-08 | A departure always shows its people stepper, labelled in its category's word, and the summary repeats it once a date is chosen. |
| W-09 | Restaurant times are the partner's own opening hours on that weekday in 30-minute steps; times already past on the venue's today (Asia/Yerevan) are left out. No published hours → a free time field, never an invented schedule. |
| W-10 | Every count is a `QuantityStepper`: a labelled number field with − / + buttons that name what they change and disable at their bounds. |
| W-11 | The RU action is now 2–3 words ("Забронировать столик", "Арендовать автомобиль"); the generic RU label only remains for a listing without known units. |
| W-12 | Unchanged (recorded in the Detail phase; the card and panel share `resolvePricingModelLabel`). |
| W-13 | The note under the action states that nothing is charged now and the partner confirms first. |
| W-14 | §5. |
| W-15 | Only active menus and active dishes are orderable (`resolveOrderableSections` on the web, `findOrderableItems` on the server). |
| W-16 | Each ordered dish is stored as a snapshot; `menu_item_id` becomes `NULL` when the dish is deleted (§5). |

### Patterns taken and rejected (21st.dev)

- Taken: quantity stepper with bounds; checkout-style summary rows with one honest total; a compact sticky bar that opens one sheet; a "nights" count beside the range.
- Adapted: the time-slot picker. Timed departures keep their chips (a few departures per day). Restaurant times are a select, because a day of half-hour times (often 20+) is too many chips on a phone.
- Rejected: price-per-day calendar overlays (noise, and the server quote is authoritative), the week-slot carousel, a table floor plan (no such data), food carousels and conveyors, multi-step schedulers, glass/shimmer drawers, and any modal opened over the mobile sheet.

### Mobile

Below laptop width the fixed bar shows the price and the flow's action; it opens one bottom sheet with the same panel (`presentation="sheet"`). In the sheet the menu is an in-place step: "Back to reservation" returns to the untouched form, and focus moves to the step heading and back to the pre-order block. The panel's `overflow: clip` (not `hidden`) keeps the menu's subtotal footer sticky inside the sheet.

## 5. Restaurant menu pre-order

### Modes

- **Table only** (Mode A): date, time, party size. Free, payment-exempt, unchanged on the server.
- **Table + dish pre-order** (Mode B): the same reservation plus dishes from the partner's real menu in the page language, with quantities. Offered only when that menu has at least one active dish; Sevan and Vanadzor (English menus only) show no pre-order in HY / RU.

### Menu source

`GET /listings/:id/menu?locale=` — the partner-managed `restaurant_menus → sections → items`, already loaded by the page for the menu section, so the pre-order adds no request. The server never trusts this copy: it reads the orderable dishes again inside the booking transaction.

### API (additive)

`POST /bookings` item fields, only for a `RESTAURANT_TABLE` item:

| Field | Rule (422 when broken) |
|---|---|
| `menuSelections` | optional array, 1–30 lines, each `{ menuItemId: positive int, quantity: int 1–20 }`, no repeated dish |
| `expectedMenuSubtotalAmount` | required with `menuSelections`; the two-decimal string the customer saw |
| `expectedMenuCurrency` | required with `menuSelections`; 3-letter code |

Inside the booking transaction, `BookingService#resolvePreorder`:

1. Refuses a pre-order on any other unit type: `422 MENU_PREORDER_NOT_SUPPORTED`.
2. Reads the requested dishes with one parameterised query limited to this listing's active menus and active dishes (`findOrderableItems`). Any other id is `422 MENU_ITEM_UNAVAILABLE`, one detail per dish with its `menuItemId`. This covers inactive dishes, inactive menus, deleted dishes and another restaurant's dishes.
3. Refuses mixed currencies: `422 MENU_CURRENCY_MISMATCH`.
4. Prices every line from the menu (`pricePreorder`, `Money`). If the subtotal or currency differs from what the customer confirmed, it returns `409 MENU_PRICE_CHANGED` with the current lines (`menu_item_id, title, quantity, unit_price_amount, line_total_amount, currency`), `subtotal_amount` and `currency`. Nothing is written, and the holds stay.
5. Writes `booking_item_menu_selections` snapshots: title, section title, language, quantity, unit price and currency per line.

The booking's charged total is unchanged: the reservation stays `0.00`, `payment_required: false`, and the payment status stays `NOT_REQUIRED_ON_PLATFORM`. Responses add `items[].menu_preorder` (`null` for a table only):

```json
{ "lines": [{ "menu_item_id": 3, "title": "Pork khorovats", "section_title": "Khorovats (Grilled Skewers)",
              "language_code": "en", "quantity": 2, "unit_price_amount": "5500.00", "line_total_amount": "11000.00" }],
  "subtotal_amount": "11000.00", "currency": "AMD", "payment": "PAY_AT_VENUE" }
```

### Storage

Migration `0057_booking_menu_preorder`: `booking_item_menu_selections` (`booking_item_id` FK, `menu_item_id` NULL FK `ON DELETE SET NULL`, the snapshots, `quantity > 0` and `unit_price_amount >= 0` checks, index `(booking_item_id, sort_order)`). Snapshots are never rewritten: a later price change, rename, deactivation or deletion of the dish leaves the booking as ordered.

### Payment semantics

Paid at the restaurant. Nothing is charged on Desavii (`PAYMENTS_ENABLED=false` unchanged); no deposit or prepayment exists or is implied. Every surface says so: the picker footer, the panel summary, checkout, and the customer, partner and admin booking details.

### Client flow and errors

- The widget hands the priced lines to checkout through router state (`menuPreorder`). The hold never carries dishes.
- Checkout (`useCheckoutPreorder`) sends only ids, quantities and the subtotal.
- `MENU_ITEM_UNAVAILABLE`: the named dishes are removed and the guest is told which. The table stays held and the rest of the form is kept; the guest confirms again.
- `MENU_PRICE_CHANGED`: the current lines are shown. Booking stays disabled until the guest accepts them or chooses "Reserve the table only". It never resubmits on its own.
- Each change is written back to the history entry, so reload and back/forward keep it.
- The partner and the admin read "Reservation: Table only" or "Table with dish pre-order" and the stored lines (`BookingItemMenuPreorder`).

Menu options and modifiers: N/A. The menu domain has none.

## 6. Security and correctness

| Threat | Control | Proof |
|---|---|---|
| Client-chosen prices | The request carries ids and quantities only; titles and prices come from the menu inside the transaction. | Integration: a client price is ignored → 409; a price change → 409 with current lines, then the retry succeeds. |
| Foreign / inactive / deleted dish (IDOR, tenant isolation) | `findOrderableItems` filters by `listing_id`, active menu and active dish. | Integration: another restaurant's dish, an inactive dish, an inactive menu and a deleted dish each → 422 `MENU_ITEM_UNAVAILABLE`. |
| Reading another booking's pre-order (BOLA) | Unchanged booking authorisation: the customer, the listing's partner and the admin only. | Integration: another customer and another partner → 404. |
| Tampering and malformed input | zod at the boundary: positive ints, 1–20 portions, at most 30 lines, no duplicates, two-decimal strings. | Integration: 0, −2, 21, 2^40, 1.5, SQL-shaped and negative ids, duplicates, 31 lines → 422 with no SQL or stack in the body. |
| Stored XSS | Titles are stored and rendered as text (React escaping). | Integration (stored as text) and unit (`<b>Gata</b>` rendered literally). |
| Double submit | The single-use holds are consumed `FOR UPDATE` inside the booking transaction. | Integration: two concurrent submits of the same holds → one booking, one set of lines. |
| Oversell | Capacity stays row-locked at hold time. | Integration: last-table race → `[201, 409]`. |
| Stale or out-of-order reads | One cache key per date and stay range, no placeholder data, superseded reads cancelled (`signal`). | Unit: the query passes an `AbortSignal`. |
| Pre-order on a non-restaurant unit | `MENU_PREORDER_NOT_SUPPORTED`. | Integration (tour). |

Strix was not run (no LLM key or cloud session, and real secrets are out of bounds); this is not a claim that the code cannot be attacked.

## 7. Demo data

`seedDemoListingInformationDepth.js` gives the representative restaurant (Toros Armenian Kitchen) its Armenian and Russian menus: the same dishes and prices as its English one, written per language as a partner authors them. Each language also gets one seasonal dish the partner switched off ("Ghapama (seasonal)"), so the "not offered" state is real. No dish is invented beyond the restaurant's existing menu. Sevan and Vanadzor keep English menus only, which covers "no menu in this language". Every category's representative listing has real bookable units (hotel rooms, property units, timed and untimed departures, a vehicle, a dining room).

## 8. Tests

- API unit: `restaurantPreorder` (pricing, unavailable ids, mixed currency, subtotal acceptance) and `toMenuPreorderResponse`.
- API integration: `bookings/restaurantMenuPreorder.test.js`, 24 cases (§6).
- Web unit:
  - `bookingFlows`, `menuPreorder`, `restaurantTimeSlots` and `reservationSummaryRows`.
  - The widget: actions per flow; untimed departure as one date; a car without guests; the restaurant's times from opening hours, its party size, table only and pre-order in the dialog and in the sheet step; the free time fallback.
  - The mobile bar's action per flow.
  - Checkout: the dishes and subtotal shown; the payload carries ids only; unavailable dish removal; changed price acceptance; table only.
  - `BookingItemMenuPreorder`.
- Playwright `bookingWidget.spec.js`:
  - 9 categories × HY/EN/RU, each at 390/430/768/1024/1280/1440/1920: the action text, no foreign guest field, no overflow, no console error. Screenshots are taken at 390 and 1440.
  - A restaurant table-only booking, end to end.
  - A pre-order in the desktop dialog, end to end, read back by the guest and the partner.
  - A pre-order in the HY mobile sheet (one dialog only, focus on the step heading, Back keeps the form).
- The existing e2e specs now use the new action and label wording (exact label matching, since a stepper's buttons carry the field's name).

## 9. Performance

| Measure | Before | After |
|---|---|---|
| API reads on load, restaurant page | 9–13, no duplicates | 13 listing reads (listing, categories, fx, favorites, units, availability, availability summary, metadata, menu, opening hours, related, calendar, day status), no duplicates |
| Extra reads for the pre-order | — | 0: it reuses the page's menu and opening-hours queries |
| SQL per booking with a pre-order | — | +1 read (`findOrderableItems`, one `IN (…)` query) and +1 bulk insert; detail reads +1 query for all items' lines |
| Superseded availability reads | completed and discarded | cancelled through the query `signal` |
| Main JS bundle (production build, `index-*.js`) | 1,098.11 kB, gzip 318.08 kB (HEAD `d644800`, built from `git archive`) | 1,119.60 kB, gzip 324.92 kB (+6.8 kB gzip: the flow modules, stepper, summary, menu picker, checkout pre-order and the shared pre-order summary) |
| `ListingDetailPage` chunk | 10.43 kB | 10.44 kB |
| Main JS bundle after the closure (§10–§13) | — | 1,120.66 kB, gzip 325.28 kB (+0.36 kB gzip for the opening-hours rule, the hint and the focus-trap fix) |

## 10. Restaurant hours past midnight (closure)

**Date semantics.**
- A reservation names its real calendar date and wall-clock time in the venue's time (Asia/Yerevan).
- A weekly window is half-open, `[opens_at, closes_at)`.
- `closes_at <= opens_at` runs past midnight, and the after-midnight tail belongs to the next calendar date:
  - Friday 18:00–02:00 offers Friday 18:00–23:30 when Friday is chosen.
  - When Saturday is chosen, it offers 00:00–01:30 first, then Saturday's own hours.
  - 18:00–00:00 ends exactly at midnight and has no tail.
  - Equal times are a 24-hour window.
- A closed or unpublished weekday has no window of its own, but it still receives the previous night's tail.
- On the venue's today, past times are left out.
- A restaurant with no published hours shows a free time field, and the server does not restrict it.

**Enforced on the server.** `core/domain/openingHours.js#isWithinOpeningHours` runs in `AvailabilityService#reserveCapacity`. It reads the hours through `OpeningHoursService#findWeeklyHoursSystemInternal` (Listings → Availability, public service only). A time outside the hours is `422 RESERVATION_OUTSIDE_OPENING_HOURS` and reserves nothing.

**On the web.**
- `restaurantTimeSlots.js#buildReservationTimes` lists exactly the times the server accepts, in 30-minute steps from each opening.
- When the chosen date's own window runs past midnight, the panel says "Open until 02:00 — times after midnight are on the next date." (HY/EN/RU).
- A server refusal is announced with its own message.

**Demo.** Toros Armenian Kitchen now serves Friday and Saturday 11:00–02:00. Before, these were seeded as 23:59, a stand-in for "late".

**Proof.**
- API unit tests (`openingHours.test.js`): same-day, midnight end, closing at 00:30/01:00/02:00, the gap, the next-day opening, the week wrap, 24 hours.
- API integration (`bookingFamilySemantics.test.js`): 5 accepted and 7 refused moments, plus midnight end and no hours.
- Web unit tests (`restaurantTimeSlots.test.js`, the widget's restaurant tests): the tail first, the gap, the closed next day, today and the Asia/Yerevan date boundary, the hint, the refusal message.
- Playwright: HY/EN/RU at 390/768/1024/1440, with screenshots `restaurant-late-night-*`. A real hold at Sunday 01:00 is held on that Sunday.

## 11. Car rental pricing rule (audit)

**Rule.** A car rental is priced by **calendar days, both ends inclusive**: `days = dateTo − dateFrom + 1`. Pickup and return times never change the count. The price is the daily prices over those days × cars. Sources:
- `core/domain/accommodationDateSemantics.js#resolveConsumedRange`: VEHICLE keeps inclusive-both-ends.
- API_SPECIFICATION.md, booking rules ("inclusive rental days = `dateTo − dateFrom + 1`; pickup/return times never change the count") and pricing ("daily prices over the inclusive rental days × vehicles").
- CALENDAR_AVAILABILITY.md.

It is a calendar-day rule, not a 24-hour rule. That is a product decision recorded before this phase, and it was audited here, not changed.

**Boundaries, proven on the server** (hold quote and booked total, `bookingFamilySemantics.test.js`) **and on the client** (summary days and estimate, `reservationSummaryRows.test.js`):

| Rental | Days billed |
|---|---|
| same day 10:00 → 18:00 | 1 |
| same day 00:00 → 23:59 | 1 |
| two dates, under 24 h (22:00 → 09:00) | 2 |
| around midnight (23:30 → 00:30) | 2 |
| exactly 24 h (10:00 → 10:00) | 2 |
| 24 h + 1 min | 2 |
| 25 h | 2 |
| Mon 10:00 → Thu 10:00 | 4 |
| two cars, three dates | 3 × 2 |

The dates are wall-clock dates in Asia/Yerevan, with no timezone conversion. A pickup already past in Asia/Yerevan is `BOOKING_IN_PAST`. The client and server agree on every row, so there are 0 overcharge or undercharge cases against the rule.

## 12. Security closure

**Found and fixed: foreign inventory injection (High).**
- *The gap.* `ListingService#assertBookable` did not check publication status, and `POST /booking-holds` takes a raw `bookableUnitId`. Unit ids are sequential, so any signed-in customer could hold and book a unit of a **draft, unpublished or rejected** listing by guessing its id.
- *The fix.* Only a PUBLISHED listing is bookable. Any other status answers `404`, as the public detail does, so the listing's existence is not revealed. An expired listing keeps its `409 LISTING_NOT_BOOKABLE`, because expiry is checked first.
- *Fixtures.* The integration fixtures that held units on never-published listings now publish them (`helpers/markListingBookable.js`). The two tests that deliberately need a draft keep one.

**Direct-API abuse cases per family** (`bookingFamilySemantics.test.js`):

| Family | Refused |
|---|---|
| Lodging | unknown unit (404), draft listing's unit (404), more guests than the rooms sleep (`GUEST_CAPACITY_EXCEEDED`), more rooms than exist (409), check-out before check-in and zero nights (422), tampered total or currency (409 `PRICE_CHANGED`; the untampered retry books the server's 60,000.00) |
| Tour | more travellers than seats (409), a client-sent departure time ignored (the booking keeps 09:00), a past date (422), a tampered total (409; the server books 30,000.00) |
| Car rental | return before pickup (`RETURN_NOT_AFTER_PICKUP`), the only car already held for the next customer (409), 2 or 999,999 cars of a one-car fleet (409), quantities 0, −1, 1.5 and "two" (422, no SQL or stack in the body), a tampered total (409) |
| Attraction / entertainment | more visitors than places (409), stale availability (another customer's held places, 409), sessions of two venues as one booking (`MULTI_LISTING_BOOKING`), a tampered total (409; the server books 8,000.00) |
| Tenant isolation | another customer cannot book someone's holds or read the booking (404); another partner cannot read it (404); the customer and the listing's partner can |

Restaurant pre-order abuse cases are in §6.

## 13. Accessibility evidence

`tests/e2e/bookingWidgetAccessibility.spec.js` (Playwright + axe):

- **axe, serious/critical, 0.** Scanned at EN 1440, HY 390 and RU 390:
  - the panel or sheet of a hotel, apartment, restaurant, tour, car rental, attraction and entertainment venue;
  - the restaurant menu: the dialog on desktop, the sheet step on phones.
- **Keyboard only, restaurant + menu, through to checkout:**
  1. Tab into the date and choose it with the arrow keys and Enter.
  2. Open the time list with ArrowDown and choose with Enter.
  3. Raise the party size with Enter on its stepper.
  4. Choose "with dishes" with ArrowDown on the radio group.
  5. Open the dish dialog with Enter and add two dishes with Enter and Space.
  6. Press Done; focus returns to "Edit dishes".
  7. Press Enter on the action and reach checkout.
- **Visible focus.** The focused stepper button has an outline.
- **Focus trap.** 40 Tabs never leave the menu dialog or the booking sheet.
  - *Found and fixed in the shared `useFocusTrap`:* it treated an unchecked radio, and any `tabindex="-1"` control, as the last Tab stop. A browser stops only on a radio group's checked radio, so Tab from the real last stop (the "Table only" radio, before the disabled action) escaped behind the sheet. The trap now wraps from the real Tab stops, with unit tests.
- **Focus return.**
  - Escape returns focus to the dialog's opener, and to the sheet's opener.
  - The sheet's menu step takes focus on its heading.
  - "Back" returns focus to the pre-order block in the same commit (previously one frame later, with focus briefly on the page body).
- **Errors announced.**
  - A return before pickup is `role="alert"`.
  - Server refusals are toasts (`role="status"`, polite).
  - Checkout's changed-price and removed-dish notices take focus.
  - The opening-hours refusal has its own message.
- **Disabled and unavailable states.** The action is disabled until the flow is complete. A stepper at its bound is disabled. A sold-out room or time is disabled, not hidden.
- **Touch targets** on a phone are at least 24 × 24 px (WCAG 2.2 AA). The stepper buttons are 36 px.
- **Reduced motion.** With `prefers-reduced-motion: reduce` actually emulated, the sheet's animation and transitions collapse to 0.01 ms.
  - *Note:* a file-level `test.use({ reducedMotion })` was found not to reach the page in this setup, so the test uses `page.emulateMedia` and asserts the media query matches.
