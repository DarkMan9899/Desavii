/**
 * Engagement Analytics, Step A2 — pure domain helpers with no I/O:
 * semantic-dedup key computation, device/traffic classification, and
 * client-generated-id validation. Kept dependency-free (just
 * `node:crypto`) so these are trivially unit-testable without a
 * database or an Express request.
 */

import { createHash } from 'node:crypto';

/** UUID v4 specifically — Zod's own `.uuid()` accepts any RFC 4122 version. */
export const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuidV4(value) {
  return typeof value === 'string' && UUID_V4_PATTERN.test(value);
}

/**
 * A0.1 §7/§21-locked hash inputs, exactly one per event name that has a
 * semantic dedup rule — every other event name (including every
 * server-authoritative one) has no entry here and always gets a `null`
 * dedup_key. Each function reads only from the SERVER-RESOLVED context
 * object `engagementAnalyticsService` builds, never raw client input, so
 * a client can never manufacture a colliding (or non-colliding) key.
 */
const DEDUP_KEY_INPUT_BUILDERS = Object.freeze({
  listing_impression: (ctx) => [
    'listing_impression',
    ctx.sessionId,
    ctx.listingId,
    ctx.placement,
  ],
  listing_viewed: (ctx) => ['listing_viewed', ctx.sessionId, ctx.listingId],
  promotion_impression: (ctx) => [
    'promotion_impression',
    ctx.sessionId,
    ctx.promotionId,
    ctx.placement,
  ],
  company_profile_view: (ctx) => [
    'company_profile_view',
    ctx.sessionId,
    ctx.partnerId,
  ],
});

/**
 * Returns a 32-byte SHA-256 digest `Buffer` (matching `dedup_key BINARY(32)`
 * exactly) for an event name with a semantic dedup rule, or `null` for one
 * without. A `null`/`undefined` piece of context (e.g. no session_id on a
 * server-authoritative event) makes the key `null` too — dedup is only
 * ever computed for fully-resolved client-observation context.
 */
export function computeDedupKey(eventName, context) {
  const buildInputs = DEDUP_KEY_INPUT_BUILDERS[eventName];
  if (!buildInputs) return null;

  const parts = buildInputs(context);
  if (parts.some((part) => part === null || part === undefined)) return null;

  return createHash('sha256').update(parts.join('|')).digest();
}

const MOBILE_UA_PATTERN = /Mobi|Android(?!.*Tablet)|iPhone|iPod/i;
const TABLET_UA_PATTERN = /iPad|Tablet|Android(?=.*Tablet)/i;

/** Coarse device classification — the raw User-Agent string is never persisted (A0 §17/A0.1 §14), only this closed-set output. */
export function classifyDeviceClass(userAgent) {
  if (typeof userAgent !== 'string' || userAgent.trim().length === 0) {
    return 'other';
  }
  if (TABLET_UA_PATTERN.test(userAgent)) return 'tablet';
  if (MOBILE_UA_PATTERN.test(userAgent)) return 'mobile';
  if (/Mozilla|Windows|Macintosh|Linux|X11/i.test(userAgent)) return 'desktop';
  return 'other';
}

const SEARCH_ENGINE_HOSTS = [
  'google.',
  'bing.',
  'yahoo.',
  'yandex.',
  'duckduckgo.',
];
const SOCIAL_HOSTS = [
  'facebook.',
  'instagram.',
  'twitter.',
  'x.com',
  't.co',
  'tiktok.',
  'linkedin.',
  'youtube.',
  'pinterest.',
];

/**
 * Coarse traffic-source category derived server-side from `Referer` —
 * the raw Referer/path/query-string/UTM value is never persisted (A0
 * §17/A0.1 §14), only this closed-set output. `internalHost` is this
 * deployment's own public web origin (e.g. `desavii.com`), so a Referer
 * pointing back at the app itself is classified `internal`, never
 * `direct` (a real direct visit never sends a Referer header at all).
 */
export function classifyTrafficSource(referer, internalHost) {
  if (typeof referer !== 'string' || referer.trim().length === 0) {
    return 'direct';
  }
  let host;
  try {
    host = new URL(referer).hostname.toLowerCase();
  } catch {
    return 'unknown';
  }
  if (internalHost && host.endsWith(internalHost.toLowerCase())) {
    return 'internal';
  }
  if (SEARCH_ENGINE_HOSTS.some((needle) => host.includes(needle))) {
    return 'search';
  }
  if (SOCIAL_HOSTS.some((needle) => host.includes(needle))) {
    return 'social';
  }
  return 'referral';
}

export default {
  UUID_V4_PATTERN,
  isUuidV4,
  computeDedupKey,
  classifyDeviceClass,
  classifyTrafficSource,
};
