# form-controls

**Sprint 2 status:** `Label`, `Input`, `Textarea`, `Checkbox`, `Radio`,
`Switch`, `Select` implemented.

**Phase 5 status:** `DatePicker` implemented (built for
`PartnerListingWizard`'s Availability step — blackout-date ranges — and
any other generic date-input need). `TimePicker`, `SearchBar`
(COMPONENT_LIBRARY.md Part II Section 2) remain scaffolded, not
implemented — out of this phase's scope.

`Label` is not a separate COMPONENT_LIBRARY.md catalog entry — it is the
one shared implementation of the "label always visible, associated via
htmlFor/id" requirement every other control in this group specifies. See
`Label/Label.jsx`'s file header for the full rationale.

Each component, when implemented, follows the full specification in
`COMPONENT_LIBRARY.md` (Purpose, Props, States, Variants, Accessibility,
Animation, Responsive Behaviour, Dependencies, Where it is used) exactly
— one file per component, colocated with its `.module.scss`
(`FRONTEND_ARCHITECTURE.md` Section 9.1) and its own tests
(`FRONTEND_ARCHITECTURE.md` Section 35). Every control here is
controlled by default (`value`/`checked` + `onChange` required —
FRONTEND_ARCHITECTURE.md §8.2).

## Usage

```jsx
import { Input, Textarea, Checkbox, Radio, Switch, Select } from '@desavii/ui/components/form-controls';

<Input
  label="Email address"
  value={email}
  onChange={(e) => setEmail(e.target.value)}
  error={errors.email}
/>

<Textarea
  label="Message"
  value={message}
  onChange={(e) => setMessage(e.target.value)}
  autoResize
/>

<Checkbox
  label="I agree to the terms"
  checked={agreed}
  onChange={(e) => setAgreed(e.target.checked)}
/>

<Radio name="room" value="deluxe" label="Deluxe room" checked={room === 'deluxe'} onChange={() => setRoom('deluxe')} />

<Switch label="Email notifications" checked={emailsOn} onChange={(e) => setEmailsOn(e.target.checked)} />

<Select
  label="Country"
  options={[{ value: 'am', label: 'Armenia' }, { value: 'ge', label: 'Georgia' }]}
  value={country}
  onChange={setCountry}
/>
```

`Select`'s `searchable` filter auto-enables once `options.length` exceeds
8, per `COMPONENT_LIBRARY.md`'s Select entry. `multiple` renders selected
values as removable chips inside the trigger and keeps the panel open
across selections.

```jsx
import { DatePicker } from '@desavii/ui/components/form-controls';

<DatePicker
  label="Check-in date"
  value={checkIn}
  onChange={setCheckIn}
  minDate="2026-01-01"
/>

<DatePicker
  mode="range"
  label="Blackout dates"
  value={blackoutRange}
  onChange={setBlackoutRange}
  disabledDates={alreadyBookedDates}
/>
```

`value`/`onChange` use `YYYY-MM-DD` strings (`{ start, end }` in `range`
mode) — the same convention the Availability module's `dateFrom`/
`dateTo` API fields already use, so wiring this to a blackout-date range
never needs reformatting. Full keyboard grid navigation (arrow keys,
Home/End, Page Up/Down) per `COMPONENT_LIBRARY.md`'s DatePicker entry;
see `DatePicker.jsx`'s file header for its two documented
simplifications (single-month grid at every breakpoint; English-only
month/weekday labels, since this package takes no i18n dependency).
The calendar panel is portaled (so no `overflow: hidden` ancestor can
clip it) to `document.body`, or — inside a `Modal`/`Drawer` — into that
overlay's own dialog via `hooks/usePortalContainer.js`, so it always
paints above the overlay instead of beneath it.
