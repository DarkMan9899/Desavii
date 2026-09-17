/**
 * Phase 5: the full Partner Listing Wizard write path — create, then
 * per-step PATCH (attribute values, pricing, policy values), then publish-
 * readiness gating (required attributes/policies/bookable-unit), mirroring
 * how the real wizard saves progressively rather than in one giant submit
 * (docs/plan "Phase 5 — Partner Listing Creation": "the wizard creates the
 * listing on Step 2 submit... every subsequent step's Next calls
 * updateListing against that real id").
 */

import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import { up } from '../../../src/infrastructure/database/migrate.js';
import { seedAll } from '../../../src/infrastructure/database/seeds/index.js';
import app from '../../../src/app.js';
import {
  getMysqlPool,
  closeMysqlPool,
} from '../../../src/infrastructure/database/mysqlPool.js';
import { closeRedisConnection } from '../../../src/infrastructure/cache/redisClient.js';
import { resetRateLimits } from '../helpers/resetRateLimits.js';
import { DEV_CREDENTIALS } from '../../../src/infrastructure/database/seeds/005_dev_accounts.js';

const ONE_PX_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

let pool;
let vendor;
let partnerId;
let languageId;
let villasCategoryId;

async function login(email, password) {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ email, password });
  return { accessToken: res.body.data.access_token };
}

beforeAll(async () => {
  await up();
  await seedAll();
  await resetRateLimits();
  pool = getMysqlPool();

  vendor = await login(
    DEV_CREDENTIALS.vendor.email,
    DEV_CREDENTIALS.vendor.password,
  );

  const [[partnerRow]] = await pool.query(
    "SELECT id FROM partners WHERE slug = 'yerevan-boutique-hospitality'",
  );
  partnerId = partnerRow.id;
  const [[language]] = await pool.query(
    "SELECT id FROM languages WHERE code = 'en'",
  );
  languageId = language.id;
  const [[villas]] = await pool.query(
    "SELECT id FROM listing_categories WHERE slug = 'villas'",
  );
  villasCategoryId = villas.id;
}, 60_000);

afterAll(async () => {
  await closeMysqlPool();
  await closeRedisConnection();
});

