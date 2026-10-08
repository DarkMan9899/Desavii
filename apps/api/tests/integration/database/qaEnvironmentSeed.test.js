/**
 * Local QA environment seed (`seedDemoQaEnvironment.js`, behind
 * `npm run db:seed:qa`). Protects the contract the owner's local QA
 * marketplace depends on: real, category-valid listings (2 per category on
 * top of Sprint J's 3), one working login per role, non-public lifecycle
 * fixtures, bookings priced like the booking engine prices them, and a
 * calendar whose every quantity is explained by the inventory ledger.
 *
 * DB-only, like `sprintJMarketplaceCoverage.test.js`: the QA layer needs
 * nothing beyond the `seedAll()` baseline, so this test runs it alone and
 * scopes every assertion to its own `qa-` rows.
 */

import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import argon2 from 'argon2';
import config from '../../../src/config/index.js';
import { up } from '../../../src/infrastructure/database/migrate.js';
import { seedAll } from '../../../src/infrastructure/database/seeds/index.js';
import seedDemoQaEnvironment, {
  QA_ACCOUNTS,
  QA_PASSWORD,
  QA_PARTNER_SLUG,
} from '../../../src/infrastructure/database/seeds/demo/seedDemoQaEnvironment.js';
import { isUnitFieldApplicable } from '../../../src/core/domain/bookableUnitFieldApplicability.js';
import { MEAL_PLANS } from '../../../src/core/domain/roomAttributes.js';
import {
  listSeededPricing,
  findPriceBasisClaims,
  findDepartureCopyContradictions,
} from '../helpers/seedPricingModels.js';
import {
  getMysqlPool,
  closeMysqlPool,
} from '../../../src/infrastructure/database/mysqlPool.js';

const PUBLIC_CATEGORIES = [
  'hotels',
  'apartments',
  'villas',
  'guest-houses',
  'restaurants',
  'tours',
  'car-rentals',
  'attractions',
  'entertainment-venues',
];
const QA_LISTINGS_PER_CATEGORY = 2;
const QA_SCOPE = "l.slug LIKE 'qa-%'";
const PUBLIC_QA_SCOPE = "l.slug LIKE 'qa-%' AND l.slug NOT LIKE 'qa-fixture-%'";

// Column per unit field `bookableUnitFieldApplicability.js` scopes by unit type.
const UNIT_FIELD_COLUMNS = {
  maxGuests: 'max_guests',
  bedConfiguration: 'bed_configuration',
  timeSlotStart: 'time_slot_start',
  timeSlotEnd: 'time_slot_end',
  roomSizeSqm: 'room_size_sqm',
  bathroomType: 'bathroom_type',
  viewType: 'view_type',
  smokingPolicy: 'smoking_policy',
  mealPlan: 'meal_plan',
};

let pool;

beforeAll(async () => {
  await up();
  await seedAll();
  pool = getMysqlPool();
  await seedDemoQaEnvironment(pool);
}, 120_000);

afterAll(async () => {
  await closeMysqlPool();
});

async function qaUnits(extraWhere = '1 = 1') {
  const [rows] = await pool.query(
    `SELECT bu.*, but.code AS unit_type_code, l.slug
     FROM bookable_units bu
     JOIN bookable_unit_types but ON but.id = bu.bookable_unit_type_id
     JOIN listings l ON l.id = bu.listing_id
     WHERE ${PUBLIC_QA_SCOPE} AND ${extraWhere}`,
  );
  return rows;
}

