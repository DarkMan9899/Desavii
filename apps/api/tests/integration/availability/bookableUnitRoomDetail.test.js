/**
 * Sprint C-1 (Accommodation room-level product data) — structured room
 * fields (`room_size_sqm`/`bathroom_type`/`view_type`/`smoking_policy`),
 * multilingual room description (`bookable_unit_translations`),
 * room-specific amenities (`bookable_unit_amenity_listing`), and room
 * photo gallery (`media` with `mediable_type = 'bookable_unit'`).
 * Mirrors `availabilityCrud.test.js`'s own login/listing/unit helper
 * pattern exactly — same real listing, same real vendor/customer
 * accounts, never a mocked ownership check.
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

let pool;
let vendor;
let customer;
let partnerId;
let languageId;
let listingId;

async function login(email, password) {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ email, password });
  return {
    accessToken: res.body.data.access_token,
    userId: res.body.data.user.id,
  };
}

const ONE_PX_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

async function createListing(title) {
  const res = await request(app)
    .post('/api/v1/listings')
    .set('Authorization', `Bearer ${vendor.accessToken}`)
    .send({
      partnerId,
      listingType: 'HOTEL',
      translations: [{ languageId, title }],
    });
  return res.body.data.id;
}

/**
 * Non-owner requests below must actually reach `ListingService
 * .getListing`'s owner-vs-permission branch (a genuine 403) rather than
 * its earlier "not published and not the owner" 404-masking branch —
 * mirrors `availabilityCrud.test.js`'s own identically-named helper and
 * its own reasoning exactly.
 */
async function publishListing(id) {
  await request(app)
    .patch(`/api/v1/listings/${id}`)
    .set('Authorization', `Bearer ${vendor.accessToken}`)
    .send({ location: { latitude: 40.1772, longitude: 44.5035 } });
  await request(app)
    .post(`/api/v1/listings/${id}/media`)
    .set('Authorization', `Bearer ${vendor.accessToken}`)
    .set('Content-Type', 'image/png')
    .send(ONE_PX_PNG);
  await request(app)
    .post(`/api/v1/listings/${id}/publish`)
    .set('Authorization', `Bearer ${vendor.accessToken}`);
}

async function registerUnit(targetListingId, overrides = {}) {
  const res = await request(app)
    .post('/api/v1/availability/units')
    .set('Authorization', `Bearer ${vendor.accessToken}`)
    .send({
      listingId: targetListingId,
      bookableUnitType: 'HOTEL_ROOM',
      unitLabel: 'Standard Room',
      capacity: 3,
      ...overrides,
    });
  return res.body.data;
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
  customer = await login(
    DEV_CREDENTIALS.customer.email,
    DEV_CREDENTIALS.customer.password,
  );

  const [[partnerRow]] = await pool.query(
    "SELECT id FROM partners WHERE slug = 'yerevan-boutique-hospitality'",
  );
  partnerId = partnerRow.id;
  const [[language]] = await pool.query(
    "SELECT id FROM languages WHERE code = 'en'",
  );
  languageId = language.id;

  listingId = await createListing(
    `Room Detail Test Listing ${Date.now()}-${Math.floor(Math.random() * 100000)}`,
  );
  // A gate unit must exist BEFORE publish (Phase 5's >=1-bookable-unit
  // publish-readiness gate), and the listing must be published so a
  // non-owner's request reaches the real owner-vs-permission 403 branch
  // instead of `getListing`'s "not published and not the owner" 404 mask.
  await registerUnit(listingId, { unitLabel: 'Gate Room' });
  await publishListing(listingId);
}, 60_000);

afterAll(async () => {
  await closeMysqlPool();
  await closeRedisConnection();
});

