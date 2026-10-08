# COMPONENT LIBRARY

**Desavii Armenia — Reusable UI Component Reference**
**Status:** Final · **Version:** 1.0 · **Classification:** Confidential
**Owner:** Chief UI Engineer
**Depends on (must never be contradicted):** `PROJECT_BIBLE.md` · `UI_UX_GUIDELINES.md` · `DATABASE_ARCHITECTURE.md` · `BOOKING_ENGINE_ARCHITECTURE.md` · `API_SPECIFICATION.md` · `FRONTEND_ARCHITECTURE.md` · `BACKEND_ARCHITECTURE.md`

---

This document is the complete architectural reference for every reusable UI
component on the platform — every button, card, calendar, modal, and
dashboard widget a frontend engineer will build. It is the implementation-
level companion to `UI_UX_GUIDELINES.md` (which sets the visual language)
and `FRONTEND_ARCHITECTURE.md` §8 (which sets the `ui/`, `components/`, and
module-ownership rules these components live under) — no visual rule, prop
name, or behavior described here contradicts either.

For every component: **Purpose, Props, States, Variants, Accessibility,
Animation, Responsive Behaviour, Dependencies, Where it is used.** No React
source code appears anywhere in this document — every prop is described,
never implemented.

## Table of Contents

**Part I — Design Tokens Quick Reference**

**Part II — Component Catalog**
1. Primitives
2. Form Controls
3. Navigation
4. Feedback & Overlays
5. Data Display
6. Listing & Media Components
7. Booking & Payment Components
8. Dashboard Components (Partner & Admin)

---

# PART I — DESIGN TOKENS QUICK REFERENCE

Every value below is already fixed by `UI_UX_GUIDELINES.md` (visual
specification) and implemented as SCSS tokens per `FRONTEND_ARCHITECTURE.md`
§9.2 (`styles/tokens/`). This part consolidates them into one lookup table
for component authors; it defines nothing new except the four
component-sizing scales at the end, which extend — never contradict — the
existing spacing/radius system.

### Colors

| Token | Value | Usage |
|---|---|---|
| Ink | `#0B1A2B` | Highest-contrast text, dark overlays |
| Navy (Primary) | `#0F2A4A` | Headers, primary buttons on light surfaces |
| Royal Blue (Accent) | `#1D5FD6` | All interactive/clickable elements, focus rings |
| Gold (Luxury Accent) | `#C9A24B` | Premium/verified badges only — never a button color |
| Gray 900 | `#17202A` | Primary body text |
| Gray 600 | `#5B6773` | Secondary text, captions |
| Gray 400 | `#9AA6B2` | Disabled text, subtle icons |
| Gray 200 | `#E4E8EC` | Borders, dividers |
| Gray 100 | `#F3F5F7` | App background, surface |
| White | `#FFFFFF` | Cards, canvas |
| Success | `#1E8E5A` | Confirmed/available states |
| Warning | `#C9761F` | Pending/limited states |
| Danger | `#C13A3A` | Errors/destructive states |

### Typography

| Style | Size / Line Height | Weight | Font |
|---|---|---|---|
| Display | 56 / 64 | Bold | Manrope |
| H1 | 40 / 48 | Bold | Manrope |
| H2 | 32 / 40 | Bold | Manrope |
| H3 | 24 / 32 | SemiBold | Manrope |
| H4 | 20 / 28 | SemiBold | Manrope |
| Body Large | 18 / 28 | Regular | Inter |
| Body | 16 / 24 | Regular | Inter |
| Small | 14 / 20 | Regular | Inter |
| Micro | 12 / 16 | Medium | Inter |

### Spacing

`space-1` 4px · `space-2` 8px · `space-3` 12px · `space-4` 16px ·
`space-6` 24px · `space-8` 32px · `space-12` 48px · `space-16` 64px ·
`space-24` 96px

### Radius

`radius-sm` 8px (tags/badges) · `radius-md` 12px (inputs/buttons) ·
`radius-lg` 16px (cards/modals) · `radius-xl` 24px (hero panels/images) ·
`radius-full` 999px (pills/avatars)

### Border

Default width `1px`, color `Gray 200`; focus border `2px`, color
`Royal Blue`; destructive-context border `1.5px`, color `Danger`.

### Shadow (Elevation)

`elevation-0` flat + 1px border · `elevation-1` soft ambient (hover cards)
· `elevation-2` medium (dropdowns/popovers) · `elevation-3` pronounced
(modals/drawers) — always cool-neutral black, never colored.

### Animation / Transition

Micro-interactions `150–250ms`; page/panel transitions `300–400ms`;
standard ease-out on entrance, ease-in on exit; spring physics reserved
for drag/swipe gestures only; every duration halves to near-zero under
`prefers-reduced-motion` (`FRONTEND_ARCHITECTURE.md` §31/§9.4).

### Z-Index Scale

| Layer | Value |
|---|---|
| Base content | 0 |
| Sticky header / sticky search | 100 |
| Dropdown / popover | 200 |
| Drawer | 300 |
| Modal backdrop | 400 |
| Modal | 410 |
| Toast | 500 |
| Tooltip | 600 |

A dropdown/popover opened from inside a Modal or Drawer does not compete
with the overlay layers above it: the overlay publishes its dialog
element as the portal target (`packages/ui` `hooks/usePortalContainer.js`),
so the popover mounts inside that dialog and its 200 ranks within the
overlay's own stacking context — above the overlay's content, and inside
its `aria-modal` boundary and focus trap. No extra layer is needed.

### Breakpoints

Mobile `<480px` · Mobile Large `480–767px` · Tablet `768–1023px` ·
Laptop `1024–1439px` · Desktop `≥1440px`

### Container Widths

Content `1200px` · Wide (dashboards) `1440px` · Narrow (forms/checkout)
`720px` · Full Bleed `100vw` (hero/gallery only)

### Icon Sizes

