/**
 * Where an auth entry point sends someone — one source of truth shared by
 * `LoginForm`, `RegisterForm`, the `RedirectIfAuthenticated` guard and the
 * Partner "Start" CTA, so a form and the guard can never disagree.
 *
 * Role-aware home (no explicit return target): the admin-area roles land
 * on `/admin`; a MANAGER on `/manager`; a MARKETING user on `/marketing`;
 * a member of a partner org on `/partner` (unless they last chose the
 * customer workspace); everyone else on `/account`. Roles and partnerships
 * are only read here, never granted — every workspace keeps its own guard.
 */

import { SUPPORTED_LOCALES } from '../translations/supportedLocales.js';
import { getLastWorkspace } from './workspacePreference.js';

// The roles whose workspace is `/admin` — also what the admin route group
// requires (`routes/index.jsx`), so the two can never drift apart.
export const ADMIN_AREA_ROLES = [
  'ADMIN',
  'SUPER_ADMIN',
  'MODERATOR',
  'SUPPORT',
];

/**
 * A `?redirect=` value is used only when it is a path inside this app: a
 * single leading slash, a supported locale as its first segment, and no
 * backslash or control character. Anything else — `//other.site`,
 * `https://…`, `/\other.site`, `javascript:` — is ignored, so a crafted
 * link cannot bounce a freshly signed-in user to another origin.
 */
export function getSafeRedirectPath(raw) {
  if (typeof raw !== 'string') return null;
  if (!/^\/[^/\\]/.test(raw)) return null;
  // eslint-disable-next-line no-control-regex -- rejecting control characters is the point
  if (/[\\\u0000-\u001f\u007f]/.test(raw)) return null;
  const [, firstSegment] = raw.split(/[/?#]/);
  return SUPPORTED_LOCALES.includes(firstSegment) ? raw : null;
}

export function resolveHomePath({ roles = [], partnerships = [], locale }) {
  if (roles.some((role) => ADMIN_AREA_ROLES.includes(role))) {
    return `/${locale}/admin`;
  }
  if (roles.includes('MANAGER')) return `/${locale}/manager`;
  if (roles.includes('MARKETING')) return `/${locale}/marketing`;
  if (partnerships.length > 0 && getLastWorkspace() !== 'customer') {
    return `/${locale}/partner`;
  }
  return `/${locale}/account`;
}

/** After signing in or up: a safe `?redirect=` wins, else the role home. */
export function resolvePostAuthPath({ redirect, roles, partnerships, locale }) {
  return (
    getSafeRedirectPath(redirect) ??
    resolveHomePath({ roles, partnerships, locale })
  );
}

export function partnerApplicationPath(locale) {
  return `/${locale}/partner/apply`;
}

/**
 * The Partner "Start" CTA: a visitor creates their partner account first;
 * a signed-in member of a partner org goes to their workspace; any other
 * signed-in user applies with the account they already have (the
 * application page itself resumes a draft or forwards an approved one).
 */
export function resolvePartnerStartPath({
  isAuthenticated,
  partnerships = [],
  locale,
}) {
  if (!isAuthenticated) return `/${locale}/partner/register`;
  if (partnerships.length > 0) return `/${locale}/partner`;
  return partnerApplicationPath(locale);
}