describe('POST /availability/units — structured room fields', () => {
  test('registering a HOTEL_ROOM unit persists room_size_sqm/bathroom_type/view_type/smoking_policy', async () => {
    const unit = await registerUnit(listingId, {
      roomSizeSqm: 24,
      bathroomType: 'PRIVATE',
      viewType: 'MOUNTAIN',
      smokingPolicy: 'NON_SMOKING',
    });
    expect(unit.room_size_sqm).toBe('24.00');
    expect(unit.bathroom_type).toBe('PRIVATE');
    expect(unit.view_type).toBe('MOUNTAIN');
    expect(unit.smoking_policy).toBe('NON_SMOKING');
    // Sprint C-1: every owner-facing register/update/list response is
    // enriched with the three new sub-resources, even when empty.
    expect(unit.translations).toEqual([]);
    expect(unit.amenity_ids).toEqual([]);
    expect(unit.media).toEqual([]);
  });

  test('a non-HOTEL_ROOM unit (VEHICLE) remains fully compatible — room fields stay null when never sent', async () => {
    const res = await request(app)
      .post('/api/v1/availability/units')
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({ listingId, bookableUnitType: 'VEHICLE', capacity: 1 });
    expect(res.status).toBe(201);
    expect(res.body.data.room_size_sqm).toBeNull();
    expect(res.body.data.bathroom_type).toBeNull();
    expect(res.body.data.view_type).toBeNull();
    expect(res.body.data.smoking_policy).toBeNull();
  });

  test('an invalid room size is rejected (422)', async () => {
    const res = await request(app)
      .post('/api/v1/availability/units')
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({
        listingId,
        bookableUnitType: 'HOTEL_ROOM',
        roomSizeSqm: -5,
      });
    expect(res.status).toBe(422);
  });

  test('an invalid bathroom_type enum value is rejected (422)', async () => {
    const res = await request(app)
      .post('/api/v1/availability/units')
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({
        listingId,
        bookableUnitType: 'HOTEL_ROOM',
        bathroomType: 'GOLD_PLATED',
      });
    expect(res.status).toBe(422);
  });

  test('capacity (pooled room quantity) and max_guests (occupancy) remain distinct on the same unit', async () => {
    const unit = await registerUnit(listingId, {
      unitLabel: 'Capacity vs Guests Room',
      capacity: 7,
      maxGuests: 2,
    });
    expect(unit.capacity).toBe(7);
    expect(unit.max_guests).toBe(2);
  });
});

describe('PATCH /availability/units/:id — structured room fields update', () => {
  test('the owner can update a room’s structured fields', async () => {
    const unit = await registerUnit(listingId);
    const res = await request(app)
      .patch(`/api/v1/availability/units/${unit.id}`)
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({
        roomSizeSqm: 30,
        bathroomType: 'ENSUITE',
        viewType: 'CITY',
        smokingPolicy: 'SMOKING_ALLOWED',
      });
    expect(res.status).toBe(200);
    expect(res.body.data.room_size_sqm).toBe('30.00');
    expect(res.body.data.bathroom_type).toBe('ENSUITE');
    expect(res.body.data.view_type).toBe('CITY');
    expect(res.body.data.smoking_policy).toBe('SMOKING_ALLOWED');
  });

  test('a non-owner cannot update a room’s structured fields (403)', async () => {
    const unit = await registerUnit(listingId);
    const res = await request(app)
      .patch(`/api/v1/availability/units/${unit.id}`)
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({ roomSizeSqm: 99 });
    expect(res.status).toBe(403);
  });
});

describe('PATCH /availability/units/:id/description — multilingual room description', () => {
  test('each locale is saved and read back independently, with no fabricated fallback for a missing locale', async () => {
    const unit = await registerUnit(listingId, { unitLabel: 'Locale Room' });

    const enRes = await request(app)
      .patch(`/api/v1/availability/units/${unit.id}/description`)
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({ languageCode: 'en', description: 'A bright room with a view.' });
    expect(enRes.status).toBe(200);
    expect(enRes.body.data.translations).toEqual([
      { language_code: 'en', description: 'A bright room with a view.' },
    ]);

    const hyRes = await request(app)
      .patch(`/api/v1/availability/units/${unit.id}/description`)
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({ languageCode: 'hy', description: 'Պայծառ սենյակ։' });
    expect(hyRes.status).toBe(200);
    const localesReturned = hyRes.body.data.translations
      .map((t) => t.language_code)
      .sort();
    expect(localesReturned).toEqual(['en', 'hy']);
    // ru was never authored — must not appear at all, never borrowed from en/hy.
    expect(
      hyRes.body.data.translations.some((t) => t.language_code === 'ru'),
    ).toBe(false);
  });

  test('re-saving the same locale replaces (not duplicates) its description', async () => {
    const unit = await registerUnit(listingId, { unitLabel: 'Replace Room' });
    await request(app)
      .patch(`/api/v1/availability/units/${unit.id}/description`)
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({ languageCode: 'en', description: 'First draft.' });
    const res = await request(app)
      .patch(`/api/v1/availability/units/${unit.id}/description`)
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({ languageCode: 'en', description: 'Final draft.' });
    expect(res.body.data.translations).toEqual([
      { language_code: 'en', description: 'Final draft.' },
    ]);
  });

  test('a non-owner cannot set a room’s description (403)', async () => {
    const unit = await registerUnit(listingId);
    const res = await request(app)
      .patch(`/api/v1/availability/units/${unit.id}/description`)
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({ languageCode: 'en', description: 'Attacker text.' });
    expect(res.status).toBe(403);
  });
});