`icon-sm` 16px · `icon-md` 20px · `icon-lg` 24px (default, matches the
platform's 24px icon grid) · `icon-xl` 32px — stroke weight fixed at
1.5px at every size, per `UI_UX_GUIDELINES.md` §7.

### Button Sizes

| Size | Height | Horizontal Padding | Font |
|---|---|---|---|
| `sm` | 36px | space-4 | Small |
| `md` | 44px (min. touch target) | space-6 | Body |
| `lg` | 52px | space-8 | Body Large |

### Input Sizes

| Size | Height | Font |
|---|---|---|
| `sm` | 36px | Small |
| `md` | 48px (default, matches `UI_UX_GUIDELINES.md` §9.2) | Body |
| `lg` | 56px | Body Large |

### Modal Sizes

| Size | Max Width | Usage |
|---|---|---|
| `sm` | 400px | Simple confirmations |
| `md` | 560px | Standard confirmations (`UI_UX_GUIDELINES.md` §9.10 default) |
| `lg` | 720px | Forms, multi-field content |
| `full` | 100vw / 100vh (mobile) | Bottom-sheet/fullscreen takeover on mobile only |


---

# PART II — COMPONENT CATALOG

> Format per component: **Purpose · Props · States · Variants ·
> Accessibility · Animation · Responsive Behaviour · Dependencies ·
> Where it is used.**

## 1. Primitives

### Button

**Purpose:** The single interactive-action element used platform-wide.
**Props:** `variant` (primary/secondary/ghost/destructive) ·
`size` (sm/md/lg) · `disabled` · `loading` · `iconLeft` / `iconRight` ·
`fullWidth` · `type` (button/submit) · `onClick`.
**States:** default, hover, active/pressed, focus-visible, disabled,
loading (label replaced by a centered Spinner, width held fixed to
prevent layout shift).
**Variants:** Primary (Royal Blue fill), Secondary (Navy outline),
Ghost (text-only, underline on hover), Destructive (Danger fill/text) —
`UI_UX_GUIDELINES.md` §9.1.
**Accessibility:** native `<button>` semantics; focus-ring token applied
via the shared `focus-ring()` mixin; `aria-busy` during loading;
minimum 44×44px touch target at every size (icon-only buttons pad up to
this regardless of visual icon size).
**Animation:** 150ms color/elevation shift on hover; 100ms scale-to-0.98
on press.
**Responsive Behaviour:** identical across breakpoints; `fullWidth`
commonly toggled true on Mobile for primary checkout/form actions.
**Dependencies:** Icon, Spinner (loading state), design tokens (color,
radius, spacing, motion).
**Where it is used:** every module — forms, cards, modals, checkout,
dashboards.

### Badge

**Purpose:** Compact status/category indicator — the single sanctioned
mapping of a status value to a color (`BookingStatusBadge`, Payment
status, listing status all reuse this primitive with different color
props, never a locally re-implemented pill).
**Props:** `variant` (success/warning/danger/neutral/info) · `label` ·
`size` (sm/md) · `filled` (boolean — solid vs. 12%-opacity background per
`UI_UX_GUIDELINES.md` §9.5).
**States:** static (no interactive state — Badge is never clickable
itself).
**Variants:** five color variants × filled/unfilled.
**Accessibility:** color is never the only signal — `label` text is
always rendered, never an icon/color alone; sufficient contrast at both
filled and unfilled treatments.
**Animation:** none (a status change re-renders instantly; no transition
needed for a non-interactive element).
**Responsive Behaviour:** identical at all breakpoints; text truncates
with an ellipsis only in extreme space-constrained contexts (dense
tables).
**Dependencies:** color tokens.
**Where it is used:** Booking status, payment status, listing status,
coupon/discount tags, verification/premium markers.

### Tag

**Purpose:** Removable categorization chip (amenities, filters, search
history) — distinct from Badge (status) by intent and by supporting a
remove action.
**Props:** `label` · `onRemove` (optional — presence toggles the close
icon) · `size` (sm/md) · `selected` (boolean, for filter-chip usage).
**States:** default, selected/active, hover (when removable), focus.
**Variants:** standard (Gray 100 background), selected (Royal Blue
background, White text).
**Accessibility:** the remove icon is a real button with an
`aria-label` ("Remove {label}"), not a bare clickable span.
**Animation:** 150ms fade-out on removal.
**Responsive Behaviour:** wraps to multiple lines in a tag group rather
than truncating or scrolling horizontally.
**Dependencies:** Icon (close), color tokens.
**Where it is used:** Search filters, amenity selection in listing
creation, coupon-code display.

### Avatar

**Purpose:** User/partner identity representation.
**Props:** `src` (Media object, `API_SPECIFICATION.md` §20) ·
`initialsFallback` (derived from name when no image exists) ·
`size` (sm/md/lg/xl) · `shape` (circle — the only supported shape,
per the platform's consistent rounded-avatar language).
**States:** loaded, loading (Skeleton circle), fallback (initials on a
deterministic background color derived from the user's ID, never a
random color that would shift between renders).
**Variants:** size only — no visual-style variants.
**Accessibility:** `alt` text always the user's display name, never
"avatar" or "profile picture."
**Animation:** none beyond the shared Image LQIP fade-in
(`FRONTEND_ARCHITECTURE.md` §24.2).
**Responsive Behaviour:** size prop selected per context (sm in
compact lists, lg on profile headers); never itself breakpoint-
responsive.
**Dependencies:** Image primitive, Skeleton.
**Where it is used:** Reviews, Messaging, Profile headers, Partner
Employee lists, Admin user tables.

### Tooltip

**Purpose:** Supplementary, hover/focus-triggered explanatory text for
an element whose meaning isn't fully self-evident (an icon-only button,
a truncated value).
**Props:** `content` · `placement` (top/bottom/left/right, auto-flipping
to stay in-viewport) · `delay` (default 400ms).
**States:** hidden, visible.
**Variants:** none (one visual treatment platform-wide, per
`UI_UX_GUIDELINES.md` §9.11).
**Accessibility:** triggered by both hover **and** keyboard focus (never
hover-only, which would make it invisible to keyboard users);
associated via `aria-describedby`, not only visually positioned.
**Animation:** 150ms fade + 4px slide toward the trigger.
**Responsive Behaviour:** disabled on touch-only devices where hover has
no meaning (content is instead made directly visible or accessible via
tap-and-hold, per context).
**Dependencies:** none beyond tokens.
**Where it is used:** Icon-only buttons, truncated table cells, form
field help text, dashboard chart data points.

### Icon

**Purpose:** The platform's single icon family (outline, 1.5px stroke,
24px grid, per `UI_UX_GUIDELINES.md` §7), wrapped as a component so size
and color are always token-driven.
**Props:** `name` (from the closed icon set) · `size` (sm/md/lg/xl) ·
`color` (inherits text color by default; explicit override only when
the icon itself is interactive).
**States:** static.
**Variants:** none — one stroke style, no filled variant, ever.
**Accessibility:** `aria-hidden="true"` by default when paired with
visible text; a real `aria-label` only when used alone as the sole
content of an interactive element.
**Animation:** none intrinsically; consuming components (favorite heart,
chevrons) apply their own micro-animation.
**Responsive Behaviour:** none.
**Dependencies:** none.
**Where it is used:** everywhere.


## 2. Form Controls

### Input

**Purpose:** Standard single-line text entry, controlled exclusively
(`FRONTEND_ARCHITECTURE.md` §8.2).
**Props:** `value` · `onChange` · `label` (always visible, never
placeholder-only) · `placeholder` · `helperText` · `error` (string,
presence toggles error state) · `size` (sm/md/lg) · `disabled` ·
`iconLeft`/`iconRight` · `type` (text/email/password/number/tel).
**States:** default, focus, filled, error, disabled.
**Variants:** size only.
**Accessibility:** `label` programmatically associated via `htmlFor`/
`id`; `error` announced via `aria-live` and linked via
`aria-describedby`; error state never conveyed by border color alone —
paired with an icon and `helperText`.
**Animation:** 150ms border-color/glow transition on focus.
**Responsive Behaviour:** full-width by default in forms; size prop may
step down on Mobile within dense filter bars.
**Dependencies:** Icon (state icons), design tokens.
**Where it is used:** every form platform-wide (auth, checkout, listing
creation, dashboards).

### Textarea

**Purpose:** Multi-line text entry (reviews, messages, listing
descriptions).
**Props:** identical to Input, plus `rows` (initial height) and
`autoResize` (boolean, grows with content up to a max height).
**States/Accessibility/Animation:** identical to Input.
**Responsive Behaviour:** `autoResize` particularly relevant on Mobile
to avoid a fixed-height scrollable box competing with the page's own
scroll.
**Dependencies:** Input's shared styling base.
**Where it is used:** Reviews, Messaging, listing description fields,
support tickets.

