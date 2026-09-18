/**
 * Engagement Analytics, Step A1: pure domain-constant coverage. Verifies
 * this module reuses (never redeclares/aliases) the canonical event
 * contract from `@desavii/types`, that all 5 events this step adds
 * (`contact_click`, `company_profile_view`, `company_listing_click`,
 * `search_impression`, `search_result_click`) are present alongside the
 * 15 pre-existing ones with no A0.1-forbidden aliases
 * (`listing_view`/`favorite_add`/`favorite_remove`/`top_impression`/
 * `top_click`) introduced anywhere, and that the bounded value sets this
 * step locks (placements/device classes/contact methods/locales/
 * retention/ingestion limits) match A0.1's exact decisions.
 */

import { describe, test, expect } from '@jest/globals';
import {
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
} from '../../../../../src/modules/engagementAnalytics/constants/engagementAnalyticsConstants.js';

const LOCKED_CANONICAL_EVENT_NAMES = [
  'search_performed',
  'filter_applied',
  'listing_impression',
  'listing_viewed',
  'favorite_added',
  'favorite_removed',
  'booking_started',
  'booking_request_submitted',
  'booking_confirmed',
  'booking_rejected',
  'booking_cancelled',
  'promotion_impression',
  'promotion_clicked',
  'contact_click',
  'company_profile_view',
  'company_listing_click',
  'search_impression',
  'search_result_click',
  'vendor_registered',
  'listing_created',
];

const FORBIDDEN_ALIASES = [
  'listing_view',
  'favorite_add',
  'favorite_remove',
  'top_impression',
  'top_click',
];

describe('ANALYTICS_EVENTS (reused from @desavii/types)', () => {
  test('contains exactly the 20 A0.1-locked canonical event names, no more, no fewer', () => {
    const actualNames = Object.values(ANALYTICS_EVENTS).sort();
    expect(actualNames).toEqual([...LOCKED_CANONICAL_EVENT_NAMES].sort());
  });

  test('the 5 events Step A1 adds are present', () => {
    expect(ANALYTICS_EVENTS.CONTACT_CLICK).toBe('contact_click');
    expect(ANALYTICS_EVENTS.COMPANY_PROFILE_VIEW).toBe('company_profile_view');
    expect(ANALYTICS_EVENTS.COMPANY_LISTING_CLICK).toBe(
      'company_listing_click',
    );
    expect(ANALYTICS_EVENTS.SEARCH_IMPRESSION).toBe('search_impression');
    expect(ANALYTICS_EVENTS.SEARCH_RESULT_CLICK).toBe('search_result_click');
  });

  test('the 15 pre-existing events are preserved unmodified', () => {
    expect(ANALYTICS_EVENTS.LISTING_IMPRESSION).toBe('listing_impression');
    expect(ANALYTICS_EVENTS.LISTING_VIEWED).toBe('listing_viewed');
    expect(ANALYTICS_EVENTS.FAVORITE_ADDED).toBe('favorite_added');
    expect(ANALYTICS_EVENTS.FAVORITE_REMOVED).toBe('favorite_removed');
    expect(ANALYTICS_EVENTS.BOOKING_STARTED).toBe('booking_started');
    expect(ANALYTICS_EVENTS.BOOKING_REQUEST_SUBMITTED).toBe(
      'booking_request_submitted',
    );
    expect(ANALYTICS_EVENTS.BOOKING_CONFIRMED).toBe('booking_confirmed');
    expect(ANALYTICS_EVENTS.PROMOTION_IMPRESSION).toBe('promotion_impression');
    expect(ANALYTICS_EVENTS.PROMOTION_CLICKED).toBe('promotion_clicked');
  });

  test('no A0.1-forbidden alias event name was introduced', () => {
    const actualNames = new Set(Object.values(ANALYTICS_EVENTS));
    FORBIDDEN_ALIASES.forEach((alias) => {
      expect(actualNames.has(alias)).toBe(false);
    });
  });

  test('the object is frozen (immutable contract)', () => {
    expect(Object.isFrozen(ANALYTICS_EVENTS)).toBe(true);
  });
});

describe('ENGAGEMENT_PLACEMENTS', () => {
  test('is bounded to exactly the 4 A0.1-locked placement values', () => {
    expect([...ENGAGEMENT_PLACEMENT_VALUES].sort()).toEqual(
      [
        'search_results',
        'home_featured',
        'category_top',
        'company_profile',
      ].sort(),
    );
  });

  test('is frozen', () => {
    expect(Object.isFrozen(ENGAGEMENT_PLACEMENTS)).toBe(true);
  });
});

describe('ENGAGEMENT_DEVICE_CLASSES', () => {
  test('is bounded to desktop/mobile/tablet/other', () => {
    expect([...ENGAGEMENT_DEVICE_CLASS_VALUES].sort()).toEqual(
      ['desktop', 'mobile', 'tablet', 'other'].sort(),
    );
  });

  test('is frozen', () => {
    expect(Object.isFrozen(ENGAGEMENT_DEVICE_CLASSES)).toBe(true);
  });
});

describe('ENGAGEMENT_CONTACT_METHODS', () => {
  test('is bounded to the real public contact surfaces (phone/email/website + 6 social platforms)', () => {
    expect([...ENGAGEMENT_CONTACT_METHOD_VALUES].sort()).toEqual(
      [
        'phone',
        'email',
        'website',
        'facebook',
        'instagram',
        'x',
        'youtube',
        'tiktok',
        'linkedin',
      ].sort(),
    );
  });

  test('never includes an actual contact value, only category names', () => {
    ENGAGEMENT_CONTACT_METHOD_VALUES.forEach((value) => {
      expect(value).not.toMatch(/@/);
      expect(value).not.toMatch(/^\+?\d/);
      expect(value).not.toMatch(/^https?:\/\//);
    });
  });

  test('is frozen', () => {
    expect(Object.isFrozen(ENGAGEMENT_CONTACT_METHODS)).toBe(true);
  });
});

describe('ENGAGEMENT_LOCALES', () => {
  test('is exactly hy/en/ru, matching the app route-prefix casing', () => {
    expect(ENGAGEMENT_LOCALES).toEqual(['hy', 'en', 'ru']);
  });
});

describe('ENGAGEMENT_RETENTION', () => {
  test('matches the A0.1-locked policy: 90 days raw, 24 months aggregate', () => {
    expect(ENGAGEMENT_RETENTION.RAW_EVENT_RETENTION_DAYS).toBe(90);
    expect(ENGAGEMENT_RETENTION.DAILY_AGGREGATE_RETENTION_MONTHS).toBe(24);
  });
});

describe('ENGAGEMENT_INGESTION_LIMITS', () => {
  test('matches the A0.1-locked ingestion contract limits', () => {
    expect(ENGAGEMENT_INGESTION_LIMITS.MAX_BATCH_SIZE).toBe(25);
    expect(ENGAGEMENT_INGESTION_LIMITS.QUERY_TEXT_MAX_LENGTH).toBe(180);
  });
});

describe('ENGAGEMENT_BUSINESS_TIMEZONE', () => {
  test('is Asia/Yerevan, never UTC, for the daily-bucket business day', () => {
    expect(ENGAGEMENT_BUSINESS_TIMEZONE).toBe('Asia/Yerevan');
  });
});
