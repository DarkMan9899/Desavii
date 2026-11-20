# FRONTEND ARCHITECTURE

**Desavii Armenia — React Frontend Engineering Contract**
**Status:** Final · **Version:** 1.0 · **Classification:** Confidential
**Owner:** Lead Frontend Architect
**Depends on (must never be contradicted):** `PROJECT_BIBLE.md` · `UI_UX_GUIDELINES.md` · `DATABASE_ARCHITECTURE.md` · `BOOKING_ENGINE_ARCHITECTURE.md` · `API_SPECIFICATION.md`

---

> "The backend guarantees correctness. The frontend's only job is to never
> pretend it can guarantee correctness too. Every price the frontend shows
> is a quote until the API confirms it; every availability calendar is a
> hint until the API holds it; every countdown is a display of a timestamp
> the server owns, never a timer the client invented."

This document is the single source of truth for the React frontend: four
customer- and operator-facing interfaces built from one codebase, consuming
the contract defined in `API_SPECIFICATION.md` exactly as written, rendering
the design language defined in `UI_UX_GUIDELINES.md` exactly as specified,
and never re-deriving, caching-as-truth, or second-guessing any state owned
by the Booking Engine (`BOOKING_ENGINE_ARCHITECTURE.md`).

No React source code, no CSS, and no page-level visual design appear in this
document — it defines structure, boundaries, and rules, not implementation.

---

> ### ⚠️ IMPLEMENTATION STATUS ADDENDUM (added P2.1, 2026-08-24)
>
> This document is the **original pre-implementation engineering
> contract**, written before Sprint 1. A P2 forensic audit of the
> running codebase found that the real, shipped frontend diverges from
> **§4.2's per-vertical route tree and §6.1's 23-module list** — there
> is no `/hotels/:slug`, `/vacation-houses/:slug`, `/spa/:slug`, or
> `/events/:slug` route, and the `hotels`, `vacation-houses`,
> `restaurants`, `spa`, `car-rentals`, `tours`, `events`, and
> `properties` "modules" are empty, unwired Sprint-1 folder scaffolds.
> What was actually built — one generic, metadata-driven listing
> detail/search/wizard system serving every vertical — is described in
> the new **§4.2A** below. Every other chapter in this document was
> verified against the real code during that audit and is accurate.

---

## Table of Contents

1. Frontend Architecture Philosophy
2. Application Boundaries
3. Complete Folder Structure
4. Routing Architecture
5. Layout Architecture
6. Feature Module Architecture
7. Shared Component Architecture
8. Design System Integration
9. SCSS Architecture
10. API Client Architecture
11. Authentication Architecture
12. Authorization and Route Guards
13. State Management Strategy
14. React Query Strategy
15. Forms and Validation
16. Internationalization
17. Currency and Locale Formatting
18. Date and Timezone Handling
19. Search Architecture
20. Booking Flow Architecture
21. Reservation Hold Countdown
22. Payment UI Architecture
23. Calendar and Availability UI
24. Media and Image Architecture
25. Maps Architecture
26. Notifications and Toasts
27. Error Handling
28. Loading and Skeleton States
29. Empty States
30. Accessibility
31. Animation Architecture
32. Performance Strategy
33. SEO Strategy
34. Security Rules
35. Testing Strategy
36. Logging and Monitoring
37. Environment Configuration
38. Build and Deployment Strategy
39. Coding Standards
40. Definition of Done

---

## 1. Frontend Architecture Philosophy

1. **The frontend renders truth; it does not compute it.** Every price,
   every availability status, every booking status shown to a user
   originates from an API response (`API_SPECIFICATION.md`), never from
   client-side arithmetic on cached data. This single rule is the reason
   Chapters 19–23 exist in the shape they do.
2. **One codebase, four applications, one design language.** Customer
   Website, Customer Account Area, Partner Dashboard, and Admin Panel are
   four *route trees* inside one React application, not four repositories
   (Chapter 2 gives the full justification). They share the same API
   client, the same design system, the same i18n pipeline, and the same
   build tooling — divergence between them is a bug, not a feature.
3. **Server state and client state are never the same state.** TanStack
   React Query owns everything that originates from the API; React
   Context and local component state own everything that is purely a UI
   concern. This boundary (Chapter 13) is the single most
   important state-management decision in this document, and every other
   state decision falls out of it.
4. **Every screen has three states before it has content: loading, empty,
   error.** No component is considered complete until all three are
   designed and implemented, per `UI_UX_GUIDELINES.md` §9.12's empty-state
   and loading-skeleton standards (Chapters 28–29).
5. **Accessibility and internationalization are default behavior, not
   opt-in features.** A component that only works in English, or only
   works with a mouse, is an incomplete component, not a "v2" component
   (Chapters 16, 30).
6. **The 15-minute hold is sacred.** The single most safety-critical
   number in the entire platform (`BOOKING_ENGINE_ARCHITECTURE.md` §5.2)
   is rendered, counted down, and expired entirely from a server-provided
   `expires_at` timestamp — the frontend never starts its own independent
   timer as the source of truth (Chapter 21).
7. **Consistency beats cleverness.** A frontend engineer who has built one
   feature module (Chapter 6) has effectively learned the shape of all
   twenty-three of them. Deviating from the established pattern to save a
   few lines of code in one module is never worth the cost to every future
   engineer reading it.

## 2. Application Boundaries

### 2.1 The Decision: One Codebase, Four Route Trees

The platform's four interfaces — **Customer Website**, **Customer Account
Area**, **Partner Dashboard**, and **Admin Panel** — are built as four
top-level route trees within **one React application**, not as four
separate applications or a micro-frontend architecture. This is a
deliberate decision, not a default.

**Why not separate repositories/deployments (micro-frontends)?**

- All four interfaces render the **same design system**
  (`UI_UX_GUIDELINES.md`) — the same buttons, cards, modals, and calendar
  component appear in the Customer Website's listing page and the Partner
  Dashboard's booking calendar. A shared component library across
  repository boundaries requires either a published, versioned package
  (adding release-coordination overhead this platform's size does not yet
  justify) or duplication (a direct violation of Chapter 1's consistency
  principle).
- All four interfaces call the **same API client** (Chapter 10) with the
  same auth, retry, and error-normalization logic. Splitting repositories
  would mean maintaining that logic four times or extracting it into a
  separately versioned package — again, overhead without a
  corresponding benefit at this stage.
- The four interfaces are **not independently deployed by different
  teams on different cadences** — there is one frontend team, one release
  train. Micro-frontend architectures earn their complexity when
  independent teams need independent deploy cadences; that condition does
  not hold here.
- **Bundle size**, the usual argument *for* separation, is instead solved
  by route-based code splitting (Chapter 4): a customer visiting the
  public website never downloads the Admin Panel's JavaScript, and vice
  versa, despite living in the same build.

**What would change this decision?** If Partner Dashboard or Admin Panel
functionality grew large enough to warrant a fully independent team with
its own release cadence, *that* application would be the first candidate
for extraction — the route-tree boundaries defined in Chapter 4 are drawn
so this split, if ever needed, is a build-configuration change, not a
rewrite.

### 2.2 The Four Applications, Scoped

| Application | Audience | Route root | Primary layout (Ch. 5) |
|---|---|---|---|
| **Customer Website** | Anonymous + logged-in customers browsing/booking | `/{locale}/` | `PublicLayout`, `CheckoutLayout` |
| **Customer Account Area** | Logged-in customers managing their own bookings/profile | `/{locale}/account/` | `CustomerAccountLayout` |
| **Partner Dashboard** | Partner owners/managers/staff managing their listings | `/{locale}/partner/` | `PartnerLayout` |
| **Admin Panel** | Platform admins/moderators | `/{locale}/admin/` | `AdminLayout` |

Each application is a **feature-module composition**, not a hand-built
page tree — Chapter 6 defines the reusable modules (`bookings`, `listings`,
`payments`, etc.) that Customer Account Area, Partner Dashboard, and Admin
Panel all import from and configure differently (different permission
scopes, different available actions), rather than each maintaining its own
copy of, say, booking-detail rendering logic.


## 3. Complete Folder Structure

```
src/
  app/                  — application bootstrap, providers, root composition
  routes/               — route tree definitions per application (Ch. 4)
  layouts/              — PublicLayout, AdminLayout, etc. (Ch. 5)
  pages/                — thin route-entry components (compose modules + layout)
  modules/              — feature modules, one per domain (Ch. 6)
  components/           — shared, cross-module UI components (Ch. 7)
  ui/                   — design-system primitives (Ch. 8)
  hooks/                — shared, cross-module custom hooks
  api/                  — Axios instance, endpoint definitions (Ch. 10)
  services/             — thin orchestration over api/ for multi-call flows
  queries/              — React Query query definitions (Ch. 14)
  mutations/            — React Query mutation definitions (Ch. 14)
  schemas/              — React Hook Form validation schemas (Ch. 15)
  contexts/             — global client-state React Contexts (Ch. 13)
  providers/            — context providers + composition root
  utils/                — pure helper functions (formatting, math, guards)
  constants/            — enums, permission keys, route paths, config constants
  assets/               — static, non-generated images/icons/fonts
  styles/               — SCSS architecture root (Ch. 9)
  translations/         — i18next resource files (Ch. 16)
  guards/               — route guard components (Ch. 12)
  errors/               — error boundary components, error page components
  tests/                — cross-cutting test utilities, mocks, fixtures
```

### 3.1 Folder-by-Folder Contract

For every folder: **Purpose**, **Allowed dependencies** (what it may
import from), **Forbidden dependencies** (what it must never import from,
to prevent architectural erosion), **Naming convention**, **Ownership**.

**`app/`**
- *Purpose:* Application entry point — mounts React, composes the provider
  tree (`providers/`), initializes i18next, React Query's `QueryClient`,
  and the Axios instance, then renders the router.
- *Allowed:* `providers/`, `routes/`, `api/` (initialization only).
- *Forbidden:* Must never import from `modules/` or `pages/` directly —
  `app/` composes infrastructure, it does not know about features.
- *Naming:* `App.jsx`, `main.jsx`.
- *Ownership:* Platform/infrastructure sub-team.

**`routes/`**
- *Purpose:* Declarative route-tree definitions per application (Chapter
  4), including lazy-loaded route components and guard composition.
- *Allowed:* `pages/`, `layouts/`, `guards/`.
- *Forbidden:* Must never contain business logic or direct API calls —
  routing is composition only.
- *Naming:* One file per application: `customerRoutes.jsx`,
  `accountRoutes.jsx`, `partnerRoutes.jsx`, `adminRoutes.jsx`, merged in
  `routes/index.jsx`.
- *Ownership:* Platform/infrastructure sub-team, reviewed by every feature
  team when their module's routes change.

**`layouts/`**
- *Purpose:* Chrome shared across a set of pages — header, footer,
  sidebar, breadcrumbs (Chapter 5).
- *Allowed:* `components/`, `ui/`, `contexts/`.
- *Forbidden:* Must never import a specific feature `module/` directly —
  a layout renders navigation *links*, never embeds a module's business
  logic.
- *Naming:* `PascalCase` + `Layout` suffix: `PartnerLayout.jsx`.
- *Ownership:* Platform/infrastructure sub-team.

**`pages/`**
- *Purpose:* The thinnest possible layer — one file per route, composing
  a layout and one or more modules, reading route params, and nothing
  else. A page file is intentionally boring.
- *Allowed:* `modules/`, `layouts/` (via `routes/`, not directly), `hooks/`.
- *Forbidden:* Must never contain a `useQuery`/`useMutation` call
  directly, and must never contain SCSS beyond page-level layout
  composition — all real logic and presentation lives in `modules/`.
- *Naming:* Mirrors the route: `pages/listings/ListingDetailPage.jsx`.
- *Ownership:* The feature team owning the corresponding module.

**`modules/`**
- *Purpose:* One directory per domain (Chapter 6) — the real home of
  feature logic, components, queries, and mutations for that domain.
