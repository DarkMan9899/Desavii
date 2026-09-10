/**
 * Sprint H (Blog + Marketing/SMM CMS). Exercises the Blog module
 * end-to-end against the real seeded `blog_posts`/`blog_post_statuses`/
 * `blog_categories`/`tags` schema (migration 0044): Admin grants the
 * MARKETING role, a Marketing user authors/publishes/schedules a post,
 * public visibility rules are proven server-side (never trusted from
 * the frontend alone), and role isolation is proven the same way
 * `managerLifecycle.test.js` proves it for MANAGER — a plain customer
 * can never reach the admin surface, and a Marketing user can never
 * grant itself broader access.
 */

import { describe, test, expect, beforeAll } from '@jest/globals';
import request from 'supertest';
import { up } from '../../../src/infrastructure/database/migrate.js';
import { seedAll } from '../../../src/infrastructure/database/seeds/index.js';
import app, { services } from '../../../src/app.js';
import { getMysqlPool } from '../../../src/infrastructure/database/mysqlPool.js';
import { resetRateLimits } from '../helpers/resetRateLimits.js';
import { DEV_CREDENTIALS } from '../../../src/infrastructure/database/seeds/005_dev_accounts.js';
import { sweepScheduledPublish } from '../../../src/modules/blog/jobs/scheduledPublishSweep.js';

let admin;
let customer;
let marketing;
let marketingUserId;

async function login(email, password) {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ email, password });
  return { accessToken: res.body.data.access_token };
}

async function registerFreshUser(label) {
  const email = `blog-${label}-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}@example.test`;
  const password = 'Sprint-H-Test-Pass1!';
  const res = await request(app).post('/api/v1/auth/register').send({
    email,
    password,
    firstName: 'Sprint H',
    lastName: label,
  });
  return {
    userId: res.body.data.user.id,
    accessToken: res.body.data.access_token,
    email,
    password,
  };
}

beforeAll(async () => {
  await up();
  await seedAll();
  await resetRateLimits();

  admin = await login(
    DEV_CREDENTIALS.admin.email,
    DEV_CREDENTIALS.admin.password,
  );
  customer = await login(
    DEV_CREDENTIALS.customer.email,
    DEV_CREDENTIALS.customer.password,
  );

  const fresh = await registerFreshUser('marketing');
  marketingUserId = fresh.userId;

  const promoteRes = await request(app)
    .post('/api/v1/blog/admin/marketing-role/promote')
    .set('Authorization', `Bearer ${admin.accessToken}`)
    .send({ userId: marketingUserId });
  expect(promoteRes.status).toBe(200);

  // A freshly-issued access token was minted before the role grant —
  // log back in so its roles claim reflects the promotion, same
  // "re-login after a role change" step `managerLifecycle.test.js`
  // itself needs.
  marketing = await login(fresh.email, fresh.password);
});

describe('Marketing role assignment (marketing.assign)', () => {
  test('a customer cannot promote a user to Marketing', async () => {
    const res = await request(app)
      .post('/api/v1/blog/admin/marketing-role/promote')
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({ userId: marketingUserId });
    expect(res.status).toBe(403);
  });

  test('a Marketing user cannot promote itself or anyone else (needs marketing.assign, not blog.manage)', async () => {
    const res = await request(app)
      .post('/api/v1/blog/admin/marketing-role/promote')
      .set('Authorization', `Bearer ${marketing.accessToken}`)
      .send({ userId: marketingUserId });
    expect(res.status).toBe(403);
  });
});