describe('QA environment — public listings', () => {
  test.each(PUBLIC_CATEGORIES)(
    'category "%s" gains exactly 2 published, complete QA listings',
    async (categorySlug) => {
      const [rows] = await pool.query(
        `SELECT l.id, l.is_contact_visible, ll.latitude, ll.longitude,
           (SELECT COUNT(DISTINCT lang.code) FROM listing_translations lt
              JOIN languages lang ON lang.id = lt.language_id
             WHERE lt.listing_id = l.id AND lang.code IN ('en', 'hy', 'ru')
               AND lt.title <> '' AND lt.summary <> '' AND lt.description <> '') AS locales,
           (SELECT COUNT(*) FROM media m WHERE m.mediable_type = 'listing'
               AND m.mediable_id = l.id AND m.is_cover = 1) AS covers,
           (SELECT COUNT(*) FROM bookable_units bu WHERE bu.listing_id = l.id) AS units,
           (SELECT COUNT(*) FROM listing_amenity_listing a WHERE a.listing_id = l.id) AS amenities
         FROM listings l
         JOIN listing_category_listing lcl ON lcl.listing_id = l.id
         JOIN listing_categories c ON c.id = lcl.category_id
         JOIN listing_statuses ls ON ls.id = l.status_id
         JOIN listing_locations ll ON ll.listing_id = l.id
         WHERE c.slug = ? AND ls.code = 'PUBLISHED' AND ${QA_SCOPE}`,
        [categorySlug],
      );
      expect(rows).toHaveLength(QA_LISTINGS_PER_CATEGORY);
      rows.forEach((row) => {
        expect(row.locales).toBe(3);
        expect(row.covers).toBe(1);
        expect(row.units).toBeGreaterThan(0);
        expect(row.latitude).not.toBeNull();
        expect(row.longitude).not.toBeNull();
        expect(row.is_contact_visible).toBe(1);
      });
    },
  );

  test('every QA listing is priced with a model its category offers', async () => {
    const pricing = await listSeededPricing(pool, QA_SCOPE, []);
    expect(pricing.length).toBeGreaterThan(0);
    expect(pricing.filter((row) => !row.offered)).toEqual([]);
  });

  test('participant-priced copy never claims a basis the booking engine does not charge', async () => {
    const basis = await findPriceBasisClaims(pool, QA_SCOPE, []);
    const departures = await findDepartureCopyContradictions(
      pool,
      QA_SCOPE,
      [],
    );
    expect(basis.checked).toBeGreaterThan(0);
    expect(basis.claims).toEqual([]);
    expect(departures.checked).toBeGreaterThan(0);
    expect(departures.contradictions).toEqual([]);
  });

  test('every unit carries only the fields its unit type accepts', async () => {
    const units = await qaUnits();
    const inapplicable = units.flatMap((unit) =>
      Object.entries(UNIT_FIELD_COLUMNS)
        .filter(
          ([field, column]) =>
            unit[column] !== null &&
            !isUnitFieldApplicable(unit.unit_type_code, field),
        )
        .map(([field]) => `${unit.slug}/${unit.unit_label}: ${field}`),
    );
    expect(inapplicable).toEqual([]);
  });

  test('a car rental has exactly one VEHICLE unit whose capacity is its fleet', async () => {
    const vehicles = await qaUnits("but.code = 'VEHICLE'");
    const perListing = new Map();
    vehicles.forEach((unit) =>
      perListing.set(unit.slug, (perListing.get(unit.slug) ?? 0) + 1),
    );
    expect([...perListing.values()]).toEqual([1, 1]);
    vehicles.forEach((unit) => expect(unit.capacity).toBeGreaterThan(1));
  });
});

describe('QA environment — hotel room variety', () => {
  let rooms;

  beforeAll(async () => {
    rooms = await qaUnits("but.code = 'HOTEL_ROOM'");
  });

  test('the hotels cover single, double, child, crib, sofa and extra beds', async () => {
    const bedTypes = new Set(
      rooms.flatMap((room) => {
        const beds =
          typeof room.bed_configuration === 'string'
            ? JSON.parse(room.bed_configuration)
            : room.bed_configuration;
        return beds.map((bed) => bed.type);
      }),
    );
    ['SINGLE', 'DOUBLE', 'CHILD_BED', 'CRIB', 'SOFA_BED', 'EXTRA_BED'].forEach(
      (type) => expect(bedTypes).toContain(type),
    );
  });

  test('the hotels cover every meal plan, bathroom type and smoking policy', async () => {
    expect(new Set(rooms.map((room) => room.meal_plan))).toEqual(
      new Set(MEAL_PLANS),
    );
    expect(new Set(rooms.map((room) => room.bathroom_type))).toEqual(
      new Set(['PRIVATE', 'SHARED', 'ENSUITE']),
    );
    expect(new Set(rooms.map((room) => room.smoking_policy))).toEqual(
      new Set(['NON_SMOKING', 'SMOKING_ALLOWED']),
    );
    expect(new Set(rooms.map((room) => room.max_guests)).size).toBeGreaterThan(
      2,
    );
    expect(
      new Set(rooms.map((room) => room.room_size_sqm)).size,
    ).toBeGreaterThan(2);
  });

  test('at least one room lists accessibility amenities', async () => {
    const [rows] = await pool.query(
      `SELECT COUNT(*) AS n FROM bookable_unit_amenity_listing bual
       JOIN listing_amenities la ON la.id = bual.amenity_id
       WHERE bual.bookable_unit_id IN (?) AND la.name IN ('Step-free Access', 'Accessible Bathroom')`,
      [rooms.map((room) => room.id)],
    );
    expect(rows[0].n).toBe(2);
  });
});

