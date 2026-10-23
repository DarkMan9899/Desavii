# Calendar & Availability

How Desavii decides what can be booked, and how the Partner Calendar shows
and changes it. Written for engineers changing availability, holds,
bookings or the calendar UI. The code is the authority; this document says
where each rule lives and why.

## 1. Business date and timezone

Every listing is in Armenia, so "today" is the **Asia/Yerevan** calendar
date (UTC+4, no daylight saving):

- API: `apps/api/src/core/domain/bookingTimebase.js` (`BUSINESS_TIMEZONE`).
- Web: `apps/web/src/utils/businessDate.js` (`getBusinessToday`,
  `addBusinessDays`).

Never derive "today" from `new Date().toISOString()` (the UTC date) or the
browser's local date. Between 00:00 and 04:00 in Yerevan the UTC date is
still yesterday. Before this phase, the Partner Calendar and Listing Detail
opened on the wrong day in that window.

Date-only values (`YYYY-MM-DD`) are calendar days, not instants. Arithmetic
anchors them at `T00:00:00Z`. Formatting them uses `timeZone: 'UTC'`
(`createDateFormatter` in `packages/ui/src/utils/dateFormat.js`), so a
browser west of UTC never shows the previous day.

Boundaries covered by tests (Yerevan date for a UTC instant):

| UTC instant          | Yerevan date |
|----------------------|--------------|
| 2026-10-22 19:59     | 2026-10-22   |
| 2026-10-22 20:00     | 2026-10-23   |
| 2026-10-22 20:01     | 2026-10-23   |
| 2026-10-22 23:59     | 2026-10-23   |
| 2026-10-23 00:00     | 2026-10-23   |

Customer date pickers follow the same rule. Each caller passes
`getBusinessToday()` as the `DatePicker`'s `today`, which sets the month it
opens on and the day it marks as today. The picker also reads every
`YYYY-MM-DD` value, `minDate` and `maxDate` as that calendar day, so a
visitor west of UTC never sees the previous day or opens on last month.

## 2. What a date range means, per unit type

| Category       | Unit type          | Range semantics                                   | Quantity means      |
|----------------|--------------------|---------------------------------------------------|---------------------|
| HOTEL          | `HOTEL_ROOM`       | Nights, checkout-exclusive `[checkIn, checkOut)`  | Rooms of that type  |
| PROPERTY       | `PROPERTY_UNIT`    | Nights, checkout-exclusive                        | Whole units         |
| CAR_RENTAL     | `VEHICLE`          | Rental days, both ends inclusive, plus pickup and return times | Cars in the fleet (one unit) |
| TOUR           | `TOUR_DEPARTURE`   | Departure date(s), inclusive                      | Seats / people      |
| ATTRACTION     | `TOUR_DEPARTURE`   | Same as TOUR                                      | Visitor places      |
| RESTAURANT     | `RESTAURANT_TABLE` | One date plus a start time                        | Tables              |
| ENTERTAINMENT  | none               | Not bookable; informational only                  | —                   |

- **Checkout exclusive.** A stay 24 → 25 October consumes the night of the
  24th only. The 25th stays free for the next guest. Rule:
  `resolveConsumedRange` (API `core/domain/accommodationDateSemantics.js`,
  mirrored in web `modules/listings/utils/accommodationDateSemantics.js`).
  A same-day accommodation range (`from === to`) is one day, never zero
  nights.
- **Hourly hotel stays** (opt-in per `HOTEL_ROOM`): half-open `[start, end)`
  on one date. A stay may not cross midnight
  (`HOURLY_CROSS_MIDNIGHT_NOT_SUPPORTED`); an overnight stay is booked by the
  night.
- **Time-sliced departures** carry their own `time_slot_start`/`end` on the
  unit. The calendar positions them on a fixed 06:00–23:00 axis.
- The Partner Calendar shows the same rule on every block and external
  reservation: "1 night" for a hotel room, "2 days" for a tour departure
  (`PartnerCalendarPageContent/inventorySpan.js`).

## 3. Sources of truth and precedence

Per unit and date, `availability_calendar.quantity_available` is the
remaining capacity. Every consumer writes it inside one transaction with a
ledger row:

| Source                         | Table                     | Effect                       |
|--------------------------------|---------------------------|------------------------------|
| Desavii booking                | `bookings` / `inventory_ledger` | Consumes capacity      |
| Active hold (15 min default)   | `reservation_holds` / `inventory_ledger` | Consumes until it expires or converts |
| Manual block                   | `inventory_blocks`        | Consumes `quantity` per date |
| External reservation           | `external_reservations`   | Consumes `quantity` per date |
| Status override (`BLOCKED`)    | `availability_calendar.status_id` | Closes the date regardless of capacity |
| Blackout                       | `blackout_dates`          | Vetoes the whole listing     |

Day state shown to partners (`resolveDayStatus.js`), in this order:

1. `blocked`: status override `BLOCKED`, or manual blocks cover the whole
   capacity.
2. `full`: nothing left.
3. `partial`: some capacity left.
4. `available`: full capacity left.

Customer-facing status (`availability-summary`, `day-status`) reads the same
`quantity_available` with the blackout veto, so Search, Listing Detail and
the booking widget agree.

**Price per date:** unit date override → unit base price → listing base
price (`core/domain/accommodationPriceResolution.js#resolvePriceForDate`).
Holds quote with the same function the booking charges with.

## 4. Writes: atomicity and concurrency

- Capacity rows are locked per date in **ascending date order**
  (`lockForCapacity`). Two writers on overlapping ranges queue instead of
  deadlocking.
