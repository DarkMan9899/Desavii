/**
 * Step A4 — retention purge. Verifies the exact predicates against the
 * REAL local dev clock (`UTC_TIMESTAMP(3)`) rather than a fixed test
 * date, since both purge queries are self-contained and always compute
 * "now" fresh from the database (see the repository's own header for
 * why — never a JS-computed boundary passed in).
 *
 * Calendar-day arithmetic below (`shiftDate`) is pure UTC `Date` math
 * used ONLY to construct fixture values from the real "today" — it
 * never stands in for the Yerevan-timezone logic under test, which
 * lives entirely in the repository's own SQL.
 */

import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { v4 as uuid } from 'uuid';
import { up } from '../../../src/infrastructure/database/migrate.js';
import {
  getMysqlPool,
  closeMysqlPool,
} from '../../../src/infrastructure/database/mysqlPool.js';
import { MySqlEngagementAnalyticsAggregationRepository } from '../../../src/modules/engagementAnalytics/repositories/mysqlEngagementAnalyticsAggregationRepository.js';
import { EngagementAnalyticsAggregationService } from '../../../src/modules/engagementAnalytics/services/engagementAnalyticsAggregationService.js';

let pool;
let repository;
let service;
let todayYerevan; // 'YYYY-MM-DD', the real current Asia/Yerevan business date

function shiftDate(dayStr, deltaDays) {
  const [y, m, d] = dayStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + deltaDays);
  return dt.toISOString().slice(0, 10);
}

/**
 * Pure wall-clock millisecond arithmetic on a literal
 * `'YYYY-MM-DD HH:MM:SS.mmm'` instant string — parsed/formatted via UTC
 * getters only, exactly mirroring how MySQL treats a string DATETIME
 * parameter (no timezone reinterpretation either direction). Used only
 * to nudge a boundary fixture by ±1ms, including across a whole-second
 * rollover (e.g. `...20:00:00.000` - 1ms = `...19:59:59.999`), which
 * naive string-slicing of the milliseconds digits alone cannot do
 * correctly.
 */
function addMillis(instantStr, deltaMs) {
  const [datePart, timePart] = instantStr.split(' ');
  const [y, m, d] = datePart.split('-').map(Number);
  const [hh, mm, rest] = timePart.split(':');
  const [ss, ms] = rest.split('.').map(Number);
  const dt = new Date(
    Date.UTC(y, m - 1, d, Number(hh), Number(mm), ss, ms) + deltaMs,
  );
  const pad = (n, len = 2) => String(n).padStart(len, '0');
  return (
    `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())} ` +
    `${pad(dt.getUTCHours())}:${pad(dt.getUTCMinutes())}:${pad(dt.getUTCSeconds())}.${pad(dt.getUTCMilliseconds(), 3)}`
  );
}

async function insertRawEvent({
  eventId = uuid(),
  occurredAt,
  listingId = null,
}) {
  await pool.query(
    `INSERT INTO analytics_events (event_id, event_name, occurred_at, listing_id)
     VALUES (?, 'listing_viewed', ?, ?)`,
    [eventId, occurredAt, listingId],
  );
}

async function eventExists(eventId) {
  const [rows] = await pool.query(
    `SELECT 1 FROM analytics_events WHERE event_id = ?`,
    [eventId],
  );
  return rows.length > 0;
}

async function insertDailyRow(table, keyColumn, keyValue, day) {
  if (table === 'listing_analytics_daily') {
    await pool.query(
      `INSERT INTO listing_analytics_daily (listing_id, day, partner_id) VALUES (?, ?, 1)
       ON DUPLICATE KEY UPDATE partner_id = VALUES(partner_id)`,
      [keyValue, day],
    );
  } else if (table === 'company_analytics_daily') {
    await pool.query(
      `INSERT INTO company_analytics_daily (partner_id, day) VALUES (?, ?)
       ON DUPLICATE KEY UPDATE partner_id = VALUES(partner_id)`,
      [keyValue, day],
    );
  } else {
    await pool.query(
      `INSERT INTO promotion_analytics_daily (promotion_id, day, partner_id) VALUES (?, ?, 1)
       ON DUPLICATE KEY UPDATE partner_id = VALUES(partner_id)`,
      [keyValue, day],
    );
  }
}

