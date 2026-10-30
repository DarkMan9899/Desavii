# components

Composite components shared across more than one module or layout, but
too domain-specific for `@desavii/ui` — `FRONTEND_ARCHITECTURE.md`
§3.1: "shared across more than one module but too domain-specific for
`ui/`" (e.g. `PriceBreakdown`, `ListingCard`). `Header` and `Footer`
below are this sprint's first inhabitants: `PublicLayout` uses the full
header, `CustomerAccountLayout` uses "a condensed version of
PublicLayout's header" (§5.3) — built once here, composed with
different `navItems`/`actions` per layout, per this sprint's "no
duplicated layout logic" requirement.

Both carry **zero business logic** (no auth state, no API calls,
no hardcoded content) — every piece of real content (`logo`, `navItems`,
`actions`, footer `columns`) is supplied by whichever layout composes
them.

## Header

**Props:** `logo` (node, required) · `homeHref` (string, default `'/'`)
· `navItems` (array of `{ label, to }`, default `[]`) · `actions`
(node, optional — a slot for auth/language-switcher controls).

**Usage:**

```jsx
import Header from '../components/Header/Header.jsx';

<Header
  logo="Desavii Armenia"
  homeHref="/hy"
  navItems={[
    { label: 'Home', to: '/hy' },
    { label: 'Search', to: '/hy/search' },
  ]}
/>;
```

A `navItems` entry may also be a dropdown group,
`{ label, items: [{ label, to }] }`, rendered as a `Popover` menu.

**Layout:** below Laptop the nav and `actions` collapse into the
hamburger-triggered `MobileNav` drawer. From Laptop up the nav is a
"priority+" row (`Header/usePriorityNav.js`): the leading items that fit
stay in the row and the rest move, in order, into a trailing "More"
(`nav.more`) menu, where an overflowed dropdown group appears as a
labelled group of its links. Fit is measured live (viewport, locale,
signed-in actions, late font loads) against a hidden, `aria-hidden`
copy of the row, so the row never overlaps the `actions` and the
actions are never hidden — order `navItems` by priority, most important
first.

**Accessibility notes:** renders `<header>` (the `banner` landmark) with
a `<nav aria-label="Primary">` for `navItems` — omitted entirely (no
empty landmark) when `navItems` is empty. Every link meets the 44px
minimum touch-target height. Uses `@desavii/ui`'s `focus-ring()` mixin
throughout. A link moved into "More" is not rendered in the row, so it
is reachable exactly once — inside the menu.

## Footer

**Props:** `columns` (array of `{ title, links: [{ label, to }] }`,
default `[]`) · `bottomText` (string, optional — e.g. a copyright line).

**Usage:**

```jsx
import Footer from '../components/Footer/Footer.jsx';

<Footer
  columns={[{ title: 'Company', links: [{ label: 'About', to: '/about' }] }]}
  bottomText="© 2026 Desavii Armenia"
/>;
```

**Accessibility notes:** renders `<footer>` (the `contentinfo`
landmark); each column is its own `<nav aria-label={column.title}>`
landmark, so screen-reader users can jump directly to "Company",
"Support", etc. Omitted entirely (no empty grid) when `columns` is
empty.