describe('QA environment — non-public lifecycle fixtures', () => {
  test('one fixture per lifecycle state, none of them public', async () => {
    const [rows] = await pool.query(
      `SELECT ls.code AS status, ms.code AS moderation, l.moderation_notes, l.published_at, l.archived_at
       FROM listings l
       JOIN listing_statuses ls ON ls.id = l.status_id
       JOIN moderation_statuses ms ON ms.id = l.moderation_status_id
       WHERE l.slug LIKE 'qa-fixture-%'
       ORDER BY l.id`,
    );
    expect(rows.map((row) => [row.status, row.moderation])).toEqual([
      ['DRAFT', 'PENDING'],
      ['PENDING_REVIEW', 'PENDING'],
      ['DRAFT', 'REJECTED'],
      ['ARCHIVED', 'APPROVED'],
    ]);
    expect(rows[2].moderation_notes).toEqual(expect.any(String));
    expect(rows[3].archived_at).not.toBeNull();
    rows.slice(0, 3).forEach((row) => expect(row.published_at).toBeNull());
  });
});

describe('QA environment — accounts', () => {
  test.each(Object.entries(QA_ACCOUNTS))(
    'the %s account is ACTIVE, verified, holds its role and signs in with the QA password',
    async (key, account) => {
      const [[user]] = await pool.query(
        `SELECT u.password_hash, u.is_email_verified, us.code AS status,
           GROUP_CONCAT(r.code) AS roles
         FROM users u
         JOIN user_statuses us ON us.id = u.status_id
         JOIN role_user ru ON ru.user_id = u.id
         JOIN roles r ON r.id = ru.role_id
         WHERE u.normalized_email = ?
         GROUP BY u.id`,
        [account.email],
      );
      expect(user.status).toBe('ACTIVE');
      expect(user.is_email_verified).toBe(1);
      expect(user.roles).toBe(account.role);
      await expect(
        argon2.verify(user.password_hash, QA_PASSWORD),
      ).resolves.toBe(true);
    },
  );

  test('the QA Partner owns the company, with a Booking Manager and an assigned Manager', async () => {
    const [members] = await pool.query(
      `SELECT u.email, per.code AS role FROM partner_employees pe
       JOIN partners p ON p.id = pe.partner_id
       JOIN users u ON u.id = pe.user_id
       JOIN partner_employee_roles per ON per.id = pe.role_id
       WHERE p.slug = ? ORDER BY per.code`,
      [QA_PARTNER_SLUG],
    );
    expect(members).toEqual([
      {
        email: QA_ACCOUNTS.partnerBookingManager.email,
        role: 'BOOKING_MANAGER',
      },
      { email: QA_ACCOUNTS.partner.email, role: 'OWNER' },
    ]);
    const [[assignment]] = await pool.query(
      `SELECT COUNT(*) AS n FROM manager_companies mc
       JOIN partners p ON p.id = mc.partner_id
       JOIN users u ON u.id = mc.manager_user_id
       WHERE p.slug = ? AND u.normalized_email = ? AND mc.deleted_at IS NULL`,
      [QA_PARTNER_SLUG, QA_ACCOUNTS.manager.email],
    );
    expect(assignment.n).toBe(1);
  });

  test('the applicant has a partner application waiting for verification', async () => {
    const [[application]] = await pool.query(
      `SELECT vs.code AS verification FROM partners p
       JOIN users u ON u.id = p.owner_user_id
       JOIN moderation_statuses vs ON vs.id = p.verification_status_id
       WHERE u.normalized_email = ?`,
      [QA_ACCOUNTS.applicant.email],
    );
    expect(application.verification).toBe('PENDING');
  });
});

