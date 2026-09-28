/**
 * Phase 5: `GET /listings/metadata?categoryId=` — the Partner Listing
 * Wizard's data-entry metadata endpoint. Reads the SAME Generic Attribute
 * Engine tables `GET /search/filters` reads (read-only, unmodified), plus
 * the new Phase 5 pricing/policy tables (seeds/007_pricing_and_policies.js)
 * — proving both systems are correctly exposed in a form-entry shape
 * (full options, `is_required`, no filter-group collapsing).
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

let pool;
let villasCategoryId;
let toursCategoryId;

beforeAll(async () => {
  await up();
  await seedAll();
  await resetRateLimits();
  pool = getMysqlPool();

  const [[villas]] = await pool.query(
    "SELECT id FROM listing_categories WHERE slug = 'villas'",
  );
  villasCategoryId = villas.id;
  const [[tours]] = await pool.query(
    "SELECT id FROM listing_categories WHERE slug = 'tours'",
  );
  toursCategoryId = tours.id;
}, 60_000);

afterAll(async () => {
  await closeMysqlPool();
  await closeRedisConnection();
});

describe('GET /listings/metadata', () => {
  test('villas: returns STEPPER room attributes, grouped amenities, PER_NIGHT pricing, and required policies', async () => {
    const res = await request(app).get(
      `/api/v1/listings/metadata?categoryId=${villasCategoryId}`,
    );
    expect(res.status).toBe(200);

    const attributeCodes = res.body.data.attributes.map((a) => a.code).sort();
    expect(attributeCodes).toEqual([
      'bathrooms',
      'bedrooms',
      'beds',
      'floor_area_sqm',
      'max_guests',
      'view_type',
    ]);
    // Phase 18 added `view_type` (ENUM) alongside the original room-count
    // STEPPER attributes — assert the numeric ones stay numeric rather
    // than requiring every attribute on the category to be numeric.
    const numericCodes = new Set([
      'bathrooms',
      'bedrooms',
      'beds',
      'max_guests',
      'floor_area_sqm',
    ]);
    expect(
      res.body.data.attributes
        .filter((a) => numericCodes.has(a.code))
        .every((a) => a.data_type === 'INTEGER' || a.data_type === 'DECIMAL'),
    ).toBe(true);
    const viewType = res.body.data.attributes.find(
      (a) => a.code === 'view_type',
    );
    expect(viewType.data_type).toBe('ENUM');

    expect(res.body.data.amenity_groups.length).toBeGreaterThan(0);
    const allAmenityCodes = res.body.data.amenity_groups.flatMap((g) =>
      g.amenities.map((a) => a.code),
    );
    expect(allAmenityCodes).toContain('Pool');

    expect(res.body.data.pricing_models.map((m) => m.code)).toEqual([
      'PER_NIGHT',
    ]);

    const policyCodes = res.body.data.policies.map((p) => p.code).sort();
    expect(policyCodes).toEqual([
      'cancellation_policy',
      'check_in_time',
      'check_out_time',
      'children_allowed',
      'pets_allowed',
      'smoking_allowed',
    ]);
    const cancellationPolicy = res.body.data.policies.find(
      (p) => p.code === 'cancellation_policy',
    );
    expect(cancellationPolicy.is_required).toBe(true);
    expect(cancellationPolicy.data_type).toBe('ENUM');
    expect(cancellationPolicy.options.map((o) => o.code).sort()).toEqual([
      'FLEXIBLE',
      'MODERATE',
      'STRICT',
    ]);
  });

  test('tours: returns a different attribute/pricing/policy set than villas (proves category-scoping, not hardcoding)', async () => {
    const res = await request(app).get(
      `/api/v1/listings/metadata?categoryId=${toursCategoryId}`,
    );
    expect(res.status).toBe(200);

    const attributeCodes = res.body.data.attributes.map((a) => a.code).sort();
    expect(attributeCodes).toEqual([
      'difficulty',
      'duration_minutes',
      'languages_offered',
      'max_group_size',
      'meeting_point_type',
    ]);
    // Step L6.2H1: PER_HOUR is no longer offered (not bookable).
    expect(res.body.data.pricing_models.map((m) => m.code)).toEqual([
      'PER_PERSON',
    ]);
    expect(res.body.data.policies.map((p) => p.code)).toEqual([
      'cancellation_policy',
      'children_allowed',
    ]);
  });

  test('an unknown/absent categoryId returns empty metadata, not an error', async () => {
    const res = await request(app).get(
      '/api/v1/listings/metadata?categoryId=999999',
    );
    expect(res.status).toBe(200);
    expect(res.body.data.attributes).toEqual([]);
    expect(res.body.data.amenity_groups).toEqual([]);
    expect(res.body.data.pricing_models).toEqual([]);
    expect(res.body.data.policies).toEqual([]);
  });

  test('requires a categoryId', async () => {
    const res = await request(app).get('/api/v1/listings/metadata');
    expect(res.status).toBe(422);
  });
});
