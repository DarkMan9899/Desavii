/**
 * Pass 3 remediation — Restaurant Menu (migration 0045). Mirrors
 * `listingRichContent.test.js`'s exact real-listing setup (vendor@
 * travelhub.dev owns the verified `yerevan-boutique-hospitality` partner),
 * but against a RESTAURANT-type listing, since menu creation is
 * restaurant-only.
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
let restaurantListingId;
let hotelListingId;
let menuId;
let sectionId;

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
  const [[restaurantCategory]] = await pool.query(
    "SELECT id FROM listing_categories WHERE slug = 'restaurants'",
  );
  const [[hotelCategory]] = await pool.query(
    "SELECT id FROM listing_categories WHERE slug = 'hotels'",
  );

  const createRestaurant = await request(app)
    .post('/api/v1/listings')
    .set('Authorization', `Bearer ${vendor.accessToken}`)
    .send({
      partnerId,
      listingType: 'RESTAURANT',
      translations: [
        {
          languageId,
          title: `Menu Test Restaurant ${Date.now()}`,
          summary: 'A test restaurant listing for the menu feature.',
        },
      ],
      categoryIds: [restaurantCategory.id],
    });
  restaurantListingId = createRestaurant.body.data.id;

  const createHotel = await request(app)
    .post('/api/v1/listings')
    .set('Authorization', `Bearer ${vendor.accessToken}`)
    .send({
      partnerId,
      listingType: 'HOTEL',
      translations: [
        {
          languageId,
          title: `Menu Rejection Test Hotel ${Date.now()}`,
          summary: 'A hotel listing that must refuse a menu.',
        },
      ],
      categoryIds: [hotelCategory.id],
    });
  hotelListingId = createHotel.body.data.id;
}, 60_000);

afterAll(async () => {
  await closeMysqlPool();
  await closeRedisConnection();
});

describe('Restaurant Menu (POST/GET/PATCH/DELETE)', () => {
  test('a non-owner cannot create a menu', async () => {
    const res = await request(app)
      .post(`/api/v1/listings/${restaurantListingId}/menu`)
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({ name: 'Dinner Menu' });
    expect(res.status).toBe(403);
  });

  test('creating a menu on a non-RESTAURANT listing is rejected', async () => {
    const res = await request(app)
      .post(`/api/v1/listings/${hotelListingId}/menu`)
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({ name: 'Dinner Menu' });
    expect(res.status).toBe(422);
  });

  test('the owner can create a menu on their RESTAURANT listing', async () => {
    const res = await request(app)
      .post(`/api/v1/listings/${restaurantListingId}/menu`)
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({ name: 'Dinner Menu', description: 'Served 6pm-11pm' });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      listing_id: restaurantListingId,
      language_code: 'en',
      name: 'Dinner Menu',
      is_active: true,
      sections: [],
    });
    menuId = res.body.data.id;
  });

  test('the public GET returns the menu tree with no auth required', async () => {
    const res = await request(app).get(
      `/api/v1/listings/${restaurantListingId}/menu?locale=en`,
    );
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].name).toBe('Dinner Menu');
  });

  test('the owner can add a section to the menu', async () => {
    const res = await request(app)
      .post(`/api/v1/listings/menu/${menuId}/sections`)
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({ title: 'Appetizers' });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      menu_id: menuId,
      title: 'Appetizers',
    });
    sectionId = res.body.data.id;
  });

  test('a non-owner cannot add an item to the section', async () => {
    const res = await request(app)
      .post(`/api/v1/listings/menu/sections/${sectionId}/items`)
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({
        title: 'Khinkali',
        priceAmount: 3500,
        priceCurrencyCode: 'AMD',
      });
    expect(res.status).toBe(403);
  });

  test('an unknown currency code is rejected', async () => {
    const res = await request(app)
      .post(`/api/v1/listings/menu/sections/${sectionId}/items`)
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({
        title: 'Khinkali',
        priceAmount: 3500,
        priceCurrencyCode: 'ZZZ',
      });
    expect(res.status).toBe(422);
  });

  test('the owner can add an item with dietary markers', async () => {
    const res = await request(app)
      .post(`/api/v1/listings/menu/sections/${sectionId}/items`)
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({
        title: 'Khinkali (5 pcs)',
        description: 'Hand-folded dumplings, spiced lamb filling.',
        priceAmount: 3500,
        priceCurrencyCode: 'AMD',
        dietaryMarkers: ['spicy'],
      });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      section_id: sectionId,
      title: 'Khinkali (5 pcs)',
      price_amount: 3500,
      price_currency_code: 'AMD',
      dietary_markers: ['spicy'],
      is_active: true,
    });

    const treeRes = await request(app).get(
      `/api/v1/listings/${restaurantListingId}/menu?locale=en`,
    );
    expect(treeRes.body.data[0].sections[0].items).toHaveLength(1);
    expect(treeRes.body.data[0].sections[0].items[0].title).toBe(
      'Khinkali (5 pcs)',
    );
  });

  test('deleting a section with items still in it is rejected', async () => {
    const res = await request(app)
      .delete(`/api/v1/listings/menu/sections/${sectionId}`)
      .set('Authorization', `Bearer ${vendor.accessToken}`);
    expect(res.status).toBe(409);
  });

  test('deleting a menu with sections still in it is rejected', async () => {
    const res = await request(app)
      .delete(`/api/v1/listings/menu/${menuId}`)
      .set('Authorization', `Bearer ${vendor.accessToken}`);
    expect(res.status).toBe(409);
  });

  test('disabling an item via update takes it off is_active without deleting it', async () => {
    const treeRes = await request(app).get(
      `/api/v1/listings/${restaurantListingId}/menu?locale=en`,
    );
    const itemId = treeRes.body.data[0].sections[0].items[0].id;

    const res = await request(app)
      .patch(`/api/v1/listings/menu/items/${itemId}`)
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({ isActive: false });
    expect(res.status).toBe(200);
    expect(res.body.data.is_active).toBe(false);
  });
});