- *Allowed:* `components/`, `ui/`, `hooks/`, `queries/`, `mutations/`,
  `schemas/`, `utils/`, `constants/`, other modules' **public exports
  only** (never another module's internals — see Chapter 6.3).
- *Forbidden:* Direct `api/` calls bypassing `queries/`/`mutations/`;
  reaching into another module's internal (non-exported) files.
- *Naming:* kebab-case directory names matching Chapter 6's module list
  (`booking-holds/`, `vacation-houses/`).
- *Ownership:* One feature team per module, listed in Chapter 6.

**`components/`**
- *Purpose:* Composite components shared across **more than one module**
  but too domain-specific for `ui/` (e.g., `PriceBreakdown`,
  `ListingCard`, `BookingStatusBadge`) — Chapter 7.
- *Allowed:* `ui/`, `hooks/`, `utils/`.
- *Forbidden:* Must never import from `modules/` — dependency flows from
  modules to shared components, never the reverse; must never make a
  direct API call.
- *Naming:* `PascalCase`, one component per directory
  (`components/PriceBreakdown/index.jsx`).
- *Ownership:* Platform/design-system sub-team.

**`ui/`**
- *Purpose:* Pure design-system primitives (Chapter 8) — `Button`,
  `Input`, `Modal`, `Badge` — with zero business/domain knowledge.
- *Allowed:* `utils/` (formatting only), nothing else feature-related.
- *Forbidden:* Must never import from `components/`, `modules/`, or
  `contexts/` (other than the theme/locale context, which `ui/` may read
  for rendering, never for business logic).
- *Naming:* `PascalCase`: `ui/Button/`, `ui/DatePicker/`.
- *Ownership:* Platform/design-system sub-team; changes require design
  review against `UI_UX_GUIDELINES.md`.

**`hooks/`**
- *Purpose:* Cross-module custom hooks with no domain-specific data
  shape (`useDebounce`, `useMediaQuery`, `useOnClickOutside`).
- *Allowed:* React built-ins, `utils/`.
- *Forbidden:* No API calls, no module-specific logic — a hook belonging
  to one domain lives inside that module's own `hooks/` subfolder instead.
- *Naming:* `camelCase`, `use` prefix.
- *Ownership:* Platform/infrastructure sub-team.

**`api/`**
- *Purpose:* The Axios instance and one file per `API_SPECIFICATION.md`
  module defining its raw endpoint calls (Chapter 10) — the *only* place
  in the codebase that constructs a URL or calls `axios.get/post/...`.
- *Allowed:* `constants/` (base URL, header names), `utils/`.
- *Forbidden:* Must never contain React hooks or component logic — this
  layer is framework-agnostic and could theoretically be extracted into a
  standalone SDK package.
- *Naming:* Mirrors `API_SPECIFICATION.md` module names:
  `api/bookings.js`, `api/bookingHolds.js`.
- *Ownership:* Platform/infrastructure sub-team, kept in lockstep with
  `API_SPECIFICATION.md` via the contract-testing process (Chapter 35).

**`services/`**
- *Purpose:* Thin orchestration for flows spanning multiple `api/` calls
  that are not themselves a single React Query hook (e.g., the file-upload
  intent flow, `API_SPECIFICATION.md` §19, which is a 3-step sequence).
- *Allowed:* `api/`, `utils/`.
- *Forbidden:* No component/hook logic; no direct import of `modules/`.
- *Naming:* `camelCase` + `Service` suffix: `mediaUploadService.js`.
- *Ownership:* Platform/infrastructure sub-team.

**`queries/` / `mutations/`**
- *Purpose:* React Query hook definitions (Chapter 14), one file per
  resource, built on top of `api/`.
- *Allowed:* `api/`, `constants/` (query-key factory).
- *Forbidden:* No direct component rendering logic.
- *Naming:* `useXQuery.js` / `useXMutation.js`, grouped by module when the
  module owns domain-specific queries (most live inside their owning
  `modules/{name}/queries/` instead — the top-level `queries/`/`mutations/`
  folders hold only the small set of truly cross-module queries, e.g. the
  notification unread-count poll used in every layout's header).
- *Ownership:* The owning feature team.

**`schemas/`**
- *Purpose:* React Hook Form validation schemas (Chapter 15), mirroring
  `API_SPECIFICATION.md` §10's validation rules exactly so client-side and
  server-side validation never disagree.
- *Allowed:* `constants/`, `utils/`.
- *Naming:* `xSchema.js` per form.
- *Ownership:* The owning feature team; changes require confirming
  against the corresponding endpoint's validation rules in
  `API_SPECIFICATION.md`.

**`contexts/` / `providers/`**
- *Purpose:* Global client state (Chapter 13) — `AuthContext`,
  `LocaleContext`, `CurrencyContext`, `ThemeContext`, `ToastContext`.
- *Allowed:* `api/`, `utils/`, `constants/`.
- *Forbidden:* A context must never store server data that React Query
  already owns (Chapter 13's core boundary) — no `ListingsContext`, ever.
- *Naming:* `XContext.jsx` + `XProvider.jsx`.
- *Ownership:* Platform/infrastructure sub-team.

**`utils/`**
- *Purpose:* Pure, side-effect-free helper functions — currency
  formatting (Chapter 17), date formatting (Chapter 18), validation
  helpers, permission-check helpers.
- *Allowed:* Other `utils/` files only, and third-party pure libraries.
- *Forbidden:* No React, no API calls, no side effects — every function
  here must be unit-testable with a plain input/output assertion.
- *Naming:* `camelCase`, grouped by concern (`utils/currency.js`,
  `utils/dates.js`, `utils/permissions.js`).
- *Ownership:* Platform/infrastructure sub-team.

**`constants/`**
- *Purpose:* Enums and fixed values mirroring backend lookup tables
  (`DATABASE_ARCHITECTURE.md` §1's "no native ENUM" principle extends to
  the frontend: every status/type value used in a comparison lives here,
  once, never as a magic string scattered through components) —
  booking statuses, permission keys, route paths, supported locales,
  supported currencies.
- *Allowed:* Nothing (leaf dependency).
- *Naming:* `SCREAMING_SNAKE_CASE` exports from `camelCase`-named files:
  `constants/bookingStatuses.js`.
- *Ownership:* Platform/infrastructure sub-team; a new backend status
  value (Appendix A of `BOOKING_ENGINE_ARCHITECTURE.md`) is added here in
  the same pull request that adds any frontend handling for it.

**`assets/`**
- *Purpose:* Static, hand-authored, non-CMS images/icons/fonts not served
  from the CDN via `media` objects (`API_SPECIFICATION.md` §20) — e.g.,
  the platform logo, UI iconography sprite.
- *Naming:* kebab-case files, organized by type (`assets/icons/`,
  `assets/fonts/`).
- *Ownership:* Platform/design-system sub-team.

**`styles/`**
- *Purpose:* SCSS architecture root (Chapter 9) — design tokens, mixins,
  global resets.
- *Ownership:* Platform/design-system sub-team.

**`translations/`**
- *Purpose:* i18next resource files (Chapter 16).
- *Ownership:* Platform/infrastructure sub-team owns the pipeline; string
  content ownership is shared with product/localization.

**`guards/`**
- *Purpose:* Route guard components (Chapter 12) — `RequireAuth`,
  `RequireRole`, `RequirePermission`, `RequireOwnership`.
- *Allowed:* `contexts/` (`AuthContext`), `utils/permissions.js`.
- *Forbidden:* No API calls of their own — guards read already-resolved
  state from `AuthContext` (populated at login via `GET /auth/me`,
  `API_SPECIFICATION.md` §27), never fetch permissions independently.
- *Ownership:* Platform/infrastructure sub-team.

**`errors/`**
- *Purpose:* `ErrorBoundary` components and the 403/404/500 error page
  components (Chapter 27).
- *Ownership:* Platform/infrastructure sub-team.

**`tests/`**
- *Purpose:* Shared test utilities — custom render functions (pre-wrapped
  with providers), mock API handlers (Chapter 35), shared fixtures.
- *Ownership:* Platform/infrastructure sub-team; every feature team
  contributes fixtures for their own module.

### 3.2 Feature Module Directory Contents

Every entry under `modules/` (the 23 modules listed in the brief) follows
the same internal shape, detailed fully in Chapter 6:

```
modules/{module-name}/
  components/
  hooks/
  queries/
  mutations/
  schemas/
  utils/
  constants/
  index.js        — the module's public export surface
```


## 4. Routing Architecture

### 4.1 Locale URL Strategy — The Decision

**Decision: locale-prefixed paths — `/hy/...`, `/ru/...`, `/en/...`** — a
segment prefix on every route, resolved via React Router, not a query
parameter, cookie-only preference, or subdomain-per-locale.

**Why not a query parameter (`?lang=hy`)?** Search engines index the path,
not transient query state, inconsistently at best; a query-parameterized
URL is trivially seen by crawlers and users as "the same page" across
locales, actively working against indexing all three languages. It also
means the *default* locale's canonical URL is ambiguous (is `/hotels/123`
Armenian, or does it depend on a cookie no crawler carries?).

**Why not subdomains (`hy.desavii.com`)?** Subdomains fragment
domain authority and analytics, and are unnecessary operational overhead
(three separate TLS/CDN configurations conceptually) for what is
fundamentally the same site in three languages, not three distinct
properties.

**Why not cookie-only, no URL signal at all?** This is the worst option
for SEO: a crawler has no reliable, linkable way to request the Russian
version of a specific listing page, and users cannot share/bookmark a
specific-language URL.

**Why path-prefix wins:** It is Google's explicitly recommended
internationalization pattern, keeps one domain's authority intact, makes
every localized page independently crawlable, linkable, and bookmarkable,
and maps directly onto `hreflang` alternate-link tags (Chapter 33) —
`https://desavii.com/en/hotels/yerevan-grand` and
`.../hy/hotels/yerevan-grand` are two distinct, indexable URLs the site
explicitly declares as language alternates of one another.

**Mechanics:**
- Every route in every application is nested under a `/:locale` segment,
  validated against the three supported values (Chapter 16); an invalid
  locale segment renders the 404 route (§4.6), never a silent fallback.
- The default locale (Armenian, per `UI_UX_GUIDELINES.md`) is **still
  explicit in the URL** (`/hy/`) rather than omitted at the root — an
  omitted-prefix-for-default pattern is a common but avoidable source of
  duplicate-content and canonicalization bugs; explicit-always is simpler
  and unambiguous.
- Switching locale (Chapter 16.6) rewrites only the leading segment,
  preserving the rest of the current path, so a user reading a specific
  listing in Armenian who switches to Russian lands on that same listing
  in Russian, not the Russian homepage.
- A root request with no locale segment (`/`) is redirected (HTTP 302,
  server- or edge-redirect, not a client-side flash) to the best-matching
  locale from `Accept-Language`, falling back to the default.

### 4.2 Route Tree Overview

> ⚠️ **NOT IMPLEMENTED AS DESCRIBED** — the per-vertical detail routes
> below (`/hotels/:slug`, `/vacation-houses/:slug`, etc.) do not exist.
> See **§4.2A** for the real route.

```
/:locale/
├── (Customer Website — PublicLayout)
│   ├── /                                  Home
│   ├── /search                            Search results
│   ├── /hotels/:slug                      Hotel detail
│   ├── /vacation-houses/:slug
│   ├── /restaurants/:slug
│   ├── /spa/:slug
│   ├── /car-rentals/:slug
│   ├── /tours/:slug
│   ├── /events/:slug
│   ├── /partners/:slug                    Public partner profile
│   ├── /pages/:cmsSlug                    CMS pages (About, Terms, etc.)
│   └── /support                           Public support/contact entry
│
├── /checkout/                             (CheckoutLayout — distraction-free)
│   ├── /checkout/hold/:holdId             Guest details + review
│   └── /checkout/payment/:holdId          Payment step
│   └── /checkout/confirmation/:bookingId
│
├── /auth/                                 (AuthLayout)
│   ├── /auth/login
│   ├── /auth/register
│   ├── /auth/forgot-password
│   └── /auth/reset-password
│
├── /account/                              (CustomerAccountLayout — RequireAuth)
│   ├── /account/                          Overview / dashboard
│   ├── /account/bookings
│   ├── /account/bookings/:id
│   ├── /account/favorites
│   ├── /account/reviews
│   ├── /account/wallet
│   ├── /account/messages
│   ├── /account/notifications
│   └── /account/profile
│
├── /partner/                              (PartnerLayout — RequireAuth + RequireRole:partner_*)
│   ├── /partner/                          Dashboard overview
│   ├── /partner/listings
│   ├── /partner/listings/:id
│   ├── /partner/listings/new
│   ├── /partner/calendar
│   ├── /partner/bookings
│   ├── /partner/pricing
│   ├── /partner/coupons
│   ├── /partner/reviews
│   ├── /partner/payouts
│   ├── /partner/employees
│   ├── /partner/organization
│   └── /partner/messages
│
├── /admin/                                (AdminLayout — RequireAuth + RequireRole:admin|super_admin|moderator)
│   ├── /admin/                            Dashboard overview
│   ├── /admin/users
│   ├── /admin/partners
│   ├── /admin/listings
│   ├── /admin/bookings
│   ├── /admin/payments
│   ├── /admin/refunds
│   ├── /admin/payouts
│   ├── /admin/moderation
│   ├── /admin/cms
│   ├── /admin/advertisements
│   ├── /admin/support
│   ├── /admin/reports
│   ├── /admin/settings
│   └── /admin/audit-logs
│
└── (Error routes — ErrorLayout)
    ├── /403
    ├── /404
    └── /500
```

### 4.2A. As-Built Reality: One Generic Listing Route (added P2.1)

There is **one route for every listing, regardless of vertical**:
`/:locale/listings/:id` (`ListingDetailPage`, wrapping
`ListingDetailPageContent`). It is not a per-category component
switch — it is a single, metadata-driven layout whose **section order**
and **booking-CTA copy** vary by the listing's `listing_type`
(resolved via `resolvePresentationGroup()`/`categoryPresentation.js`:
`HOTEL`/`PROPERTY`→accommodation grouping, `TOUR`/`ATTRACTION`→
experience grouping, `CAR_RENTAL`→transport grouping, `RESTAURANT`→
generic), while every section itself (attributes, amenities, policies,
itinerary, FAQ) renders generically from real listing data and is
simply omitted when a listing/vertical has none — never hardcoded per
type. The Partner Listing Wizard is likewise one fixed 11-step
sequence for every vertical; type-specificity happens entirely inside
the attributes/pricing/policy steps via the same metadata engine
described in `BACKEND_ARCHITECTURE.md` §7A, not via separate wizard
routes. See §7A there for the full `listing_type`/`listing_category`/
`bookable_unit_type` model and current per-vertical status.

The `hotels`, `vacation-houses`, `restaurants`, `spa`, `car-rentals`,
`tours`, `events`, and `properties` module folders referenced in §6.1
below exist in the codebase only as empty, unwired Sprint-1 scaffolds
(an `index.js` exporting nothing and a boilerplate README) — no route,
component, or import ever references them.

### 4.3 Lazy Loading and Route-Level Code Splitting

Every route entry in `routes/` is a `React.lazy()`-wrapped import of its
`pages/` component, split by **application boundary first, then by
feature module** — the customer website's bundle never includes Partner
Dashboard or Admin Panel code, and within the customer website, a visit
to `/hotels/:slug` does not download the Car Rentals module's components.
This is what makes Chapter 2.1's one-codebase decision viable without a
bundle-size penalty. Each lazy boundary renders the route-level Skeleton
(Chapter 28) as its `Suspense` fallback, never a bare spinner, keeping
perceived-performance consistent with `UI_UX_GUIDELINES.md` §9.12.

### 4.4 Protected Routes: Role, Permission, and Ownership Guards

Three distinct, composable guard types (fully specified in Chapter 12),
applied at the route level:

- **`RequireAuth`** — redirects to `/auth/login` (preserving the intended
  destination for post-login redirect) if no valid session exists.
- **`RequireRole`** — checks the authenticated user's roles (from
  `GET /auth/me`, `API_SPECIFICATION.md` §27) against an allowlist;
  renders `/403` if unmet.
- **`RequirePermission`** — checks a specific permission key
  (`API_SPECIFICATION.md` Appendix B) rather than a role name directly,
  matching the backend's own permission-based enforcement
  (`DATABASE_ARCHITECTURE.md` §9) — a route never hardcodes "is this user
  a partner_manager," it asks "does this user have `listing.update`."
- **Ownership checks** are **not** a route-level guard — ownership
  (`API_SPECIFICATION.md` §5's "Owner or `{permission}`" pattern) can only
  be resolved once the specific resource ID is loaded, so it is enforced
  at the **data-fetching layer** (Chapter 14): a query for
  `/partner/listings/:id` that returns `403 FORBIDDEN` (the resource
  belongs to a different partner) renders the 403 route from within the
  page, not from the router.

### 4.5 404, 403, and 500 Handling

- **404** — rendered by React Router's route-not-found fallback *and*
  explicitly by any data-fetching hook that receives `NOT_FOUND` (Appendix
  A of `API_SPECIFICATION.md`) from the API — both paths render the same
  `NotFoundPage` component (Chapter 27).
- **403** — rendered whenever a `RequireRole`/`RequirePermission` guard
  fails, or whenever a query resolves a `FORBIDDEN` API error — same
  `ForbiddenPage` component regardless of trigger.
- **500** — rendered by the nearest `ErrorBoundary` (Chapter 27) catching
  an unhandled render error, or by a query resolving `INTERNAL_ERROR`;
  distinct from 403/404 in that it always offers a "reload" action and
  logs to the monitoring pipeline (Chapter 36) with full context.

### 4.6 Scroll Restoration and Page Transitions

- Scroll position is restored on browser back/forward navigation
  (React Router's built-in scroll restoration, configured to key on the
  full path including query string for paginated/filtered views) and
  reset to top on any *forward* navigation to a new route.
- Page transitions use the Framer Motion pattern specified in
  `UI_UX_GUIDELINES.md` §10.2 (250ms fade + 8px shift crossfade) applied at
  the route-outlet level, respecting `prefers-reduced-motion`
  (Chapter 31) automatically.


## 5. Layout Architecture

Every layout is chrome only — header, footer, sidebar, breadcrumb, and a
content outlet (`<Outlet />`) — never business logic. Each maps directly
onto the navigation patterns already defined in `UI_UX_GUIDELINES.md` §9.3.

### 5.1 PublicLayout

- **Header:** transparent over hero imagery on the homepage, transitions
  to solid + elevation on scroll (`UI_UX_GUIDELINES.md` §9.3), containing
  logo, primary nav, language switcher, currency switcher, auth/profile
  entry point.
- **Sticky search:** on listing/search pages, the search bar (Chapter 19)
  becomes a compact sticky pill in the header on scroll past the
  hero-embedded full search bar, per `UI_UX_GUIDELINES.md` §9.2.
- **Footer:** full, per `UI_UX_GUIDELINES.md` §9.3 — company/explore/
  partners/support/legal columns.
- **Mobile navigation:** header collapses to a hamburger-triggered
  full-screen drawer (Chapter 30's focus-trap rules apply).
- **Page container:** `Content` container width (1200px max,
  `UI_UX_GUIDELINES.md` §5.2), full-bleed exception for hero/gallery
  sections.

### 5.2 AuthLayout

- Minimal chrome: logo only, no primary nav, no footer column clutter —
  a single centered `Narrow` container (720px max) so the login/register
  form is the only focal point, consistent with the checkout-adjacent
  principle of removing distraction near a conversion-critical form.

### 5.3 CustomerAccountLayout

- **Sidebar:** persistent left sidebar (desktop) — Bookings, Favorites,
  Reviews, Wallet, Messages, Notifications, Profile — collapsing to a
  bottom tab bar or a top horizontal scroller on mobile
  (`UI_UX_GUIDELINES.md` §9.3's sidebar pattern, consumer-scale variant).
- **Header:** condensed version of `PublicLayout`'s header (no full
  search bar — a simple "Back to site" link plus profile menu).
- **Breadcrumbs:** shown on detail sub-pages (`Account / Bookings /
  BKG-1234`), omitted on top-level sidebar destinations.

### 5.4 PartnerLayout

- **Sidebar:** the dashboard sidebar pattern from `UI_UX_GUIDELINES.md`
  §9.3 — 260px expanded / 72px icon-only collapsed, persisted per-user via
  a client-state preference (Chapter 13), grouped by function (Overview,
  Listings, Bookings, Finance, Settings).
- **Organization switcher:** if a partner-employee account has access to
  more than one organization (rare, but supported per
  `API_SPECIFICATION.md` §31/32), a switcher sits above the sidebar's main
  nav — selecting one updates the client-state `partner_scope` (Chapter
  13) and every subsequent query in this session.
- **Wide container:** 1440px max, per `UI_UX_GUIDELINES.md` §5.2.
- **Breadcrumbs:** always shown, since dashboard depth is typically 2–3
  levels (`Partner / Listings / Hotel Yerevan Grand / Room Types`).

### 5.5 AdminLayout

- Structurally identical to `PartnerLayout` (same sidebar mechanics,
  same Wide container) but with an admin-scoped nav group set
  (Users, Partners, Moderation, Reports, Settings, Audit Logs) and a
  persistent, high-visibility **impersonation banner** whenever an admin
  session is impersonating a user (`API_SPECIFICATION.md` §68) — a fixed,
  high-contrast (Warning/Orange) bar reading "Viewing as {user}" with a
  one-click exit, present on every page of an impersonation session and
  never dismissible, so an admin can never lose track of being in that
  mode.

### 5.6 CheckoutLayout

- The most deliberately restrictive layout: **no primary nav, no
  footer, no sidebar** — logo (non-clickable during an active hold,
  Chapter 21) plus a slim step indicator (Guest Details → Payment →
  Confirmation) and, persistently, the reservation hold countdown
  (Chapter 21). Every design choice here exists to minimize the chance of
  a customer navigating away and losing an active hold.

### 5.7 ErrorLayout

- Minimal chrome (logo + a link home), used by the 403/404/500 pages —
  deliberately lightweight so an error page never depends on the
  same data-fetching that may have just failed.

### 5.8 Responsive Behavior (All Layouts)

Every layout follows the breakpoint contract from `UI_UX_GUIDELINES.md`
§5.3 exactly (Mobile <480, Mobile Large 480–767, Tablet 768–1023, Laptop
1024–1439, Desktop ≥1440) — a layout component never invents its own
breakpoint; it consumes the shared SCSS breakpoint tokens (Chapter 9).

## 6. Feature Module Architecture

### 6.1 The 23 Modules

> ⚠️ **NOT IMPLEMENTED AS DESCRIBED** — `properties`, `hotels`,
> `vacation-houses`, `restaurants`, `spa`, `car-rentals`, `tours`, and
> `events` exist only as empty Sprint-1 scaffolds (see §4.2A); every
> real vertical's frontend logic lives in the generic `listings`
> module instead. The remaining modules listed here (`auth`, `home`,
> `search`, `favorites`, `reviews`, `availability`, `booking-holds`,
> `bookings`, `payments`, `notifications`, `profile`, `partner`,
> `admin`, `cms`) are real and accurately described below.

`auth` · `home` · `search` · `listings` · `properties` · `hotels` ·
`vacation-houses` · `restaurants` · `spa` · `car-rentals` · `tours` ·
`events` · `favorites` · `reviews` · `availability` · `booking-holds` ·
`bookings` · `payments` · `notifications` · `profile` · `partner` ·
`admin` · `cms`

Each maps to one or more `API_SPECIFICATION.md` modules (Part II) and,
where applicable, one `BOOKING_ENGINE_ARCHITECTURE.md` concern — the
mapping is intentionally 1:1 wherever possible so a frontend engineer
implementing a feature and a backend engineer implementing its endpoint
are always talking about the same named thing.

### 6.2 Internal Module Shape

Every module directory (Chapter 3.2) contains its own `components/`,
`hooks/`, `queries/`, `mutations/`, `schemas/`, `utils/`, `constants/`, and
a single `index.js` — the module's **public export surface**. Anything not
re-exported from `index.js` is that module's private implementation
detail.

### 6.3 Cross-Module Dependency Rules

- A module may import another module's **public exports only**
  (`import { BookingStatusBadge } from 'modules/bookings'`), never reach
  into `modules/bookings/components/internal/...` directly.
- Dependencies flow **downstream along the booking funnel**, matching
  `BOOKING_ENGINE_ARCHITECTURE.md` §2's stage order: `search` may depend
  on `listings`; `listings` may depend on `availability` and `reviews`;
  `availability` may depend on `pricing`-adjacent display (via
  `booking-holds`); `booking-holds` may depend on `availability` and
  `pricing`; `bookings` may depend on `booking-holds`, `payments`, and
  `notifications`. The reverse is always forbidden — `availability` must
  never import from `bookings`, since availability is a concern that
  exists independently of any specific booking's later lifecycle.
- Module-specific listing types (`hotels`, `vacation-houses`,
  `restaurants`, `spa`, `car-rentals`, `tours`, `events`) each depend on
  `listings` (the shared parent, mirroring `API_SPECIFICATION.md` §38's
  "parent resource every module extends") and on `availability` /
  `booking-holds` for their booking widgets, but never on each other —
  `hotels` has no reason to import anything from `tours`.
- `partner` and `admin` are **composition modules**: they depend on
  nearly every other module (a partner needs to manage listings,
  bookings, pricing, coupons, payouts) but no other module ever depends on
  `partner` or `admin` — this one-directional rule keeps the
  customer-facing bundle (Chapter 4.3) free of any dashboard-only code.
- `auth`, `notifications`, and `profile` are **foundational modules**
  every other module may depend on, but which depend on nothing but
  shared `contexts/`, `ui/`, and `components/`.

### 6.4 Module Ownership

Each module has exactly one owning feature team, listed at module
creation time in this document's companion project-tracking system (not
duplicated here to avoid this document going stale as team assignments
change) — but the **rule** is fixed permanently: one module, one clear
owner, reviewed by the platform/infrastructure sub-team whenever a change
touches the module's `index.js` public surface (since that is the
contract every other module relies on).

## 7. Shared Component Architecture

`components/` holds composite, domain-aware-but-not-domain-owned pieces
used by three or more modules — the layer between raw `ui/` primitives
(Chapter 8) and module-owned business components. Representative
inhabitants:

- `ListingCard` — the shared card template `UI_UX_GUIDELINES.md` §9.6
  describes (one structure, module-specific metadata slots) — used by
  `search`, `favorites`, `listings`, and every module-specific listing
  type's "similar listings" rail.
- `PriceBreakdown` — renders the itemized pipeline output from
  `API_SPECIFICATION.md` §51 (`GET /pricing/quote`) — used by
  `booking-holds`, `bookings`, and `payments`.
- `BookingStatusBadge` — a single component mapping every status in
  `BOOKING_ENGINE_ARCHITECTURE.md` §3.1 to its exact badge color per
  `UI_UX_GUIDELINES.md` §9.5 — the **only** place in the codebase that
  performs this mapping, so a color is never hand-picked per usage.
- `ReviewCard`, `MediaGallery`, `MapPreview`, `RatingStars` — shared
  across every listing-type module.

**Rule:** if a component is used by exactly one module, it lives inside
that module, not here — promotion to `components/` happens only once a
second module genuinely needs it, preventing premature, over-general
abstractions.

## 8. Design System Integration

`ui/` is the direct, disciplined implementation of `UI_UX_GUIDELINES.md`
Section 9's component catalog — every primitive named there
(Button, Input, Select, Dropdown, Calendar, Search, Modal, Drawer,
Tooltip, Toast, Table, Badge, Tag, Gallery, Carousel) has exactly one
implementation in `ui/`, imported everywhere it is needed. A component is
never re-implemented locally inside a module "just for this one screen" —
if an existing `ui/` primitive doesn't fit, the primitive is extended
(new variant/prop), never duplicated.

- Every `ui/` component's variants and sizes are enumerated in
  `constants/` (e.g., `BUTTON_VARIANTS = ['primary', 'secondary', 'ghost',
  'destructive']`, matching `UI_UX_GUIDELINES.md` §9.1 exactly) and
  validated via PropTypes/JSDoc typing against that enum — an unlisted
  variant string is a build-time-caught error, not a silent visual bug.
- `ui/` components consume design tokens (Chapter 9) exclusively — no
  hardcoded color, spacing, or radius value is permitted inside a `ui/`
  component's styles; this is what lets `UI_UX_GUIDELINES.md`'s token
  values change once and propagate everywhere.
- Full catalog treatment (controlled/uncontrolled rules, accessibility
  requirements, variant strategy) is given in the Design System chapters
  the brief calls out explicitly — see the dedicated component-by-
  component rules below.

### 8.1 Component Categories

| Category | Members |
|---|---|
| **Primitives** | Button, Input, Select, Checkbox, Radio, Switch, Badge, Tag, Tooltip |
| **Form controls** | Input, Select, Checkbox, Radio, Switch, DatePicker, TimePicker, SearchBar |
| **Navigation** | Header nav, Sidebar, Tabs, Breadcrumbs, Pagination |
| **Feedback** | Toast, Skeleton, EmptyState, Badge (status) |
| **Overlays** | Modal, Drawer, Tooltip |
| **Data display** | Table, Accordion, Rating, PriceBreakdown |
| **Listing components** | Card (Property/Destination/Car/Restaurant/Tour), Gallery, Map |
| **Booking components** | Calendar, PriceBreakdown, ReservationHoldCountdown, BookingStatusBadge |
| **Dashboard components** | Table, Charts (per `UI_UX_GUIDELINES.md` §9.9), Sidebar nav |

### 8.2 Controlled vs. Uncontrolled Components

**Rule: every `ui/` form control is controlled by default** (`value` +
`onChange` props required, no internal uncontrolled state for the actual
field value) — this is what allows React Hook Form (Chapter 15) to
integrate via its `Controller` wrapper uniformly across every control,
and what allows a parent to always know and validate current form state.
The **one exception** is a small set of purely presentational,
non-form primitives with genuinely local-only UI state that no parent
ever needs to read or drive — a `Tooltip`'s open/closed hover state, an
`Accordion` panel's expanded/collapsed state (unless the parent
explicitly needs to control it, in which case an optional controlled mode
is supported side-by-side).