### Select / Dropdown

**Purpose:** Single or multi-choice selection from a closed list,
custom-styled (never the native browser `<select>`), per
`UI_UX_GUIDELINES.md` §9.2.
**Props:** `options` · `value` · `onChange` · `multiple` (boolean) ·
`searchable` (auto-enabled above 8 options, per the UI guideline) ·
`label` · `error` · `size` (sm/md/lg) · `disabled`.
**States:** closed, open, focus, error, disabled.
**Variants:** single-select, multi-select (renders selected items as
Tags within the field), searchable.
**Accessibility:** full keyboard support (arrow keys to navigate
options, Enter to select, Escape to close, type-ahead jump-to-option);
`role="listbox"`/`role="option"` semantics; selected state announced.
**Animation:** options panel: 150ms fade + 4px slide; chevron rotates
180° on open.
**Responsive Behaviour:** options panel renders as a full-screen sheet
on Mobile rather than a small anchored popover, for touch-target
comfort.
**Dependencies:** Tag (multi-select chips), Icon (chevron, check).
**Where it is used:** Search filters, listing category/amenity
selection, admin filters, settings.

### Checkbox / Radio / Switch

**Purpose:** Boolean and single-choice-from-a-small-set inputs.
**Props (shared shape):** `checked` · `onChange` · `label` · `disabled`
· `error` (Checkbox/Radio group only).
**States:** unchecked, checked, focus, disabled, (Checkbox only)
indeterminate.
**Variants:** Checkbox (square, supports indeterminate for "select all"
table headers), Radio (circular, used in groups sharing one `name`),
Switch (pill-track toggle, used for immediate-effect settings rather
than form-submitted booleans, e.g. notification preference toggles).
**Accessibility:** each renders its native semantic role
(`checkbox`/`radio`/`switch` via `role`), label always clickable
(clicking the label toggles the control), focus-ring token applied.
**Animation:** Switch thumb: 150ms spring-eased slide; Checkbox check
mark: 150ms draw-in.
**Responsive Behaviour:** identical across breakpoints; touch target
padded to 44×44px around the visual control regardless of its smaller
visual size.
**Dependencies:** Icon (checkmark), design tokens.
**Where it is used:** Forms platform-wide; Switch specifically in
Notification Preferences and Admin/Partner settings toggles.

### DatePicker

**Purpose:** Date and date-range selection — the generic primitive
underlying the Booking-specific Calendar (Part 7's `BookingCalendar` is
a specialized composition of this primitive plus live availability
data).
**Props:** `value` (single date or `{start, end}`) · `onChange` ·
`mode` (single/range) · `minDate`/`maxDate` · `disabledDates` (array) ·
`label` · `error`.
**States:** closed, open, date-hover (range-preview), selected,
disabled-date, today.
**Variants:** single-month (Mobile), dual-month (Desktop range mode),
per `UI_UX_GUIDELINES.md` §9.2.
**Accessibility:** full keyboard grid navigation (arrow keys move
between days, `PageUp`/`PageDown` move months); every date cell's
accessible name includes its full date and any relevant status;
`aria-live` announces the currently focused date's month/year on
navigation.
**Animation:** 200ms crossfade between months; range-hover preview
highlights instantly (no lag, since this is direct visual feedback to
pointer movement).
**Responsive Behaviour:** dual-month collapses to a single swipeable
month on Mobile.
**Dependencies:** Icon (chevrons), design tokens.
**Where it is used:** Generic date-input contexts (e.g., date-of-birth
in profile forms) — see Part 7 for the booking-specific, availability-
aware variant.

### TimePicker

**Purpose:** Time-of-day selection at a defined interval granularity.
**Props:** `value` · `onChange` · `interval` (minutes, e.g. 15/30) ·
`minTime`/`maxTime` · `disabledSlots` (array) · `label` · `error`.
**States:** closed, open, slot-selected, slot-disabled.
**Accessibility:** identical keyboard-navigation discipline to
DatePicker, rendered as a scrollable listbox of time options rather than
a grid.
**Animation:** 150ms fade/slide open.
**Responsive Behaviour:** full-width sheet on Mobile.
**Dependencies:** design tokens.
**Where it is used:** Generic time-input contexts; see Part 7 for the
availability-aware booking time-slot picker.

### SearchBar

**Purpose:** The platform's primary discovery entry point
(`UI_UX_GUIDELINES.md` §9.2) — segmented Where/When/Who input.
**Props:** `destination` · `dateRange` · `partySize` ·
`onSearch` (fires navigation to search results, `FRONTEND_ARCHITECTURE.md`
§19.1's URL-state pattern) · `compact` (boolean — sticky-header
condensed form vs. hero full form) · `recentSearches` (array, shown on
focus).
**States:** default, focused-segment, dropdown-open (per segment),
compact (scrolled).
**Variants:** hero (large, pill-shaped, full segmented) and compact
(sticky-header, condensed pill) — both render the same underlying
control set.
**Accessibility:** each segment is independently keyboard-reachable and
labeled; the destination segment's autocomplete listbox follows Select's
keyboard pattern.
**Animation:** hero→compact transition on scroll: 200ms ease; dropdown
panels: 150ms fade.
**Responsive Behaviour:** hero form stacks segments vertically on
Mobile; compact form becomes a single tap-target opening a full-screen
search modal rather than an inline expanding bar.
**Dependencies:** DatePicker (range mode), Select (destination
autocomplete, party size), Icon.
**Where it is used:** Homepage hero, sticky header on search/listing
pages.


## 3. Navigation

### Breadcrumb

**Purpose:** Hierarchical location indicator within nested dashboard/
account contexts (`UI_UX_GUIDELINES.md` §9.3).
**Props:** `items` (array of `{label, href}`) · `maxItems` (collapses
middle items into an ellipsis menu on long paths).
**States:** static, with the final (current-page) item rendered
non-interactive.
**Variants:** none.
**Accessibility:** `nav` landmark with `aria-label="Breadcrumb"`; the
current page item carries `aria-current="page"`.
**Animation:** none.
**Responsive Behaviour:** truncates to first + last + ellipsis on
Mobile.
**Dependencies:** Icon (separator chevron).
**Where it is used:** Customer Account Area, Partner Dashboard, Admin
Panel sub-pages.

### Pagination

