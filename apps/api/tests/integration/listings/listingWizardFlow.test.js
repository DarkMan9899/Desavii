/**
 * Phase 5: the full Partner Listing Wizard write path — create, then
 * per-step PATCH (attribute values, pricing, policy values), then publish-
 * readiness gating (required attributes/policies/bookable-unit), mirroring
 * how the real wizard saves progressively rather than in one giant submit
 * (docs/plan "Phase 5 — Partner Listing Creation": "the wizard creates the
 * listing on Step 2 submit... every subsequent step's Next calls
 * updateListing against that real id").
 *
 * Step M2B: the wizard's final "Review & Publish" step is now
 * submit-for-review, not a direct Partner publish — `submitForReview`
 * reuses `#checkPublishReadiness` verbatim, so every readiness-gate
 * assertion below still holds unchanged against that endpoint. Reaching
 * PUBLISHED itself now needs a Moderator's approval on top.
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
let moderator;
let partnerId;
let languageId;
let villasCategoryId;
let hotelsCategoryId;
let toursCategoryId;
let carRentalsCategoryId;

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

  // Step M2B: the wizard's final step is now submit-for-review ->
  // Moderator approve, never a direct Partner publish — same
  // MODERATOR-seeding convention `adminListingModeration.test.js`
  // established (no dev account is seeded with MODERATOR, so it's
  // assigned directly to a throwaway registered user).
  const registerRes = await request(app).post('/api/v1/auth/register').send({
    email: 'wizard.moderator@example.com',
    password: 'WizardModerator!2024',
    firstName: 'Wizard',
    lastName: 'Moderator',
  });
  await pool.query(
    `INSERT IGNORE INTO role_user (role_id, user_id)
     SELECT id, ? FROM roles WHERE code = 'MODERATOR'`,
    [registerRes.body.data.user.id],
  );
  moderator = await login(
    'wizard.moderator@example.com',
    'WizardModerator!2024',
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
  // Step L4 (brief §20) — representative categories for the dynamic
  // attribute bounds the brief names explicitly (HOTEL total_rooms,
  // TOUR duration_minutes, CAR_RENTAL seats/doors/luggage_capacity).
  const [[hotels]] = await pool.query(
    "SELECT id FROM listing_categories WHERE slug = 'hotels'",
  );
  hotelsCategoryId = hotels.id;
  const [[tours]] = await pool.query(
    "SELECT id FROM listing_categories WHERE slug = 'tours'",
  );
  toursCategoryId = tours.id;
  const [[carRentals]] = await pool.query(
    "SELECT id FROM listing_categories WHERE slug = 'car-rentals'",
  );
  carRentalsCategoryId = carRentals.id;
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

    // Submit-for-review attempt before anything else is set — every gate
    // should fire (reuses the same `#checkPublishReadiness` a direct
    // publish would).
    const earlyPublish = await request(app)
      .post(`/api/v1/listings/${listingId}/submit-for-review`)
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

    // Submit-for-review should still fail — policies + media + bookable
    // unit missing.
    const midPublish = await request(app)
      .post(`/api/v1/listings/${listingId}/submit-for-review`)
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

    // Submit-for-review should still fail — only the bookable-unit gate
    // remains.
    const lastGatedPublish = await request(app)
      .post(`/api/v1/listings/${listingId}/submit-for-review`)
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

    // Step 10: Review & Publish — now fully satisfied. Submit for review
    // (readiness now passes), then a Moderator approves it — the only
    // path to PUBLISHED left after Step M2B closed the direct-publish
    // bypass.
    const finalSubmit = await request(app)
      .post(`/api/v1/listings/${listingId}/submit-for-review`)
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({ publicationPeriodDays: 90 });
    expect(finalSubmit.status).toBe(200);
    expect(finalSubmit.body.data.status).toBe('PENDING_REVIEW');

    const finalPublish = await request(app)
      .patch(`/api/v1/listings/admin/${listingId}/moderation-status`)
      .set('Authorization', `Bearer ${moderator.accessToken}`)
      .send({ status: 'APPROVED' });
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

// Step L4 — numeric field validation hardening. Every case here proves
// an invalid payload is rejected by the real HTTP route (never just the
// in-process Zod schema), and that a rejected PATCH never partially
// writes — the listing's previously-stored valid value is unchanged
// afterward.
describe('Step L4 — numeric field validation hardening', () => {
  async function createDraftListing(
    categoryId = villasCategoryId,
    listingType = 'PROPERTY',
  ) {
    const res = await request(app)
      .post('/api/v1/listings')
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({
        partnerId,
        listingType,
        translations: [
          { languageId, title: `L4 Numeric ${Date.now()}-${Math.random()}` },
        ],
        categoryIds: [categoryId],
      });
    return res.body.data.id;
  }

  describe('booking rules', () => {
    test('0 nights is rejected (positive-required)', async () => {
      const listingId = await createDraftListing();
      const res = await request(app)
        .patch(`/api/v1/listings/${listingId}`)
        .set('Authorization', `Bearer ${vendor.accessToken}`)
        .send({ bookingRules: { minimumStayNights: 0 } });
      expect(res.status).toBe(422);
    });

    test('-1 nights is rejected', async () => {
      const listingId = await createDraftListing();
      const res = await request(app)
        .patch(`/api/v1/listings/${listingId}`)
        .set('Authorization', `Bearer ${vendor.accessToken}`)
        .send({ bookingRules: { minimumStayNights: -1 } });
      expect(res.status).toBe(422);
    });

    test('1 night is accepted', async () => {
      const listingId = await createDraftListing();
      const res = await request(app)
        .patch(`/api/v1/listings/${listingId}`)
        .set('Authorization', `Bearer ${vendor.accessToken}`)
        .send({ bookingRules: { minimumStayNights: 1 } });
      expect(res.status).toBe(200);
      expect(res.body.data.booking_rules.minimum_stay_nights).toBe(1);
    });

    test('a decimal night count is rejected', async () => {
      const listingId = await createDraftListing();
      const res = await request(app)
        .patch(`/api/v1/listings/${listingId}`)
        .set('Authorization', `Bearer ${vendor.accessToken}`)
        .send({ bookingRules: { minimumStayNights: 1.5 } });
      expect(res.status).toBe(422);
    });

    test('a value beyond the SMALLINT UNSIGNED column ceiling is rejected with a clean 422, not a raw DB error', async () => {
      const listingId = await createDraftListing();
      const res = await request(app)
        .patch(`/api/v1/listings/${listingId}`)
        .set('Authorization', `Bearer ${vendor.accessToken}`)
        .send({ bookingRules: { minimumStayNights: 70000 } });
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
    });

    test('advanceBookingMinHours accepts 0 (nonnegative, not positive-required)', async () => {
      const listingId = await createDraftListing();
      const res = await request(app)
        .patch(`/api/v1/listings/${listingId}`)
        .set('Authorization', `Bearer ${vendor.accessToken}`)
        .send({ bookingRules: { advanceBookingMinHours: 0 } });
      expect(res.status).toBe(200);
      expect(res.body.data.booking_rules.advance_booking_min_hours).toBe(0);
    });

    test('advanceBookingMaxDays rejects a negative value', async () => {
      const listingId = await createDraftListing();
      const res = await request(app)
        .patch(`/api/v1/listings/${listingId}`)
        .set('Authorization', `Bearer ${vendor.accessToken}`)
        .send({ bookingRules: { advanceBookingMaxDays: -1 } });
      expect(res.status).toBe(422);
    });

    test('minimumStayNights > maximumStayNights is rejected (cross-field)', async () => {
      const listingId = await createDraftListing();
      const res = await request(app)
        .patch(`/api/v1/listings/${listingId}`)
        .set('Authorization', `Bearer ${vendor.accessToken}`)
        .send({
          bookingRules: { minimumStayNights: 6, maximumStayNights: 5 },
        });
      expect(res.status).toBe(422);
    });

    test('minimumStayNights === maximumStayNights is accepted', async () => {
      const listingId = await createDraftListing();
      const res = await request(app)
        .patch(`/api/v1/listings/${listingId}`)
        .set('Authorization', `Bearer ${vendor.accessToken}`)
        .send({
          bookingRules: { minimumStayNights: 5, maximumStayNights: 5 },
        });
      expect(res.status).toBe(200);
    });

    test('a rejected PATCH never partially writes — the previous valid value survives', async () => {
      const listingId = await createDraftListing();
      const first = await request(app)
        .patch(`/api/v1/listings/${listingId}`)
        .set('Authorization', `Bearer ${vendor.accessToken}`)
        .send({ bookingRules: { minimumStayNights: 3 } });
      expect(first.status).toBe(200);

      const rejected = await request(app)
        .patch(`/api/v1/listings/${listingId}`)
        .set('Authorization', `Bearer ${vendor.accessToken}`)
        .send({ bookingRules: { minimumStayNights: -1 } });
      expect(rejected.status).toBe(422);

      const check = await request(app)
        .get(`/api/v1/listings/${listingId}`)
        .set('Authorization', `Bearer ${vendor.accessToken}`);
      expect(check.body.data.booking_rules.minimum_stay_nights).toBe(3);
    });
  });

  describe('pricing amount', () => {
    test('a negative amount is rejected', async () => {
      const listingId = await createDraftListing();
      const res = await request(app)
        .patch(`/api/v1/listings/${listingId}`)
        .set('Authorization', `Bearer ${vendor.accessToken}`)
        .send({
          pricing: { modelCode: 'PER_NIGHT', amount: -1, currencyCode: 'AMD' },
        });
      expect(res.status).toBe(422);
    });

    test('zero is accepted (existing nonnegative contract, unchanged by L4)', async () => {
      const listingId = await createDraftListing();
      const res = await request(app)
        .patch(`/api/v1/listings/${listingId}`)
        .set('Authorization', `Bearer ${vendor.accessToken}`)
        .send({
          pricing: { modelCode: 'PER_NIGHT', amount: 0, currencyCode: 'AMD' },
        });
      expect(res.status).toBe(200);
    });

    test('an amount with more than 2 decimal places is rejected', async () => {
      const listingId = await createDraftListing();
      const res = await request(app)
        .patch(`/api/v1/listings/${listingId}`)
        .set('Authorization', `Bearer ${vendor.accessToken}`)
        .send({
          pricing: {
            modelCode: 'PER_NIGHT',
            amount: 19.999,
            currencyCode: 'AMD',
          },
        });
      expect(res.status).toBe(422);
    });

    test('an amount beyond the DECIMAL(12,2) column ceiling is rejected', async () => {
      const listingId = await createDraftListing();
      const res = await request(app)
        .patch(`/api/v1/listings/${listingId}`)
        .set('Authorization', `Bearer ${vendor.accessToken}`)
        .send({
          pricing: {
            modelCode: 'PER_NIGHT',
            amount: 99999999999.99,
            currencyCode: 'AMD',
          },
        });
      expect(res.status).toBe(422);
    });

    test('a genuinely NaN-producing payload is rejected', async () => {
      const listingId = await createDraftListing();
      const res = await request(app)
        .patch(`/api/v1/listings/${listingId}`)
        .set('Authorization', `Bearer ${vendor.accessToken}`)
        .send({
          pricing: {
            modelCode: 'PER_NIGHT',
            amount: 'not-a-number',
            currencyCode: 'AMD',
          },
        });
      expect(res.status).toBe(422);
    });
  });

  describe('dynamic attribute values', () => {
    test('a non-numeric string value for an INTEGER attribute is rejected, not silently stored as the raw string', async () => {
      const listingId = await createDraftListing();
      const res = await request(app)
        .patch(`/api/v1/listings/${listingId}`)
        .set('Authorization', `Bearer ${vendor.accessToken}`)
        .send({
          attributeValues: [{ code: 'bedrooms', value: 'not-a-number' }],
        });
      expect(res.status).toBe(422);
      expect(res.body.error.details[0].issue).toBe('INVALID_NUMBER');
    });

    test('a fractional value for an INTEGER attribute is rejected', async () => {
      const listingId = await createDraftListing();
      const res = await request(app)
        .patch(`/api/v1/listings/${listingId}`)
        .set('Authorization', `Bearer ${vendor.accessToken}`)
        .send({ attributeValues: [{ code: 'bedrooms', value: 2.5 }] });
      expect(res.status).toBe(422);
      expect(res.body.error.details[0].issue).toBe('MUST_BE_INTEGER');
    });

    test('a fractional value for a DECIMAL attribute (bathrooms) is accepted', async () => {
      const listingId = await createDraftListing();
      const res = await request(app)
        .patch(`/api/v1/listings/${listingId}`)
        .set('Authorization', `Bearer ${vendor.accessToken}`)
        .send({ attributeValues: [{ code: 'bathrooms', value: 1.5 }] });
      expect(res.status).toBe(200);
      expect(res.body.data.attribute_values).toEqual(
        expect.arrayContaining([{ code: 'bathrooms', value: 1.5 }]),
      );
    });

    test('a rejected attribute PATCH never partially writes — the previous valid value survives', async () => {
      const listingId = await createDraftListing();
      const first = await request(app)
        .patch(`/api/v1/listings/${listingId}`)
        .set('Authorization', `Bearer ${vendor.accessToken}`)
        .send({ attributeValues: [{ code: 'bedrooms', value: 2 }] });
      expect(first.status).toBe(200);

      const rejected = await request(app)
        .patch(`/api/v1/listings/${listingId}`)
        .set('Authorization', `Bearer ${vendor.accessToken}`)
        .send({ attributeValues: [{ code: 'bedrooms', value: 2.5 }] });
      expect(rejected.status).toBe(422);

      const check = await request(app)
        .get(`/api/v1/listings/${listingId}`)
        .set('Authorization', `Bearer ${vendor.accessToken}`);
      expect(check.body.data.attribute_values).toEqual(
        expect.arrayContaining([{ code: 'bedrooms', value: 2 }]),
      );
    });
  });

  // Step L4 (brief §20) — representative category-specific bounds,
  // proven against the real, currently-seeded metadata values (not a
  // duplicated/re-invented copy of them) via the real HTTP route, never
  // just the in-process validator.
  describe('category-specific attribute bounds (brief §20)', () => {
    test('HOTEL total_rooms = 0 is rejected (seeded min: 1)', async () => {
      const listingId = await createDraftListing(hotelsCategoryId, 'HOTEL');
      const res = await request(app)
        .patch(`/api/v1/listings/${listingId}`)
        .set('Authorization', `Bearer ${vendor.accessToken}`)
        .send({ attributeValues: [{ code: 'total_rooms', value: 0 }] });
      expect(res.status).toBe(422);
      expect(res.body.error.details[0].issue).toBe('BELOW_MINIMUM');
    });

    test('HOTEL total_rooms = 1000 is rejected (seeded max: 999)', async () => {
      const listingId = await createDraftListing(hotelsCategoryId, 'HOTEL');
      const res = await request(app)
        .patch(`/api/v1/listings/${listingId}`)
        .set('Authorization', `Bearer ${vendor.accessToken}`)
        .send({ attributeValues: [{ code: 'total_rooms', value: 1000 }] });
      expect(res.status).toBe(422);
      expect(res.body.error.details[0].issue).toBe('ABOVE_MAXIMUM');
    });

    test('TOUR duration_minutes = 14 is rejected (seeded min: 15)', async () => {
      const listingId = await createDraftListing(toursCategoryId, 'TOUR');
      const res = await request(app)
        .patch(`/api/v1/listings/${listingId}`)
        .set('Authorization', `Bearer ${vendor.accessToken}`)
        .send({ attributeValues: [{ code: 'duration_minutes', value: 14 }] });
      expect(res.status).toBe(422);
      expect(res.body.error.details[0].issue).toBe('BELOW_MINIMUM');
    });

    test('TOUR duration_minutes = 721 is rejected (seeded max: 720)', async () => {
      const listingId = await createDraftListing(toursCategoryId, 'TOUR');
      const res = await request(app)
        .patch(`/api/v1/listings/${listingId}`)
        .set('Authorization', `Bearer ${vendor.accessToken}`)
        .send({ attributeValues: [{ code: 'duration_minutes', value: 721 }] });
      expect(res.status).toBe(422);
      expect(res.body.error.details[0].issue).toBe('ABOVE_MAXIMUM');
    });

    test('CAR_RENTAL seats = 0 is rejected (seeded min: 1)', async () => {
      const listingId = await createDraftListing(
        carRentalsCategoryId,
        'CAR_RENTAL',
      );
      const res = await request(app)
        .patch(`/api/v1/listings/${listingId}`)
        .set('Authorization', `Bearer ${vendor.accessToken}`)
        .send({ attributeValues: [{ code: 'seats', value: 0 }] });
      expect(res.status).toBe(422);
      expect(res.body.error.details[0].issue).toBe('BELOW_MINIMUM');
    });

    test('CAR_RENTAL doors = 1 is rejected (seeded min: 2)', async () => {
      const listingId = await createDraftListing(
        carRentalsCategoryId,
        'CAR_RENTAL',
      );
      const res = await request(app)
        .patch(`/api/v1/listings/${listingId}`)
        .set('Authorization', `Bearer ${vendor.accessToken}`)
        .send({ attributeValues: [{ code: 'doors', value: 1 }] });
      expect(res.status).toBe(422);
      expect(res.body.error.details[0].issue).toBe('BELOW_MINIMUM');
    });

    test('CAR_RENTAL luggage_capacity = -1 is rejected (seeded min: 0)', async () => {
      const listingId = await createDraftListing(
        carRentalsCategoryId,
        'CAR_RENTAL',
      );
      const res = await request(app)
        .patch(`/api/v1/listings/${listingId}`)
        .set('Authorization', `Bearer ${vendor.accessToken}`)
        .send({ attributeValues: [{ code: 'luggage_capacity', value: -1 }] });
      expect(res.status).toBe(422);
      expect(res.body.error.details[0].issue).toBe('BELOW_MINIMUM');
    });

    test('CAR_RENTAL luggage_capacity = 0 is accepted (seeded min is 0, not 1 — zero is a legitimate "no luggage space" answer)', async () => {
      const listingId = await createDraftListing(
        carRentalsCategoryId,
        'CAR_RENTAL',
      );
      const res = await request(app)
        .patch(`/api/v1/listings/${listingId}`)
        .set('Authorization', `Bearer ${vendor.accessToken}`)
        .send({ attributeValues: [{ code: 'luggage_capacity', value: 0 }] });
      expect(res.status).toBe(200);
      expect(res.body.data.attribute_values).toEqual(
        expect.arrayContaining([{ code: 'luggage_capacity', value: 0 }]),
      );
    });
  });

  describe('coordinates', () => {
    test('an out-of-range latitude is rejected', async () => {
      const listingId = await createDraftListing();
      const res = await request(app)
        .patch(`/api/v1/listings/${listingId}`)
        .set('Authorization', `Bearer ${vendor.accessToken}`)
        .send({ location: { latitude: 91, longitude: 44.5 } });
      expect(res.status).toBe(422);
    });

    test('an out-of-range longitude is rejected', async () => {
      const listingId = await createDraftListing();
      const res = await request(app)
        .patch(`/api/v1/listings/${listingId}`)
        .set('Authorization', `Bearer ${vendor.accessToken}`)
        .send({ location: { latitude: 40.18, longitude: 181 } });
      expect(res.status).toBe(422);
    });

    test('a NaN-producing coordinate payload is rejected', async () => {
      const listingId = await createDraftListing();
      const res = await request(app)
        .patch(`/api/v1/listings/${listingId}`)
        .set('Authorization', `Bearer ${vendor.accessToken}`)
        .send({ location: { latitude: 'not-a-number', longitude: 44.5 } });
      expect(res.status).toBe(422);
    });

    test('exactly the boundary values (±90/±180) are accepted', async () => {
      const listingId = await createDraftListing();
      const res = await request(app)
        .patch(`/api/v1/listings/${listingId}`)
        .set('Authorization', `Bearer ${vendor.accessToken}`)
        .send({ location: { latitude: -90, longitude: 180 } });
      expect(res.status).toBe(200);
    });
  });
});