describe('QA environment — bookings and calendar', () => {
  let items;

  beforeAll(async () => {
    [items] = await pool.query(
      `SELECT b.total_amount, bs.code AS status, bt.code AS booking_type,
         bi.quantity, bi.guest_count, bi.unit_price_amount, bi.start_time,
         bi.booking_mode
       FROM bookings b
       JOIN booking_items bi ON bi.booking_id = b.id
       JOIN booking_statuses bs ON bs.id = b.status_id
       JOIN booking_types bt ON bt.id = b.booking_type_id
       JOIN listings l ON l.id = b.listing_id
       WHERE ${QA_SCOPE}`,
    );
  });

  test('bookings cover every reachable status and every booking type', async () => {
    expect(new Set(items.map((item) => item.status))).toEqual(
      new Set([
        'PENDING_VENDOR',
        'CONFIRMED',
        'REJECTED',
        'CANCELLED_BY_CUSTOMER',
        'COMPLETED',
      ]),
    );
    expect(new Set(items.map((item) => item.booking_type))).toEqual(
      new Set([
        'HOTEL_ROOM_BOOKING',
        'PROPERTY_BOOKING',
        'RESTAURANT_RESERVATION',
        'TOUR_BOOKING',
        'CAR_RENTAL_BOOKING',
      ]),
    );
  });

  test('a pending request is younger than the vendor SLA, so the start-up sweep keeps it pending', async () => {
    const [[pending]] = await pool.query(
      `SELECT COUNT(*) AS n,
         SUM(b.requested_at > UTC_TIMESTAMP(3) - INTERVAL ? HOUR) AS within_sla
       FROM bookings b
       JOIN booking_statuses bs ON bs.id = b.status_id
       JOIN listings l ON l.id = b.listing_id
       WHERE ${QA_SCOPE} AND bs.code = 'PENDING_VENDOR'`,
      [config.booking.pendingVendorSlaHours],
    );
    expect(pending.n).toBeGreaterThan(0);
    expect(Number(pending.within_sla)).toBe(pending.n);
  });

  test('a booking total is the one-unit range price times the quantity', async () => {
    items.forEach((item) =>
      expect(Number(item.total_amount)).toBe(
        Number(item.unit_price_amount) * item.quantity,
      ),
    );
  });

  test('a restaurant reservation is free, one slot, with its party size and time', async () => {
    const reservations = items.filter(
      (item) => item.booking_type === 'RESTAURANT_RESERVATION',
    );
    expect(reservations.length).toBeGreaterThan(0);
    reservations.forEach((item) => {
      expect(item.total_amount).toBe('0.00');
      expect(item.quantity).toBe(1);
      expect(item.guest_count).toBeGreaterThan(1);
      expect(item.start_time).toEqual(expect.any(String));
    });
    // Step L6.3B: an hourly hotel stay also records its guests.
    items
      .filter(
        (item) =>
          item.booking_type !== 'RESTAURANT_RESERVATION' &&
          item.booking_mode !== 'HOURLY',
      )
      .forEach((item) => expect(item.guest_count).toBeNull());
  });

  test('every calendar quantity equals capacity plus its ledger deltas', async () => {
    const [rows] = await pool.query(
      `SELECT ac.quantity_available, bu.capacity,
         COALESCE((SELECT SUM(il.delta) FROM inventory_ledger il
                   WHERE il.bookable_unit_id = ac.bookable_unit_id AND il.date = ac.date), 0) AS ledger
       FROM availability_calendar ac
       JOIN bookable_units bu ON bu.id = ac.bookable_unit_id
       JOIN listings l ON l.id = bu.listing_id
       WHERE ${QA_SCOPE}`,
    );
    expect(rows.length).toBeGreaterThan(0);
    const unexplained = rows.filter(
      (row) => row.quantity_available !== row.capacity + Number(row.ledger),
    );
    expect(unexplained).toEqual([]);
  });

  test('the calendar shows sold-out, limited, blocked and price-override dates', async () => {
    const [[counts]] = await pool.query(
      `SELECT
         SUM(ac.quantity_available = 0 AND st.code = 'AVAILABLE') AS sold_out,
         SUM(ac.quantity_available = 1 AND bu.capacity > 1) AS limited,
         SUM(st.code = 'BLOCKED') AS blocked,
         SUM(ac.price_override_amount IS NOT NULL) AS overrides
       FROM availability_calendar ac
       JOIN availability_statuses st ON st.id = ac.status_id
       JOIN bookable_units bu ON bu.id = ac.bookable_unit_id
       JOIN listings l ON l.id = bu.listing_id
       WHERE ${PUBLIC_QA_SCOPE}`,
    );
    expect(Number(counts.sold_out)).toBeGreaterThan(0);
    expect(Number(counts.limited)).toBeGreaterThan(0);
    expect(Number(counts.blocked)).toBeGreaterThan(0);
    expect(Number(counts.overrides)).toBeGreaterThan(0);
  });

  test('no temporary reservation hold is left behind', async () => {
    const [[holds]] = await pool.query(
      `SELECT COUNT(*) AS n FROM reservation_holds rh
       JOIN bookable_units bu ON bu.id = rh.bookable_unit_id
       JOIN listings l ON l.id = bu.listing_id
       WHERE ${QA_SCOPE}`,
    );
    expect(holds.n).toBe(0);
  });

  test('moderation queues hold a pending review and a pending promotion request', async () => {
    const [[queues]] = await pool.query(
      `SELECT
         (SELECT COUNT(*) FROM reviews r JOIN moderation_statuses ms ON ms.id = r.status_id
            JOIN listings l ON l.id = r.listing_id WHERE ${QA_SCOPE} AND ms.code = 'PENDING') AS reviews,
         (SELECT COUNT(*) FROM advertisements a JOIN advertisement_statuses s ON s.id = a.status_id
            JOIN listings l ON l.id = a.listing_id WHERE ${QA_SCOPE} AND s.code = 'REQUEST_SUBMITTED') AS promotions`,
    );
    expect(queues).toEqual({ reviews: 1, promotions: 1 });
  });
});

