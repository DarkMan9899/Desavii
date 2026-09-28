/**
 * Step L6.2B — the listing type decides its bookable unit model
 * (`core/domain/listingTypeBookableUnitTypes.js`) and each unit type
 * decides which type-specific fields and room details apply
 * (`core/domain/bookableUnitFieldApplicability.js`). Every rejection is a
 * 422 raised before any write; a legacy mismatched unit stays manageable
 * by its own (immutable) stored type.
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

const UNIT_TYPE_BY_LISTING_TYPE = {
  HOTEL: 'HOTEL_ROOM',
  PROPERTY: 'PROPERTY_UNIT',
  RESTAURANT: 'RESTAURANT_TABLE',
  TOUR: 'TOUR_DEPARTURE',
  CAR_RENTAL: 'VEHICLE',
  ATTRACTION: 'TOUR_DEPARTURE',
};
const ALL_UNIT_TYPES = [
  'HOTEL_ROOM',
  'PROPERTY_UNIT',
  'RESTAURANT_TABLE',
  'TOUR_DEPARTURE',
  'VEHICLE',
];

const ONE_PX_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

let pool;
let vendor;
let partnerId;
let languageId;
let seq = 0;

function unique(prefix) {
  seq += 1;
  return `${prefix} ${Date.now()}-${seq}`;
}

async function createListing(listingType) {
  const res = await request(app)
    .post('/api/v1/listings')
    .set('Authorization', `Bearer ${vendor}`)
    .send({
      partnerId,
      listingType,
      translations: [{ languageId, title: unique(`L6.2B ${listingType}`) }],
    });
  expect(res.status).toBe(201);
  return res.body.data.id;
}

function registerUnit(body) {
  return request(app)
    .post('/api/v1/availability/units')
    .set('Authorization', `Bearer ${vendor}`)
    .send(body);
}

function patchUnit(unitId, path, body) {
  return request(app)
    .patch(`/api/v1/availability/units/${unitId}${path}`)
    .set('Authorization', `Bearer ${vendor}`)
    .send(body);
}

async function countUnits(listingId) {
  const [[{ total }]] = await pool.query(
    'SELECT COUNT(*) AS total FROM bookable_units WHERE listing_id = ?',
    [listingId],
  );
  return total;
}

function detailsOf(res) {
  return res.body.error?.details ?? [];
}

beforeAll(async () => {
  await up();
  await seedAll();
  await resetRateLimits();
  pool = getMysqlPool();

  const loginRes = await request(app).post('/api/v1/auth/login').send({
    email: DEV_CREDENTIALS.vendor.email,
    password: DEV_CREDENTIALS.vendor.password,
  });
  vendor = loginRes.body.data.access_token;

  const [[partnerRow]] = await pool.query(
    "SELECT id FROM partners WHERE slug = 'yerevan-boutique-hospitality'",
  );
  partnerId = partnerRow.id;
  const [[language]] = await pool.query(
    "SELECT id FROM languages WHERE code = 'en'",
  );
  languageId = language.id;
}, 60_000);

afterAll(async () => {
  await closeMysqlPool();
  await closeRedisConnection();
});

describe('listing type -> bookable unit type', () => {
  const matrix = Object.entries(UNIT_TYPE_BY_LISTING_TYPE).flatMap(
    ([listingType, allowed]) =>
      ALL_UNIT_TYPES.map((unitType) => [listingType, unitType, allowed]),
  );

  test.each(matrix)(
    'a %s listing registering %s',
    async (listingType, unitType, allowed) => {
      const listingId = await createListing(listingType);
      const res = await registerUnit({
        listingId,
        bookableUnitType: unitType,
        unitLabel: unique('Unit'),
      });

      if (unitType === allowed) {
        expect(res.status).toBe(201);
        expect(await countUnits(listingId)).toBe(1);
        return;
      }
      expect(res.status).toBe(422);
      expect(detailsOf(res)).toEqual([
        { field: 'bookableUnitType', issue: 'UNIT_TYPE_NOT_ALLOWED' },
      ]);
      expect(await countUnits(listingId)).toBe(0);
    },
  );
});

describe('one vehicle per Car Rental listing', () => {
  test('a second vehicle is rejected with no write; its fleet is the capacity', async () => {
    const listingId = await createListing('CAR_RENTAL');
    const first = await registerUnit({
      listingId,
      bookableUnitType: 'VEHICLE',
      unitLabel: 'Toyota RAV4',
      capacity: 3,
    });
    expect(first.status).toBe(201);

    const second = await registerUnit({
      listingId,
      bookableUnitType: 'VEHICLE',
      unitLabel: 'Kia Sportage',
    });
    expect(second.status).toBe(422);
    expect(detailsOf(second)).toEqual([
      { field: 'bookableUnitType', issue: 'ONE_VEHICLE_PER_LISTING' },
    ]);
    expect(await countUnits(listingId)).toBe(1);
  });

  test('an identical re-registration still resolves to the same vehicle', async () => {
    const listingId = await createListing('CAR_RENTAL');
    const body = {
      listingId,
      bookableUnitType: 'VEHICLE',
      unitLabel: 'Nissan',
    };
    const first = await registerUnit(body);
    const again = await registerUnit(body);
    expect(again.status).toBe(201);
    expect(again.body.data.id).toBe(first.body.data.id);
    expect(await countUnits(listingId)).toBe(1);
  });

  test('other listing types may register several units', async () => {
    const listingId = await createListing('TOUR');
    const morning = await registerUnit({
      listingId,
      bookableUnitType: 'TOUR_DEPARTURE',
      unitLabel: 'Morning',
      timeSlotStart: '09:00',
    });
    const evening = await registerUnit({
      listingId,
      bookableUnitType: 'TOUR_DEPARTURE',
      unitLabel: 'Evening',
      timeSlotStart: '18:00',
    });
    expect(morning.status).toBe(201);
    expect(evening.status).toBe(201);
    expect(await countUnits(listingId)).toBe(2);
  });
});

describe('type-specific unit fields', () => {
  const FIELD_VALUES = {
    maxGuests: 2,
    bedConfiguration: [{ type: 'KING', count: 1 }],
    timeSlotStart: '09:00',
    timeSlotEnd: '11:00',
    roomSizeSqm: 25,
    bathroomType: 'PRIVATE',
    viewType: 'CITY',
    smokingPolicy: 'NON_SMOKING',
  };
  const APPLICABLE = {
    HOTEL: [
      'maxGuests',
      'bedConfiguration',
      'roomSizeSqm',
      'bathroomType',
      'viewType',
      'smokingPolicy',
    ],
    PROPERTY: ['maxGuests', 'bedConfiguration'],
    RESTAURANT: [],
    TOUR: ['timeSlotStart', 'timeSlotEnd'],
    CAR_RENTAL: [],
  };
  const matrix = Object.entries(APPLICABLE).flatMap(([listingType, fields]) =>
    Object.keys(FIELD_VALUES).map((field) => [
      listingType,
      field,
      fields.includes(field),
    ]),
  );

  test.each(matrix)(
    'on a %s unit, registering %s (applicable: %s)',
    async (listingType, field, applicable) => {
      const listingId = await createListing(listingType);
      const res = await registerUnit({
        listingId,
        bookableUnitType: UNIT_TYPE_BY_LISTING_TYPE[listingType],
        unitLabel: unique('Unit'),
        [field]: FIELD_VALUES[field],
      });

      if (applicable) {
        expect(res.status).toBe(201);
        return;
      }
      expect(res.status).toBe(422);
      expect(detailsOf(res)).toEqual([
        { field, issue: 'NOT_APPLICABLE_FOR_UNIT_TYPE' },
      ]);
      expect(await countUnits(listingId)).toBe(0);
    },
  );

  test('an edit sending an inapplicable field is rejected and changes nothing', async () => {
    const listingId = await createListing('RESTAURANT');
    const created = await registerUnit({
      listingId,
      bookableUnitType: 'RESTAURANT_TABLE',
      unitLabel: 'Terrace table',
      capacity: 4,
    });
    const unitId = created.body.data.id;

    const res = await patchUnit(unitId, '', { capacity: 6, maxGuests: 6 });
    expect(res.status).toBe(422);
    expect(detailsOf(res)).toEqual([
      { field: 'maxGuests', issue: 'NOT_APPLICABLE_FOR_UNIT_TYPE' },
    ]);
    const [[row]] = await pool.query(
      'SELECT capacity, max_guests FROM bookable_units WHERE id = ?',
      [unitId],
    );
    expect(row).toEqual({ capacity: 4, max_guests: null });
  });
});

describe('room details are hotel-room only', () => {
  let propertyUnitId;

  beforeAll(async () => {
    const listingId = await createListing('PROPERTY');
    const res = await registerUnit({
      listingId,
      bookableUnitType: 'PROPERTY_UNIT',
      unitLabel: 'Two-bedroom apartment',
    });
    propertyUnitId = res.body.data.id;
  });

  const ROOM_DETAILS_REJECTED = [
    { field: 'bookableUnitType', issue: 'ROOM_DETAILS_NOT_APPLICABLE' },
  ];

  test('a description is rejected; clearing it stays allowed', async () => {
    const rejected = await patchUnit(propertyUnitId, '/description', {
      languageCode: 'en',
      description: 'Spacious flat.',
    });
    expect(rejected.status).toBe(422);
    expect(detailsOf(rejected)).toEqual(ROOM_DETAILS_REJECTED);

    const cleared = await patchUnit(propertyUnitId, '/description', {
      languageCode: 'en',
      description: null,
    });
    expect(cleared.status).toBe(200);
  });

  test('room amenities are rejected; an empty set stays allowed', async () => {
    const [[amenity]] = await pool.query(
      "SELECT id FROM listing_amenities WHERE name = 'Air Conditioning'",
    );
    const rejected = await patchUnit(propertyUnitId, '/amenities', {
      amenityIds: [amenity.id],
    });
    expect(rejected.status).toBe(422);
    expect(detailsOf(rejected)).toEqual(ROOM_DETAILS_REJECTED);

    const cleared = await patchUnit(propertyUnitId, '/amenities', {
      amenityIds: [],
    });
    expect(cleared.status).toBe(200);
  });

  test('a room photo is rejected with nothing stored', async () => {
    const res = await request(app)
      .post(`/api/v1/availability/units/${propertyUnitId}/media`)
      .set('Authorization', `Bearer ${vendor}`)
      .set('Content-Type', 'image/png')
      .send(ONE_PX_PNG);
    expect(res.status).toBe(422);
    expect(detailsOf(res)).toEqual(ROOM_DETAILS_REJECTED);
    const [[{ total }]] = await pool.query(
      "SELECT COUNT(*) AS total FROM media WHERE mediable_type = 'bookable_unit' AND mediable_id = ?",
      [propertyUnitId],
    );
    expect(total).toBe(0);
  });
});

describe('legacy mismatched units', () => {
  test('stay editable by their own stored unit type', async () => {
    const listingId = await createListing('HOTEL');
    const created = await registerUnit({
      listingId,
      bookableUnitType: 'HOTEL_ROOM',
      unitLabel: 'Legacy room',
    });
    // Simulates a pre-L6.2B row the API can no longer create.
    const [[tourType]] = await pool.query(
      "SELECT id FROM listing_types WHERE code = 'TOUR'",
    );
    await pool.query('UPDATE listings SET listing_type_id = ? WHERE id = ?', [
      tourType.id,
      listingId,
    ]);

    const listRes = await request(app)
      .get('/api/v1/availability/units')
      .set('Authorization', `Bearer ${vendor}`)
      .query({ listingId });
    expect(listRes.status).toBe(200);
    expect(listRes.body.data.map((unit) => unit.id)).toEqual([
      created.body.data.id,
    ]);

    const edit = await patchUnit(created.body.data.id, '', { maxGuests: 3 });
    expect(edit.status).toBe(200);
    expect(edit.body.data.max_guests).toBe(3);
  });
});
