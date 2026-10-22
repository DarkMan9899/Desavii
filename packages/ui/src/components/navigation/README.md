# navigation

**Sprint 4 status:** `Breadcrumbs`, `Sidebar` implemented.

**Phase 5 status:** `WizardProgress` implemented — not a
`COMPONENT_LIBRARY.md` catalog entry (this group's catalog is
Breadcrumb/Sidebar/Pagination/Tabs), built for `PartnerListingWizard`'s
step indicator on the same "zero-domain-knowledge structural primitive
belongs in ui/, just uncataloged" precedent the `layout` group's README
documents. `Pagination`, `Tabs` (COMPONENT_LIBRARY.md Part II Section 3)
remain scaffolded, not implemented — out of scope so far.

Each component, when implemented, follows the full specification in
`COMPONENT_LIBRARY.md` (Purpose, Props, States, Variants, Accessibility,
Animation, Responsive Behaviour, Dependencies, Where it is used) exactly
— one file per component, colocated with its `.module.scss`
(`FRONTEND_ARCHITECTURE.md` Section 9.1) and its own tests
(`FRONTEND_ARCHITECTURE.md` Section 35).

## Breadcrumbs

Maps to `COMPONENT_LIBRARY.md`'s **"Breadcrumb"** entry. Hierarchical
location indicator for nested dashboard/account contexts.

**Props:** `items` (array of `{ label, href }`, required) · `maxItems`
(number, default `4` — collapses middle items into a static ellipsis
once `items.length` exceeds it) · `linkComponent` (element type,
default `'a'` — inject a router's link component; it always receives an
`href` prop, so a `to`-based router link needs a small local adapter)
· `className`.

**Usage:**

```jsx
import { Breadcrumbs } from '@desavii/ui/components/navigation';

<Breadcrumbs
  items={[
    { label: 'Dashboard', href: '/dashboard' },
    { label: 'Listings', href: '/dashboard/listings' },
    { label: 'Villa Ararat', href: '/dashboard/listings/villa-ararat' },
  ]}
/>;
```

**Accessibility notes:** `<nav aria-label="Breadcrumb">` landmark; every
item except the last is a real link; the last (current-page) item is
non-interactive text with `aria-current="page"`. The separator chevron
is `aria-hidden`.

**Documented simplification:** the spec's mobile-specific "truncates to
first + last + ellipsis" and the general `maxItems` collapse are unified
into one algorithm applied at every breakpoint (see `Breadcrumbs.jsx`'s
file header). The ellipsis is static, not an expandable menu — no
shared Dropdown/Menu primitive exists yet to compose it from.

## Sidebar

Maps to `COMPONENT_LIBRARY.md`'s **"Sidebar Navigation"** entry. The
persistent dashboard navigation structure shared by `PartnerLayout` and
`AdminLayout`.

**Props:** `items` (array of `{ id, label?, items: [{ id, label, href,
icon?, badgeCount? }] }` groups, required) · `collapsed` (boolean,
default `false` — persistence across sessions is an application-level
concern, e.g. `localStorage`, not this component's job) ·
`onToggleCollapse` (function — renders a built-in toggle button when
given, omitted entirely otherwise) · `activeItemId` (string) ·
`linkComponent` (element type, default `'a'`, same contract as
`Breadcrumbs`) · `ariaLabel` (string, default `'Dashboard navigation'`)
· `className`.

**Usage:**

```jsx
import { useState } from 'react';
import { Sidebar } from '@desavii/ui/components/navigation';

function PartnerNav() {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <Sidebar
      ariaLabel="Partner navigation"
      collapsed={collapsed}
      onToggleCollapse={() => setCollapsed((prev) => !prev)}
      activeItemId="listings"
      items={[
        {
          id: 'main',
          label: 'Main',
          items: [
            { id: 'dashboard', label: 'Dashboard', href: '/partner' },
            {
              id: 'listings',
              label: 'Listings',
              href: '/partner/listings',
              badgeCount: 2,
            },
          ],
        },
      ]}
    />
  );
}
```

**Accessibility notes:** renders as `<aside>` wrapping a `<nav>` — the
`<aside>` is the landmark for "this is the sidebar region", the `<nav>`
is the landmark for "this is a navigation list" (this sprint's required
semantic-landmark set treats the two as distinct). Every item carries an
explicit `aria-label` regardless of `collapsed` state, so collapsed
(icon-only) mode never loses its accessible name. The active item is
indicated by more than color alone (a left-border accent + bold text).

**Documented simplification:** the spec's Mobile/Tablet "bottom tab bar
**or** slide-in drawer" is implemented as a CSS-only reflow to a
horizontal, bottom-fixed bar — not a slide-in `Drawer` composition, since
the documented prop API has no open/close state for a drawer variant
(see `Sidebar.jsx`'s file header).

## WizardProgress

Step indicator for `PartnerListingWizard`'s multi-step flow. Deliberately
its own component, not a reuse of `DynamicFilterPanel`'s numeric
`Stepper` control (`apps/web/src/modules/search/components/
DynamicFilterPanel/controls/Stepper.jsx`) — that `Stepper` is an
unrelated +/- number input.

**Props:** `steps` (array of `{ id, label }`, required) · `currentStepId`
(required) · `completedStepIds` (array, default `[]`) · `onStepClick`
(function — when given, completed and current steps become clickable;
omitted entirely otherwise, since a partner shouldn't be able to jump
ahead of validation via this control alone) · `ariaLabel` (default
`'Listing creation progress'`) · `className`.

**Responsive behaviour:** a container query on the bar's own width (not
the viewport's, since it usually sits beside a sidebar). Narrower than the
`laptop` breakpoint, the steps form one horizontally scrolling row, and the
current step is scrolled into view (inside the row only) whenever it
changes. At that width or wider, every step gets an equal column with its
label wrapping (hyphenated in the page's language) under its number, so
the whole flow is visible at once.

**Usage:**

```jsx
import { WizardProgress } from '@desavii/ui/components/navigation';

<WizardProgress
  steps={[
    { id: 'category', label: 'Category' },
    { id: 'basicInfo', label: 'Basic Information' },
    { id: 'location', label: 'Location' },
  ]}
  currentStepId="location"
  completedStepIds={['category', 'basicInfo']}
  onStepClick={(stepId) => goToStep(stepId)}
/>;
```

**Accessibility notes:** `<nav>` wrapping an `<ol>` of step markers, each
with `aria-current="step"` on the current one; clickable markers carry
an explicit `aria-label` ("Go to {label}") since their visible content is
just a number or checkmark icon. A permanent "Step X of N" caption plus
`role="progressbar"` renders beneath the step row at every breakpoint —
unlike `Sidebar`'s CSS-only `display: none` reflow, this summary is never
the sole accessible copy of an interactive control, so it stays
supplementary rather than swapping out the step row's buttons behind a
media query.