- Last-inventory races are covered by `tests/integration/booking-holds/
  lastInventoryRaces.test.js`. Simultaneous requests for the last room,
  seats or tables hold exactly the capacity. Every other request gets a 409;
  none gets a 500.
- **Release and cancel claim first** (Calendar Excellence fix). The guarded
  `UPDATE … WHERE released_at IS NULL` decides which request releases.
  Capacity is restored only by that request, from the row re-read under the
  lock. Before this, two concurrent "Unblock" clicks restored the same rooms
  twice (capacity 4 on a 2-room unit).
- **Edit a block** (`PATCH /availability/blocks/:id`) in one transaction:
  1. Lock the old and new dates together, in ascending order.
  2. Give the old dates back.
  3. Take the new dates.

  If the new dates do not fit, the request returns 409
  `AVAILABILITY_CONFLICT` and the block stays exactly as it was. A released
  block returns 409 `ALREADY_RELEASED`.
- **Another partner's block or external reservation looks missing.** Edit,
  remove or cancel by id from outside the owning partner returns the same
  404 as an id that does not exist, active or not. A 403 or a 409 would
  confirm the object exists. Members of the owning partner still get 403
  when their role lacks the capability, and admins with
  `inventory.manage_all` keep access.

## 5. Limits and validation

- Every date range a request writes, holds or scans per date is capped at
  **366 days** (`apps/api/src/validation/dateSpan.js`; issue
  `DATE_SPAN_TOO_LONG` with `maximum`). Before this, a single 10-year
  request held its row locks for about 5 seconds.
- A hold asks for at most 20 items.
- Blackouts are one row per range and lock nothing per date, so they are not
  capped.
- **Past dates.** Customers can never book a past date (`BOOKING_IN_PAST`).
  Partners may write availability, blocks and external reservations on past
  dates to correct records. The calendar dims past days but keeps them
  editable.

## 6. Recurring schedules

There are **no recurring availability rules** (no "every Monday closed").
Availability is per date. Partners set it for a range in the calendar or
import it by CSV. Opening hours exist only as listing information
(`listing_opening_hours`) and do not affect inventory. A recurring rule
engine would be a new feature with its own spec, including how it composes
with the precedence in §3.

## 7. Freshness and caching

- The API has **no server-side cache** for availability or search. Every
  read is live. `INVENTORY_BLOCKED`/`UNBLOCKED` events have no subscribers.
- In the browser, React Query invalidates on every partner write: blocks
  list, per-day breakdown and ledger (`invalidateInventoryBlockViews.js`
  for create, edit and release; the calendar's day states read the
  breakdown). Customer pages refetch on their own query lifetimes.

## 8. External calendars (sync boundary)

External reservations are Desavii's **local record** of a booking made
elsewhere (phone, walk-in, Booking.com, Airbnb, iCal sync). Cancelling one
in Desavii only restores Desavii's capacity. It never cancels anything at
the source, and the confirm dialog says so. Sync-created rows are cancelled
by the sync itself (`cancelSystemExternalReservation`) through the same
claim-first path.

## 9. Wizard produces, Calendar consumes

The Partner Listing Wizard creates the listing, its bookable units
(type, capacity, base price, time slots, hourly settings) and blackouts.
The Partner Calendar never creates units. It reads them
(`GET /availability/:listingId/units`) and manages per-date inventory for
one explicit unit at a time. Unit-specific reads always pass `unitId`.
The backend never guesses a unit for a multi-unit listing (`AMBIGUOUS_UNIT`).

Listing Detail reads the listing-level public ranges plus per-unit summaries.
Before this phase it probed the unit calendar and got a 422 on every
multi-room hotel.

## 10. Partner Calendar UI

- Month grid (`packages/ui` `PartnerCalendarEditor`):
  - Monday-first weekday header, matching the Week view.
  - Today marked `aria-current="date"`; past days dimmed.
  - A legend for every status and every source dot (booking, hold, block,
    external).
- Each status has a non-color cue: a hatch for blocked, a struck-through
  number for fully booked, a fill bar for partial.
- Active blocks and external reservations show as a labelled list:
  - localized dates, with nights or days;
  - quantity, reason or source, and notes;
  - actions: Edit and Unblock, or Cancel.

  The layout follows the list's own width (a container query), so it stays
  readable beside the workspace sidebar in Armenian.

## 11. Tests

- API integration (`apps/api/tests/integration`):
  - `inventory/concurrentRelease`;
  - `inventory/blockEditAndRangeLimits`;
  - `inventory/inventoryRbac` (Partner A cannot edit or remove B's block);
  - `booking-holds/lastInventoryRaces`;
  - plus the existing `calendarIntegrity`, `stayAvailability`,
    `hourlyHotelRooms`, `holdConcurrency` and `carRentalInterval` suites.
- API unit: `core/domain/bookingTimebase` (midnight boundary table).
- Web unit:
  - `utils/businessDate`;
  - Partner Calendar `calendarDateGrid`, `inventorySpan`,
    `InventoryRecordList`, `EditBlockDialog` and the page (midnight month);
  - `useUpdateInventoryBlockMutation`;
  - Listing Detail availability (Yerevan window).
- UI unit: `PartnerCalendarEditor` (weekday header, week start, today/past,
  legend); `dateFormat` (Armenian fallback for week/day headings).
- Playwright: `partnerCalendarAvailability.spec.js`:
  - block, edit and remove through the UI, checked against public
    availability;
  - multi-room Listing Detail never gets a 422;
  - frozen-clock midnight with the browser in UTC.