describe('Partner Listing Wizard — full write flow', () => {
  test('create -> attributes/pricing/policies (separate PATCHes) -> gated publish -> satisfied publish', async () => {
    // Step 1-2: Category + Basic Info (the wizard's real create-on-step-2 moment)
    const createRes = await request(app)
      .post('/api/v1/listings')
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({
        partnerId,
        listingType: 'PROPERTY',
        translations: [
          { languageId, title: `Wizard Flow Villa ${Date.now()}` },
        ],
        categoryIds: [villasCategoryId],
      });
    expect(createRes.status).toBe(201);
    const listingId = createRes.body.data.id;
    expect(createRes.body.data.status).toBe('DRAFT');

    // Publish attempt before anything else is set — every gate should fire.
    const earlyPublish = await request(app)
      .post(`/api/v1/listings/${listingId}/publish`)
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({ publicationPeriodDays: 90 });
    expect(earlyPublish.status).toBe(422);
    const earlyIssues = earlyPublish.body.error.details.map((d) => d.issue);
    expect(earlyIssues).toContain('AT_LEAST_ONE_IMAGE_REQUIRED');
    expect(earlyIssues).toContain('COMPLETE_LOCATION_REQUIRED');
    expect(earlyIssues).toContain('REQUIRED_POLICY_MISSING');
    expect(earlyIssues).toContain('AT_LEAST_ONE_BOOKABLE_UNIT_REQUIRED');

    // Step 3: Location
    const locationRes = await request(app)
      .patch(`/api/v1/listings/${listingId}`)
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({ location: { latitude: 40.18, longitude: 44.5 } });
    expect(locationRes.status).toBe(200);

    // Step 4: Dynamic Attributes — a separate PATCH, no categoryIds resent,
    // proving updateListing falls back to the listing's own stored category.
    const attributesRes = await request(app)
      .patch(`/api/v1/listings/${listingId}`)
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({
        attributeValues: [
          { code: 'bedrooms', value: 3 },
          { code: 'bathrooms', value: 2 },
          { code: 'beds', value: 4 },
          { code: 'max_guests', value: 6 },
        ],
      });
    expect(attributesRes.status).toBe(200);
    expect(attributesRes.body.data.attribute_values).toEqual(
      expect.arrayContaining([
        { code: 'bedrooms', value: 3 },
        { code: 'bathrooms', value: 2 },
      ]),
    );

    // Reject an out-of-range value.
    const invalidAttrRes = await request(app)
      .patch(`/api/v1/listings/${listingId}`)
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({ attributeValues: [{ code: 'bedrooms', value: 999 }] });
    expect(invalidAttrRes.status).toBe(422);
    expect(invalidAttrRes.body.error.details[0].issue).toBe('ABOVE_MAXIMUM');

    // Reject an unknown attribute code.
    const unknownAttrRes = await request(app)
      .patch(`/api/v1/listings/${listingId}`)
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({ attributeValues: [{ code: 'not_a_real_attribute', value: 1 }] });
    expect(unknownAttrRes.status).toBe(422);
    expect(unknownAttrRes.body.error.details[0].issue).toBe(
      'UNKNOWN_ATTRIBUTE_CODE',
    );

    // Step 7: Pricing
    const pricingRes = await request(app)
      .patch(`/api/v1/listings/${listingId}`)
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({
        pricing: { modelCode: 'PER_NIGHT', amount: 150.5, currencyCode: 'AMD' },
      });
    expect(pricingRes.status).toBe(200);
    expect(pricingRes.body.data.pricing).toEqual({
      pricing_model: 'PER_NIGHT',
      amount: 150.5,
      currency: 'AMD',
    });

    // Unknown pricing model is rejected.
    const invalidPricingRes = await request(app)
      .patch(`/api/v1/listings/${listingId}`)
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({
        pricing: {
          modelCode: 'PER_LIGHT_YEAR',
          amount: 1,
          currencyCode: 'AMD',
        },
      });
    expect(invalidPricingRes.status).toBe(422);
    expect(invalidPricingRes.body.error.details[0].issue).toBe(
      'UNKNOWN_PRICING_MODEL',
    );

    // Publish should still fail — policies + media + bookable unit missing.
    const midPublish = await request(app)
      .post(`/api/v1/listings/${listingId}/publish`)
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({ publicationPeriodDays: 90 });
    expect(midPublish.status).toBe(422);
    const midIssues = midPublish.body.error.details.map((d) => d.issue);
    expect(midIssues).toContain('REQUIRED_POLICY_MISSING');
    expect(midIssues).not.toContain('COMPLETE_LOCATION_REQUIRED');

    // Step 9: Policies
    const policiesRes = await request(app)
      .patch(`/api/v1/listings/${listingId}`)
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({
        policyValues: [
          { code: 'cancellation_policy', value: 'FLEXIBLE' },
          { code: 'check_in_time', value: '14:00' },
          { code: 'check_out_time', value: '11:00' },
        ],
      });
    expect(policiesRes.status).toBe(200);

    // Unknown ENUM option code is rejected.
    const invalidPolicyRes = await request(app)
      .patch(`/api/v1/listings/${listingId}`)
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({
        policyValues: [{ code: 'cancellation_policy', value: 'NOT_A_POLICY' }],
      });
    expect(invalidPolicyRes.status).toBe(422);
    expect(invalidPolicyRes.body.error.details[0].issue).toBe(
      'UNKNOWN_OPTION_CODE',
    );

    // Step 6: Gallery
    const mediaRes = await request(app)
      .post(`/api/v1/listings/${listingId}/media`)
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .set('Content-Type', 'image/png')
      .send(ONE_PX_PNG);
    expect(mediaRes.status).toBe(201);

    // Publish should still fail — only the bookable-unit gate remains.
    const lastGatedPublish = await request(app)
      .post(`/api/v1/listings/${listingId}/publish`)
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({ publicationPeriodDays: 90 });
    expect(lastGatedPublish.status).toBe(422);
    expect(lastGatedPublish.body.error.details).toEqual([
      { field: 'bookableUnits', issue: 'AT_LEAST_ONE_BOOKABLE_UNIT_REQUIRED' },
    ]);

    // Step 8: Availability — register a bookable unit via the existing,
    // unmodified Availability module.
    const unitRes = await request(app)
      .post('/api/v1/availability/units')
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({ listingId, bookableUnitType: 'PROPERTY_UNIT', capacity: 1 });
    expect(unitRes.status).toBe(201);

    // Step 8 (booking rules) — additive, not part of the readiness gate.
    const bookingRulesRes = await request(app)
      .patch(`/api/v1/listings/${listingId}`)
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({
        bookingRules: {
          minimumStayNights: 2,
          maximumStayNights: 14,
          advanceBookingMinHours: 24,
        },
      });
    expect(bookingRulesRes.status).toBe(200);
    expect(bookingRulesRes.body.data.booking_rules).toEqual({
      minimum_stay_nights: 2,
      maximum_stay_nights: 14,
      advance_booking_min_hours: 24,
      advance_booking_max_days: null,
    });

    // Step 10: Review & Publish — now fully satisfied.
    const finalPublish = await request(app)
      .post(`/api/v1/listings/${listingId}/publish`)
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({ publicationPeriodDays: 90 });
    expect(finalPublish.status).toBe(200);
    expect(finalPublish.body.data.status).toBe('PUBLISHED');

    // Round-trips correctly via GET and appears in GET /search.
    const getRes = await request(app).get(`/api/v1/listings/${listingId}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.data.status).toBe('PUBLISHED');
    expect(getRes.body.data.attribute_values).toEqual(
      expect.arrayContaining([{ code: 'bedrooms', value: 3 }]),
    );

    const searchRes = await request(app).get(
      `/api/v1/search?attr_bedrooms_min=3&categoryId=${villasCategoryId}`,
    );
    expect(searchRes.status).toBe(200);
    expect(searchRes.body.data.map((r) => r.id)).toContain(listingId);
  });
});
