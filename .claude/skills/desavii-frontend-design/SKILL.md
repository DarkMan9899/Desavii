---
name: desavii-frontend-design
description: Desavii's visual direction, vertical-specific UX conventions, and motion rules for any frontend/design work on the travel marketplace. Load this before implementing or reviewing UI in apps/web or packages/ui.
---

# Desavii Frontend Design Rules

Desavii is a premium, modern Armenia travel marketplace — not a generic SaaS
dashboard and not a generic AI-card template. Every UI decision should read as
distinctly travel/editorial, not interchangeable with any other marketplace.

## Visual direction

- Palette: restrained dark navy / royal blue, with gold used only as an
  accent (CTAs, highlights, small marks) — never as a dominant fill.
- Strong whitespace and deliberate typographic hierarchy over dense,
  cramped layouts.
- Must read correctly and elegantly in Armenian, Russian, and English —
  check line-length, wrapping, and diacritic/Cyrillic/Armenian glyph
  rendering, not just English copy, before calling any layout done.
- Avoid generic AI-generated design defaults: warm cream + serif + terracotta,
  near-black + neon accent, purple-to-blue gradient heroes, centered-everything,
  emoji as section markers, `rounded-lg` on every surface, accent rail on every
  card. Distinctive should come from the travel/Armenia subject, not a
  templated look.

## Vertical UX — each category has different informational needs

- **HOTEL** — rooms/hospitality: room types, bed configuration, amenities per
  room, check-in/out times.
- **PROPERTY** — whole-property stay: full unit, not individual rooms.
- **RESTAURANT** — menu/food/reservation: dishes, price, reservation time —
  never guests-as-rooms semantics.
- **TOUR** — itinerary/departure/duration: departure dates, duration, group
  size — not room/guest semantics.
- **CAR_RENTAL** — vehicle/pickup-return/specs: pickup/return location and
  time, seats/transmission/fuel — never a "Guests" field.
- **ATTRACTION** — history/facts/visit information: only verified, stored
  facts — never invented history or copy.
- **ENTERTAINMENT** — events/schedule/venue/tickets: show times and venue,
  not a generic listing card.

Never reuse a field or label across verticals just because the component is
shared — gate fields by category capability instead of showing every field
everywhere.

## Motion

- Animate `transform` and `opacity` only — never properties that trigger
  layout (`width`, `height`, `top`, `left` outside of an already-`position:
fixed`/`absolute` element, margin).
- No layout jump, no flicker, no animation-caused CLS.
- Respect `prefers-reduced-motion` — every non-essential transition/animation
  must have a reduced-motion fallback (instant or no-op).
- Hover/entry interactions should be subtle and premium — quick, restrained,
  never bouncy or attention-grabbing for its own sake.

## QA requirement

Every meaningful visual change must be driven in a real browser, not judged
from source alone. Check at these widths:

- 390 (mobile)
- 768 (tablet)
- 1024 (small desktop)
- 1440 (desktop)

For each: interact with the change, inspect visual hierarchy, inspect for
overflow/clipping, check the browser console for errors, check network for
failed requests, and honestly critique whether the result still looks
generic before calling it a PASS. A change is not visually verified until
it has been seen rendering in a real browser at these breakpoints — code
review alone is not sufficient evidence of a visual PASS.
