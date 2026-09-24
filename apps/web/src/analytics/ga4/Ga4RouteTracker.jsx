/**
 * Step A7 (brief §15-17, §29-30) — mounted once in `AppRoutes`, next to
 * `ScrollRestoration` (same "single shared owner" precedent). Emits
 * exactly one GA4 `page_view` per genuinely eligible route transition:
 * not on a rerender, not on a query/hash-only change, but — unlike
 * `ScrollRestoration`'s own locale-only exclusion — a locale-prefix
 * change DOES count as a new page here, per brief §17's explicit rule.
 *
 * Also owns syncing `ga4InternalTraffic.js`'s shared gate from
 * `useAuth()` (brief §30, hardened in Step A8.1 — see that module's own
 * header for the auth-bootstrap race this closes): this is the one
 * place in the GA4 module with hook access to auth state, so it is also
 * where `dispatchToGa4.js` (a plain function, no hook access) gets its
 * answer to "is GA4 public tracking currently allowed" from.
 *
 * Step A8.1: the pageview effect below now ALSO waits for
 * `isBootstrapping === false` before ever scheduling a dispatch — it
 * never schedules one during the bootstrap window and later cancels it;
 * there is simply nothing to schedule until auth has resolved, so a
 * genuinely eligible first page load's page_view is delayed until then,
 * never fired-then-corrected.
 */

import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext.jsx';
import {
  isPublicGa4Route,
  extractLocaleFromPathname,
} from './ga4RoutePolicy.js';
import { GA4_CONSENT_STATES, useGa4AnalyticsConsent } from './ga4Consent.js';
import {
  setGa4AuthBootstrapping,
  setGa4InternalTrafficSuppressed,
} from './ga4InternalTraffic.js';
import { isGa4Configured } from './ga4Config.js';
import { buildGa4PageViewParams } from './ga4Events.js';
import { sendGa4PageView } from './ga4Client.js';

const GA4_INTERNAL_STAFF_ROLES = [
  'ADMIN',
  'SUPER_ADMIN',
  'MODERATOR',
  'SUPPORT',
];

export default function Ga4RouteTracker() {
  const location = useLocation();
  const { roles, isAuthenticated, isBootstrapping } = useAuth();
  const consentState = useGa4AnalyticsConsent();
  const lastSentPathnameRef = useRef(null);
  const timeoutIdRef = useRef(null);

  const isInternalStaff =
    isAuthenticated &&
    roles.some((role) => GA4_INTERNAL_STAFF_ROLES.includes(role));

  useEffect(() => {
    setGa4AuthBootstrapping(isBootstrapping);
  }, [isBootstrapping]);

  useEffect(() => {
    setGa4InternalTrafficSuppressed(isInternalStaff);
  }, [isInternalStaff]);

  useEffect(() => {
    if (!isGa4Configured()) return undefined;
    if (isBootstrapping) return undefined;
    if (isInternalStaff) return undefined;
    if (consentState !== GA4_CONSENT_STATES.GRANTED) return undefined;
    if (!isPublicGa4Route(location.pathname)) return undefined;
    if (lastSentPathnameRef.current === location.pathname) return undefined;

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
  }, [location, consentState, isInternalStaff, isBootstrapping]);

  return null;
}
