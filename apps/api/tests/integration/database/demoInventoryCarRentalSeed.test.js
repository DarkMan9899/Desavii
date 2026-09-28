/**
 * Step L6.2C — the demo inventory seed builds its Car Rental listing the way
 * the API model requires (`core/domain/listingTypeBookableUnitTypes.js`):
 * one CAR_RENTAL listing, exactly one VEHICLE unit, the fleet size as that
 * unit's capacity, and the flow-F OTA baseline consuming one car of the
 * fleet rather than a whole unit.
 *
 * Runs the real demo pipeline (`seedDemoMarketplace` then
 * `seedDemoInventoryScenarios`, in `cli/seedDemo.js`'s order) on one
 * connection inside a transaction that is always rolled back, so the shared
 * test database is left exactly as the global setup made it.
 */

import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { up } from '../../../src/infrastructure/database/migrate.js';
import { seedAll } from '../../../src/infrastructure/database/seeds/index.js';
import seedDemoMarketplace from '../../../src/infrastructure/database/seeds/demo/seedDemoMarketplace.js';
import seedDemoInventoryScenarios, {
  DEMO_FLEET_CAPACITY,
} from '../../../src/infrastructure/database/seeds/demo/seedDemoInventoryScenarios.js';
import { isBookableUnitTypeAllowed } from '../../../src/core/domain/listingTypeBookableUnitTypes.js';
import {
  getMysqlPool,
  closeMysqlPool,
} from '../../../src/infrastructure/database/mysqlPool.js';

const FLEET_SLUG = 'demo-vendor-ararat-valley-fleet';

let connection;
let summary;

beforeAll(async () => {
  await up();
  await seedAll();
  connection = await getMysqlPool().getConnection();
  await connection.beginTransaction();
  await seedDemoMarketplace(connection);
  summary = await seedDemoInventoryScenarios(connection);
}, 120_000);

afterAll(async () => {
  await connection.rollback();
  connection.release();
  await closeMysqlPool();
});

async function unitsOf(listingId) {
  const [rows] = await connection.query(
    `SELECT bu.id, but.code AS unit_type, bu.capacity
     FROM bookable_units bu
     JOIN bookable_unit_types but ON but.id = bu.bookable_unit_type_id
     WHERE bu.listing_id = ? AND bu.deleted_at IS NULL`,
    [listingId],
  );
  return rows;
}

describe('demo inventory seed — Car Rental fleet model (Step L6.2C)', () => {
  test('the fleet is one CAR_RENTAL listing with exactly one VEHICLE unit sized to the fleet', async () => {
    const [[listing]] = await connection.query(
      `SELECT l.id, lt.code AS listing_type
       FROM listings l JOIN listing_types lt ON lt.id = l.listing_type_id
       WHERE l.slug = ?`,
      [FLEET_SLUG],
    );
    expect(listing).toEqual({
      id: summary.listings.carRentalListingId,
      listing_type: 'CAR_RENTAL',
    });

    const units = await unitsOf(listing.id);
    expect(units).toEqual([
      {
        id: summary.units.fleetUnitId,
        unit_type: 'VEHICLE',
        capacity: DEMO_FLEET_CAPACITY,
      },
    ]);
    expect(DEMO_FLEET_CAPACITY).toBe(3);
  });

  test('the OTA baseline takes one car out of the fleet, leaving the rest rentable', async () => {
    const [[reservation]] = await connection.query(
      'SELECT date_from, quantity FROM external_reservations WHERE bookable_unit_id = ?',
      [summary.units.fleetUnitId],
    );
    expect(reservation.quantity).toBe(1);

    const [[day]] = await connection.query(
      'SELECT quantity_available FROM availability_calendar WHERE bookable_unit_id = ? AND date = ?',
      [summary.units.fleetUnitId, reservation.date_from],
    );
    expect(day.quantity_available).toBe(DEMO_FLEET_CAPACITY - 1);
  });

  test("every demo listing's units match its listing type, and no Car Rental listing has more than one vehicle", async () => {
    const [rows] = await connection.query(
      `SELECT l.id AS listing_id, lt.code AS listing_type, but.code AS unit_type
       FROM bookable_units bu
       JOIN bookable_unit_types but ON but.id = bu.bookable_unit_type_id
       JOIN listings l ON l.id = bu.listing_id
       JOIN listing_types lt ON lt.id = l.listing_type_id
       WHERE bu.deleted_at IS NULL AND l.slug LIKE 'demo-%'`,
    );
    expect(rows.length).toBeGreaterThan(0);
    rows.forEach((row) => {
      expect(isBookableUnitTypeAllowed(row.listing_type, row.unit_type)).toBe(
        true,
      );
    });

    const vehiclesPerCarRental = {};
    rows
      .filter((row) => row.listing_type === 'CAR_RENTAL')
      .forEach((row) => {
        vehiclesPerCarRental[row.listing_id] =
          (vehiclesPerCarRental[row.listing_id] ?? 0) + 1;
      });
    expect(Math.max(...Object.values(vehiclesPerCarRental))).toBe(1);
  });
});
