/**
 * Engagement Analytics, Step A1 — small, fixed, app-level domain value
 * sets, none of which warrant their own DB lookup table (same convention
 * `modules/ai/constants/featureCodes.js` already established): adding a
 * new placement/contact method is a code change (a new component/CTA)
 * anyway, so a lookup table would add ceremony without buying anything.
 *
 * Canonical event names themselves are NOT redeclared here — they are
 * imported from `@desavii/types` (`packages/types/src/analyticsEvents.js`),
 * this module's single source of truth for "what happened" event names,
 * shared with the future frontend tracker and any future GA4 adapter.
 *
 * No runtime behavior lives here yet (Step A1 is schema/domain foundation
 * only) — these constants are consumed starting in A2 (ingestion
 * validation) and A4 (aggregation job).
 */

import { ANALYTICS_EVENTS } from '@desavii/types';

export { ANALYTICS_EVENTS };

/**
 * Where a tracked listing card/impression was rendered. Audited against
 * the actual public frontend (A0 audit): Search results and Category page
 * organic results both render through the same `useSearchListingsQuery`/
 * `SearchResultCard` mechanism, so both fall under `SEARCH_RESULTS` — kept
 * to exactly the 4 values A0.1 locked, never expanded speculatively.
 */
export const ENGAGEMENT_PLACEMENTS = Object.freeze({
  SEARCH_RESULTS: 'search_results',
  HOME_FEATURED: 'home_featured',
  CATEGORY_TOP: 'category_top',
  COMPANY_PROFILE: 'company_profile',
});
export const ENGAGEMENT_PLACEMENT_VALUES = Object.freeze(
  Object.values(ENGAGEMENT_PLACEMENTS),
);

/**
 * Coarse device classification, derived server-side from User-Agent at
 * ingestion time in A2 — the raw User-Agent string itself is never stored
 * (A0 §17/A0.1 §14).
 */
export const ENGAGEMENT_DEVICE_CLASSES = Object.freeze({
  DESKTOP: 'desktop',
  MOBILE: 'mobile',
  TABLET: 'tablet',
  OTHER: 'other',
});
export const ENGAGEMENT_DEVICE_CLASS_VALUES = Object.freeze(
  Object.values(ENGAGEMENT_DEVICE_CLASSES),
);

/**
 * The exact set of contact channels the public frontend currently renders
 * — audited against `CompanyProfilePageContent.jsx`'s real contact row
 * (mailto/tel/website) and its `SOCIAL_PLATFORM_LABELS` social-link set
 * (facebook/instagram/x/youtube/tiktok/linkedin). Never the actual phone
 * number/email/URL value (A0 §12) — only this category.
 */
export const ENGAGEMENT_CONTACT_METHODS = Object.freeze({
  PHONE: 'phone',
  EMAIL: 'email',
  WEBSITE: 'website',
  FACEBOOK: 'facebook',
  INSTAGRAM: 'instagram',
  X: 'x',
  YOUTUBE: 'youtube',
  TIKTOK: 'tiktok',
  LINKEDIN: 'linkedin',
});
export const ENGAGEMENT_CONTACT_METHOD_VALUES = Object.freeze(
  Object.values(ENGAGEMENT_CONTACT_METHODS),
);

/** Matches the app's own lowercase locale-code convention (`/hy/`, `/en/`, `/ru/` route prefixes). */
export const ENGAGEMENT_LOCALES = Object.freeze(['hy', 'en', 'ru']);

/** A0.1-locked retention policy constants — no purge worker exists yet (A4). */
export const ENGAGEMENT_RETENTION = Object.freeze({
  RAW_EVENT_RETENTION_DAYS: 90,
  DAILY_AGGREGATE_RETENTION_MONTHS: 24,
});

/** A0.1-locked ingestion contract limits — no ingestion endpoint exists yet (A2). */
export const ENGAGEMENT_INGESTION_LIMITS = Object.freeze({
  MAX_BATCH_SIZE: 25,
  QUERY_TEXT_MAX_LENGTH: 180,
  CATEGORY_CODE_MAX_LENGTH: 60,
  PLACEMENT_MAX_LENGTH: 30,
  CONTACT_METHOD_MAX_LENGTH: 20,
  TRAFFIC_SOURCE_MAX_LENGTH: 20,
});

/**
 * A0.1 §16-locked business-day timezone for the three daily rollup
 * tables' `day` column — never used to reinterpret `analytics_events
 * .occurred_at` itself, which stays UTC forever. Consumed by the future
 * aggregation job (A4) to compute each Yerevan day's UTC instant
 * boundaries; not applied anywhere in A1.
 */
export const ENGAGEMENT_BUSINESS_TIMEZONE = 'Asia/Yerevan';

export default {
  ANALYTICS_EVENTS,
  ENGAGEMENT_PLACEMENTS,
  ENGAGEMENT_PLACEMENT_VALUES,
  ENGAGEMENT_DEVICE_CLASSES,
  ENGAGEMENT_DEVICE_CLASS_VALUES,
  ENGAGEMENT_CONTACT_METHODS,
  ENGAGEMENT_CONTACT_METHOD_VALUES,
  ENGAGEMENT_LOCALES,
  ENGAGEMENT_RETENTION,
  ENGAGEMENT_INGESTION_LIMITS,
  ENGAGEMENT_BUSINESS_TIMEZONE,
};