describe('QA environment — optional hourly hotel rooms (Step L6.3B)', () => {
  test('one hotel mixes nightly-only rooms with one hourly-enabled room; the other stays nightly-only', async () => {
    const [rooms] = await pool.query(
      `SELECT l.slug, bu.unit_label, bu.hourly_enabled
       FROM bookable_units bu
       JOIN bookable_unit_types but ON but.id = bu.bookable_unit_type_id
       JOIN listings l ON l.id = bu.listing_id
       WHERE ${PUBLIC_QA_SCOPE} AND but.code = 'HOTEL_ROOM'`,
    );
    const hourly = rooms.filter((room) => room.hourly_enabled === 1);
    expect(hourly.map((room) => [room.slug, room.unit_label])).toEqual([
      ['qa-ararat-view-grand-hotel', 'Superior Double with Ararat View'],
    ]);
    expect(
      rooms.filter(
        (room) =>
          room.slug === 'qa-ararat-view-grand-hotel' &&
          room.hourly_enabled === 0,
      ).length,
    ).toBeGreaterThan(0);
    expect(
      rooms
        .filter((room) => room.slug === 'qa-goris-cliffside-resort')
        .every((room) => room.hourly_enabled === 0),
    ).toBe(true);
  });

  test('hourly stays are priced by the hour and hold timed rooms that overlap within capacity', async () => {
    const [items] = await pool.query(
      `SELECT bi.id, bi.quantity, bi.unit_price_amount, bi.start_time, bi.end_time,
              bi.date_from, bu.capacity, bu.hourly_price_amount
       FROM booking_items bi
       JOIN bookable_units bu ON bu.id = bi.bookable_unit_id
       JOIN listings l ON l.id = bu.listing_id
       WHERE ${QA_SCOPE} AND bi.booking_mode = 'HOURLY'`,
    );
    expect(items).toHaveLength(2);
    items.forEach((item) => {
      const hours =
        Number(item.end_time.slice(0, 2)) - Number(item.start_time.slice(0, 2));
      expect(Number(item.unit_price_amount)).toBe(
        Number(item.hourly_price_amount) * hours,
      );
    });

    const [rows] = await pool.query(
      `SELECT booking_item_id, start_time, end_time, quantity
       FROM hourly_inventory_reservations
       WHERE booking_item_id IN (?) AND released_at IS NULL`,
      [items.map((item) => item.id)],
    );
    items.forEach((item) => {
      const own = rows.filter((row) => row.booking_item_id === item.id);
      expect(own.reduce((sum, row) => sum + row.quantity, 0)).toBe(
        item.quantity,
      );
    });
    const occupiedAt = (hour) =>
      rows
        .filter(
          (row) =>
            Number(row.start_time.slice(0, 2)) <= hour &&
            Number(row.end_time.slice(0, 2)) > hour,
        )
        .reduce((sum, row) => sum + row.quantity, 0);
    expect(occupiedAt(15)).toBe(4);
    expect(occupiedAt(15)).toBeLessThanOrEqual(items[0].capacity);
  });

  test('every lodging item records an explicit booking mode', async () => {
    const [[unmoded]] = await pool.query(
      `SELECT COUNT(*) AS n FROM booking_items bi
       JOIN bookable_units bu ON bu.id = bi.bookable_unit_id
       JOIN bookable_unit_types but ON but.id = bu.bookable_unit_type_id
       JOIN listings l ON l.id = bu.listing_id
       WHERE ${QA_SCOPE} AND but.code IN ('HOTEL_ROOM', 'PROPERTY_UNIT')
         AND bi.booking_mode IS NULL`,
    );
    expect(unmoded.n).toBe(0);
  });
});