**Purpose:** Page-based navigation for the small set of dashboard
contexts using classic paging rather than infinite scroll/cursor
pagination (`API_SPECIFICATION.md` §11's documented exception —
Countries/Regions-style reference data and dense Admin/Partner tables).
**Props:** `currentPage` · `totalPages` · `onPageChange` ·
`siblingCount` (how many page numbers show around the current page).
**States:** default, current-page (highlighted), disabled (first/last
boundary arrows).
**Variants:** none.
**Accessibility:** each page control is a real button with an
`aria-label` ("Go to page 3"); current page marked `aria-current="page"`.
**Animation:** none (instant page-content swap, handled by the
consuming table/list's own loading state, Skeleton).
**Responsive Behaviour:** collapses to Prev/Next + "Page X of Y" text
on Mobile rather than a full number row.
**Dependencies:** Icon (chevrons).
**Where it is used:** Admin Panel tables, Partner Dashboard tables,
Countries/Regions reference lists.

### Tabs

**Purpose:** In-page content switching without a route change (e.g., a
listing detail page's Overview/Amenities/Reviews sections, a Partner
Dashboard listing's Details/Pricing/Calendar sub-views).
**Props:** `tabs` (array of `{label, content}`) · `activeTab` ·
`onChange` · `variant` (underline/pill).
**States:** default, active, hover, focus, disabled (per tab).
**Variants:** underline (content-heavy contexts) and pill (compact
toggle-like contexts).
**Accessibility:** full `role="tablist"`/`role="tab"`/`role="tabpanel"`
semantics; arrow-key navigation between tabs; only the active panel is
in the tab order.
**Animation:** 200ms underline/pill-indicator slide to the newly active
tab.
**Responsive Behaviour:** horizontally scrollable tab row on Mobile
when tabs exceed viewport width, never wrapping to multiple lines.
**Dependencies:** none beyond tokens.
**Where it is used:** Listing detail pages, Partner Dashboard listing
editor, Admin Panel section switches.

### Sidebar Navigation

**Purpose:** The persistent dashboard navigation structure
(`UI_UX_GUIDELINES.md` §9.3) shared by `PartnerLayout` and `AdminLayout`
(`FRONTEND_ARCHITECTURE.md` §5.4–5.5).
**Props:** `items` (grouped array) · `collapsed` (boolean, persisted
per-user) · `activeItemId`.
**States:** expanded, collapsed (icon-only), item-active, item-hover.
**Variants:** expanded (260px) / collapsed (72px).
**Accessibility:** `nav` landmark; collapsed mode still exposes each
item's label via `aria-label` (never icon-only with no accessible
name); active item indicated by more than color alone (left-border
accent).
**Animation:** 200ms width transition on collapse/expand.
**Responsive Behaviour:** becomes a bottom tab bar or slide-in drawer on
Mobile/Tablet rather than a persistent side column.
**Dependencies:** Icon, Badge (unread-count indicators on nav items).
**Where it is used:** Partner Dashboard, Admin Panel.

## 4. Feedback & Overlays

### Modal

**Purpose:** Focused, blocking overlay for confirmations and short
forms (`UI_UX_GUIDELINES.md` §9.10).
**Props:** `isOpen` · `onClose` · `title` · `size` (sm/md/lg/full, Part
I) · `closeOnBackdropClick` (default true, disabled for
destructive-confirmation and active-hold-adjacent contexts) ·
`preventClose` (boolean, for a mandatory in-progress state).
**States:** closed, opening, open, closing.
**Variants:** confirmation (sm/md, single action pair), form (lg).
**Accessibility:** full focus trap (`FRONTEND_ARCHITECTURE.md` §30);
`role="dialog"` + `aria-modal="true"`; closes on `Escape` unless
`preventClose` or a nested popup (an open Select list or DatePicker
calendar) already handled it — the first Escape closes only that popup,
the second closes the overlay; focus returns to the triggering element on close;
background content marked `inert`/`aria-hidden` while open.
**Animation:** backdrop 200ms fade; panel 250ms fade + scale-from-0.98.
**Responsive Behaviour:** becomes a full-screen takeover (`full` size)
automatically on Mobile regardless of the requested size prop, for
comfortable touch interaction.
**Dependencies:** Button, focus-trap utility, z-index tokens.
**Where it is used:** Cancellation confirmation, coupon-application
confirmation, quick-edit forms, delete confirmations across Admin/
Partner.

### Drawer

**Purpose:** Side-anchored (desktop) or bottom-anchored (mobile) panel
for detail/edit views and filter panels (`UI_UX_GUIDELINES.md` §9.10).
**Props:** `isOpen` · `onClose` · `anchor` (right/bottom, auto-selected
by breakpoint) · `title`.
**States/Accessibility:** identical focus-trap and dismissal behavior to
Modal.
**Variants:** right-side panel (Desktop detail/edit), bottom sheet
(Mobile — filters, actions).
**Animation:** slide-in from the anchored edge, 300ms ease-out; slide-
out 250ms ease-in.
**Responsive Behaviour:** anchor prop switches automatically at the
Tablet breakpoint.
**Dependencies:** Button, focus-trap utility, z-index tokens.
**Where it is used:** Search filter panel (Mobile), booking/listing
detail quick-edit (Partner Dashboard), notification center panel.

### Toast

**Purpose:** Ephemeral, session-local feedback for the current user's
own action (`FRONTEND_ARCHITECTURE.md` §26.1) — never a durable record.
**Props:** `variant` (success/error/info) · `message` · `duration`
(default 5000ms; errors persist until dismissed) · `action` (optional
inline button, e.g. "Undo").
**States:** entering, visible, exiting.
**Variants:** success, error, info — mapped to the same color tokens as
Badge.
**Accessibility:** rendered in an `aria-live="polite"` region (`"assertive"`
for errors); dismissible via a close button, never relying on hover to
reveal dismissal.
**Animation:** 250ms slide-in + fade from the edge it's anchored to;
250ms fade-out on dismiss/expiry.
**Responsive Behaviour:** top-right stack on Desktop; full-width,
top-anchored stack on Mobile.
**Dependencies:** Icon, Button (action/dismiss), z-index tokens.
**Where it is used:** Every mutation's success/error feedback,
platform-wide (`FRONTEND_ARCHITECTURE.md` §26.2's shared
`useMutationToast` convention).

### Notification Center

**Purpose:** The durable, server-backed notification list
(`API_SPECIFICATION.md` §55), distinct from Toast.
**Props:** `notifications` (paginated) · `onMarkRead` ·
`onMarkAllRead` · `unreadCount`.
**States:** empty (EmptyState), loading (Skeleton list), populated,
item-unread/-read.
**Variants:** header dropdown panel (Desktop) / full drawer (Mobile).
**Accessibility:** unread count exposed via `aria-label` on the trigger
icon ("12 unread notifications"), not color alone; list items are
focusable, actionable list elements (`role="list"`/`role="listitem"`).
**Animation:** 150ms fade/slide panel open; unread-to-read transition
fades the unread indicator over 200ms.
**Responsive Behaviour:** dropdown panel (Desktop) becomes a full-screen
Drawer (Mobile).
**Dependencies:** Badge (unread count), EmptyState, Skeleton, Drawer
(Mobile).
**Where it is used:** Every layout's header (all four applications).

### Loading Spinner

**Purpose:** Sub-second or button-level in-flight indicator
(`UI_UX_GUIDELINES.md` §9.12) — never used for full-page/list loading.
**Props:** `size` (sm/md/lg) · `color` (inherits by default).
**States:** spinning (its only state).
**Variants:** inline (within a Button, Part 2) and standalone
(full-overlay processing states, e.g. payment submission).
**Accessibility:** `role="status"` with an `aria-label` ("Loading");
respects reduced-motion by falling back to a subtle pulsing opacity
rather than a rotating animation.
**Animation:** continuous rotation, 800ms per cycle.
**Responsive Behaviour:** none.
**Dependencies:** none.
**Where it is used:** Button loading state, Payment processing overlay.

### Skeleton

**Purpose:** Shape-matching loading placeholder for content-bearing
components (`UI_UX_GUIDELINES.md` §9.12) — the default loading
treatment platform-wide.
**Props:** `variant` (text/circle/rect) · `width`/`height` · `count`
(repeated lines).
**States:** shimmering (its only state).
**Variants:** one skeleton shape defined per real component it stands
in for (`ListingCardSkeleton`, `BookingRowSkeleton`, ...), all built
from this shared primitive's text/circle/rect building blocks.
**Accessibility:** `aria-busy="true"` on the containing region;
skeleton elements themselves are `aria-hidden` (they carry no real
content to announce).
**Animation:** left-to-right shimmer sweep, 1.5s cycle, low-contrast
(Gray 100 → Gray 200).
**Responsive Behaviour:** matches its real component's responsive
layout exactly, so no reflow occurs when real content replaces it.
**Dependencies:** none.
**Where it is used:** Every list/detail view's loading state,
platform-wide.

### EmptyState

**Purpose:** Explains why a list/section has no content and offers one
next action (`UI_UX_GUIDELINES.md` §9.12).
**Props:** `illustration` · `title` · `description` · `actionLabel` ·
`onAction`.
**States:** static.
**Variants:** one per context (no favorites, no bookings, no search
results, no notifications) — same structural component, different
content.
**Accessibility:** the action is a real Button, fully keyboard-
reachable; illustration is decorative (`aria-hidden`).
**Animation:** 200ms fade-in on mount.
**Responsive Behaviour:** illustration scales down / may be omitted
below Tablet width to preserve vertical space.
**Dependencies:** Button, Icon/illustration asset.
**Where it is used:** Every list component's zero-results state,
platform-wide (`FRONTEND_ARCHITECTURE.md` §29).

### 404 Page

**Purpose:** Route-not-found and resource-not-found terminal state
(`FRONTEND_ARCHITECTURE.md` §4.5, §27.1).
**Props:** none (static content) beyond localized copy.
**States:** static.
**Variants:** none.
**Accessibility:** a real, focusable "Back to home" / search-bar
affordance; page `<title>` reflects the 404 state for assistive tech
and browser history clarity.
**Animation:** 200ms fade-in.
**Responsive Behaviour:** standard page-container responsiveness.
**Dependencies:** SearchBar (surfaced prominently per
`BOOKING_ENGINE_ARCHITECTURE.md`-adjacent UX guidance), Button.
**Where it is used:** `ErrorLayout`, any unmatched route or `NOT_FOUND`
API response.

### 500 Page

**Purpose:** Unhandled-error terminal state
(`FRONTEND_ARCHITECTURE.md` §27.1.3).
**Props:** `requestId` (displayed for support reference,
`API_SPECIFICATION.md` §9).
**States:** static.
**Variants:** none.
**Accessibility:** same as 404; additionally announces the error via
`aria-live` if reached without a full page reload (client-side
`ErrorBoundary` catch).
**Animation:** 200ms fade-in.
**Responsive Behaviour:** standard.
**Dependencies:** Button ("Reload").
**Where it is used:** `ErrorLayout`, any `INTERNAL_ERROR` response or
uncaught render exception.


## 5. Data Display

### Table

**Purpose:** Dense, sortable/filterable tabular data for dashboards
(`UI_UX_GUIDELINES.md` §9.4) — never used for consumer-facing listings
(Cards own that role, Part 6).
**Props:** `columns` (array with `key`, `label`, `sortable`,
`align`) · `data` · `sortKey`/`sortDirection`/`onSortChange` ·
`onRowClick` · `selectable` (boolean, renders row checkboxes) ·
`loading` (renders row Skeletons).
**States:** loading, populated, empty (EmptyState), row-hover,
row-selected.
**Variants:** standard, selectable (bulk-action tables — moderation
queues, bulk booking management).
**Accessibility:** semantic `<table>`/`<thead>`/`<tbody>` markup (never
a `div`-grid impersonating a table); sortable column headers are real
buttons announcing current sort direction via `aria-sort`.
**Animation:** none beyond row-hover background transition (150ms).
**Responsive Behaviour:** below Tablet width, collapses to a stacked
card-per-row layout (each row's columns become labeled key-value pairs)
rather than horizontal scrolling, per accessibility best practice.
**Dependencies:** Skeleton, EmptyState, Badge, Pagination, Checkbox
(selectable mode).
**Where it is used:** Partner Dashboard (bookings, listings), Admin
Panel (users, partners, moderation, audit logs).

### Chart

**Purpose:** Data visualization for Analytics
(`API_SPECIFICATION.md` §62, `UI_UX_GUIDELINES.md` §9.9).
**Props:** `type` (line/bar/donut) · `series` (data + label + color-role)
· `xAxisLabel`/`yAxisLabel` · `loading` · `emptyMessage`.
**States:** loading (Skeleton block), populated, empty
("Not enough data yet," per `UI_UX_GUIDELINES.md` §9.9).
**Variants:** line (revenue-over-time), bar (occupancy/comparison), donut
(category breakdown) — one accent color per series (Royal Blue primary,
Gold only for a secondary comparison series), never a rainbow palette.
**Accessibility:** an accompanying visually-hidden data table or
`aria-label` summary renders alongside every chart, so the same
information is available to screen-reader users; tooltips (Part 1's
Tooltip) surface exact values on hover/focus per data point.
**Animation:** initial render animates series in over 400–600ms;
subsequent data updates cross-fade rather than re-animating the full
draw.
**Responsive Behaviour:** legend moves from side (Desktop) to below the
chart (Mobile); axis label density reduces on narrow viewports.
**Dependencies:** Tooltip, Skeleton, EmptyState, color tokens.
**Where it is used:** Partner Dashboard revenue/occupancy views, Admin
Panel platform-wide analytics.

### Rating

**Purpose:** Star-based aggregate/input rating display.
**Props:** `value` (0–5, supports halves) · `readOnly` (display mode
vs. interactive input mode) · `onChange` (input mode) · `size` ·
`showCount` (renders "(128)" alongside).
**States:** static (display), hover-preview (input mode).
**Variants:** display-only (listing cards, review lists), interactive
(review submission form).
**Accessibility:** display mode uses `role="img"` with a full
`aria-label` ("4.5 out of 5 stars, 128 reviews"), never five separate
unlabeled icons; input mode is a real radio-group semantically (5
selectable options), keyboard-operable via arrow keys.
**Animation:** input mode: 100ms scale-bounce per star on hover/select.
**Responsive Behaviour:** none.
**Dependencies:** Icon (star, filled/outline).
**Where it is used:** Listing cards, listing detail headers, Review
Card, review submission form.

### Review Card

**Purpose:** Single review display (`UI_UX_GUIDELINES.md` §9.6).
**Props:** `review` (avatar, first name, rating, date, comment,
`reply`) · `truncateLines` (default 3, with "Read more") ·
`onReadMore`.
**States:** truncated, expanded.
**Variants:** with-partner-reply (renders the `review_replies` entry
nested beneath), without.
**Accessibility:** "Read more" is a real button toggling
`aria-expanded`; relative dates (`"2 weeks ago"`) carry a full
`title`/`aria-label` with the absolute date.
**Animation:** 200ms height expand on "Read more."
**Responsive Behaviour:** standard card width scaling; truncation line
count may reduce further on Mobile.
**Dependencies:** Avatar, Rating.
**Where it is used:** Listing detail pages, Partner Dashboard reviews
section.

### Accordion

**Purpose:** Collapsible content sections (listing detail's amenity
groups, FAQ-style CMS content).
**Props:** `items` (array of `{title, content}`) · `allowMultipleOpen`
(boolean) · `defaultOpenIndex`.
**States:** collapsed, expanded, focus.
**Variants:** none.
**Accessibility:** each header is a real button with `aria-expanded`
and `aria-controls` pointing to its panel; panel content is not removed
from the DOM when collapsed (only visually hidden and `aria-hidden`),
preserving in-page search/find behavior.
**Animation:** 200ms height expand/collapse.
**Responsive Behaviour:** identical across breakpoints.
**Dependencies:** Icon (chevron).
**Where it is used:** Listing detail pages, CMS/FAQ content, Support
help articles.

## 6. Listing & Media Components

### Listing Card (Property / Destination / Car / Restaurant / Tour)

**Purpose:** The single shared card template every listing type
renders through (`UI_UX_GUIDELINES.md` §9.6) — one component, module-
specific metadata slots, never a per-module re-implementation.
**Props:** `listing` (image, title, location, rating, price,
metadata slot content) · `variant` (property/destination/car/
restaurant/tour) · `isFavorited` · `onToggleFavorite` · `href`.
**States:** default, hover (Desktop — image scale + elevation), loading
(`ListingCardSkeleton`), favorited/unfavorited.
**Variants:**
- **Property** (Hotels/Vacation Houses/Apartments/Camping): nightly
  price, amenity icon row.
- **Destination:** full-bleed image, gradient scrim, White text
  overlay, no separate text block.
- **Car:** vehicle on light/transparent background, spec row (seats/
  transmission/luggage), price/day.
- **Restaurant:** cuisine + price tier, open/closed Badge.
- **Tour:** duration/group-size metadata, "from" price per person.
**Accessibility:** the entire card is one focusable link (`<a>` wrapping
the card), never a `div` with a synthetic click handler; the favorite-
toggle icon is a separate, nested focusable button (`event.stopPropagation`
semantics) with its own `aria-pressed` state.
**Animation:** image scale 1.03x within a clipped container over 300ms
on hover; elevation rises to Level 1; favorite-heart micro-bounce
(300ms) on toggle.
**Responsive Behaviour:** grid columns per breakpoint per
`UI_UX_GUIDELINES.md` §13 (1/2/3/4 columns Mobile→Desktop).
**Dependencies:** Image, Badge, Rating, Icon (favorite heart).
**Where it is used:** Search results, homepage rails, Favorites,
"similar listings" sections.

### Gallery (Property Gallery / Car Gallery)

**Purpose:** Full media browsing experience for a listing
(`UI_UX_GUIDELINES.md` §9.7).
**Props:** `media` (array of Media objects, `API_SPECIFICATION.md` §20)
· `variant` (grid-lightbox/carousel, auto-selected by breakpoint) ·
`initialIndex`.
**States:** thumbnail-grid (Desktop entry point), lightbox-open,
carousel (Mobile).
**Variants:** **Property Gallery** — Airbnb-style full-screen lightbox
grid (Desktop), swipeable full-bleed carousel (Mobile), per
`UI_UX_GUIDELINES.md` §9.7 exactly. **Car Gallery** — a lighter variant
(fewer images typically, light/transparent-background vehicle shots
rather than lifestyle photography) reusing the identical carousel/
lightbox mechanics.
**Accessibility:** lightbox is a focus-trapped Modal variant; carousel
is fully keyboard-navigable (arrow keys) and never auto-advances;
every image's `alt` text is rendered from `media_translations`.
**Animation:** lightbox open: 250ms fade + scale; carousel slide: 300ms
ease.
**Responsive Behaviour:** grid-lightbox (Desktop) vs. carousel with a
slim dash-style progress indicator (Mobile), per
`UI_UX_GUIDELINES.md` §9.7.
**Dependencies:** Image, Modal (lightbox), Icon (navigation arrows).
**Where it is used:** Every listing-type detail page.

### Map / MapPreview

**Purpose:** Location display, single-listing or search-results
multi-pin (`UI_UX_GUIDELINES.md` §9.8, `FRONTEND_ARCHITECTURE.md` §25).
**Props:** `center` · `zoom` · `markers` (array of `{lat, lng, price?,
listingId}`) · `onMarkerClick` · `interactive` (boolean —
`MapPreview` sets this false: a static, non-pannable preview embed).
**States:** loading (Skeleton placeholder occupying final layout
space), loaded, marker-selected (enlarged/elevated, synced to the
corresponding result-card list).
**Variants:** **MapPreview** (single listing's location, static,
non-interactive, listing detail pages) and **Map** (full interactive
search-results map with clustering, price-bubble markers).
**Accessibility:** always paired with a screen-reader-accessible list
view of the same locations/results (`FRONTEND_ARCHITECTURE.md` §30) —
the map is never the sole source of location information.
**Animation:** selected-pin enlarge/elevate transition, 150ms.
**Responsive Behaviour:** search-results Map view is a toggle (not
simultaneous side-by-side) below Laptop width, to preserve list
readability.
**Dependencies:** the Google Maps SDK adapter (lazy-loaded,
`FRONTEND_ARCHITECTURE.md` §25.1), Skeleton.
**Where it is used:** Listing detail pages (MapPreview), Search results
(Map).


## 7. Booking & Payment Components

### Booking Widget

**Purpose:** The persistent, listing-detail-page entry point into the
booking flow (`BOOKING_ENGINE_ARCHITECTURE.md` §2.1's Search →
Availability stages) — the single composed component tying together
date/slot selection, party size, live price, and the "Reserve" action.
**Props:** `listing` · `bookableUnits` · `onHoldCreated` (navigates to
checkout on success, `FRONTEND_ARCHITECTURE.md` §20.1).
**States:** date-selection, availability-checking (Spinner on the price
area only, never blocking the whole widget), available-with-price,
unavailable (conflict message), submitting-hold, error.
**Variants:** date-range (Hotels/Vacation Houses/Apartments/Camping/
Cars), date+time-slot (Restaurants/SPA), date+capacity
(Tours/Events/Pools) — selects its internal Booking Calendar variant
per the listing's algorithm (`BOOKING_ENGINE_ARCHITECTURE.md` §4.2).
**Accessibility:** the price/availability update region is
`aria-live="polite"` so a screen-reader user is informed when a date
change resolves to a new price; the primary action Button follows
standard focus/keyboard rules.
**Animation:** price-update: 150ms cross-fade of the amount; sticky
behavior on scroll (Desktop) with a 200ms slide-in.
**Responsive Behaviour:** a fixed, persistent bottom bar on Mobile
(price + "Reserve" button) rather than a full inline widget, expanding
to the full widget in a Drawer on tap.
**Dependencies:** Booking Calendar, Price Breakdown, Button, Spinner.
**Where it is used:** Every listing-type detail page.

### Booking Calendar (Availability-Aware)

**Purpose:** The booking-specific specialization of the generic
DatePicker/TimePicker (Part 2), rendering **live server availability**
rather than a plain date grid (`FRONTEND_ARCHITECTURE.md` §23.1) —
never a client-side-generated calendar of "plausible" dates.
**Props:** `bookableUnitId` · `algorithmType` (date-range/slot/capacity)
· `onSelectionChange` · `partySize` (capacity mode).
**States:** loading availability, available-date, booked-date,
held-date, blocked-date, selected, today.
**Variants:** the three granularity modes from
`FRONTEND_ARCHITECTURE.md` §23.2, each reusing DatePicker/TimePicker's
base interaction mechanics with an availability-status overlay per
cell/slot.
**Accessibility:** every date/slot's accessible name includes its
availability status ("July 20, available" / "July 21, fully booked"),
never conveyed by color alone, per `FRONTEND_ARCHITECTURE.md` §30.
**Animation:** identical to DatePicker/TimePicker (Part 2).
**Responsive Behaviour:** identical to DatePicker/TimePicker.
**Dependencies:** DatePicker, TimePicker, the `availability` module's
live-query hook (`staleTime: 0`, `FRONTEND_ARCHITECTURE.md` §14.6).
**Where it is used:** Booking Widget, Partner Calendar (in its
editing-mode composition, `FRONTEND_ARCHITECTURE.md` §23.3).

### Reservation Hold Countdown

**Purpose:** The visible, ticking display of a `reservation_holds`
row's server-owned `expires_at` (`BOOKING_ENGINE_ARCHITECTURE.md` §5.2,
`FRONTEND_ARCHITECTURE.md` §21) — the single most safety-critical
display component on the platform.
**Props:** `holdId` (the component fetches and re-validates the hold
itself, per `FRONTEND_ARCHITECTURE.md` §21.2 — it is never handed a
raw duration/timestamp as a plain prop it could drift from).
**States:** normal (>5 min remaining), warning (<5 min), expired.
**Variants:** none — one visual treatment, calm and non-alarming even
in its final seconds, per `FRONTEND_ARCHITECTURE.md` §21.3.
**Accessibility:** the transition into the `expired` state is announced
via `aria-live="assertive"` (the one time this component interrupts);
the ticking display itself is not re-announced every second (that would
be disruptive) — only significant state changes are.
**Animation:** color shift to Warning/Orange under 5 minutes is a
150ms transition, never a flashing/pulsing treatment.
**Responsive Behaviour:** persistent, non-dismissible placement in
`CheckoutLayout`'s header on all breakpoints
(`FRONTEND_ARCHITECTURE.md` §5.6).
**Dependencies:** the `booking-holds` module's `useReservationHold`
hook.
**Where it is used:** `CheckoutLayout` exclusively (guest-details and
payment steps).

### Price Breakdown

**Purpose:** Itemized rendering of the Pricing Engine's full pipeline
output (`API_SPECIFICATION.md` §51, `BOOKING_ENGINE_ARCHITECTURE.md`
§7.1) — the platform's only sanctioned way to display a price; never
hand-summed by any consuming component.
**Props:** `quote` (the full server-returned breakdown object:
base, seasonal adjustment, discounts, coupon, subtotal, taxes[],
service fee, total).
**States:** loading (Skeleton lines), populated, updating (re-quote in
flight — previous values remain visible with a subtle loading
treatment rather than blanking out, to avoid layout jank).
**Variants:** compact (Booking Widget's live preview) and full
(checkout review step, invoice view).
**Accessibility:** rendered as a real, semantic list/definition-list
structure (label/value pairs), not a purely visual table-like `div`
layout, so screen readers announce each line correctly.
**Animation:** 150ms cross-fade on value updates.
**Responsive Behaviour:** identical structure at all breakpoints;
compact variant may collapse secondary lines (taxes) behind a
"View details" toggle on Mobile.
**Dependencies:** none beyond typography tokens.
**Where it is used:** Booking Widget, Checkout (guest-details and
payment steps), Invoice view, Wallet application toggle context.

### Guest Details Form

**Purpose:** Traveler-information capture at checkout
(`API_SPECIFICATION.md` §47's `booking_guests`).
**Props:** `bookingItemId` · `requiredFields` (varies by module — a
Car Rental may require a driver's license field a Restaurant
Reservation does not) · `onSubmit`.
**States:** empty, partially filled, validation-error (Layer 2,
`FRONTEND_ARCHITECTURE.md` §15), submitting.
**Variants:** one form schema per module's required-field set,
composed from shared Input/Select primitives — never a bespoke,
one-off form implementation per module.
**Accessibility:** standard form accessibility (Part 2's Input/Select
rules apply); server-side validation errors (`API_SPECIFICATION.md`
§9's `details` array) map onto the exact same fields
(`FRONTEND_ARCHITECTURE.md` §15.3).
**Animation:** none beyond standard field focus/error transitions.
**Responsive Behaviour:** single-column field stack on Mobile,
two-column where space allows on Desktop.
**Dependencies:** Input, Select, DatePicker (date-of-birth where
required), Button.
**Where it is used:** Checkout guest-details step.

### Payment Method Selector

**Purpose:** Saved-method reuse and gateway-hosted new-card entry
(`API_SPECIFICATION.md` §57, `FRONTEND_ARCHITECTURE.md` §22.1).
**Props:** `savedMethods` · `selectedMethodId` · `onSelect` ·
`onAddNewMethod` · `walletBalance` (optional toggle,
`FRONTEND_ARCHITECTURE.md` §22.2).
**States:** loading saved methods, method-selected, adding-new
(embeds the gateway SDK's hosted card-entry component), wallet-toggled.
**Variants:** none — one selector, composed of a saved-methods list
plus one "Add new" entry point.
**Accessibility:** saved methods rendered as a real radio-group; the
gateway-hosted card iframe's own accessibility is the gateway
provider's responsibility, but the surrounding label/error wiring
(`FRONTEND_ARCHITECTURE.md` §22.1) follows the platform's standard
field-association rules.
**Animation:** 200ms expand when "Add new" reveals the hosted card
component.
**Responsive Behaviour:** identical structure at all breakpoints.
**Dependencies:** Radio, Switch (wallet toggle), Price Breakdown
(live total update), Button.
**Where it is used:** Checkout payment step.

### Booking Status Badge

**Purpose:** The one, exact mapping of every
`BOOKING_ENGINE_ARCHITECTURE.md` §3.1 status value to its Badge color —
already introduced conceptually under Badge (Part 1); documented
separately here because of its platform-wide, booking-specific
reuse and its closed, non-extensible status list.
**Props:** `status` (one of the eleven closed values — Draft, Pending,
Reserved, Confirmed, Checked In, Checked Out, Completed, Cancelled,
Expired, Refunded, Chargeback).
**States:** one static rendering per status value.
**Variants:** none — this is deliberately the **only** place in the
codebase permitted to map a booking status to a color
(`FRONTEND_ARCHITECTURE.md` §7's `BookingStatusBadge` rule).
**Accessibility:** identical to Badge — label text always present.
**Animation:** none.
**Responsive Behaviour:** none.
**Dependencies:** Badge.
**Where it is used:** Bookings list/detail (Customer Account, Partner
Dashboard, Admin Panel), Booking Summary Card.

### Booking Summary Card

**Purpose:** Compact booking representation for list contexts ("My
Trips," Partner Dashboard booking lists).
**Props:** `booking` (listing thumbnail, dates, status, total) ·
`onClick`.
**States:** default, hover, loading (`BookingRowSkeleton`).
**Variants:** list-row (dense, dashboard tables) and card (customer-
facing "My Trips" grid).
**Accessibility:** identical link-wrapping discipline as Listing Card.
**Animation:** hover elevation (150ms), matching Listing Card's
restraint.
**Responsive Behaviour:** card variant stacks to full-width single
column on Mobile.
**Dependencies:** Image, Booking Status Badge, Rating (post-completion,
if reviewed).
**Where it is used:** Customer Account "My Trips," Partner Dashboard
bookings list.


## 8. Dashboard Components (Partner & Admin)

### Stat Card

**Purpose:** Headline-metric display (`UI_UX_GUIDELINES.md` §11.2 —
"lead with the number, then the trend") for dashboard overview screens.
**Props:** `label` · `value` · `trend` (percentage + direction,
optional) · `comparisonPeriodLabel` · `icon` · `loading`.
**States:** loading (Skeleton), populated, positive-trend,
negative-trend (color-coded per Success/Danger tokens, always paired
with a directional icon, never color alone).
**Variants:** with-trend, value-only (simpler counts, e.g. "Active
Listings").
**Accessibility:** the numeric value and trend are both included in a
single composed `aria-label` for assistive tech, rather than relying on
visual proximity alone to convey the relationship between the number
and its trend.
**Animation:** the value animates via a brief count-up (600–800ms) on
first view only, per `UI_UX_GUIDELINES.md` §10.4 — never re-animating
on every background refetch.
**Responsive Behaviour:** grid of Stat Cards reflows from 4-across
(Desktop) to 2-across (Tablet) to 1-across (Mobile).
**Dependencies:** Icon, Skeleton.
**Where it is used:** Partner Dashboard overview, Admin Panel overview.

### Partner Calendar Editor

**Purpose:** The Partner Dashboard's editing-mode composition of the
Booking Calendar (`FRONTEND_ARCHITECTURE.md` §23.3) — blackout-date
toggling and price-override shortcuts.
**Props:** `listingId` · `bookableUnitId` · `onBlackoutToggle` ·
`onPriceOverride`.
**States:** viewing, date-popover-open (edit actions), saving.
**Variants:** none — one editing composition, reused across every
lodging-type module (Hotels, Vacation Houses, Apartments, Camping) per
`BOOKING_ENGINE_ARCHITECTURE.md` Appendix A's shared pattern.
**Accessibility:** the edit popover is a focus-managed overlay (Modal/
Tooltip-adjacent pattern) fully keyboard-operable.
**Animation:** 150ms popover fade/slide.
**Responsive Behaviour:** popover becomes a bottom Drawer on Mobile/
Tablet.
**Dependencies:** Booking Calendar, Modal (popover), Input (price
override), Switch (blackout toggle).
**Where it is used:** Partner Dashboard's Calendar section.

### Moderation Queue Row

**Purpose:** Admin content-moderation list item
(`API_SPECIFICATION.md` §68's moderation queue).
**Props:** `item` (type: review/advertisement/listing, preview content,
submitted-by, submitted-at) · `onApprove` · `onReject`.
**States:** pending, approving (in-flight), rejecting (in-flight),
resolved (removed from the live queue view on success).
**Variants:** one row template per moderatable content type, sharing
the same approve/reject action pattern.
**Accessibility:** approve/reject are distinct, clearly-labeled Buttons
(never a single ambiguous icon toggle); a rejection always requires a
reason (a small inline Textarea revealed on reject-intent) before
confirming.
**Animation:** 200ms fade-out on resolution (approve/reject), rather
than an instant disappearance, so the admin has visual confirmation the
action registered.
**Responsive Behaviour:** collapses to a stacked card layout on Tablet/
Mobile per the Table component's own responsive rule.
**Dependencies:** Table (as the containing list), Button, Textarea,
Badge (content-type indicator).
**Where it is used:** Admin Panel moderation queue.

### Audit Log Viewer

**Purpose:** Searchable, read-only view over `audit_logs`
(`API_SPECIFICATION.md` §68, `DATABASE_ARCHITECTURE.md` §4.10).
**Props:** `filters` (actor, entity type, date range) ·
`entries` (paginated) · `onFilterChange`.
**States:** loading, populated, empty (EmptyState — "No matching audit
entries").
**Variants:** none.
**Accessibility:** each entry's before/after diff is rendered as
structured, labeled text (never a raw JSON dump presented without
labels).
**Animation:** none beyond standard Table row transitions.
**Responsive Behaviour:** follows Table's responsive collapse rule.
**Dependencies:** Table, Select (filters), DatePicker (date-range
filter), Pagination, EmptyState.
**Where it is used:** Admin Panel audit log section.

### Impersonation Banner

**Purpose:** The persistent, non-dismissible warning shown throughout
an active admin impersonation session
(`FRONTEND_ARCHITECTURE.md` §5.5, `API_SPECIFICATION.md` §68).
**Props:** `impersonatedUserName` · `onExit`.
**States:** active (its only state — the banner does not render at all
when no impersonation session is active).
**Variants:** none.
**Accessibility:** rendered with `role="alert"` on mount (announced
once, not repeatedly); the "Exit" action is a clearly labeled, always-
visible Button — never hidden behind a hover state or a collapsed
control.
**Animation:** none — deliberately static and unmissable, never
fading or auto-hiding.
**Responsive Behaviour:** full-width fixed bar at all breakpoints,
positioned above the standard header.
**Dependencies:** Button, color tokens (Warning/Orange, high-contrast).
**Where it is used:** `AdminLayout`, only while impersonating.

### Listing Table Row (Partner)

**Purpose:** Partner Dashboard's dense listing-management row
(`API_SPECIFICATION.md` §38–46's partner-scoped listing views).
**Props:** `listing` (thumbnail, name, type, status, occupancy summary)
· `onEdit` · `onPublishToggle` · `onDelete`.
**States:** draft, published, deactivated (soft-deleted, shown only
under an explicit "include inactive" filter).
**Variants:** one row template shared across every listing type
(Hotels through Swimming Pools), with a type Badge distinguishing them
— never a per-module-type row implementation.
**Accessibility:** row actions (Edit/Publish/Delete) are distinct,
labeled Buttons within the row, each independently focusable.
**Animation:** none beyond Table's standard row-hover treatment.
**Responsive Behaviour:** follows Table's responsive collapse rule.
**Dependencies:** Table, Badge (type + status), Button, Switch
(publish toggle).
**Where it is used:** Partner Dashboard listings section.

### Employee List Item

**Purpose:** Partner staff management row
(`API_SPECIFICATION.md` §32).
**Props:** `employee` (avatar, name, role, status) · `onRoleChange` ·
`onRemove`.
**States:** default, role-editing (inline Select), removing
(confirmation required via Modal), last-owner (remove action disabled
with an explanatory Tooltip, per
`BACKEND_ARCHITECTURE.md` Module 6's last-owner rule).
**Variants:** none.
**Accessibility:** the disabled "Remove" state for a last owner still
exposes its reason via `aria-describedby`/Tooltip, never a silently
disabled control with no explanation.
**Animation:** 200ms fade-out on successful removal.
**Responsive Behaviour:** follows Table's responsive collapse rule.
**Dependencies:** Avatar, Select (role), Button, Modal (remove
confirmation), Tooltip.
**Where it is used:** Partner Dashboard employees section.

---

## Governance

This document is the single source of truth for every reusable
component's architecture. A new component is added here — Purpose
through Where-it-is-used — before it is built, following the promotion
rule already established in `FRONTEND_ARCHITECTURE.md` §7 (a component
used by exactly one module lives inside that module until a second
module needs it, at which point it is promoted to this shared catalog).
No component ships that duplicates an existing entry's purpose; an
apparent gap is filled by extending an existing component's variants
(Chapter/§ per component above), never by creating a parallel,
slightly-different implementation.

---

*— End of COMPONENT_LIBRARY.md —*
