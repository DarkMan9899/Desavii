/**
 * Step A7 (brief §16) — the explicit, non-substring-based classification
 * of which routes are eligible for GA4 pageview tracking. Mirrors the
 * bare `<Route element={<PublicLayout />}>` group in `routes/index.jsx`
 * EXACTLY, with one deliberate exclusion:
 *
 * - `booking/checkout` shares `PublicLayout`'s chrome but is
 *   `RequireAuth`-gated (converts an authenticated reservation hold into
 *   a real booking) — a private, transactional page, not public
 *   discovery content, so it is excluded here even though its layout
 *   matches.
 * - `partner/apply` / `partner/invitations/:token` are also
 *   `RequireAuth`-only + `PublicLayout` but are excluded for the same
 *   reason: authenticated, non-discovery pages.
 * - Auth pages (`auth/login`, `auth/register`, etc.) are unauthenticated
 *   and publicly reachable, but are a conversion/funnel surface, not
 *   marketplace discovery, and none of A7 v1's 9 GA4 events relate to
 *   them — deliberately out of scope for this step rather than assumed.
 *
 * Every other route group (Customer Account, Partner, Manager,
 * Marketing, Admin) is authenticated and/or an internal operational
 * dashboard — never eligible, per brief §29.
 */

import { SUPPORTED_LOCALES } from '../../translations/supportedLocales.js';

const LOCALE_PREFIX_PATTERN = new RegExp(
  `^/(?:${SUPPORTED_LOCALES.join('|')})(?=/|$)`,
);
const LOCALE_CAPTURE_PATTERN = new RegExp(
  `^/(${SUPPORTED_LOCALES.join('|')})(?:/|$)`,
);

function pathnameWithoutLocale(pathname) {
  const stripped = pathname.replace(LOCALE_PREFIX_PATTERN, '');
  return stripped === '' ? '/' : stripped;
}

export function extractLocaleFromPathname(pathname) {
  const match = pathname.match(LOCALE_CAPTURE_PATTERN);
  return match ? match[1] : undefined;
}

const PUBLIC_ROUTE_PATTERNS = [
  /^\/$/,
  /^\/search$/,
  /^\/listings\/[^/]+$/,
  /^\/companies$/,
  /^\/companies\/[^/]+$/,
  /^\/categories\/[^/]+$/,
  /^\/destinations\/[^/]+$/,
  /^\/about$/,
  /^\/contact$/,
  /^\/faq$/,
  /^\/help$/,
  /^\/become-a-partner$/,
  /^\/blog$/,
  /^\/blog\/[^/]+$/,
];

export function isPublicGa4Route(pathname) {
  const bare = pathnameWithoutLocale(pathname);
  return PUBLIC_ROUTE_PATTERNS.some((pattern) => pattern.test(bare));
}