### 8.3 Accessibility Requirements (Component-Level)

Every `ui/` component ships accessible by construction, per
`UI_UX_GUIDELINES.md` §12 — full treatment in Chapter 30; the component-
level rule is simply that **accessibility is not a prop you opt into**: a
`Modal` always traps focus, a `Select` always supports keyboard
navigation, an `Input` always associates its label via `htmlFor`/`id`
without the consuming code needing to remember to wire it up.

### 8.4 Variant and Size Strategy

- **Variant** describes visual/semantic intent (`primary`/`secondary`/
  `ghost`/`destructive` for Button; `success`/`warning`/`danger`/`neutral`
  for Badge) — a fixed, closed enum per component, never a free-form
  string or a raw color prop.
- **Size** is a shared, cross-component scale (`sm`/`md`/`lg`) applied
  consistently — a `sm` Button and a `sm` Input share the same 8px-grid
  height logic (`UI_UX_GUIDELINES.md` §5.1), so mixing sizes across
  adjacent controls in a form never looks accidentally misaligned.
- Neither variant nor size accepts an arbitrary override prop
  (no `style={{ color: '#...' }}` escape hatches) — a genuinely new visual
  need is a new variant added to the shared enum and the component's
  SCSS (Chapter 9), reviewed as a design-system change, never a one-off
  inline style.

## 9. SCSS Architecture

### 9.1 The Decision: SCSS Modules + a Light BEM Convention Within Each

**No Bootstrap, Material UI, or Tailwind — SCSS only**, per the brief.
Within that constraint, the remaining choice is *how* class names are
scoped and named. **Decision: SCSS Modules (`.module.scss`, one per
component, auto-scoped class names) as the scoping mechanism, with a
lightweight BEM-inspired naming convention *within* each module file for
readability** — not global utility classes, and not "pure," unscoped BEM
across the whole app.

**Why not global utility classes (a hand-rolled Tailwind-alike)?** The
brief already excludes Tailwind itself, and a hand-rolled equivalent
reintroduces the exact problem utility frameworks are excluded to avoid:
styling logic scattered as class-string soup in JSX rather than
co-located, reviewable SCSS per component.

**Why not pure global BEM with no module scoping?** Global BEM
(`.PriceBreakdown__row--highlighted`) works, but at this platform's
scale (dozens of shared components across four applications) it depends
entirely on developer discipline to avoid collisions — a single typo'd
class name silently leaks styles across unrelated components with no
build-time signal. SCSS Modules make that class of bug structurally
impossible (the build tool hashes/scopes every class name automatically),
while still letting engineers use BEM-style naming *inside* a module
purely for human readability, with none of BEM's collision risk.

**Result:** `ui/Button/Button.module.scss` defines `.button`, `.button
.button__icon`, `.button--primary`, etc.; the build tool scopes every one
of those automatically. No component's styles can ever leak into or be
overridden by another's by accident.

### 9.2 Design Tokens

Every visual value from `UI_UX_GUIDELINES.md` Sections 3–6 is expressed
as an SCSS variable in `styles/tokens/`, one file per token category —
**never** a hand-typed hex code or pixel value inside a component's
`.module.scss` file:

- `_colors.scss` — every color from `UI_UX_GUIDELINES.md` §3 (Ink, Navy,
  Royal Blue, Gold, the Gray scale, status colors).
- `_typography.scss` — Manrope/Inter font stacks, the full type scale
  (§4.2), weights.
- `_spacing.scss` — the 4px/8px spacing scale (§5.1).
- `_breakpoints.scss` — the five breakpoints (§5.3), exposed as SCSS
  variables **and** as a `mixins/_respond.scss` mixin
  (`@include respond(tablet) { ... }`) so no component hand-writes a
  `@media` query with a raw pixel value.
- `_radius.scss` — the radius scale (§6.1).
- `_elevation.scss` — the shadow-level scale (§6.2), each level a
  reusable mixin.
- `_z-index.scss` — a single, centrally-managed z-index scale (header,
  sticky search, dropdown, modal backdrop, modal, toast, tooltip — each a
  named variable, never a raw number in a component file, preventing the
  classic "just use 9999" stacking-context bug).
- `_motion.scss` — animation duration/easing tokens matching
  `UI_UX_GUIDELINES.md` §10.1 exactly (150–250ms micro-interactions,
  300–400ms transitions).

### 9.3 Functions and Mixins

- A `rem()` function converts design-spec pixel values to `rem` at the
  point of use, keeping the entire system scalable with the user's root
  font-size preference (an accessibility requirement, Chapter 30).