describe('PATCH /availability/units/:id/amenities — room-specific amenities', () => {
  async function findAmenityId(name) {
    const [[row]] = await pool.query(
      'SELECT id FROM listing_amenities WHERE name = ?',
      [name],
    );
    return row.id;
  }

  test('amenities are a full replace, and are scoped to the room, not the listing', async () => {
    const unit = await registerUnit(listingId, { unitLabel: 'Amenity Room' });
    const acId = await findAmenityId('Air Conditioning');
    const minibarId = await findAmenityId('Minibar');

    const firstRes = await request(app)
      .patch(`/api/v1/availability/units/${unit.id}/amenities`)
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({ amenityIds: [acId] });
    expect(firstRes.body.data.amenity_ids).toEqual([acId]);

    const secondRes = await request(app)
      .patch(`/api/v1/availability/units/${unit.id}/amenities`)
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({ amenityIds: [minibarId] });
    // Full replace: Air Conditioning must be gone, only Minibar remains.
    expect(secondRes.body.data.amenity_ids).toEqual([minibarId]);

    // The listing's own amenities are a completely separate relation —
    // never touched by a room-amenity write.
    const [[listingAmenityRow]] = await pool.query(
      'SELECT COUNT(*) AS count FROM listing_amenity_listing WHERE listing_id = ?',
      [listingId],
    );
    expect(listingAmenityRow.count).toBe(0);
  });

  test('a non-owner cannot replace a room’s amenities (403)', async () => {
    const unit = await registerUnit(listingId);
    const acId = await findAmenityId('Air Conditioning');
    const res = await request(app)
      .patch(`/api/v1/availability/units/${unit.id}/amenities`)
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({ amenityIds: [acId] });
    expect(res.status).toBe(403);
  });
});

describe('room media (POST/GET/DELETE /availability/units/:id/media)', () => {
  test('the owner can upload a room photo; the first upload becomes the cover', async () => {
    const unit = await registerUnit(listingId, { unitLabel: 'Gallery Room' });
    const res = await request(app)
      .post(`/api/v1/availability/units/${unit.id}/media`)
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .set('Content-Type', 'image/png')
      .send(ONE_PX_PNG);
    expect(res.status).toBe(201);
    expect(res.body.data.is_cover).toBe(true);

    const listRes = await request(app)
      .get(`/api/v1/availability/units/${unit.id}/media`)
      .set('Authorization', `Bearer ${vendor.accessToken}`);
    expect(listRes.body.data).toHaveLength(1);
  });

  test('room photos are isolated per room — uploading to one room never appears on another, or on the listing gallery', async () => {
    const roomA = await registerUnit(listingId, { unitLabel: 'Room A' });
    const roomB = await registerUnit(listingId, { unitLabel: 'Room B' });
    await request(app)
      .post(`/api/v1/availability/units/${roomA.id}/media`)
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .set('Content-Type', 'image/png')
      .send(ONE_PX_PNG);

    const roomBMedia = await request(app)
      .get(`/api/v1/availability/units/${roomB.id}/media`)
      .set('Authorization', `Bearer ${vendor.accessToken}`);
    expect(roomBMedia.body.data).toHaveLength(0);

    const listingMedia = await request(app).get(
      `/api/v1/listings/${listingId}/media`,
    );
    expect(
      listingMedia.body.data.every((m) => m.mediable_type !== 'bookable_unit'),
    ).toBe(true);
  });

  test('removing a room photo removes only that photo', async () => {
    const unit = await registerUnit(listingId, { unitLabel: 'Removal Room' });
    const firstUpload = await request(app)
      .post(`/api/v1/availability/units/${unit.id}/media`)
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .set('Content-Type', 'image/png')
      .send(ONE_PX_PNG);
    const secondUpload = await request(app)
      .post(`/api/v1/availability/units/${unit.id}/media`)
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .set('Content-Type', 'image/png')
      .send(ONE_PX_PNG);

    const removeRes = await request(app)
      .delete(
        `/api/v1/availability/units/${unit.id}/media/${firstUpload.body.data.id}`,
      )
      .set('Authorization', `Bearer ${vendor.accessToken}`);
    expect(removeRes.status).toBe(200);

    const listRes = await request(app)
      .get(`/api/v1/availability/units/${unit.id}/media`)
      .set('Authorization', `Bearer ${vendor.accessToken}`);
    expect(listRes.body.data.map((m) => m.id)).toEqual([
      secondUpload.body.data.id,
    ]);
  });

  test('a non-owner cannot attach media to a room they do not own (403)', async () => {
    const unit = await registerUnit(listingId, {
      unitLabel: 'Protected Room',
    });
    const res = await request(app)
      .post(`/api/v1/availability/units/${unit.id}/media`)
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .set('Content-Type', 'image/png')
      .send(ONE_PX_PNG);
    expect(res.status).toBe(403);
  });

  test('a non-owner cannot remove media from a room they do not own (403)', async () => {
    const unit = await registerUnit(listingId, {
      unitLabel: 'Protected Removal Room',
    });
    const upload = await request(app)
      .post(`/api/v1/availability/units/${unit.id}/media`)
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .set('Content-Type', 'image/png')
      .send(ONE_PX_PNG);
    const res = await request(app)
      .delete(
        `/api/v1/availability/units/${unit.id}/media/${upload.body.data.id}`,
      )
      .set('Authorization', `Bearer ${customer.accessToken}`);
    expect(res.status).toBe(403);
  });

  test('a real bookable_unit_id used against another room’s media id is not found (mediable ownership is verified, not just the room owner)', async () => {
    const roomA = await registerUnit(listingId, { unitLabel: 'Owner Room A' });
    const roomC = await registerUnit(listingId, { unitLabel: 'Owner Room C' });
    const upload = await request(app)
      .post(`/api/v1/availability/units/${roomA.id}/media`)
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .set('Content-Type', 'image/png')
      .send(ONE_PX_PNG);

    // Same owner, but the media id belongs to roomA, not roomC — must not
    // be deletable through roomC's endpoint.
    const res = await request(app)
      .delete(
        `/api/v1/availability/units/${roomC.id}/media/${upload.body.data.id}`,
      )
      .set('Authorization', `Bearer ${vendor.accessToken}`);
    expect(res.status).toBe(404);
  });
});