async function dailyRowExists(table, keyColumn, keyValue, day) {
  const [rows] = await pool.query(
    `SELECT 1 FROM ${table} WHERE ${keyColumn} = ? AND day = ?`,
    [keyValue, day],
  );
  return rows.length > 0;
}

function randomId(base) {
  return base + Math.floor(Math.random() * 90_000);
}

beforeAll(async () => {
  await up();
  pool = getMysqlPool();
  repository = new MySqlEngagementAnalyticsAggregationRepository(pool);
  service = new EngagementAnalyticsAggregationService({
    engagementAnalyticsAggregationRepository: repository,
  });
  todayYerevan = await repository.getCurrentBusinessDate();
});

afterAll(async () => {
  await closeMysqlPool();
});

describe('Raw event retention (brief §18/§19/§22/§23)', () => {
  // The repository purges strictly before the Yerevan-midnight START of
  // business date (today - 90), i.e. before (today - 91) 20:00:00 UTC —
  // one full UTC day more conservative than a naive `now - 90*24h`
  // instant, so the oldest day a 90-day dashboard window needs is always
  // fully intact (brief §22/§23's resolution, documented on the
  // repository method itself).
  const oldestNeededDay = () => shiftDate(todayYerevan, -90);
  const boundaryInstant = () =>
    `${shiftDate(oldestNeededDay(), -1)} 20:00:00.000`;

  test('an event 1ms before the boundary is purged; exactly at the boundary and 1ms after are retained', async () => {
    const beforeId = uuid();
    const atId = uuid();
    const afterId = uuid();
    const boundary = boundaryInstant();
    const beforeMs = addMillis(boundary, -1);
    const afterMs = addMillis(boundary, 1);

    await insertRawEvent({ eventId: beforeId, occurredAt: beforeMs });
    await insertRawEvent({ eventId: atId, occurredAt: boundary });
    await insertRawEvent({ eventId: afterId, occurredAt: afterMs });

    await service.purgeRawEvents();

    expect(await eventExists(beforeId)).toBe(false);
    expect(await eventExists(atId)).toBe(true);
    expect(await eventExists(afterId)).toBe(true);

    // cleanup the two retained fixtures
    await pool.query(`DELETE FROM analytics_events WHERE event_id IN (?, ?)`, [
      atId,
      afterId,
    ]);
  });

  test('a genuinely recent event is always retained', async () => {
    const recentId = uuid();
    await insertRawEvent({
      eventId: recentId,
      occurredAt: `${todayYerevan} 12:00:00.000`,
    });
    await service.purgeRawEvents();
    expect(await eventExists(recentId)).toBe(true);
    await pool.query(`DELETE FROM analytics_events WHERE event_id = ?`, [
      recentId,
    ]);
  });

  test('the FULL oldest business date a 90-day Partner window needs (today - 90, start through end) survives purge intact', async () => {
    const day = oldestNeededDay();
    const dayStartInstant = `${shiftDate(day, -1)} 20:00:00.000`;
    const dayEndMinus1msInstant = `${day} 19:59:59.999`;

    const startId = uuid();
    const endId = uuid();
    await insertRawEvent({ eventId: startId, occurredAt: dayStartInstant });
    await insertRawEvent({ eventId: endId, occurredAt: dayEndMinus1msInstant });

    await service.purgeRawEvents();

    expect(await eventExists(startId)).toBe(true);
    expect(await eventExists(endId)).toBe(true);

    await pool.query(`DELETE FROM analytics_events WHERE event_id IN (?, ?)`, [
      startId,
      endId,
    ]);
  });

  test('collection being disabled does not block raw retention purge (brief §39)', async () => {
    const originalValue = process.env.ANALYTICS_COLLECTION_ENABLED;
    process.env.ANALYTICS_COLLECTION_ENABLED = 'false';
    try {
      const oldId = uuid();
      await insertRawEvent({
        eventId: oldId,
        occurredAt: '2020-01-01 00:00:00.000',
      });
      await service.purgeRawEvents();
      expect(await eventExists(oldId)).toBe(false);
    } finally {
      process.env.ANALYTICS_COLLECTION_ENABLED = originalValue;
    }
  });
});