- A `focus-ring()` mixin applies the platform's single, consistent focus
  style (`UI_UX_GUIDELINES.md` §9.2's 2px Royal Blue outline, 2px offset)
  — every focusable custom component includes this mixin rather than
  reimplementing focus styling, guaranteeing Chapter 30's keyboard-
  accessibility requirement is met by construction.
- A `truncate-lines($n)` mixin standardizes the multi-line text
  truncation used by Review Cards, listing descriptions, etc.
  (`UI_UX_GUIDELINES.md` §9.6).

### 9.4 Reduced Motion

A single global rule in `styles/base/_motion.scss`, wrapped in a
`@media (prefers-reduced-motion: reduce)` block, zeroes out the motion
tokens from §9.2 platform-wide — combined with the equivalent JavaScript-
level check in the Animation Architecture (Chapter 31), motion is disabled
consistently whether it's driven by SCSS transitions or Framer Motion.

### 9.5 Theme Readiness

Every color token (§9.2) is defined as a CSS custom property
(`--color-navy: #0F2A4A`) set at the SCSS-variable-to-custom-property
bridge layer, not hardcoded directly into component rules — this costs
nothing today (there is one theme) but means a future dark-mode or
white-label theme is a matter of swapping the custom-property values at
a root scope, never a rewrite of component SCSS.


## 10. API Client Architecture

### 10.1 Axios Instance

One Axios instance, created in `api/client.js`, used by every `api/*.js`
endpoint file — no module ever creates its own Axios instance or calls
`axios` directly.

- **Base URL:** `{ENV_API_BASE_URL}/api/v1` (Chapter 37) — the `/api/v1`
  prefix is applied once, here, matching `API_SPECIFICATION.md` §3
  exactly; no individual endpoint file repeats it.
- **Default headers:** `Content-Type: application/json`,
  `Accept-Language` (Chapter 10.4), and a request-scoped `X-Client`
  header identifying which of the four applications issued the call
  (useful server-side for analytics and, if ever needed, differentiated
  rate-limit tiers).

### 10.2 Authorization Header and Access Token Handling

- A request interceptor attaches `Authorization: Bearer {access_token}`
  to every outgoing request **except** those explicitly flagged public
  (matching `API_SPECIFICATION.md` §5's public-endpoint declarations —
  the `api/*.js` file for each module marks each call's auth requirement
  directly, mirroring Part II's per-endpoint "Auth Required" column).
- The access token itself is held in memory only (Chapter 34's full
  security rationale) — the interceptor reads it from a module-level
  variable maintained by the Authentication Architecture (Chapter 11),
  never from `localStorage`.

### 10.3 Refresh Token Rotation and Concurrent Refresh Protection

- A response interceptor watches for `401 UNAUTHENTICATED`
  (`API_SPECIFICATION.md` Appendix A). On the **first** 401 encountered,
  it triggers `POST /auth/refresh` (§27) and holds the original failed
  request.
- **Concurrent refresh protection:** if multiple requests fail with 401
  in the same short window (common when several components mount and
  fetch simultaneously right as a token expires), only the **first**
  triggers the refresh call; every subsequent 401 during that in-flight
  refresh subscribes to its result (a shared in-flight promise) rather
  than firing a second, redundant refresh request — preventing the
  refresh-token-rotation single-use rule (`API_SPECIFICATION.md` §7) from
  invalidating itself via a race between two near-simultaneous refresh
  calls.
- On successful refresh, the new access token is stored (Chapter 11) and
  every held request is retried once, transparently, with no user-visible
  interruption. On refresh failure (`INVALID_REFRESH_TOKEN` or
  `AUTH_TOKEN_REUSE_DETECTED`), every held request is rejected, the
  in-memory session is cleared, and the user is redirected to
  `/auth/login` with the current path preserved for post-login return.
- A request is retried **at most once** after a refresh — a request that
  fails with 401 again immediately after a successful refresh is treated
  as a genuine auth failure, not looped indefinitely.

### 10.4 Locale, Currency, and Timezone Headers

- `Accept-Language` is set from the current URL locale segment (Chapter
  4.1), kept in sync by the i18n provider (Chapter 16) — never
  independently chosen by an individual request.
- Display currency (`API_SPECIFICATION.md` §15) is sent as a
  `?display_currency=` query parameter, appended by the Axios instance's
  request interceptor from the Currency Context (Chapter 13) rather than
  passed manually by every call site.
- No client-supplied timezone header is sent — per
  `API_SPECIFICATION.md` §16, every timestamp exchanged is UTC; any
  timezone conversion for display is a pure frontend formatting concern
  (Chapter 18), not something the API needs to be told.

### 10.5 Idempotency-Key Generation

- For every mutation the API requires an `Idempotency-Key` for
  (`API_SPECIFICATION.md` §22 — booking holds, hold confirmation,
  payments, refunds, payouts), the **mutation hook** (Chapter 14, not the
  raw Axios call) generates a UUID **once**, at the point the user
  initiates the action, and holds it in that mutation's local state for
  the lifetime of that logical attempt — including any automatic retries
  (§10.6) — so a network-level retry of the same logical action reuses
  the same key, while a genuinely new user action (clicking "Confirm
  Booking" again after an earlier attempt was explicitly cancelled)
  generates a fresh one.

### 10.6 Request Retry Rules

- **Idempotent GETs:** retried automatically by React Query's own retry
  logic (Chapter 14), not the Axios layer.
- **Idempotent, idempotency-keyed mutations** (Section 10.5): retried
  automatically up to a small bounded count on network-level failure
  (timeout, connection drop) only — never on a 4xx response, which
  indicates the request was received and rejected for a reason a retry
  cannot fix.
- **Non-idempotent-by-nature actions** without an idempotency key are
  never automatically retried by the client — a failed request surfaces
  its error (Chapter 27) and lets the user explicitly retry.

### 10.7 Request Cancellation

Every `useQuery`/`useMutation` call (Chapter 14) passes React Query's
`AbortSignal` straight through to the Axios call's `signal` option — a
component that unmounts mid-request (a customer navigating away from a
search results page before it finishes loading) cancels the in-flight
request rather than letting it complete and update unmounted state, and
rapid successive requests to the same query (e.g., fast typing in a
search box) cancel their predecessor automatically.

### 10.8 API Error Normalization

Every response — success or failure — passes through a single response
interceptor that normalizes the `API_SPECIFICATION.md` §9 error envelope
into a consistent JavaScript `ApiError` shape (`code`, `message`,
`details`, `requestId`, plus the original HTTP status), thrown as a
rejected promise. No component or hook ever inspects a raw Axios error
object or a raw HTTP status code directly — every catch block downstream
deals with one normalized shape, matching one of the Appendix A codes
(Chapter 27 defines how each is displayed).

### 10.9 Request ID Logging

Every normalized `ApiError` carries the `request_id` from
`API_SPECIFICATION.md` §9; the global error handler (Chapter 27) attaches
it to every user-facing error toast/message ("Reference: req_9f3c2a1b")
and to every entry sent to the monitoring pipeline (Chapter 36), so a
support ticket referencing a displayed error can always be traced to the
exact backend log line.

### 10.10 File Upload Intent Flow

Implemented exactly as `API_SPECIFICATION.md` §19 specifies, orchestrated
by a `services/mediaUploadService.js` (Chapter 3), never inlined into a
component: (1) call `POST /media/upload-intent`, (2) `PUT` the raw file
directly to the returned pre-signed URL (a **separate**, unauthenticated
Axios call outside the main instance, since it targets object storage,
not the API), (3) call `POST /media` to confirm. Upload progress is
surfaced via Axios's `onUploadProgress` on step 2 for a progress-bar UI
(Chapter 24).

### 10.11 Webhooks Are Backend-Only

The browser **never** registers, receives, or processes a webhook.
Everything in `API_SPECIFICATION.md` §23 (inbound gateway webhooks,
outbound partner webhooks) is a server-to-server concern exclusively. Any
frontend need for "live" updates (e.g., a payment status changing after
an async gateway confirmation) is served by **polling** the relevant
resource via React Query's background refetching (Chapter 14) or, if
genuinely real-time UX is required in a future iteration, a
platform-hosted WebSocket/SSE channel the frontend subscribes to — never
a webhook endpoint exposed to or consumed by client-side JavaScript.

### 10.12 Secrets

No API key, gateway secret, or signing secret is ever present in
frontend source, build output, or environment variables bundled into the
client (Chapter 34 and Chapter 37 both restate this as a hard rule) — the
frontend authenticates purely via the JWT flow (Chapter 11); anything
requiring a shared secret (webhook signing, server-to-server gateway
calls) is, by definition, backend-only per §10.11.

## 11. Authentication Architecture

### 11.1 Session Bootstrapping

On application load, `app/` (Chapter 3) attempts a silent session
restore: if an in-memory access token does not exist (always true on a
fresh page load, since access tokens are never persisted — Chapter 34),
it attempts `POST /auth/refresh` using... nothing, by default, **unless**
a refresh mechanism is available (Chapter 34.1 details the exact,
security-driven decision on how the refresh token itself is delivered to
the browser and what that means for this bootstrap step). If bootstrap
succeeds, `GET /auth/me` (§27) hydrates `AuthContext`
(Chapter 13) with the user, roles, and permissions; if it fails, the app
renders in its fully logged-out state — no route requiring
`RequireAuth` (Chapter 12) is reachable until this resolves.

### 11.2 AuthContext Shape

`AuthContext` (Chapter 13) exposes: `user`, `roles`, `permissions`,
`partnerScope` (if applicable), `isAuthenticated`, `isBootstrapping`
(true only during the initial silent-restore attempt, so route guards can
distinguish "not logged in" from "still checking"), `login()`,
`logout()`, `logoutAll()` — thin wrappers over the corresponding
`auth` module mutations (Chapter 6).

### 11.3 Login / Logout Flow

- `login()` calls `POST /auth/login` (§27), stores the returned access
  token in memory, stores/initiates refresh-token handling per Chapter
  34.1's decision, populates `AuthContext`, and redirects to the
  originally-intended route (captured by `RequireAuth`, Chapter 12) or
  the default post-login destination for that role.
- `logout()` calls `POST /auth/logout`, clears the in-memory access
  token and `AuthContext` state, clears any client-persisted non-token
  state that should not survive a session boundary (Chapter 13's
  per-item survives-refresh table), and redirects to the public
  homepage.

### 11.4 Cross-Tab Session Sync

A `BroadcastChannel` (or `storage` event listener, as a fallback for
older environments) synchronizes logout across browser tabs: logging out
in one tab immediately clears `AuthContext` and redirects in every other
open tab of the same browser, preventing a stale "still logged in" tab
from issuing requests with a session the user believes has ended.

## 12. Authorization and Route Guards

Three composable guard components, all reading exclusively from
`AuthContext` (Chapter 11) — never making their own API calls:

- **`<RequireAuth>`** — renders its children if `isAuthenticated`;
  otherwise redirects to `/auth/login?redirect={currentPath}`. Renders
  nothing (or a full-page loading state) while `isBootstrapping` is true,
  never briefly flashing a logged-out redirect during the silent-restore
  check.
- **`<RequireRole roles={[...]}>`** — renders children if the user's
  resolved roles intersect the allowlist; otherwise renders `/403`.
- **`<RequirePermission permission="listing.update">`** — the preferred,
  more granular guard, checked against `AuthContext.permissions`
  (resolved server-side at login and re-verified — never solely
  trusted — by the API itself on every request per
  `API_SPECIFICATION.md` §5; the frontend guard is a UX convenience that
  hides unreachable UI, not a security boundary).
- **Ownership** is never a route guard (Chapter 4.4) — it is enforced by
  the data-fetching layer surfacing a `FORBIDDEN` error from the API,
  rendered as `/403` from within the page.

**Guards are UX, not security.** Every one of these three guard types
exists to give the user a clean experience (never showing a button they
can't use, never letting them sit on a page they can't access) — the
actual authorization boundary is enforced server-side on every request,
per `API_SPECIFICATION.md` §5, and the frontend never assumes otherwise.

## 13. State Management Strategy

### 13.1 The Five Kinds of State

| Kind | Owner | Examples |
|---|---|---|
| **Server state** | TanStack React Query | Listings, bookings, availability, pricing quotes, notifications, favorites, payments |
| **Global client state** | React Context | Authenticated user session, locale, currency, theme, toast queue, reservation hold countdown ticker |
| **Local component state** | `useState`/`useReducer` | Modal open/closed, hover state, accordion expansion, form step index |
| **URL state** | React Router search params | Search filters, sort, pagination cursor, selected dates on a listing page |
| **Form state** | React Hook Form | Every form's field values, touched/dirty state, client-side validation errors |

### 13.2 Why Not Redux

Redux earns its complexity when an application has large amounts of
client-owned state with complex, cross-cutting update logic. Here,
**the overwhelming majority of "state" is server state**, and React
Query already solves caching, invalidation, background refetching, and
loading/error state for it more precisely than a hand-rolled Redux store
would. What remains — auth session, locale, currency, theme, toasts — is
small, changes infrequently, and has no complex derived-state logic
between its pieces. A handful of small, focused Context providers
(§13.3) covers this completely without Redux's boilerplate or the risk of
server data accidentally being duplicated into a global store (Chapter
1's core state-boundary principle). If a genuine cross-cutting
client-state complexity emerges later (unlikely at this platform's
scope), it is reconsidered then — not introduced preemptively.

### 13.3 Where Each Named Item Lives

| Item | Owner | Rationale |
|---|---|---|
| Authenticated user, roles, permissions | `AuthContext` (Ch. 11) | Global, session-scoped, read by guards everywhere |
| Language | `LocaleContext` + URL segment (Ch. 4.1, 16) | Must be URL-visible for SEO; Context mirrors it for non-URL consumers (e.g., toast text) |
| Currency | `CurrencyContext` | Global display preference, not URL-relevant |
| Theme | `ThemeContext` | Global, rarely-changing preference (readiness per `UI_UX_GUIDELINES.md` §6.3) |
| Search filters | URL search params | Must be shareable/bookmarkable/back-button-able (Chapter 19) |
| Search history | `localStorage`-backed hook, read into local component state on the search page | Personal convenience data, not security-sensitive, fine to persist client-side |
| Favorites | React Query (server state) | It's a server resource (`API_SPECIFICATION.md` §53); no client-only favorites concept exists |
| Notifications | React Query (list) + a small `NotificationsContext` for the unread-count badge shown in every layout header | List content is server state; the always-visible badge count benefits from one shared subscription rather than every layout re-querying independently |
| Booking draft (pre-hold) | URL state (selected dates/guests on a listing page) + local component state (guest-count stepper, etc.) | Nothing is persisted server-side until a hold is created (Chapter 20) — there is no "draft booking" API resource to sync against |
| Reservation hold | React Query (the hold resource itself, fetched from `GET /booking-holds/{id}`) | It is server state with a server-owned `expires_at` — never reconstructed from client memory (Chapter 21) |
| Hold countdown (the ticking display) | Local component state (a `useEffect` interval) **computed from** the React-Query-cached hold's `expires_at` | The tick is a rendering concern; the truth (`expires_at`) is server state — Chapter 21 details this split precisely |
| Checkout progress (step index) | URL state (`/checkout/hold/:holdId`, `/checkout/payment/:holdId`) | Shareable/refreshable/back-button-safe by construction |
| Partner-selected organization | `PartnerContext` (a small context scoped to the Partner Dashboard route tree only) | Global within the Partner Dashboard session, irrelevant elsewhere — not hoisted to the app-wide `AuthContext` |
| Admin filters | URL state | Same rationale as search filters — an admin's filtered users/bookings view should be a link they can share with another admin |

### 13.4 What Survives a Full Page Refresh

Consistent with Chapter 34's security decisions: the access token does
**not** survive a refresh (re-acquired via the refresh flow, Chapter
10.3/11.1); `AuthContext` is rehydrated from that flow, not from any
persisted copy. Locale and currency preferences **do** survive (persisted
to `localStorage` as pure preferences, not secrets). URL state survives
by definition (it's in the URL). An active reservation hold **does**
survive a refresh functionally — because it lives on the server
(`reservation_holds`, `BOOKING_ENGINE_ARCHITECTURE.md` §5), a refreshed
`/checkout/hold/:holdId` page simply re-fetches the same hold and its
live remaining TTL; nothing about the hold itself was ever client-only
state to lose.

## 14. React Query Strategy

### 14.1 Query Key Factory

Every module's `queries/` defines its keys through one shared factory
pattern per resource, never ad hoc arrays, so invalidation (§14.4) can
target precisely the right cache entries:

```
listingKeys.all              → ['listings']
listingKeys.lists()          → ['listings', 'list']
listingKeys.list(filters)    → ['listings', 'list', { filters }]
listingKeys.detail(id)       → ['listings', 'detail', id]
searchKeys.results(params)   → ['search', 'results', { params }]
availabilityKeys.check(unitId, range)
                              → ['availability', unitId, { range }]
pricingKeys.quote(payload)   → ['pricing', 'quote', { payload }]
favoriteKeys.list()          → ['favorites', 'list']
bookingHoldKeys.detail(id)   → ['booking-holds', 'detail', id]
bookingKeys.list(filters)    → ['bookings', 'list', { filters }]
bookingKeys.detail(id)       → ['bookings', 'detail', id]
notificationKeys.list()      → ['notifications', 'list']
partnerListingKeys.list(partnerId, filters)
                              → ['partner', partnerId, 'listings', { filters }]
partnerBookingKeys.list(partnerId, filters)
                              → ['partner', partnerId, 'bookings', { filters }]
adminModerationKeys.queue(filters)
                              → ['admin', 'moderation', 'queue', { filters }]
```

- Naming convention: `{resource}Keys.{scope}(...)`, always an ordered
  array from most-general to most-specific, so `queryClient.invalidateQueries(listingKeys.all)`
  correctly invalidates every list and detail entry beneath it.

### 14.2 Cache Times and Stale Times (By Resource Class)

| Resource class | `staleTime` | `gcTime` (cache retention) | Rationale |
|---|---|---|---|
| Reference data (countries, regions, cities, permissions) | 24 hours | 7 days | Near-static (`API_SPECIFICATION.md` §35–37) |
| Listing detail, search results | 60 seconds | 5 minutes | Fresh enough for browsing; explicitly **not** trusted for booking decisions (§14.6) |
| **Availability** | **0 (always stale)** | 30 seconds | Never served from cache as authoritative (§14.6) |
| **Pricing quote** | **0 (always stale)** | 30 seconds | Same rationale — re-quoted on every relevant input change |
| **Reservation hold** | **0 (always stale)**, refetched on interval (Ch. 21) | 0 | The countdown depends on always reading the server's current `expires_at` |
| Bookings (list/detail) | 30 seconds | 5 minutes | Status can change from partner/admin actions; short staleness keeps "My Trips" reasonably current without hammering the API |
| Notifications | 30 seconds, plus background polling (§14.4) | 5 minutes | Needs near-real-time unread-count freshness without a WebSocket |
| Favorites | 5 minutes | 10 minutes | Low-frequency-change resource |
| Partner/Admin dashboards | 60 seconds | 5 minutes | Balances dashboard freshness against query volume |

### 14.3 Retry Rules

- **Queries:** retry twice with exponential backoff on network-level
  failure or `5xx`; **never** retry on `4xx` (a 404/403/422 is not
  transient — retrying it wastes a round-trip and delays the correct
  error state from displaying).
- **Mutations:** no automatic React-Query-level retry by default (the
  Axios-layer idempotency-aware retry, §10.6, handles the narrow
  network-failure case) — a failed mutation always surfaces to the user
  explicitly rather than silently retrying a state-changing action.

### 14.4 Prefetching, Pagination, Infinite Queries, Background Refetching

- **Prefetching:** search-result list items prefetch their own
  `listing.detail` query on hover/focus (desktop) so a click-through to
  the detail page renders instantly from cache; the Partner Dashboard
  prefetches the next paginated page of bookings once the current page
  is idle-rendered.
- **Pagination:** every list endpoint (`API_SPECIFICATION.md` §11's
  cursor pagination) is consumed via `useInfiniteQuery` for
  continuous-scroll contexts (public search results, the notification
  feed) and via a paged `useQuery` + explicit "Next" control for
  dashboard tables (Partner/Admin), matching the UI pattern each context
  calls for.
- **Background refetching:** enabled (`refetchOnWindowFocus: true`) for
  Bookings and Notifications specifically — a user tabbing back to the
  app after a few minutes sees an up-to-date booking status or unread
  count without a manual refresh; disabled for reference data and search
  results, where it would be wasted traffic.

### 14.5 Mutation Invalidation, Optimistic Updates, and Rollback

- **Standard rule:** every mutation's `onSuccess` invalidates the exact
  query keys (§14.1) its action affects — e.g., `POST /bookings/{id}/cancel`
  invalidates `bookingKeys.detail(id)` and `bookingKeys.lists()`, and
  (per Chapter 6.3's dependency direction) the `availability` module's
  relevant keys, since a cancellation frees inventory.
- **Optimistic updates** are used **only** for low-stakes, easily
  reversible actions where instant feedback matters more than perfect
  consistency — Favorites (toggle heart icon instantly, roll back on
  error) and marking a Notification read. They are **never** used for
  anything touching availability, holds, bookings, or payments — those
  always wait for the server's authoritative response before updating any
  displayed state (§14.6).
- **Rollback:** every optimistic mutation captures the previous cache
  value in `onMutate` and restores it in `onError`, paired with a toast
  (Chapter 26) explaining the reverted action.

### 14.6 Availability and Holds Are Never Served Stale as Authoritative

This is restated here as its own rule because it is the single most
important React Query policy on the platform: **`staleTime: 0`** is set
explicitly (not just left at a short default) on every availability and
pricing-quote query, and reservation hold data is **always refetched**
(never read from cache alone) at the two moments that matter —
immediately before creating a hold (a fresh `GET /availability` call,
`API_SPECIFICATION.md` §49) and on every tick of the countdown UI
re-confirming the hold hasn't been invalidated server-side (Chapter 21).
A cached "available" response is treated by the entire codebase as
**advisory only**, exactly mirroring `BOOKING_ENGINE_ARCHITECTURE.md`
§4.5's own description of the search index — the frontend's cache is
just one more layer of the same advisory-only principle, never a
second source of truth.

### 14.7 Offline Behavior

React Query's default offline queuing is **disabled** for mutations
(`networkMode: 'always'` is overridden to fail fast rather than queue) —
a booking-critical action queued silently while offline and replayed
minutes later against since-changed availability is a correctness risk,
not a convenience; the platform instead shows a clear "you're offline"
state (Chapter 27) and requires the user to retry once connectivity
returns. Read queries use the default `online` network mode (paused while
offline, resumed automatically on reconnect).

## 15. Forms and Validation

### 15.1 React Hook Form as the Single Form Layer

Every form on the platform — login, listing creation, checkout guest
details, partner settings — is built with React Hook Form, using its
`Controller` wrapper to integrate the platform's controlled `ui/`
components (Chapter 8.2). No form is built with plain `useState`-per-field
wiring; this keeps validation, error display, and submission handling
uniform across all four applications.

### 15.2 Schema-Driven Validation Mirroring the API Exactly

Every form's validation schema (`schemas/xSchema.js`, Chapter 3) is
written to **mirror `API_SPECIFICATION.md` §10's validation rules for the
corresponding endpoint field-for-field** — the same required fields, the
same format constraints, the same numeric ranges. This is deliberate:
client-side validation exists purely to give the user faster feedback
(Layer 1 of `BOOKING_ENGINE_ARCHITECTURE.md` §11.1's three-layer
validation model) — it is never the authoritative check, and it must
never be looser *or* stricter than what the API will actually enforce, or
users hit a confusing "it looked valid but the server rejected it" (or
worse, an over-restrictive client check blocking a legitimately valid
submission).

### 15.3 Server-Side Error Mapping

On a `422 VALIDATION_FAILED` response (`API_SPECIFICATION.md` §9's
`details` array), the mutation's error handler maps each `details[].field`
entry directly onto the corresponding React Hook Form field via
`setError(field, { message })` — so a validation failure the client-side
schema didn't catch (a race condition, a business rule only the server
can evaluate, e.g. `EMAIL_ALREADY_EXISTS`) still surfaces as a normal,
inline field error, never only as a generic top-level toast.

### 15.4 Multi-Step Forms

The checkout flow (Chapter 20) and multi-step listing-creation forms use
one React Hook Form instance per step (not one giant form spanning all
steps) with step-transition data merged into a parent step-orchestrator's
local state — this keeps each step's validation scope narrow and
matches the URL-per-step routing decision in Chapter 4.2.


## 16. Internationalization

### 16.1 Translation Folder Structure

```
translations/
  hy/
    common.json
    auth.json
    listings.json
    bookings.json
    payments.json
    errors.json
    cms.json
    partner.json
    admin.json
  ru/
    (same namespace files)
  en/
    (same namespace files)
```

### 16.2 Namespaces

One namespace per feature module family, not one giant flat file —
`common` (shared UI strings: buttons, nav labels), plus one namespace per
module grouping matching Chapter 6's module list. i18next loads only the
namespaces the current route needs (§16.3), and this file-per-namespace
split is what makes that lazy-loading possible.

### 16.3 Lazy-Loaded Translation Files

Namespaces are fetched on demand via i18next's backend plugin, keyed off
the route being entered — visiting `/hy/partner/...` loads `common.json`
and `partner.json` for Armenian, never `admin.json` or another locale's
files. This mirrors the route-based code-splitting principle from
Chapter 4.3 applied to translation payload size.

### 16.4 Fallback Behavior

If a key is missing in the requested locale, i18next falls back to the
platform default locale (Armenian) for that key only — never to a raw
key name displayed to the user, and never to a blank string. This
mirrors the exact fallback behavior `API_SPECIFICATION.md` §15 specifies
for server-rendered translated content, so the client and server behave
identically when a translation is incomplete.

### 16.5 Pluralization and Never Concatenating Sentences

- Pluralization uses i18next's built-in plural-form key suffixes
  (`_one`, `_other`, and Armenian/Russian-specific plural categories
  where they differ from English's two-form system) — a count is always
  interpolated into a single, complete translated string
  (`t('bookings.count', { count })`), never built by concatenating a
  translated word with a hardcoded "(s)" suffix.
- **Never concatenate translated sentence fragments.** A message like
  "Your booking at {listingName} is confirmed" is one translation key
  with an interpolation placeholder, authored as a complete sentence per
  locale — never `t('your_booking_at') + listingName + t('is_confirmed')`,
  which breaks word order and grammar in Armenian and Russian even when
  it reads fine in English.
- **Never hardcode a user-facing string** anywhere in `pages/`,
  `modules/`, or `components/` — a lint rule (Chapter 39) flags any
  literal string inside JSX text content that isn't wrapped in `t()`, a
  translated constant, or explicitly marked as non-user-facing (a test
  ID, a CSS class name).

### 16.6 Locale Switching Behavior

Switching locale (the language switcher in every layout's header)
performs, in order: (1) update `i18next`'s active language, (2) rewrite
the URL's leading locale segment in place (Chapter 4.1), preserving the
rest of the path and query string, (3) update `LocaleContext` and the
`Accept-Language` header used by all subsequent API calls (Chapter
10.4), (4) trigger React Query to refetch any currently-mounted query
whose response content is locale-dependent (listing detail, search
results, CMS pages) — reference-data queries with locale-independent
values (raw IDs, numeric prices before formatting) are not refetched.

### 16.7 Error-Message and API-Localized-Message Handling

API errors already arrive pre-localized in `message`
(`API_SPECIFICATION.md` §9 — the server resolves locale from
`Accept-Language`) — the frontend displays that string **as-is** for
generic error toasts, never re-translating it, and uses its own `error`
namespace translations only for frontend-originated messages (client-side
validation text, network-failure messaging the server never had a chance
to produce).

### 16.8 RTL Future-Readiness

None of the three current locales (Armenian, Russian, English) are RTL,
but every layout and `ui/` component uses CSS logical properties
(`margin-inline-start` rather than `margin-left`, etc.) throughout the
SCSS architecture (Chapter 9) from day one — this costs nothing today and
means a future RTL locale addition is a `dir="rtl"` attribute and a
handful of icon-mirroring rules, never a layout rewrite.

## 17. Currency and Locale Formatting

### 17.1 The Authoritative-vs-Display Split (Restated for the Frontend)

Per `API_SPECIFICATION.md` §15: the **transactional currency** (what is
actually charged) always travels with its amount as a `Money` object
(`{ amount, currency_id, currency_code }`, per the shared shape every
priced field uses) and is never converted client-side. The **display
currency** (`CurrencyContext`, Chapter 13) only affects a parallel,
clearly-secondary "≈ {converted amount}" rendering the frontend computes
using `exchange_rates`-derived rates **the API itself returns** (never a
rate the frontend hardcodes or fetches from a third party) — the
customer's final charge is always shown, unambiguously, in the
transactional currency first.

### 17.2 Number and Currency Formatting

All number/currency formatting goes through the native `Intl.NumberFormat`
API, configured per the active locale (Chapter 16) and the relevant
currency code — one shared `utils/currency.js` helper wraps this so no
component hand-formats a price string. This guarantees correct thousands
separators, decimal marks, and currency symbol placement per locale
convention (e.g., `1,234.56 ֏` vs. `1 234,56 ₽`) without the frontend
maintaining its own locale-formatting rules.

Every number is formatted through `createNumberFormatter`
(`packages/ui/src/utils/numberFormat.js`, exported as
`@desavii/ui/utils/numberFormat`) rather than `new Intl.NumberFormat`
directly — `formatMoney`, `PriceTag` and the dashboard tables all use it.
Some browsers (desktop Chrome among them) ship ICU without Armenian, and
`Intl` then silently formats `hy` with English separators (`37,000`). The
helper keeps `Intl` whenever it supports the locale; otherwise it rounds
with `Intl` and rebuilds the text from Unicode CLDR data (the
`cldr-numbers-full` package: Armenian symbols, grouping and patterns, so
`37 000,00 ֏`). Dates follow the same pattern via `createDateFormatter`.
Guest ratings too: `apps/web/src/utils/formatRating.js` writes the
average to one decimal in the page locale (`4.7`, `4,7`), and every
`RatingStars` receives `locale` plus a localized accessible name
(`ratingLabel`), so no English "out of 5 stars" reaches a `/hy/` or `/ru/`
page. Armenian's CLDR minimum grouping is two digits, so `9000 ֏` and
`13 000 ֏` are both correct; WebKit's own data groups four digits
(`9 000 ֏`), which is equally valid and not overridden.

### 17.3 Date and Number Formatting Consistency

The same `Intl`-based approach is used for all locale-sensitive date
display (`Intl.DateTimeFormat`, Chapter 18) — one shared formatting layer
for both numbers and dates keeps every module's price and date rendering
visually and grammatically consistent, rather than each module
implementing its own ad hoc formatting.

Dates and relative times never call `Intl` directly from a module. They
go through `@desavii/ui/utils/dateFormat` (`createDateFormatter`, plus
the `NUMERIC_DATE` / `NUMERIC_DATE_TIME` presets that replace
`toLocaleDateString` / `toLocaleString`) and
`@desavii/ui/utils/relativeTimeFormat` (`formatRelativeTime`). Desktop
Google Chrome (checked on 157) ships ICU without Armenian: a bare
`Intl` call on a `/hy/` page silently answers in the visitor's browser
language ("Nov 25, 2026", "25 нояб. 2026 г.", or "2026 M11 25" for an
Armenian-language browser). These utilities keep `Intl` wherever it has
the locale and fall back to `date-fns`'s maintained `hy` data otherwise.
A new option set needs a matching fallback pattern in `dateFormat.js`,
or it keeps the `Intl` fallback language. Node ships full ICU, so unit
tests only see the fallback when they mock `supportedLocalesOf`.

## 18. Date and Timezone Handling

### 18.1 The Frontend Never Invents a Timezone

Every timestamp received from the API is UTC (`API_SPECIFICATION.md`
§16). The frontend's only job is **display conversion**, never
authoritative interpretation:

- **Whole-day bookings** (Hotels, Vacation Houses, Apartments, Camping,
  Car Rentals' date range): the API already sends date-only strings
  (`"2026-08-15"`, no time/timezone ambiguity) — the frontend renders
  these directly via `Intl.DateTimeFormat`, with **no timezone
  conversion applied at all**, matching
  `BOOKING_ENGINE_ARCHITECTURE.md` §6.3's treatment of a booking night as
  a calendar-date concept.
- **Time-slot bookings** (Restaurants, SPA, Tours, Events): the API
  returns both the UTC instant and the listing's IANA timezone identifier
  (`API_SPECIFICATION.md` §16) — the frontend converts and displays using
  that listing's timezone specifically (via a small `date-fns-tz`-based
  utility), **never** the browser's local timezone, since a customer in
  Moscow booking a SPA slot in Yerevan needs to see the Yerevan-local
  time the slot actually occurs at, not their own local equivalent
  (which is shown only as a clearly-labeled secondary "in your local
  time" hint where useful, e.g. for a booking confirmation email
  reference).

### 18.2 DST-Safe Date Picker Behavior

The Calendar/DatePicker component (Chapter 23) never offers a
locally-invalid time slot for selection (a "spring forward" gap), matching
`BOOKING_ENGINE_ARCHITECTURE.md` §6.4's server-side rule exactly — this
is enforced by having the **API's own availability response** (§49)
be the source of which slots exist at all; the frontend calendar never
independently generates candidate time slots from a naive
add-30-minutes-repeatedly loop that could produce an invalid local time.

## 19. Search Architecture

### 19.1 Search Is URL State, Backed by the Dedicated Search Endpoint

Every search filter (destination/query text, dates, party size, price
range, category, amenities, sort) lives in the URL's query string
(Chapter 13.3) — never in a Context or component state alone — so a
search results page is always a shareable, bookmarkable, back-button-safe
link, and a page refresh reproduces the exact same results.

- The `search` module's `useSearchQuery` hook reads filters from
  `useSearchParams` (React Router), constructs the request to
  `GET /listings/search` (`API_SPECIFICATION.md` §14/§38) exactly, and
  exposes results via `useInfiniteQuery` (Chapter 14.4) for
  continuous-scroll result loading.
- Changing any filter control updates the URL (via `setSearchParams`,
  never local state first) — the URL update is what triggers the query
  re-fetch, keeping a single source of truth for "what is currently
  searched."

### 19.2 Search-as-You-Type and Debouncing

The free-text portion of the search bar debounces input (≈300ms) before
updating the URL/triggering a query, using the shared `useDebounce` hook
(Chapter 3's `hooks/`) — typeahead suggestions (`GET /cities/search`,
`API_SPECIFICATION.md` §37) are a **separate**, faster-debounced
(≈150ms) query shown in a dropdown, distinct from committing an actual
search.

### 19.3 Search Results Are Never Treated as Booking-Authoritative

Consistent with Chapter 14.6: a search result card's displayed
availability/price is explicitly the eventually-consistent search index
(`BOOKING_ENGINE_ARCHITECTURE.md` §16.3) — clicking through to a listing
detail page always triggers a fresh, authoritative `GET /availability`
call (§49) before any booking action becomes possible; the search
results themselves are never wired directly into the booking flow's
availability state.

## 20. Booking Flow Architecture

### 20.1 The Complete Flow, Stage by Stage

Mirroring `BOOKING_ENGINE_ARCHITECTURE.md` §2.1 exactly:

```
Search  →  Listing Detail  →  Availability Check  →  Pricing Quote
   →  Booking Hold Created  →  15-Minute Countdown  →  Guest Details
   →  Payment  →  Confirmation
```

| Stage | Frontend location | Data stored | Where |
|---|---|---|---|
| Search | `search` module, `/search` route | Filters | URL state |
| Listing Detail | `listings`/module-specific pages | Selected dates/slot, party size (not yet submitted anywhere) | Local component state |
| Availability Check | `availability` module, inline on the listing page | Live availability response | React Query (`staleTime: 0`) |
| Pricing Quote | `availability`/`booking-holds` module | Itemized price breakdown | React Query (`staleTime: 0`), re-fetched on any input change |
| Booking Hold Created | `booking-holds` module, `POST /booking-holds` | The hold resource (`id`, `expires_at`, resolved price) | React Query cache, keyed by hold ID; hold ID also placed in the URL (`/checkout/hold/:holdId`) |
| Countdown | `booking-holds` module (Chapter 21) | Derived tick state only | Local component state, computed from the cached hold's `expires_at` |
| Guest Details | `bookings` module (pre-confirmation), on the same `/checkout/hold/:holdId` route | Form field values | React Hook Form state (Chapter 15) |
| Payment | `payments` module, `/checkout/payment/:holdId` | Selected payment method, gateway-tokenized card reference | React Hook Form + a gateway-hosted tokenization iframe/SDK (never raw card data in application state) |
| Confirmation | `bookings` module, `/checkout/confirmation/:bookingId` | The confirmed booking resource | React Query cache |

### 20.2 What Is Never Trusted From the Browser

- **Price.** The frontend never sums line items itself to produce a
  "total" it then submits — every price shown is the server's own
  `POST /pricing/quote` / hold-snapshotted output
  (`API_SPECIFICATION.md` §51, `BOOKING_ENGINE_ARCHITECTURE.md` §7.7),
  displayed verbatim.
- **Availability.** The frontend never infers "this must still be
  available" from an earlier response's absence of an error — every
  transition into a state that assumes availability (creating a hold,
  confirming a hold) re-validates against a fresh API call, and every
  `AVAILABILITY_CONFLICT`/`HOLD_EXPIRED` response is handled explicitly
  (§20.4), never silently retried with stale assumptions.
- **Coupon validity/discount amount.** Computed and returned exclusively
  by `POST /coupons/validate` and the pricing pipeline — the frontend
  never estimates a discount client-side even for display purposes.
- **Booking status.** Always read from the API's current value
  (`BOOKING_ENGINE_ARCHITECTURE.md` §3), never inferred from "we just
  clicked confirm, so it must be confirmed now" — the confirmation page
  renders only once the `POST /booking-holds/{id}/confirm` response
  actually returns a `confirmed` (or `reserved`) status.

### 20.3 Mixed Bookings in the UI

A Mixed Booking (`BOOKING_ENGINE_ARCHITECTURE.md` §4.3 — e.g., a hotel
room plus a rental car in one checkout) is represented in the frontend as
a **single hold with multiple `items[]`** (`API_SPECIFICATION.md` §48) —
the checkout UI renders one guest-details step and one payment step
covering all items together (an itemized `PriceBreakdown`, Chapter 8,
shows each item's own subtotal), and a single `POST
/booking-holds/{id}/confirm` call confirms all items atomically. The UI
never splits a Mixed Booking into separate sequential checkouts — that
would contradict the Booking Engine's own all-or-nothing guarantee.

### 20.4 Failure and Edge-Case Handling

- **Hold expires client-side (countdown hits zero, Chapter 21):** the
  checkout UI immediately locks all form inputs, shows a clear
  "Your reservation hold has expired" state, and offers a single action
  — "Search again" — returning to the listing/search flow; it never
  attempts to silently create a new hold behind the scenes.
- **Availability changes underneath an active hold** (a rare
  server-side edge case, e.g. an admin manually intervening): surfaced
  only if a subsequent API call (confirm, or a countdown-tick
  re-validation, Chapter 21) returns a conflict — handled identically to
  expiry: lock the form, show a clear message, offer to search again.
  The frontend never polls availability independently *during* an active
  hold to "double check," since the hold itself is the authoritative
  claim; it reacts to what the confirm call tells it.
- **Payment fails** (`PAYMENT_FAILED`, `API_SPECIFICATION.md` §57/§58 via
  §48's confirm endpoint): the hold is **not** assumed expired — per
  `BOOKING_ENGINE_ARCHITECTURE.md` §8.4, a failed payment leaves the hold
  intact for the remainder of its window. The UI keeps the countdown
  running, surfaces the specific payment error, and lets the customer
  retry with a different method within the same hold.
- **API returns 409 (`AVAILABILITY_CONFLICT`)** at hold-creation time:
  the UI never silently substitutes a different date/unit — it surfaces
  the conflict explicitly and returns the customer to the Availability
  stage to choose again, consistent with
  `BOOKING_ENGINE_ARCHITECTURE.md` §5.7's worked example.

### 20.5 Idempotency Key Lifecycle in the UI

A single idempotency key (Chapter 10.5) is generated once per **logical
checkout attempt** and stored in that flow's local orchestrator state
(not React Query, not the URL): generated the moment the customer clicks
"Confirm and Pay," reused across any automatic network-retry of that same
click (§10.6), and **discarded and regenerated** only if the customer
explicitly backs out and restarts payment (e.g., switching payment
method after an explicit cancel, not after an automatic retry) — ensuring
retries of the same intent are safely deduplicated server-side while
genuinely distinct attempts are not incorrectly collapsed into one.

## 21. Reservation Hold Countdown

### 21.1 The Core Rule

**The countdown displays a server timestamp; it never owns one.** The
hold resource's `expires_at` (`API_SPECIFICATION.md` §48,
`BOOKING_ENGINE_ARCHITECTURE.md` §5.2) is the single source of truth. The
frontend's countdown component computes `remainingSeconds =
expires_at - clientNow` on every render tick — it never starts a
15-minute `setTimeout` from the moment the UI first saw the hold, which
would silently drift from the server's actual expiry under clock skew,
tab-sleep/throttling, or network latency in receiving the initial
response.

### 21.2 Implementation Shape (Architecture, Not Code)

- The `booking-holds` module's `useReservationHold(holdId)` hook wraps
  `GET /booking-holds/{id}` (React Query, `staleTime: 0`) **and** a
  lightweight local ticking mechanism: a `useEffect`-driven interval
  (every 1 second) that recomputes `remainingSeconds` from the
  **currently cached** `expires_at` — the interval itself never
  refetches on every tick (that would be excessive request volume); it
  only recalculates a subtraction against already-known data.
- **Periodic re-validation:** independently of the 1-second visual tick,
  the hook re-fetches the hold from the server on a slower interval
  (e.g., every 30 seconds) and whenever the browser tab regains focus
  (`visibilitychange`) — this is what catches the rare case of a
  server-side change to the hold (Chapter 20.4) or corrects for
  significant client clock drift, without the visual countdown depending
  on network round-trips for every single second it ticks down.
- When `remainingSeconds` reaches zero (client-computed) **or** a
  re-validation fetch returns a `HOLD_EXPIRED`/404, the same expiry
  handling path fires (§20.4) — the two triggers converge on one handler,
  so the UI behaves identically whether the client's own countdown or a
  server re-check is what first detected expiry.

### 21.3 Visual Treatment

Per `UI_UX_GUIDELINES.md` §9.10's Warning/Orange color convention: the
countdown renders in neutral styling above roughly 5 minutes remaining,
shifts to Warning/Orange styling under 5 minutes, and — matching the
platform's care around anxiety-inducing UI — never uses harsh red or
alarming animation even in the final seconds; the tone stays calm and
clear ("2:14 remaining") rather than urgent-feeling, consistent with
`UI_UX_GUIDELINES.md`'s user-wellbeing-conscious tone principles.

### 21.4 Persistence Across Refresh and Tab Close

A customer refreshing `/checkout/hold/:holdId` or closing and reopening
the tab loses no state that matters: the hold ID is in the URL, and
re-fetching `GET /booking-holds/{id}` returns the exact same
server-computed `expires_at` — the countdown simply resumes from the
correct remaining time. No hold-related countdown state is ever persisted
to `localStorage`, because none needs to be; the server is already the
persistence layer.

## 22. Payment UI Architecture

### 22.1 Gateway-Hosted Tokenization

Consistent with `API_SPECIFICATION.md` §57's PCI-scope boundary: raw card
input fields are rendered via the payment gateway's own hosted
iframe/Elements-style SDK, never as plain application-controlled `<input>`
fields — the `payments` module's checkout step embeds this SDK component
and receives back only a short-lived **token reference**, which is what
gets submitted to `POST /booking-holds/{id}/confirm` (Chapter 20.1). No
card number, CVV, or expiry ever exists in React state, Redux-equivalent
Context, or is ever logged (Chapter 34, Chapter 36).

### 22.2 Saved Payment Methods and Wallet

- `GET /payments/methods` (§57) lists a customer's saved, tokenized
  methods for one-click reuse; selecting one skips the tokenization SDK
  step entirely.
- Wallet balance (`GET /wallet`, §60) is displayed as an optional toggle
  ("Apply ֏15,000 wallet credit") on the payment step — toggling it
  updates the `PriceBreakdown` (Chapter 7) live by re-running
  `POST /pricing/quote`-equivalent logic server-side (the confirm
  endpoint recomputes with `wallet_amount` included, per
  `BOOKING_ENGINE_ARCHITECTURE.md` §8.3) rather than the frontend
  subtracting the wallet amount from a previously displayed total itself.

### 22.3 Payment Status Feedback

While `POST /booking-holds/{id}/confirm` is in flight, the payment step
shows a non-dismissible, clearly-labeled processing state (never a bare
spinner — a short, reassuring message, per `UI_UX_GUIDELINES.md` §10.4's
loading-state tone guidance) and disables the submit control to prevent
duplicate submission — this UI-level disable is a UX convenience layered
on top of, never a replacement for, the idempotency-key protection
(§10.5/§20.5) that makes a duplicate submission safe regardless.


## 23. Calendar and Availability UI

### 23.1 The Calendar Component Renders Server Data Only

The Calendar/DatePicker (`ui/Calendar`, per `UI_UX_GUIDELINES.md` §9.2)
never generates its own notion of which dates are available — every date
cell's state (`available` / `booked` / `held` / `blocked`) is rendered
directly from the `availability` module's `GET /availability` response
(`API_SPECIFICATION.md` §49), fetched for the currently-viewed month
range and re-fetched as the customer navigates months. Selecting a date
range in the UI does not, by itself, reserve anything — it only
constructs the parameters for the next stage's Pricing Quote and,
ultimately, the Booking Hold request (Chapter 20).

### 23.2 Granularity-Aware Rendering

The same `ui/Calendar` component renders three interaction modes, chosen
by the consuming module based on the listing's Availability Algorithm
(`BOOKING_ENGINE_ARCHITECTURE.md` §4.2):

- **Date-range mode** (Algorithm 1 — Hotels, Vacation Houses, Apartments,
  Camping, Car Rentals): dual-month range picker, per
  `UI_UX_GUIDELINES.md` §9.2.
- **Date + time-slot mode** (Algorithm 2 — Restaurants, SPA): a single-date
  calendar paired with a time-slot picker (`ui/TimePicker`) whose
  available slots come directly from the same availability response's
  slot-level data, never client-generated by incrementing a start time.
- **Date + capacity mode** (Algorithm 3/4 — Pools, Events, Tours): a
  session/departure picker showing `quantity_available` per session
  directly, with a party-size stepper capped at that number.

### 23.3 Partner Calendar (Editing Mode)

The Partner Dashboard's calendar (`UI_UX_GUIDELINES.md` §9.3's "Partner
Calendar") reuses the same `ui/Calendar` component in an editing mode:
clicking a date opens a small popover (blackout toggle, price override
shortcut) that calls the `calendar`/`pricing` modules' mutations
(`API_SPECIFICATION.md` §50/§51) directly — visually the same component,
functionally gated by a `mode="edit"` prop and `RequirePermission`
(Chapter 12) rather than a separate component implementation.

## 24. Media and Image Architecture

### 24.1 Consuming the Media Object

Every image/video rendered anywhere on the platform consumes the `Media`
object shape exactly as `API_SPECIFICATION.md` §20 defines it
(`variants`, `thumbnail_url`, `playback_url`) — no component ever
constructs its own resized-image URL by string-manipulating a base URL;
if a needed variant doesn't exist in the response, that is a backend
contract gap to fix, not something the frontend works around.

### 24.2 Responsive Images and Lazy Loading

- Every `<img>` (via a shared `ui/Image` primitive) renders a `srcset`
  built from the `variants` object, with the browser's native
  `loading="lazy"` for anything below the fold, and eager loading
  reserved for the single largest above-the-fold hero image per page
  (matching `UI_UX_GUIDELINES.md` §8's photography standards).
- **LQIP placeholders:** every `ui/Image` shows a blurred low-resolution
  placeholder (a small, inlined base64 thumbnail already present in the
  `Media` object's `variants.thumbnail`, downscaled further client-side
  for the blur effect) while the full-resolution variant loads — never a
  gray box or bare spinner, per `UI_UX_GUIDELINES.md` §9.12.

### 24.3 Video Loading Strategy

Videos never autoplay with sound; ambient hero background video loops
(`UI_UX_GUIDELINES.md` §9.7) autoplay muted only, load lazily (not until
the containing section is near-viewport), and pause automatically when
scrolled out of view to conserve bandwidth/battery. User-initiated
gallery videos load on click, not preemptively.

### 24.4 Upload UI

The `media` upload flow's UI (used by `listings` and its module-specific
extensions when a partner adds photos) shows per-file progress driven by
the `services/mediaUploadService.js` upload-progress callback
(Chapter 10.10), supports multi-file drag-and-drop, and validates file
type/size client-side **before** requesting an upload intent — purely as
fast feedback (Layer 1 validation, Chapter 15.2); the authoritative
constraint check still happens server-side at `POST /media/upload-intent`.

## 25. Maps Architecture

### 25.1 Lazy-Loaded, Never Blocking Initial Render

The map SDK (Google Maps, per `PROJECT_BIBLE.md`'s technology choice) is
loaded **only** when a component that actually needs it mounts (a listing
detail page's location section, a search-results map view) — never
included in the initial bundle for pages without a map, consistent with
Chapter 4.3's code-splitting discipline. A skeleton placeholder (Chapter
28) occupies the map's layout space until the SDK and tile data are
ready, preventing layout shift.

### 25.2 Data Source

Map markers render directly from `listing_locations`' `geo_point`
(surfaced via `API_SPECIFICATION.md` §38/§39's listing responses) — the
map component never geocodes an address client-side; geocoding, if ever
needed, is a backend concern at listing-creation time.

### 25.3 Search Results Map View

The search page's optional map view (`UI_UX_GUIDELINES.md` §9.8) syncs
selected-pin state with the corresponding result-card list via shared
local component state (not a separate data fetch) — both views render
from the same already-fetched search-results query (Chapter 19).

## 26. Notifications and Toasts

### 26.1 Two Distinct Notification Surfaces

- **Toasts** (`ui/Toast`, `UI_UX_GUIDELINES.md` §9.11) are ephemeral,
  client-triggered feedback for the **current session's own actions**
  (a mutation succeeding/failing, a copy-to-clipboard confirmation) —
  owned by a `ToastContext` (Chapter 13), never persisted, never fetched
  from the API.
- **The Notification Center** (`ui/` + the `notifications` module) is the
  durable, server-backed record (`API_SPECIFICATION.md` §55,
  `BOOKING_ENGINE_ARCHITECTURE.md` §10.2's "always populated regardless
  of channel preference") — a React Query list, with an unread-count
  badge in every layout header (Chapter 5) backed by a lightweight,
  shared polling query (`notificationKeys.list()`, Chapter 14.4's
  background-refetch policy).

### 26.2 Mapping Mutation Outcomes to Toasts

A small, shared convention: every mutation hook (Chapter 14) accepts
optional `successMessage`/`errorMessage` translation keys, and a single
shared `useMutationToast` wrapper hook fires the appropriate toast
automatically from the normalized `ApiError` (Chapter 10.8) on failure or
the mutation's own success — individual components never manually call
`toast.show(...)` with hand-written strings, keeping tone and phrasing
consistent platform-wide.

## 27. Error Handling

### 27.1 Three Layers of Error Handling

1. **Field-level** (Chapter 15.3) — `422 VALIDATION_FAILED` mapped onto
   individual form fields.
2. **Component-level** — a query's `error` state renders an inline
   `ErrorState` component (a variant of the `EmptyState` pattern, Chapter
   29) scoped to just that section of the page (e.g., a "Reviews failed
   to load — Retry" block that doesn't take down the rest of the listing
   page).
3. **Application-level** — a top-level `ErrorBoundary` (`errors/`,
   Chapter 3) catches unhandled render exceptions and renders the `/500`
   page; a dedicated Axios/React-Query error path catches `NOT_FOUND` and
   `FORBIDDEN` globally and redirects to `/404`/`/403` respectively
   (Chapter 4.5) rather than leaving a broken partial page rendered.

### 27.2 Error Code → UI Behavior Mapping

Every code in `API_SPECIFICATION.md` Appendix A has an explicit, reviewed
mapping to one of: a field error (§15.3), a toast (§26.2), a full-page
error route (§27.1.3), or a specific bespoke UI state (e.g.,
`HOLD_EXPIRED` → the Chapter 21 expiry state, not a generic toast) — no
error code is ever left to fall through to a generic "Something went
wrong" unless it is genuinely unanticipated (`INTERNAL_ERROR` and truly
unmapped codes only).

### 27.3 Network/Offline State

A shared `useOnlineStatus` hook (backed by the browser's
`online`/`offline` events) drives a small, dismissible banner
platform-wide when connectivity is lost, and disables submission of any
in-progress form/mutation while offline (Chapter 14.7) rather than
letting a submission silently queue.

## 28. Loading and Skeleton States

### 28.1 Skeletons, Not Spinners, for Content

Every content-bearing component (listing cards, booking lists, dashboard
tables) renders a shape-matching Skeleton (`ui/Skeleton`,
`UI_UX_GUIDELINES.md` §9.12) while its backing query is loading — never a
centered spinner for anything expected to take longer than roughly one
second. Skeletons are defined once per component "shape" (a
`ListingCardSkeleton`, a `BookingRowSkeleton`) co-located with the real
component, so the two never visually drift apart as the real component
evolves.

### 28.2 Spinners, Reserved for Short Actions

A simple spinner (`ui/Spinner`) is reserved for sub-second,
button-level, or full-overlay actions (a mutation's in-flight submit
state, Chapter 22.3's payment-processing state) — never for a full page
or list load, per `UI_UX_GUIDELINES.md` §9.12's own distinction.

### 28.3 Suspense Boundaries

Route-level code-splitting (Chapter 4.3) and any component using
`React.lazy` render a full-route Skeleton as their `Suspense` fallback;
data-fetching loading states are handled by React Query's own `isLoading`
flag within an already-mounted component, not by wrapping data fetching
in `Suspense` — this keeps the loading-state model consistent and
explicit (Chapter 14) rather than mixing two different suspense
mechanisms for the same concern.

## 29. Empty States

Every list-rendering component defines its own `EmptyState` (`ui/EmptyState`,
`UI_UX_GUIDELINES.md` §9.12) — a short explanation of why the list is
empty plus one clear next action (e.g., an empty Favorites list: "You
haven't saved anything yet" + a "Browse listings" button) — distinguished
explicitly from the loading state (Chapter 28) and the error state
(Chapter 27.1.2), which share the same layout slot but are never confused
with one another: a query's `data.length === 0` (empty) is a different
render branch than `isLoading` (loading) or `error` (failed), checked in
that explicit order in every list component.

## 30. Accessibility

### 30.1 WCAG AA as the Floor

Every rule in `UI_UX_GUIDELINES.md` §12 is enforced at the component
level (Chapter 8.3), not left to page-level review:

- **Keyboard navigation:** every interactive element reachable via `Tab`
  in a logical order; custom components (`ui/Select`, `ui/Calendar`)
  implement full keyboard interaction patterns (arrow keys, `Enter`/
  `Space`, `Escape`) matching native equivalents, never relying on a bare
  `div` with an `onClick`.
- **Focus management:** `ui/Modal` and `ui/Drawer` trap focus within
  themselves while open (`Tab`/`Shift+Tab` cycle only their own focusable
  children), restore focus to the triggering element on close, and close
  on `Escape` — implemented once in each primitive, never re-implemented
  per usage.
- **ARIA live regions:** toasts (§26), form errors (§15.3), and the hold
  countdown's expiry transition (§21) are announced via `aria-live`
  regions so screen reader users receive the same time-sensitive
  information sighted users see.
- **Minimum touch targets:** every interactive element, including
  icon-only buttons, meets the 44×44px minimum from
  `UI_UX_GUIDELINES.md` §7 platform-wide, enforced via the shared `ui/`
  sizing tokens (Chapter 8.4), never left to per-usage padding choices.
- **Reduced motion:** every Framer Motion animation (Chapter 31) checks
  `prefers-reduced-motion` via a shared hook and renders its reduced/no-
  animation variant automatically — component authors never need to
  remember this per-animation; it is built into the shared animation
  wrapper utility.
- **Color contrast:** enforced by construction, since every color used
  anywhere is one of the design tokens (Chapter 9.2) already verified
  against `UI_UX_GUIDELINES.md` §3's 4.5:1 minimum — a component can
  never introduce an out-of-palette, uncontrasted color.
- **Semantic HTML:** landmarks (`header`, `nav`, `main`, `footer`) used
  in every layout (Chapter 5); form controls always programmatically
  associated with their labels via `ui/`'s controlled-component wiring
  (Chapter 8.2), never a bare placeholder standing in for a label.
- **Accessible calendars:** the `ui/Calendar` (Chapter 23) exposes each
  date as a properly labeled, keyboard-navigable grid cell
  (`role="grid"` semantics) with the date's full accessible name
  including availability status ("July 20, available") — never a purely
  visual color-only signal.
- **Accessible maps:** the map component (Chapter 25) is supplemented by
  an always-present, screen-reader-accessible list view of the same
  results (the search results list itself), so no information is
  conveyed by the map alone.
- **Accessible carousels:** the Gallery/Carousel (Chapter 24) is fully
  keyboard-navigable (arrow keys) and never auto-advances content the
  user needs to read, matching `UI_UX_GUIDELINES.md` §9.7 exactly.


## 31. Animation Architecture

### 31.1 Framer Motion, Governed by One Shared Wrapper

Every animation on the platform uses Framer Motion (per the brief's tech
stack and `UI_UX_GUIDELINES.md` §10), accessed through a small set of
shared, pre-configured primitives (`components/motion/FadeIn`,
`components/motion/PageTransition`) rather than raw `motion.div` usage
scattered through feature code — this is what makes the
`prefers-reduced-motion` rule (Chapter 30) and the duration/easing tokens
(Chapter 9.2) automatically consistent everywhere, since they are baked
into the shared wrapper once.

### 31.2 What Gets Animated

Restated from `UI_UX_GUIDELINES.md` §10 as frontend implementation rules:
route/page transitions (Chapter 4.6), card hover states, button
press/hover feedback, modal/drawer enter-exit, toast enter-exit, skeleton
shimmer (Chapter 28), and the favorite-heart micro-bounce. **Never**
animated: anything that would delay a user from completing a booking
action (no decorative animation gates the "Confirm and Pay" button's
availability), and never a layout-shifting animation on the checkout
flow specifically, where stability is prioritized over polish.

### 31.3 Performance Discipline

Every animation exclusively transforms `opacity` and `transform`
(matching `UI_UX_GUIDELINES.md` §10.1's 60fps rule) — never `width`,
`height`, `top`, or `left` — enforced by code review against this rule
and by the shared wrapper components only exposing props for
transform/opacity-based variants in the first place.

## 32. Performance Strategy

### 32.1 Code Splitting and Bundle Discipline

Route-based (Chapter 4.3) and component-level (`React.lazy` for heavy,
rarely-immediately-needed components — the map SDK, Chapter 25; the
payment gateway SDK, Chapter 22) splitting are both mandatory, not
optional optimizations added later. A CI bundle-size budget per
application entry point (Customer Website, Account, Partner, Admin) is
enforced (Chapter 35/38) — a pull request that regresses a bundle past
its budget fails CI and requires an explicit justification or further
splitting.

### 32.2 Image and Media Performance

Covered fully in Chapter 24 — responsive `srcset`, lazy loading, LQIP,
lazy video. Restated here as a performance requirement, not just a UX
one: images are the single largest contributor to page weight on a
travel marketplace, and every rule in Chapter 24 exists primarily to
protect Core Web Vitals (§32.5).

### 32.3 Memoization Rules

`React.memo`, `useMemo`, and `useCallback` are applied **deliberately**,
not reflexively — the rule is: memoize a component only once it is
demonstrated (via the profiler, not guessed) to re-render expensively and
unnecessarily as a child of frequently-updating state (e.g., a
long search-results list re-rendering on every keystroke of an unrelated
filter). Blanket memoization of every component is explicitly discouraged
— it adds comparison overhead and cognitive load without benefit for
cheap, infrequently-rendering components.

### 32.4 Virtualization

Long lists (search results beyond roughly 50 items rendered at once,
Admin Panel data tables, the notification feed) use a virtualization
library (windowing only the visible rows) rather than rendering every
item — applied at the `ui/Table` and infinite-scroll list level once,
inherited by every module that uses those primitives, never
re-implemented per module.

### 32.5 Core Web Vitals Targets

| Metric | Target |
|---|---|
| Largest Contentful Paint (LCP) | < 2.5s |
| Interaction to Next Paint (INP) | < 200ms |
| Cumulative Layout Shift (CLS) | < 0.1 |

Measured continuously in production via real-user monitoring (Chapter
36), not only in synthetic CI checks — synthetic checks (Lighthouse CI in
the build pipeline, Chapter 38) catch regressions before merge; real-user
monitoring confirms actual customer experience across real devices and
networks.

### 32.6 Third-Party Script Control

Every third-party script (analytics, the map SDK, the payment gateway
SDK) is loaded lazily and only on the routes that need it (Chapter 25,
Chapter 22) — no third-party script is included in the root HTML's
initial load, and any new third-party integration is required to justify
its performance cost against the Core Web Vitals budget before adoption.

## 33. SEO Strategy

### 33.1 Server-Side Rendering / Static Generation for Public Pages

The **Customer Website** route tree (Chapter 2.2) is rendered with
server-side rendering (SSR) or static generation for every publicly
indexable route (home, search, listing detail, CMS pages, partner public
profile) — the Customer Account Area, Partner Dashboard, and Admin Panel
remain client-side-rendered only, since none of that content is ever
meant to be indexed. This split is a build-configuration difference
within the one codebase (Chapter 2.1), not a reason to separate
repositories.

### 33.2 hreflang and Canonical Tags

Every publicly indexable page renders `<link rel="alternate"
hreflang="hy|ru|en" href="...">` tags for all three locale variants of
that same page (Chapter 4.1's URL strategy is what makes this possible)
plus a self-referencing canonical tag — generated once, centrally, by
the SSR layout shell, never hand-added per page.

### 33.3 Structured Data

Listing detail pages render Schema.org structured data (`Hotel`,
`Product`/`Offer`, `AggregateRating` from review data) matching
`UI_UX_GUIDELINES.md` §9 SEO principles — sourced directly from the same
API response already rendering the visible page, never a
separately-maintained duplicate data source.

### 33.4 Meta Tags, Sitemap, Robots

Dynamic per-page meta title/description (localized, per Chapter 16) is
set from listing/CMS content at render time; a generated sitemap
(refreshed on a schedule from the `listings`/`cms` APIs, not hand-
maintained) and `robots.txt` explicitly disallow the Account/Partner/Admin
route trees, reinforcing §33.1's indexability split.

## 34. Security Rules

### 34.1 Token Storage — The Decision

**Access token:** stored **in memory only** (a module-level variable in
the API client, Chapter 10.2) — never in `localStorage`, `sessionStorage`,
or a cookie. It is lost on a full page reload by design, and reacquired
via the refresh flow (Chapter 11.1). This eliminates the single highest-
value target for an XSS attack from persistent client storage entirely —
a 15-minute-lived token in memory is a far smaller exposure window than
any persisted token.

**Refresh token:** `API_SPECIFICATION.md` §6–7 defines the login/refresh
endpoints as returning the refresh token in the JSON response body — a
delivery mechanism that, for a native mobile client storing it in
platform-secure storage (Keychain/Keystore), is entirely appropriate. For
the **web** client specifically, the safest achievable pattern given
that same contract is: the web frontend requests (and this document
specifies as the required web-specific behavior) that the backend
**additionally** set the refresh token as a `Secure`, `HttpOnly`,
`SameSite=Strict` cookie on the login/refresh response for browser
clients — identified via the `X-Client` header (Chapter 10.1) — so
browser JavaScript never has read access to the refresh token at all,
closing the one gap a purely-JSON-body delivery would leave open to XSS.
This is additive to, and does not contradict, `API_SPECIFICATION.md`'s
existing contract: the JSON field remains present (used by native
clients), and the web client simply never reads or persists that field
itself, relying on the browser's automatic cookie handling instead. This
is the single most important security decision in this document, made
explicit exactly as instructed: **the risk being mitigated is XSS-based
token theft; the mitigation is ensuring the longest-lived credential
never exists in any location JavaScript — malicious or otherwise — can
read.**

**CSRF consideration:** because the refresh cookie is `SameSite=Strict`,
cross-site request forgery against the refresh endpoint is inherently
mitigated without requiring a separate CSRF token for that specific flow;
standard `SameSite` cookie behavior means the cookie is never attached to
a cross-origin request in the first place.

### 34.2 XSS Prevention

React's default JSX escaping is relied upon for all user-generated
content (review text, messages, listing descriptions) — `dangerouslySetInnerHTML`
is banned platform-wide except for one reviewed, sanitized exception (CMS
rich-text content, passed through a dedicated sanitization utility in
`utils/` before rendering, never raw). No user input is ever interpolated
into a URL, `eval`, or dynamic script construction.

### 34.3 Sensitive Data Handling

Payment card data is never handled by application code at all (Chapter
22.1). Passwords are never stored, logged, or held in component state
beyond the lifetime of the login form submission itself. Any PII (email,
phone, address) rendered in the UI follows the masking rules in §34.9.

### 34.4 Open Redirect Prevention

The post-login redirect (`?redirect={path}`, Chapter 11.3) and any other
client-supplied redirect target is validated against an allowlist of
same-origin, known route patterns before being used — a redirect
parameter is never passed directly to `window.location` or
`navigate()` without this check, preventing it from being weaponized to
redirect a user to an external phishing destination after a legitimate
login.

### 34.5 File Upload Validation

Client-side MIME-type and size checks (Chapter 24.4) are explicitly
documented as **UX convenience only** — the authoritative check is
server-side (`API_SPECIFICATION.md` §19), and the frontend never assumes
a file is safe or valid merely because it passed the client-side check.

### 34.6 Dependency Security

Every dependency (Axios, React Query, Framer Motion, i18next, and all
transitive dependencies) is scanned automatically in CI (Chapter 38) for
known vulnerabilities on every build; a critical-severity finding blocks
merge until resolved or explicitly, temporarily waived with a tracked
justification.

### 34.7 Content Security Policy Compatibility

All styling goes through SCSS Modules (Chapter 9), never inline `style`
attributes for anything beyond computed, data-driven values (e.g., a
progress bar's width) — this keeps the application compatible with a
strict Content Security Policy that disallows `unsafe-inline` for styles.
No inline `<script>` blocks are used; any required third-party script
(Chapter 32.6) is loaded from an explicitly allowlisted origin in the
CSP configuration.

### 34.8 Logging Restrictions

No PII, payment data, or authentication token is ever written to
`console.log` or sent to the monitoring pipeline (Chapter 36) in
plaintext — the shared logging utility (Chapter 36.2) automatically
redacts known-sensitive field names before any log line leaves the
client.

### 34.9 PII Masking

Any UI surface showing a customer's contact details to a party other
than themselves (a partner viewing a guest's booking, Chapter 47's
equivalent frontend view) shows only what `API_SPECIFICATION.md`'s
response actually includes for that caller's permission level — the
frontend performs no additional client-side masking logic of its own,
since the API itself never over-shares (Chapter 29 of `API_SPECIFICATION.md`'s
Profiles module is the model: public fields are public fields, full stop,
enforced server-side).

## 35. Testing Strategy

| Layer | Tool | What it covers |
|---|---|---|
| **Unit tests** | Vitest | Pure `utils/` functions, formatting logic, permission-check helpers |
| **Component tests** | React Testing Library + Vitest | `ui/` primitives (rendering, keyboard interaction, ARIA attributes) and module components in isolation, with mocked queries |
| **Integration tests** | React Testing Library + Mock Service Worker (mocking `API_SPECIFICATION.md` endpoints at the network layer) | Full feature flows within one module (e.g., the search-filter-to-results flow) |
| **API contract tests** | Generated from the OpenAPI bundle (`API_SPECIFICATION.md` §26) | Verifies the frontend's `api/` layer request/response shapes match the published contract — run in CI against a contract-testing tool, catching drift before it reaches a real environment |
| **End-to-end tests** | Playwright | Full user journeys across real (staging) backend: search → hold → payment → confirmation; login/logout; partner listing creation |
| **Accessibility tests** | axe-core (via Playwright/Testing Library integration) | Automated WCAG AA violations caught in CI on every `ui/` primitive and every full page |
| **Visual regression tests** | Playwright's screenshot comparison | `ui/` primitives and key page templates, run against every pull request touching `ui/` or `styles/` |

### 35.1 Required Coverage for Specific Flows

- **Authentication:** login success/failure, refresh rotation, concurrent-
  refresh de-duplication (Chapter 10.3), logout-all cross-tab sync
  (Chapter 11.4).
- **Search:** filter-to-URL sync, debounce behavior, empty-results state.
- **Availability:** correct rendering of all four algorithm types
  (Chapter 23.2), advisory-vs-authoritative distinction (a stale cached
  "available" followed by a real `AVAILABILITY_CONFLICT` on hold
  creation, Chapter 20.4).
- **Booking hold:** creation, the countdown's tick-vs-re-validation split
  (Chapter 21.2), Mixed Booking multi-item confirmation (Chapter 20.3).
- **Hold expiration:** the full expiry-handling UI path (Chapter 20.4),
  triggered both by client-computed zero and by a mocked server 409.
- **Payment failure:** hold-preserved-after-failure behavior (Chapter
  20.4), retry with a different method.
- **Booking confirmation:** correct rendering of the server's actual
  returned status (never an assumed status, Chapter 20.2).
- **Language switching:** URL rewrite, content refetch, no hardcoded-
  string regressions (a CI lint check, Chapter 39, backed by an
  integration test asserting no raw literal text nodes in a sampled set
  of key pages).
- **Partner permissions:** every `RequirePermission`/`RequireRole` guard
  (Chapter 12) tested for both the allowed and denied case, including the
  ownership-check path (a partner attempting to view another partner's
  listing detail).
- **Admin permissions:** the same, for every admin-only route and action,
  plus the impersonation banner's persistent, non-dismissible presence
  (Chapter 5.5).

## 36. Logging and Monitoring

### 36.1 What Is Logged

Every normalized `ApiError` (Chapter 10.8), every unhandled render
exception caught by an `ErrorBoundary` (Chapter 27.1.3), and key
booking-funnel milestones (search performed, hold created, hold expired,
payment attempted, booking confirmed — mirroring
`BOOKING_ENGINE_ARCHITECTURE.md` §14.6's conversion funnel) are sent to
the monitoring pipeline, each tagged with the `request_id` where
applicable (Chapter 10.9), the current route, locale, and — for
authenticated sessions — a non-PII user identifier (the opaque user ID,
never email/phone).

### 36.2 Redaction

A single shared logging utility (`utils/logger.js`) is the **only**
sanctioned way to send data to the monitoring pipeline — it automatically
redacts any field matching a known-sensitive name pattern (password,
token, card, cvv, ssn-equivalent identifiers) before transmission,
enforced by a unit test asserting redaction behavior against a fixed set
of known-sensitive sample payloads.

### 36.3 Real-User Monitoring

Core Web Vitals (Chapter 32.5) are captured from real sessions via the
browser's Performance Observer APIs and reported continuously, segmented
by application (Customer Website vs. Partner Dashboard vs. Admin Panel),
locale, and device class, so a regression affecting only mobile Armenian-
locale customers, for example, is visible rather than averaged away.

## 37. Environment Configuration

- Configuration (API base URL, environment name, feature-flag defaults
  before the `settings.feature-flags` API call resolves them, monitoring
  pipeline endpoint) is injected at **build time** via environment
  variables, never fetched from a runtime config file that could be
  tampered with client-side.
- **No secret ever belongs in a frontend environment variable** — anything
  bundled into client-served JavaScript is, by definition, public; the
  only values permitted here are non-sensitive configuration (Chapter
  10.12, Chapter 34 restate this from the security angle).
- Three environments — `development`, `staging`, `production` — each with
  its own variable set, never sharing a single "figure it out from the
  hostname" runtime branch; the build pipeline (Chapter 38) selects the
  correct set explicitly per deploy target.

## 38. Build and Deployment Strategy

- **Build tool:** Vite, for fast development builds and native support
  for the route-based code-splitting strategy (Chapter 4.3).
- **CI pipeline, per pull request:** lint (Chapter 39) → type/PropTypes
  check → unit + component tests (Chapter 35) → bundle-size budget check
  (Chapter 32.1) → Lighthouse CI (Chapter 32.5) → accessibility scan
  (Chapter 35) → build. Merge is blocked on any failure.
- **Deployment:** static build output served via CDN for the SSR/static
  Customer Website routes (Chapter 33.1) and the client-rendered
  application shell for Account/Partner/Admin, both from the same build
  artifact — no separate deployment pipeline per application, reinforcing
  Chapter 2.1's one-codebase decision at the infrastructure level too.
- **Preview deployments:** every pull request gets an ephemeral preview
  deployment for manual/design review before merge.
- **Rollback:** every production deploy is immutable and instantly
  revertible to the previous build artifact — no in-place hotfixing of a
  live deployment.

## 39. Coding Standards

- **Linting:** ESLint with a shared, non-negotiable config (no
  per-module overrides) enforcing the dependency-direction rules
  (Chapter 3.1/6.3) via import-boundary lint rules, the no-hardcoded-
  user-facing-string rule (Chapter 16.5), and standard React best
  practices (hooks rules, no unused state, exhaustive-deps).
- **Formatting:** Prettier, enforced pre-commit and in CI — no
  formatting debates in code review.
- **Component structure:** one component per file, colocated with its
  `.module.scss` (Chapter 9.1), its own tests, and (for a module-owned
  component) its own subfolder under that module.
- **Naming:** `PascalCase` components, `camelCase` functions/variables,
  `SCREAMING_SNAKE_CASE` constants (Chapter 3's `constants/` rule),
  kebab-case file/folder names outside of component files themselves.
- **PropTypes/JSDoc typing:** every component's props are explicitly
  typed (PropTypes, given the brief's plain-JavaScript stack rather than
  TypeScript) and documented — an untyped prop is a code-review blocker.
- **Commit/PR discipline:** every pull request maps to one logical change
  within one module's ownership (Chapter 6.4) wherever possible;
  cross-module changes (a shared `ui/` component update) are flagged for
  review by the platform/design-system sub-team regardless of which
  feature team authored them.

## 40. Definition of Done

A feature is **not done** until every one of the following is true —
this checklist is the final gate for every pull request touching
user-facing functionality:

- [ ] Implements the exact request/response contract in
      `API_SPECIFICATION.md` — no invented fields, no assumed endpoints.
- [ ] Never computes an authoritative price, availability, or booking
      status client-side (Chapter 20.2).
- [ ] Fully localized — zero hardcoded user-facing strings (Chapter 16.5),
      verified in all three locales.
- [ ] All three states designed and implemented: loading (Chapter 28),
      empty (Chapter 29), error (Chapter 27).
- [ ] Meets WCAG AA (Chapter 30): keyboard-navigable, screen-reader
      labeled, focus-managed, reduced-motion-respecting.
- [ ] Responsive across all five breakpoints (`UI_UX_GUIDELINES.md` §5.3).
- [ ] Uses only `ui/` primitives and design tokens (Chapter 8–9) — no
      inline styles, no ad hoc colors/spacing.
- [ ] Respects module dependency-direction rules (Chapter 6.3) and folder
      boundaries (Chapter 3.1).
- [ ] Server state lives in React Query, client state in the correct
      owner per Chapter 13.3's table — no server data duplicated into
      Context.
- [ ] Every mutation has correct cache invalidation (Chapter 14.5) and,
      where applicable, an idempotency key (Chapter 10.5).
- [ ] Every API error code this feature can encounter has an explicit,
      reviewed UI treatment (Chapter 27.2) — nothing falls through to a
      generic message unintentionally.
- [ ] Covered by unit/component tests for logic, integration tests for
      the flow, and — for booking-funnel features — the specific required
      scenarios in Chapter 35.1.
- [ ] Passes the CI pipeline in full (Chapter 38): lint, tests, bundle
      budget, Lighthouse, accessibility scan.
- [ ] No secret, token, or PII logged (Chapter 34.8, 36.2), verified by
      the redaction test suite.
- [ ] Reviewed and approved by the owning feature team (Chapter 6.4) and,
      for any shared `ui/`/`styles/`/`contexts/` change, by the platform/
      design-system sub-team.

---

*— End of FRONTEND_ARCHITECTURE.md —*