describe('GET /availability/:listingId/units — public room data exposure (Sprint C-2)', () => {
  test('a customer can see a HOTEL_ROOM unit’s structured fields, description, amenities, and photo — with no owner-only fields leaked', async () => {
    const unit = await registerUnit(listingId, {
      unitLabel: 'Public Detail Room',
      maxGuests: 2,
      roomSizeSqm: 24,
      bathroomType: 'ENSUITE',
      viewType: 'GARDEN',
      smokingPolicy: 'NON_SMOKING',
    });
    await request(app)
      .patch(`/api/v1/availability/units/${unit.id}/description`)
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({ languageCode: 'en', description: 'A quiet garden-view room.' });
    const [[acRow]] = await pool.query(
      "SELECT id FROM listing_amenities WHERE name = 'Air Conditioning'",
    );
    await request(app)
      .patch(`/api/v1/availability/units/${unit.id}/amenities`)
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({ amenityIds: [acRow.id] });
    await request(app)
      .post(`/api/v1/availability/units/${unit.id}/media`)
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .set('Content-Type', 'image/png')
      .send(ONE_PX_PNG);

    // No Authorization header — this is the real, unauthenticated public
    // read `ListingRoomsSection`/`ListingReservationWidget` both use.
    const res = await request(app).get(
      `/api/v1/availability/${listingId}/units`,
    );
    expect(res.status).toBe(200);
    const publicUnit = res.body.data.find((u) => u.id === unit.id);
    expect(publicUnit).toBeDefined();
    expect(publicUnit.max_guests).toBe(2);
    expect(publicUnit.room_size_sqm).toBe('24.00');
    expect(publicUnit.bathroom_type).toBe('ENSUITE');
    expect(publicUnit.view_type).toBe('GARDEN');
    expect(publicUnit.smoking_policy).toBe('NON_SMOKING');
    expect(publicUnit.translations).toEqual([
      { language_code: 'en', description: 'A quiet garden-view room.' },
    ]);
    expect(publicUnit.amenity_ids).toEqual([acRow.id]);
    expect(publicUnit.media).toHaveLength(1);
    expect(publicUnit.media[0]).toMatchObject({
      is_cover: true,
      media_type: 'IMAGE',
    });
    expect(publicUnit).not.toHaveProperty('listing_id');
    expect(publicUnit).not.toHaveProperty('created_at');
    expect(publicUnit).not.toHaveProperty('updated_at');
  });
});
