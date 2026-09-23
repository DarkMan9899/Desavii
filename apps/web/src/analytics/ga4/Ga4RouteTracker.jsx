/**
 * Step A7 (brief §15-17, §29-30) — mounted once in `AppRoutes`, next to
 * `ScrollRestoration` (same "single shared owner" precedent). Emits
 * exactly one GA4 `page_view` per genuinely eligible route transition:
 * not on a rerender, not on a query/hash-only change, but — unlike
 * `ScrollRestoration`'s own locale-only exclusion — a locale-prefix
 * change DOES count as a new page here, per brief §17's explicit rule.
 *
 * Also owns syncing `ga4InternalTraffic.js`'s suppression flag from
 * `useAuth()`'s `roles` (brief §30): this is the one place in the GA4
 * module with hook access to auth state, so it is also where
 * `dispatchToGa4.js` (a plain function, no hook access) gets its answer
 * to "is this session internal staff" from.
 */

import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext.jsx';
import {
  isPublicGa4Route,
  extractLocaleFromPathname,
} from './ga4RoutePolicy.js';
import { GA4_CONSENT_STATES, useGa4AnalyticsConsent } from './ga4Consent.js';
import { setGa4InternalTrafficSuppressed } from './ga4InternalTraffic.js';
import { isGa4Configured } from './ga4Config.js';
import { buildGa4PageViewParams } from './ga4Events.js';
import { sendGa4PageView } from './ga4Client.js';

// Mirrors `routes/index.jsx`'s own `ADMIN_AREA_ROLES` (not exported
// there, and this 4-string list is small/stable enough that duplicating
// it here beats widening that file's public surface just for this).
const GA4_INTERNAL_STAFF_ROLES = [
  'ADMIN',
  'SUPER_ADMIN',
  'MODERATOR',
  'SUPPORT',
];

export default function Ga4RouteTracker() {
  const location = useLocation();
  const { roles, isAuthenticated } = useAuth();
  const consentState = useGa4AnalyticsConsent();
  const lastSentPathnameRef = useRef(null);
  const timeoutIdRef = useRef(null);

  const isInternalStaff =
    isAuthenticated &&
    roles.some((role) => GA4_INTERNAL_STAFF_ROLES.includes(role));

  useEffect(() => {
    setGa4InternalTrafficSuppressed(isInternalStaff);
  }, [isInternalStaff]);

  useEffect(() => {
    if (!isGa4Configured()) return undefined;
    if (isInternalStaff) return undefined;
    if (consentState !== GA4_CONSENT_STATES.GRANTED) return undefined;
    if (!isPublicGa4Route(location.pathname)) return undefined;
    if (lastSentPathnameRef.current === location.pathname) return undefined;

    // Deferred one macrotask: this component is a sibling mounted BEFORE
    // `<Routes>` in the tree, so its effects fire before the routed
    // page's own `useSeo`-style title effect on a fresh navigation —
    // reading `document.title` synchronously here would still see the
    // PREVIOUS page's title. A `setTimeout(0)` lets that effect (and any
    // other same-commit passive effects) run first.
    const targetPathname = location.pathname;
    timeoutIdRef.current = setTimeout(() => {
      const params = buildGa4PageViewParams({
        origin: window.location.origin,
        pathname: targetPathname,
        title: document.title,
        locale: extractLocaleFromPathname(targetPathname),
      });
      sendGa4PageView(params);
      lastSentPathnameRef.current = targetPathname;
    }, 0);

    return () => {
      if (timeoutIdRef.current) clearTimeout(timeoutIdRef.current);
    };
  }, [location, consentState, isInternalStaff]);

  return null;
}
