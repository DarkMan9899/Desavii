/**
 * Listing Detail redesign — `GET /listings/:idOrSlug` returns the minimal
 * public shape to everyone who may not manage the listing, and the
 * management shape only to its owner (or a moderator). Verified over HTTP
 * against real rows: field set, private-stay location, draft concealment,
 * malformed ids and script-shaped content.
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
import { YEREVAN_CITY_ID } from '../helpers/seededCities.js';

const SCRIPT_TITLE = '<img src=x onerror="alert(1)"> Detail DTO Hotel';
const STORED_POINT = { latitude: 40.181234, longitude: 44.514567 };

let pool;
let vendor;
let customer;
let partnerId;
let hotelSlug;
let villaSlug;
let draftId;

async function login({ email, password }) {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ email, password });
  return res.body.data.access_token;
}

async function createListing(listingType, categorySlug, title) {
  const [[language]] = await pool.query(
    "SELECT id FROM languages WHERE code = 'en'",
  );
  const [[category]] = await pool.query(
    'SELECT id FROM listing_categories WHERE slug = ?',
    [categorySlug],
  );
  const res = await request(app)
    .post('/api/v1/listings')
    .set('Authorization', `Bearer ${vendor}`)
    .send({
      partnerId,
      listingType,
      translations: [
        {
          languageId: language.id,
          title: `${title} ${Date.now()}`,
          summary: 'A test listing for the public Listing Detail contract.',
        },
      ],
      categoryIds: [category.id],
      location: {
        cityId: YEREVAN_CITY_ID,
        addressLine: '5 Private Lane',
        ...STORED_POINT,
      },
    });
  expect(res.status).toBe(201);
  return res.body.data;
}

async function publish(id) {
  await pool.query(
    "UPDATE listings SET status_id = (SELECT id FROM listing_statuses WHERE code = 'PUBLISHED') WHERE id = ?",
    [id],
  );
}

beforeAll(async () => {
  await up();
  await seedAll();
  await resetRateLimits();
  pool = getMysqlPool();
  vendor = await login(DEV_CREDENTIALS.vendor);
  customer = await login(DEV_CREDENTIALS.customer);
  const [[partner]] = await pool.query(
    "SELECT id FROM partners WHERE slug = 'yerevan-boutique-hospitality'",
  );
  partnerId = partner.id;

  const hotel = await createListing('HOTEL', 'hotels', SCRIPT_TITLE);
  await publish(hotel.id);
  hotelSlug = hotel.slug;
  const villa = await createListing('PROPERTY', 'villas', 'Detail DTO Villa');
  await publish(villa.id);
  villaSlug = villa.slug;
  const draft = await createListing('HOTEL', 'hotels', 'Detail DTO Draft');
  draftId = draft.id;
}, 60_000);

afterAll(async () => {
  await closeMysqlPool();
  await closeRedisConnection();
});

const INTERNAL_FIELDS = [
  'partner_id',
  'moderation_status',
  'moderation_notes',
  'is_contact_visible',
  'is_featured',
  'unpublished_at',
  'archived_at',
  'og_image_media_id',
  'is_sitemap_included',
  'canonical_url',
  'created_at',
  'updated_at',
];

describe('GET /listings/:idOrSlug — public vs management shape', () => {
  test.each([
    ['an anonymous visitor', () => undefined],
    ['a signed-in customer', () => customer],
  ])('%s gets the public shape only', async (_label, token) => {
    const call = request(app).get(`/api/v1/listings/${hotelSlug}`);
    const res = await (token()
      ? call.set('Authorization', `Bearer ${token()}`)
      : call);
    expect(res.status).toBe(200);
    INTERNAL_FIELDS.forEach((field) =>
      expect(res.body.data).not.toHaveProperty(field),
    );
    expect(res.body.data.location).not.toHaveProperty('address_id');
  });

  test('the owner gets the management shape', async () => {
    const res = await request(app)
      .get(`/api/v1/listings/${hotelSlug}`)
      .set('Authorization', `Bearer ${vendor}`);
    expect(res.status).toBe(200);
    expect(res.body.data.partner_id).toBe(partnerId);
    expect(res.body.data).toHaveProperty('moderation_status');
  });
});

describe('GET /listings/:idOrSlug — location privacy', () => {
  test('a private stay: approximate point, no street address — in the whole body', async () => {
    const res = await request(app).get(`/api/v1/listings/${villaSlug}`);
    expect(res.status).toBe(200);
    const { location } = res.body.data;
    expect(location.location_precision).toBe('approximate');
    expect(location.address_line).toBeNull();
    const body = JSON.stringify(res.body);
    expect(body).not.toContain('5 Private Lane');
    expect(body).not.toContain(String(STORED_POINT.latitude));
    expect(body).not.toContain(String(STORED_POINT.longitude));
  });

  test("the villa's owner still sees its exact place", async () => {
    const res = await request(app)
      .get(`/api/v1/listings/${villaSlug}`)
      .set('Authorization', `Bearer ${vendor}`);
    expect(res.body.data.location.address_line).toBe('5 Private Lane');
  });
});

describe('GET /listings/:idOrSlug — concealment and abuse', () => {
  test('a draft is a plain 404 to the public, never "forbidden"', async () => {
    const res = await request(app).get(`/api/v1/listings/${draftId}`);
    expect(res.status).toBe(404);
    expect(JSON.stringify(res.body)).not.toMatch(/draft|partner/i);
  });

  test.each([
    'not a slug!',
    '../../etc/passwd',
    "1' OR '1'='1",
    '9'.repeat(40),
  ])('a malformed id (%s) is refused without internals', async (id) => {
    const res = await request(app).get(
      `/api/v1/listings/${encodeURIComponent(id)}`,
    );
    expect([400, 404, 422]).toContain(res.status);
    expect(JSON.stringify(res.body)).not.toMatch(
      /stack|sql|select |at \w+ \(/i,
    );
  });

  test('script-shaped content comes back as plain data, never interpreted', async () => {
    const res = await request(app).get(`/api/v1/listings/${hotelSlug}`);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.body.data.translations[0].title).toContain(
      '<img src=x onerror="alert(1)">',
    );
  });
});