describe('Daily aggregate retention — 24 months (brief §20/§36)', () => {
  test('the exact SQL cutoff (day < today - 24 MONTH) is respected at its boundary, for all three tables', async () => {
    const [[{ cutoff }]] = await pool.query(
      `SELECT DATE_SUB(?, INTERVAL 24 MONTH) AS cutoff`,
      [todayYerevan],
    );
    const { toDateString } =
      await import('../../../src/infrastructure/database/dateFormat.js');
    const exactCutoff = toDateString(cutoff);
    const dayBefore = shiftDate(exactCutoff, -1);
    const dayAfter = shiftDate(exactCutoff, 1);

    const listingOld = randomId(910_000);
    const listingAtCutoff = randomId(910_000);
    const listingAfter = randomId(910_000);
    const companyOld = randomId(810_000);
    const companyAtCutoff = randomId(810_000);
    const promotionOld = randomId(710_000);
    const promotionAtCutoff = randomId(710_000);

    await insertDailyRow(
      'listing_analytics_daily',
      'listing_id',
      listingOld,
      dayBefore,
    );
    await insertDailyRow(
      'listing_analytics_daily',
      'listing_id',
      listingAtCutoff,
      exactCutoff,
    );
    await insertDailyRow(
      'listing_analytics_daily',
      'listing_id',
      listingAfter,
      dayAfter,
    );
    await insertDailyRow(
      'company_analytics_daily',
      'partner_id',
      companyOld,
      dayBefore,
    );
    await insertDailyRow(
      'company_analytics_daily',
      'partner_id',
      companyAtCutoff,
      exactCutoff,
    );
    await insertDailyRow(
      'promotion_analytics_daily',
      'promotion_id',
      promotionOld,
      dayBefore,
    );
    await insertDailyRow(
      'promotion_analytics_daily',
      'promotion_id',
      promotionAtCutoff,
      exactCutoff,
    );

    await service.purgeAggregates();

    expect(
      await dailyRowExists(
        'listing_analytics_daily',
        'listing_id',
        listingOld,
        dayBefore,
      ),
    ).toBe(false);
    expect(
      await dailyRowExists(
        'listing_analytics_daily',
        'listing_id',
        listingAtCutoff,
        exactCutoff,
      ),
    ).toBe(true);
    expect(
      await dailyRowExists(
        'listing_analytics_daily',
        'listing_id',
        listingAfter,
        dayAfter,
      ),
    ).toBe(true);
    expect(
      await dailyRowExists(
        'company_analytics_daily',
        'partner_id',
        companyOld,
        dayBefore,
      ),
    ).toBe(false);
    expect(
      await dailyRowExists(
        'company_analytics_daily',
        'partner_id',
        companyAtCutoff,
        exactCutoff,
      ),
    ).toBe(true);
    expect(
      await dailyRowExists(
        'promotion_analytics_daily',
        'promotion_id',
        promotionOld,
        dayBefore,
      ),
    ).toBe(false);
    expect(
      await dailyRowExists(
        'promotion_analytics_daily',
        'promotion_id',
        promotionAtCutoff,
        exactCutoff,
      ),
    ).toBe(true);

    // cleanup survivors
    await pool.query(
      `DELETE FROM listing_analytics_daily WHERE listing_id IN (?, ?)`,
      [listingAtCutoff, listingAfter],
    );
    await pool.query(
      `DELETE FROM company_analytics_daily WHERE partner_id = ?`,
      [companyAtCutoff],
    );
    await pool.query(
      `DELETE FROM promotion_analytics_daily WHERE promotion_id = ?`,
      [promotionAtCutoff],
    );
  });

  test('a genuinely recent daily row and other partners/entities are unaffected', async () => {
    const listingId = randomId(920_000);
    await insertDailyRow(
      'listing_analytics_daily',
      'listing_id',
      listingId,
      shiftDate(todayYerevan, -1),
    );
    await service.purgeAggregates();
    const [rows] = await pool.query(
      `SELECT 1 FROM listing_analytics_daily WHERE listing_id = ?`,
      [listingId],
    );
    expect(rows.length).toBe(1);
    await pool.query(
      `DELETE FROM listing_analytics_daily WHERE listing_id = ?`,
      [listingId],
    );
  });
});