describe('Marketing authoring flow (blog.manage / blog.publish)', () => {
  let postId;
  let postSlug;

  test('a customer cannot create a draft', async () => {
    const res = await request(app)
      .post('/api/v1/blog/admin/posts')
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({ title: 'Should Not Be Created' });
    expect(res.status).toBe(403);
  });

  test('Marketing creates a draft', async () => {
    const res = await request(app)
      .post('/api/v1/blog/admin/posts')
      .set('Authorization', `Bearer ${marketing.accessToken}`)
      .send({ title: 'Exploring the Vernissage Market', languageCode: 'en' });
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('DRAFT');
    expect(res.body.data.slug).toBe('exploring-the-vernissage-market');
    postId = res.body.data.id;
    postSlug = res.body.data.slug;
  });

  test('a draft is not publicly visible by slug', async () => {
    const res = await request(app).get(`/api/v1/blog/posts/${postSlug}`);
    expect(res.status).toBe(404);
  });

  test('a draft is not publicly visible in the public list', async () => {
    const res = await request(app).get('/api/v1/blog/posts');
    expect(res.status).toBe(200);
    expect(res.body.data.find((row) => row.slug === postSlug)).toBeUndefined();
  });

  test('publish is rejected until the post has real content', async () => {
    const res = await request(app)
      .post(`/api/v1/blog/admin/posts/${postId}/publish`)
      .set('Authorization', `Bearer ${marketing.accessToken}`);
    expect(res.status).toBe(422);
  });

  test('Marketing fills in the English translation, category, and tags', async () => {
    const translationRes = await request(app)
      .put(`/api/v1/blog/admin/posts/${postId}/translations/en`)
      .set('Authorization', `Bearer ${marketing.accessToken}`)
      .send({
        title: 'Exploring the Vernissage Market',
        excerpt: 'A weekend guide to Yerevan’s open-air art market.',
        body: '# Vernissage\n\nHandicrafts, antiques, and Soviet-era finds.',
      });
    expect(translationRes.status).toBe(200);

    const settingsRes = await request(app)
      .patch(`/api/v1/blog/admin/posts/${postId}`)
      .set('Authorization', `Bearer ${marketing.accessToken}`)
      .send({
        categorySlug: 'experiences',
        tagNames: ['Yerevan', 'Weekend Trip'],
      });
    expect(settingsRes.status).toBe(200);
    expect(settingsRes.body.data.category_slug).toBe('experiences');
    expect(settingsRes.body.data.tags.map((t) => t.slug)).toEqual(
      expect.arrayContaining(['yerevan', 'weekend-trip']),
    );
  });

  test('a customer cannot publish, even knowing the post id', async () => {
    const res = await request(app)
      .post(`/api/v1/blog/admin/posts/${postId}/publish`)
      .set('Authorization', `Bearer ${customer.accessToken}`);
    expect(res.status).toBe(403);
  });

  test('Marketing publishes the post', async () => {
    const res = await request(app)
      .post(`/api/v1/blog/admin/posts/${postId}/publish`)
      .set('Authorization', `Bearer ${marketing.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('PUBLISHED');
    expect(res.body.data.published_at).not.toBeNull();
  });

  test('the published post is now publicly visible by slug, in English', async () => {
    const res = await request(app).get(
      `/api/v1/blog/posts/${postSlug}?locale=en`,
    );
    expect(res.status).toBe(200);
    expect(res.body.data.title).toBe('Exploring the Vernissage Market');
    expect(res.body.data.author).toBe('Sprint H marketing');
    expect(res.body.data.tags.length).toBe(2);
  });

  test('the published post appears in the public list', async () => {
    const res = await request(app).get('/api/v1/blog/posts?locale=en');
    expect(res.status).toBe(200);
    expect(res.body.data.find((row) => row.slug === postSlug)).toMatchObject({
      title: 'Exploring the Vernissage Market',
    });
  });

  test('Marketing unpublishes the post', async () => {
    const res = await request(app)
      .post(`/api/v1/blog/admin/posts/${postId}/unpublish`)
      .set('Authorization', `Bearer ${marketing.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('ARCHIVED');
  });

  test('an unpublished (archived) post is no longer publicly visible', async () => {
    const res = await request(app).get(`/api/v1/blog/posts/${postSlug}`);
    expect(res.status).toBe(404);
  });
});

describe('Scheduled publishing (spec §23)', () => {
  let scheduledPostId;
  let scheduledSlug;

  test('Marketing schedules a fully-written post for a future time', async () => {
    const createRes = await request(app)
      .post('/api/v1/blog/admin/posts')
      .set('Authorization', `Bearer ${marketing.accessToken}`)
      .send({ title: 'Autumn in Dilijan', languageCode: 'en' });
    scheduledPostId = createRes.body.data.id;
    scheduledSlug = createRes.body.data.slug;

    await request(app)
      .put(`/api/v1/blog/admin/posts/${scheduledPostId}/translations/en`)
      .set('Authorization', `Bearer ${marketing.accessToken}`)
      .send({
        title: 'Autumn in Dilijan',
        excerpt: 'Forest trails and mountain air.',
        body: 'Dilijan turns gold every October.',
      });

    const futureDate = new Date(Date.now() + 60_000).toISOString();
    const scheduleRes = await request(app)
      .post(`/api/v1/blog/admin/posts/${scheduledPostId}/schedule`)
      .set('Authorization', `Bearer ${marketing.accessToken}`)
      .send({ scheduledAt: futureDate });
    expect(scheduleRes.status).toBe(200);
    expect(scheduleRes.body.data.status).toBe('SCHEDULED');
  });

  test('a not-yet-due scheduled post is not publicly visible', async () => {
    const res = await request(app).get(`/api/v1/blog/posts/${scheduledSlug}`);
    expect(res.status).toBe(404);
  });

  test('once scheduled_at has passed, the post is publicly visible WITHOUT the sweep having run (public query is the real authority, spec §23)', async () => {
    const pool = getMysqlPool();
    await pool.query(
      'UPDATE blog_posts SET scheduled_at = DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 1 MINUTE) WHERE id = ?',
      [scheduledPostId],
    );

    const res = await request(app).get(
      `/api/v1/blog/posts/${scheduledSlug}?locale=en`,
    );
    expect(res.status).toBe(200);
    expect(res.body.data.title).toBe('Autumn in Dilijan');

    // The admin list still shows it as SCHEDULED — the sweep, not this
    // public read, is what flips the stored status row.
    const adminListRes = await request(app)
      .get('/api/v1/blog/admin/posts')
      .set('Authorization', `Bearer ${marketing.accessToken}`);
    expect(
      adminListRes.body.data.find((row) => row.id === scheduledPostId).status,
    ).toBe('SCHEDULED');
  });

  test('the sweep is directly callable outside BullMQ and flips the due post to PUBLISHED', async () => {
    const result = await sweepScheduledPublish(services.blogService);
    expect(result.published).toBeGreaterThanOrEqual(1);

    const adminDetailRes = await request(app)
      .get(`/api/v1/blog/admin/posts/${scheduledPostId}`)
      .set('Authorization', `Bearer ${marketing.accessToken}`);
    expect(adminDetailRes.body.data.status).toBe('PUBLISHED');
  });
});

describe('Public taxonomy', () => {
  test('lists seeded blog categories', async () => {
    const res = await request(app).get('/api/v1/blog/categories?locale=en');
    expect(res.status).toBe(200);
    expect(res.body.data.map((c) => c.slug)).toEqual(
      expect.arrayContaining(['travel-guides', 'armenia', 'experiences']),
    );
  });

  test('lists seeded tags plus any created during authoring', async () => {
    const res = await request(app).get('/api/v1/blog/tags?locale=en');
    expect(res.status).toBe(200);
    expect(res.body.data.map((t) => t.slug)).toEqual(
      expect.arrayContaining(['yerevan', 'hiking']),
    );
  });
});
