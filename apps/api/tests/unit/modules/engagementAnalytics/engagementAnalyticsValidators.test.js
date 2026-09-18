import { describe, test, expect } from '@jest/globals';
import { ingestEventsSchema } from '../../../../src/modules/engagementAnalytics/validators/engagementAnalyticsValidators.js';

const EVENT_ID = '4b3f1c9a-2e1d-4a3b-8c2d-1a2b3c4d5e6f';
const SESSION_ID = '5c4f2d0b-3f2e-4b4c-9d3e-2b3c4d5e6f70';

function parse(events) {
  return ingestEventsSchema.safeParse({
    body: { events },
    query: {},
    params: {},
  });
}

describe('ingestEventsSchema', () => {
  test('accepts a valid listing_impression event', () => {
    const result = parse([
      {
        eventId: EVENT_ID,
        eventName: 'listing_impression',
        sessionId: SESSION_ID,
        listingId: 5,
        placement: 'search_results',
      },
    ]);
    expect(result.success).toBe(true);
  });

  test('rejects a server-authoritative event name (favorite_added) — not on the client allowlist', () => {
    const result = parse([
      {
        eventId: EVENT_ID,
        eventName: 'favorite_added',
        sessionId: SESSION_ID,
        listingId: 5,
      },
    ]);
    expect(result.success).toBe(false);
  });

  test('rejects an unknown event name outright', () => {
    const result = parse([
      {
        eventId: EVENT_ID,
        eventName: 'totally_made_up_event',
        sessionId: SESSION_ID,
      },
    ]);
    expect(result.success).toBe(false);
  });

  test('rejects an unknown root field (strict)', () => {
    const result = ingestEventsSchema.safeParse({
      body: { events: [], somethingElse: true },
      query: {},
      params: {},
    });
    expect(result.success).toBe(false);
  });

  test('rejects an unknown event field (strict)', () => {
    const result = parse([
      {
        eventId: EVENT_ID,
        eventName: 'listing_viewed',
        sessionId: SESSION_ID,
        listingId: 5,
        partnerId: 999, // client-supplied partnerId is never accepted
      },
    ]);
    expect(result.success).toBe(false);
  });

  test('rejects a non-UUID-v4 eventId', () => {
    const result = parse([
      {
        eventId: 'not-a-uuid',
        eventName: 'listing_viewed',
        sessionId: SESSION_ID,
        listingId: 5,
      },
    ]);
    expect(result.success).toBe(false);
  });

  test('rejects an empty batch', () => {
    expect(parse([]).success).toBe(false);
  });

  test('rejects a batch over 25 events', () => {
    const events = Array.from({ length: 26 }, () => ({
      eventId: EVENT_ID,
      eventName: 'listing_viewed',
      sessionId: SESSION_ID,
      listingId: 5,
    }));
    expect(parse(events).success).toBe(false);
  });

  test('accepts exactly 25 events', () => {
    const events = Array.from({ length: 25 }, () => ({
      eventId: EVENT_ID,
      eventName: 'listing_viewed',
      sessionId: SESSION_ID,
      listingId: 5,
    }));
    expect(parse(events).success).toBe(true);
  });

  describe('per-event conditional required fields', () => {
    test('listing_impression requires listingId and placement', () => {
      expect(
        parse([
          {
            eventId: EVENT_ID,
            eventName: 'listing_impression',
            sessionId: SESSION_ID,
          },
        ]).success,
      ).toBe(false);
    });

    test('promotion_impression requires listingId, promotionId, and placement', () => {
      expect(
        parse([
          {
            eventId: EVENT_ID,
            eventName: 'promotion_impression',
            sessionId: SESSION_ID,
            listingId: 5,
          },
        ]).success,
      ).toBe(false);
      expect(
        parse([
          {
            eventId: EVENT_ID,
            eventName: 'promotion_impression',
            sessionId: SESSION_ID,
            listingId: 5,
            promotionId: 3,
            placement: 'home_featured',
          },
        ]).success,
      ).toBe(true);
    });

    test('contact_click requires companySlug and contactMethod (company-scoped, not listing-scoped)', () => {
      expect(
        parse([
          {
            eventId: EVENT_ID,
            eventName: 'contact_click',
            sessionId: SESSION_ID,
            companySlug: 'yerevan-boutique-hospitality',
          },
        ]).success,
      ).toBe(false);
      expect(
        parse([
          {
            eventId: EVENT_ID,
            eventName: 'contact_click',
            sessionId: SESSION_ID,
            companySlug: 'yerevan-boutique-hospitality',
            contactMethod: 'phone',
          },
        ]).success,
      ).toBe(true);
    });

    test('company_profile_view requires companySlug, never a raw partnerId', () => {
      expect(
        parse([
          {
            eventId: EVENT_ID,
            eventName: 'company_profile_view',
            sessionId: SESSION_ID,
          },
        ]).success,
      ).toBe(false);
      expect(
        parse([
          {
            eventId: EVENT_ID,
            eventName: 'company_profile_view',
            sessionId: SESSION_ID,
            companySlug: 'yerevan-boutique-hospitality',
          },
        ]).success,
      ).toBe(true);
    });

    test('search_impression requires resultCount', () => {
      expect(
        parse([
          {
            eventId: EVENT_ID,
            eventName: 'search_impression',
            sessionId: SESSION_ID,
          },
        ]).success,
      ).toBe(false);
      expect(
        parse([
          {
            eventId: EVENT_ID,
            eventName: 'search_impression',
            sessionId: SESSION_ID,
            resultCount: 12,
          },
        ]).success,
      ).toBe(true);
    });

    test('search_result_click requires listingId and position', () => {
      expect(
        parse([
          {
            eventId: EVENT_ID,
            eventName: 'search_result_click',
            sessionId: SESSION_ID,
            listingId: 5,
          },
        ]).success,
      ).toBe(false);
      expect(
        parse([
          {
            eventId: EVENT_ID,
            eventName: 'search_result_click',
            sessionId: SESSION_ID,
            listingId: 5,
            position: 2,
          },
        ]).success,
      ).toBe(true);
    });
  });
});
