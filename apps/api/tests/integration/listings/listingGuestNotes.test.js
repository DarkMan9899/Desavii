/**
 * Listing Detail rebuild — guest guidance notes ("what to bring", "not
 * allowed", "know before you go"; docs/LISTING_DETAIL_FIELD_GAP.md §5).
 * `PATCH /listings/:id/guest-notes` replaces one language's notes; the
 * listing response carries them for the public page. Only the categories
 * a guest takes part in or drives accept them.
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
import { GUEST_NOTES_PER_KIND_MAX } from '../../../src/core/domain/listingGuestNotes.js';

let vendor;
let customer;
let partnerId;
let languageId;

async function login(email, password) {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ email, password });
  return res.body.data.access_token;
}

const as = (token, req) => req.set('Authorization', `Bearer ${token}`);

async function createListing(listingType) {
  const res = await as(vendor, request(app).post('/api/v1/listings')).send({
    partnerId,
    listingType,
    translations: [
      { languageId, title: `Guest notes ${listingType} ${Date.now()}` },
    ],
  });
  expect(res.status).toBe(201);
  return res.body.data.id;
}

const replaceNotes = (token, id, body) =>
  as(token, request(app).patch(`/api/v1/listings/${id}/guest-notes`)).send(
    body,
  );

const readListing = (id) =>
  as(vendor, request(app).get(`/api/v1/listings/${id}`));

beforeAll(async () => {
  await up();
  await seedAll();
  await resetRateLimits();
  vendor = await login(
    DEV_CREDENTIALS.vendor.email,
    DEV_CREDENTIALS.vendor.password,
  );
  customer = await login(
    DEV_CREDENTIALS.customer.email,
    DEV_CREDENTIALS.customer.password,
  );
  const pool = getMysqlPool();
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

describe('PATCH /listings/:id/guest-notes', () => {
  test('a tour stores its notes per kind, in order, and the listing response carries them', async () => {
    const id = await createListing('TOUR');
    const res = await replaceNotes(vendor, id, {
      languageCode: 'en',
      notes: [
        { kind: 'BRING', text: 'Comfortable walking shoes' },
        { kind: 'BRING', text: 'Passport for the border checkpoint' },
        { kind: 'NOT_ALLOWED', text: 'Drones' },
        {
          kind: 'KNOW_BEFORE',
          text: 'The monastery asks for covered shoulders',
        },
      ],
    });
    expect(res.status).toBe(200);
    expect(res.body.data.map((note) => [note.kind, note.text])).toEqual([
      ['BRING', 'Comfortable walking shoes'],
      ['BRING', 'Passport for the border checkpoint'],
      ['KNOW_BEFORE', 'The monastery asks for covered shoulders'],
      ['NOT_ALLOWED', 'Drones'],
    ]);

    const listing = (await readListing(id)).body.data;
    expect(listing.guest_notes).toHaveLength(4);
    expect(listing.guest_notes[0]).toMatchObject({
      language_code: 'en',
      kind: 'BRING',
      text: 'Comfortable walking shoes',
    });
  });

  test('each language is replaced on its own', async () => {
    const id = await createListing('CAR_RENTAL');
    await replaceNotes(vendor, id, {
      languageCode: 'en',
      notes: [{ kind: 'BRING', text: 'Driving licence' }],
    });
    await replaceNotes(vendor, id, {
      languageCode: 'hy',
      notes: [{ kind: 'BRING', text: 'Վարորդական վկայական' }],
    });
    // Replacing English again leaves Armenian untouched.
    const res = await replaceNotes(vendor, id, {
      languageCode: 'en',
      notes: [{ kind: 'NOT_ALLOWED', text: 'Off-road driving' }],
    });
    expect(res.status).toBe(200);

    // A plain filter, not `Object.groupBy`: that only exists from Node 21,
    // and the runtime contract (.nvmrc, CI) is Node 20.
    const notes = (await readListing(id)).body.data.guest_notes;
    const textsIn = (languageCode) =>
      notes
        .filter((note) => note.language_code === languageCode)
        .map((note) => note.text);
    expect(textsIn('en')).toEqual(['Off-road driving']);
    expect(textsIn('hy')).toEqual(['Վարորդական վկայական']);
  });

  test('an empty list clears that language', async () => {
    const id = await createListing('ATTRACTION');
    await replaceNotes(vendor, id, {
      languageCode: 'en',
      notes: [
        { kind: 'KNOW_BEFORE', text: 'Last entry 30 minutes before closing' },
      ],
    });
    const res = await replaceNotes(vendor, id, {
      languageCode: 'en',
      notes: [],
    });
    expect(res.status).toBe(200);
    expect((await readListing(id)).body.data.guest_notes).toEqual([]);
  });

  test('a hotel does not accept guest notes', async () => {
    const id = await createListing('HOTEL');
    const res = await replaceNotes(vendor, id, {
      notes: [{ kind: 'BRING', text: 'Swimsuit' }],
    });
    expect(res.status).toBe(422);
    expect(res.body.error.details).toEqual([
      expect.objectContaining({ issue: 'GUEST_NOTES_NOT_APPLICABLE' }),
    ]);
    expect((await readListing(id)).body.data.guest_notes).toEqual([]);
  });

  test('each kind is capped on its own, and unknown kinds or empty text are refused', async () => {
    const id = await createListing('TOUR');
    const tooMany = Array.from(
      { length: GUEST_NOTES_PER_KIND_MAX + 1 },
      (_, i) => ({
        kind: 'BRING',
        text: `Item ${i}`,
      }),
    );
    expect((await replaceNotes(vendor, id, { notes: tooMany })).status).toBe(
      422,
    );

    // The cap is per kind: the maximum of every kind together is fine.
    const full = ['BRING', 'NOT_ALLOWED', 'KNOW_BEFORE'].flatMap((kind) =>
      Array.from({ length: GUEST_NOTES_PER_KIND_MAX }, (_, i) => ({
        kind,
        text: `${kind} ${i}`,
      })),
    );
    expect((await replaceNotes(vendor, id, { notes: full })).status).toBe(200);

    expect(
      (
        await replaceNotes(vendor, id, {
          notes: [{ kind: 'OTHER', text: 'x' }],
        })
      ).status,
    ).toBe(422);
    expect(
      (
        await replaceNotes(vendor, id, {
          notes: [{ kind: 'BRING', text: '   ' }],
        })
      ).status,
    ).toBe(422);
  });

  test('only the owner (or listing.update) may write them', async () => {
    const id = await createListing('TOUR');
    const res = await replaceNotes(customer, id, {
      notes: [{ kind: 'BRING', text: 'Water' }],
    });
    expect([403, 404]).toContain(res.status);
    expect(
      (
        await request(app)
          .patch(`/api/v1/listings/${id}/guest-notes`)
          .send({ notes: [] })
      ).status,
    ).toBe(401);
  });
});
