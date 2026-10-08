/**
 * Local QA environment — a complete, synthetic marketplace an owner can log
 * into with one account per role (`npm run db:seed:qa -- --confirm`, see
 * `cli/seedQaDev.js`).
 *
 * Layered on top of `seedAll()` + `seedDemoSprintJCatalog` (3 public
 * listings per category). This module adds, all clearly synthetic:
 * - one QA account per platform role, plus a partner Booking Manager and a
 *   pending partner applicant — every one signs in with `QA_PASSWORD`;
 * - the QA Partner company owning 2 more public listings per category
 *   (`qaCatalogAccommodation.js` + `qaCatalogExperiences.js`), so every
 *   category shows exactly 5, and 4 non-public lifecycle fixtures
 *   (`qaModerationFixtures.js`);
 * - calendar scenarios (price overrides, a limited date, a sold-out date,
 *   maintenance blocks, closed weekdays) and bookings in every reachable
 *   status, each capacity change mirrored in `inventory_ledger` exactly as
 *   `AvailabilityService` writes it;
 * - reviews and one pending promotion request for the moderation queues.
 *
 * Depends only on the `seedAll()` baseline, so its integration test runs
 * it alone. Same raw-SQL convention as every `demo/` seed (infrastructure
 * may not import modules); never runs in production.
 */

import config from '../../../../config/index.js';
import { getIdByCode, getIdsByCode } from '../helpers.js';
import {
  addDays,
  toSqlDate,
  toSqlDateTime,
} from './seedDemoInventoryScenarios.js';
import { insertLocalizedRows } from './seedDemoListingRichContent.js';
import {
  BOOKING_MODES,
  parseWholeHour,
  resolveBookingMode,
} from '../../../../core/domain/hourlyStay.js';
import {
  DEMO_PASSWORD,
  createUser,
  createPartner,
  createFullListing,
  loadCatalogContext,
} from './seedDemoSprintJCatalog.js';
import { QA_ACCOMMODATION_LISTINGS } from './qaCatalogAccommodation.js';
import { QA_EXPERIENCE_LISTINGS } from './qaCatalogExperiences.js';
import { QA_MODERATION_FIXTURES } from './qaModerationFixtures.js';

/** The repository's documented, local-only demo password — never valid anywhere else. */
export const QA_PASSWORD = DEMO_PASSWORD;

/** One synthetic account per role. `.local` addresses can never reach a real inbox. */
export const QA_ACCOUNTS = Object.freeze({
  customer: {
    email: 'qa.customer@desavii.local',
    fullName: 'QA Customer',
    role: 'CUSTOMER',
  },
  partner: {
    email: 'qa.partner@desavii.local',
    fullName: 'QA Partner',
    role: 'CUSTOMER',
  },
  partnerBookingManager: {
    email: 'qa.partner.bookings@desavii.local',
    fullName: 'QA Booking Manager',
    role: 'CUSTOMER',
  },
  moderator: {
    email: 'qa.moderator@desavii.local',
    fullName: 'QA Moderator',
    role: 'MODERATOR',
  },
  admin: {
    email: 'qa.admin@desavii.local',
    fullName: 'QA Admin',
    role: 'ADMIN',
  },
  superAdmin: {
    email: 'qa.superadmin@desavii.local',
    fullName: 'QA Super Admin',
    role: 'SUPER_ADMIN',
  },
  support: {
    email: 'qa.support@desavii.local',
    fullName: 'QA Support',
    role: 'SUPPORT',
  },
  manager: {
    email: 'qa.manager@desavii.local',
    fullName: 'QA Manager',
    role: 'MANAGER',
  },
  marketing: {
    email: 'qa.marketing@desavii.local',
    fullName: 'QA Marketing',
    role: 'MARKETING',
  },
  applicant: {
    email: 'qa.applicant@desavii.local',
    fullName: 'QA Applicant',
    role: 'CUSTOMER',
  },
});

export const QA_PARTNER_SLUG = 'desavii-qa-hospitality';

const QA_PARTNER = {
  slug: QA_PARTNER_SLUG,
  legalName: 'Desavii QA Hospitality Group LLC',
  displayName: 'Desavii QA Hospitality Group',
  email: QA_ACCOUNTS.partner.email,
  phone: '+374 10 555 010',
  translations: {
    en: 'A synthetic local QA company operating listings in every Desavii category — demo data only.',
    hy: 'Սինթետիկ տեղական QA ընկերություն, որը կառավարում է հայտարարություններ Desavii-ի բոլոր կատեգորիաներում՝ միայն ցուցադրական տվյալներ։',
    ru: 'Синтетическая локальная QA-компания с объявлениями во всех категориях Desavii — только демонстрационные данные.',
  },
};

const QA_APPLICANT_PARTNER = {
  slug: 'lori-valley-eco-cabins',
  legalName: 'Lori Valley Eco Cabins LLC',
  displayName: 'Lori Valley Eco Cabins',
  email: QA_ACCOUNTS.applicant.email,
  phone: '+374 10 555 020',
  translations: {
    en: 'Four wooden eco cabins in the Lori forest — a partner application waiting for verification.',
  },
};

export const QA_PUBLIC_LISTINGS = [
  ...QA_ACCOMMODATION_LISTINGS,
  ...QA_EXPERIENCE_LISTINGS,
];

const CLOSED_WEEKDAYS_BY_SLUG = new Map(
  QA_PUBLIC_LISTINGS.map((spec) => [spec.slug, spec.closedWeekdays ?? []]),
);

// Mirrors `LEDGER_SOURCE_TYPES` (modules/availability) — infrastructure may
// not import modules, same reason `seedDemoInventoryScenarios.js` gives.
const LEDGER = Object.freeze({
  BOOKING: 'TRAVELHUB_BOOKING',
  MANUAL_BLOCK: 'MANUAL_BLOCK',
  EXTERNAL_RESERVATION: 'EXTERNAL_RESERVATION',
});

const PENDING_REQUEST_AGE_MS = 3 * 60 * 60 * 1000;

// Mirrors `ACCOMMODATION_BOOKABLE_UNIT_TYPES` (core/domain): lodging
// consumes nights, so `date_to` (checkout) is never an occupied date.
const NIGHTLY_UNIT_TYPES = ['HOTEL_ROOM', 'PROPERTY_UNIT'];

/**
 * Calendar variety, in days from today. PRICE writes a per-date override
 * (status/quantity untouched, like a Partner's price-only save); BLOCK and
 * EXTERNAL consume capacity through the ledger, like `createManualBlock`
 * and `createExternalReservation`.
 */
const QA_CALENDAR_SCENARIOS = [
  {
    kind: 'PRICE',
    listing: 'qa-ararat-view-grand-hotel',
    unit: 'Superior Double with Ararat View',
    from: 14,
    to: 16,
    amount: 52000,
  },
  {
    kind: 'PRICE',
    listing: 'qa-sevan-peninsula-lake-villa',
    unit: 'Whole Villa',
    from: 35,
    to: 37,
    amount: 115000,
  },
  {
    kind: 'PRICE',
    listing: 'qa-tatev-monastery-wings-of-tatev-tour',
    unit: 'Daily Departure',
    from: 26,
    to: 28,
    amount: 25000,
  },
  {
    kind: 'EXTERNAL',
    listing: 'qa-ararat-view-grand-hotel',
    unit: 'Classic Single Room',
    from: 6,
    to: 7,
    quantity: 5,
    source: 'PHONE',
    guestName: 'Conference group',
    notes: 'Leaves one Classic Single on this night — limited availability.',
  },
  {
    kind: 'EXTERNAL',
    listing: 'qa-goris-cliffside-resort',
    unit: 'Economy Twin, Shared Bathroom',
    from: 9,
    to: 10,
    quantity: 4,
    source: 'BOOKING_COM',
    guestName: 'Hiking club group',
    notes: 'Every Economy Twin is taken on this night — sold out.',
  },
  {
    kind: 'EXTERNAL',
    listing: 'qa-electric-city-hatchback',
    unit: 'Electric Hatchback',
    from: 12,
    to: 13,
    quantity: 3,
    source: 'PARTNER_WEBSITE',
    guestName: 'Corporate rental',
    notes: 'Three of four cars out — one left on these days.',
  },
  {
    kind: 'BLOCK',
    listing: 'qa-ararat-view-grand-hotel',
    unit: 'Family Suite',
    from: 18,
    to: 20,
    quantity: 2,
    reason: 'MAINTENANCE',
    notes: 'Bathroom renovation in both Family Suites.',
  },
  {
    kind: 'BLOCK',
    listing: 'qa-dilijan-pine-ridge-villa',
    unit: 'Whole Villa',
    from: 50,
    to: 56,
    quantity: 1,
    reason: 'OWNER_USE',
    notes: 'The owners stay at the villa this week.',
  },
];

/**
 * Bookings by the QA Customer, in days from today. `status` is the end
 * state; past COMPLETED stays never touch the calendar (it starts today,
 * like every demo calendar window).
 */
const QA_BOOKINGS = [
  {
    ref: 'QA000001',
    listing: 'qa-ararat-view-grand-hotel',
    unit: 'Superior Double with Ararat View',
    from: 10,
    to: 13,
    quantity: 1,
    status: 'CONFIRMED',
  },
  {
    ref: 'QA000002',
    listing: 'qa-goris-cliffside-resort',
    unit: 'Mountain Double with Extra Bed',
    from: 20,
    to: 22,
    quantity: 2,
    status: 'PENDING_VENDOR',
    notes: 'We are arriving late, around 22:00.',
  },
  {
    ref: 'QA000003',
    listing: 'qa-northern-avenue-designer-loft',
    unit: 'Whole Loft',
    from: 30,
    to: 33,
    quantity: 1,
    status: 'REJECTED',
    vendorNotes:
      'The loft is closed for repainting on these dates. Please choose other dates.',
  },
  {
    ref: 'QA000004',
    listing: 'qa-dilijan-pine-ridge-villa',
    unit: 'Whole Villa',
    from: 40,
    to: 43,
    quantity: 1,
    status: 'CANCELLED_BY_CUSTOMER',
    cancellationReason: 'Our travel dates changed.',
  },
  {
    ref: 'QA000005',
    listing: 'qa-lavash-and-vine-wine-restaurant',
    unit: 'Dining Room',
    from: 3,
    to: 3,
    quantity: 1,
    guestCount: 4,
    startTime: '19:30:00',
    status: 'PENDING_VENDOR',
    notes: 'A table on the terrace, please.',
  },
  {
    ref: 'QA000006',
    listing: 'qa-dilijan-mountain-trout-house',
    unit: 'Riverside Decks',
    from: 5,
    to: 5,
    quantity: 1,
    guestCount: 2,
    startTime: '13:00:00',
    status: 'CONFIRMED',
  },
  {
    ref: 'QA000007',
    listing: 'qa-tatev-monastery-wings-of-tatev-tour',
    unit: 'Daily Departure',
    from: 15,
    to: 15,
    quantity: 3,
    status: 'CONFIRMED',
  },
  {
    ref: 'QA000008',
    listing: 'qa-matenadaran-manuscript-museum-visit',
    unit: 'Guided Visit',
    from: 7,
    to: 7,
    quantity: 2,
    status: 'PENDING_VENDOR',
  },
  {
    ref: 'QA000009',
    listing: 'qa-nova-laser-tag-arena',
    unit: 'Evening Game',
    from: 4,
    to: 4,
    quantity: 5,
    status: 'CONFIRMED',
  },
  {
    ref: 'QA000010',
    listing: 'qa-electric-city-hatchback',
    unit: 'Electric Hatchback',
    from: 8,
    to: 11,
    quantity: 1,
    status: 'CONFIRMED',
  },
  {
    ref: 'QA000011',
    listing: 'qa-ararat-view-grand-hotel',
    unit: 'Classic Single Room',
    from: -20,
    to: -17,
    quantity: 1,
    status: 'COMPLETED',
  },
  {
    ref: 'QA000012',
    listing: 'qa-mount-aragats-southern-summit-hike',
    unit: 'Weekend Departure',
    from: -12,
    to: -12,
    quantity: 2,
    status: 'COMPLETED',
  },
  {
    ref: 'QA000013',
    listing: 'qa-goris-stone-house-guesthouse',
    unit: 'Family Room',
    from: -30,
    to: -28,
    quantity: 1,
    status: 'COMPLETED',
  },
  // Step L6.3B — two overlapping hourly stays in the hourly-enabled Superior
  // Double (5 rooms): 15:00–17:00 has 4 rooms taken, so only 1 is left then.
  {
    ref: 'QA000014',
    listing: 'qa-ararat-view-grand-hotel',
    unit: 'Superior Double with Ararat View',
    from: 5,
    to: 5,
    startTime: '14:00:00',
    endTime: '17:00:00',
    mode: 'HOURLY',
    quantity: 2,
    guestCount: 3,
    status: 'CONFIRMED',
  },
  {
    ref: 'QA000015',
    listing: 'qa-ararat-view-grand-hotel',
    unit: 'Superior Double with Ararat View',
    from: 5,
    to: 5,
    startTime: '15:00:00',
    endTime: '18:00:00',
    mode: 'HOURLY',
    quantity: 2,
    guestCount: 2,
    status: 'PENDING_VENDOR',
  },
];

/** Reviews on completed stays — two published, one waiting in the review moderation queue. */
const QA_REVIEWS = [
  {
    ref: 'QA000011',
    status: 'APPROVED',
    rating: 5,
    title: 'Ararat from the window',
    content:
      'Small but spotless single room, and the terrace breakfast view of Ararat is worth getting up early for.',
  },
  {
    ref: 'QA000013',
    status: 'APPROVED',
    rating: 4,
    title: 'Warm hosts, great breakfast',
    content:
      'The family room was comfortable for four and the homemade honey was a highlight. Street parking only.',
  },
  {
    ref: 'QA000012',
    status: 'PENDING',
    rating: 5,
    title: 'Tough climb, unforgettable view',
    content:
      'Two guides for eight people, a careful pace and a clear sky over the crater. Bring warm layers.',
  },
];

function dateAt(ctx, offset) {
  return toSqlDate(addDays(ctx.now, offset));
}

/** Weekday (0 = Sunday) of a YYYY-MM-DD date, in UTC like the calendar dates. */
function weekdayOf(isoDate) {
  return new Date(`${isoDate}T00:00:00Z`).getUTCDay();
}

/** Every calendar date a range consumes — lodging stops the night before checkout. */
function consumedDates(unitTypeCode, dateFrom, dateTo) {
  const last = NIGHTLY_UNIT_TYPES.includes(unitTypeCode)
    ? toSqlDate(addDays(new Date(`${dateTo}T00:00:00Z`), -1))
    : dateTo;
  const dates = [];
  for (
    let cursor = dateFrom;
    cursor <= last;
    cursor = toSqlDate(addDays(new Date(`${cursor}T00:00:00Z`), 1))
  ) {
    dates.push(cursor);
  }
  return dates;
}

async function createQaAccounts(connection, ctx) {
  const roleIds = await getIdsByCode(connection, 'roles', [
    ...new Set(Object.values(QA_ACCOUNTS).map((account) => account.role)),
  ]);
  const userIds = {};
  // eslint-disable-next-line no-restricted-syntax -- seeding must run in a stable, readable order
  for (const [key, account] of Object.entries(QA_ACCOUNTS)) {
    // eslint-disable-next-line no-await-in-loop -- sequential by design
    userIds[key] = await createUser(connection, ctx, {
      email: account.email,
      fullName: account.fullName,
      roleIds: [roleIds.get(account.role)],
    });
  }
  return userIds;
}

async function createQaCompanies(connection, ctx, userIds) {
  const [bookingManagerRoleId, pendingStatusId] = await Promise.all([
    getIdByCode(connection, 'partner_employee_roles', 'BOOKING_MANAGER'),
    getIdByCode(connection, 'moderation_statuses', 'PENDING'),
  ]);
  const qaPartner = await createPartner(connection, ctx, QA_PARTNER, {
    ownerUserId: userIds.partner,
  });
  await connection.query(
    'INSERT INTO partner_employees (partner_id, user_id, role_id, created_by, updated_by) VALUES (?, ?, ?, ?, ?)',
    [
      qaPartner.partnerId,
      userIds.partnerBookingManager,
      bookingManagerRoleId,
      userIds.partner,
      userIds.partner,
    ],
  );
  await connection.query(
    'INSERT INTO manager_companies (manager_user_id, partner_id, created_by, updated_by) VALUES (?, ?, ?, ?)',
    [
      userIds.manager,
      qaPartner.partnerId,
      userIds.superAdmin,
      userIds.superAdmin,
    ],
  );
  const applicant = await createPartner(connection, ctx, QA_APPLICANT_PARTNER, {
    ownerUserId: userIds.applicant,
    verificationStatusId: pendingStatusId,
    moderationStatusId: pendingStatusId,
  });
  return { qaPartner, applicantPartnerId: applicant.partnerId };
}

async function insertBookingRules(connection, listingId, rules) {
  await connection.query(
    `INSERT INTO listing_booking_rules
      (listing_id, minimum_stay_nights, maximum_stay_nights, advance_booking_min_hours, advance_booking_max_days)
     VALUES (?, ?, ?, ?, ?)`,
    [
      listingId,
      rules.minimumStayNights ?? null,
      rules.maximumStayNights ?? null,
      rules.advanceBookingMinHours ?? null,
      rules.advanceBookingMaxDays ?? null,
    ],
  );
}

async function insertRichContent(connection, ctx, listingId, spec) {
  const tables = [
    [
      'itinerary',
      'listing_itinerary_steps',
      ['sort_order', 'title', 'description', 'duration_minutes'],
      (lid, langId, step, index) => [
        lid,
        langId,
        index,
        step.title,
        step.description ?? null,
        step.durationMinutes ?? null,
      ],
    ],
    [
      'included',
      'listing_included_items',
      ['item_text', 'is_included', 'sort_order'],
      (lid, langId, item, index) => [
        lid,
        langId,
        item.itemText,
        item.isIncluded ? 1 : 0,
        index,
      ],
    ],
    [
      'faqs',
      'listing_faqs',
      ['question', 'answer', 'sort_order'],
      (lid, langId, faq, index) => [
        lid,
        langId,
        faq.question,
        faq.answer,
        index,
      ],
    ],
  ];
  // eslint-disable-next-line no-restricted-syntax -- seeding must run in a stable, readable order
  for (const [field, table, columns, toRow] of tables) {
    // eslint-disable-next-line no-restricted-syntax -- seeding must run in a stable, readable order
    for (const [localeCode, items] of Object.entries(spec[field] ?? {})) {
      // eslint-disable-next-line no-await-in-loop -- sequential by design
      await insertLocalizedRows(
        connection,
        table,
        columns,
        listingId,
        ctx.languageIds.get(localeCode),
        items,
        toRow,
      );
    }
  }
}

/** Closed weekdays become BLOCKED dates — status only, capacity untouched (a Partner's calendar block). */
async function blockClosedWeekdays(connection, ctx, listingId, closedWeekdays) {
  if (!closedWeekdays?.length) return;
  await connection.query(
    `UPDATE availability_calendar ac
     JOIN bookable_units bu ON bu.id = ac.bookable_unit_id
     SET ac.status_id = ?
     WHERE bu.listing_id = ? AND (DAYOFWEEK(ac.date) - 1) IN (?)`,
    [ctx.blockedStatusId, listingId, closedWeekdays],
  );
}

/**
 * Step L6.3B — switches hourly booking on for the units whose spec carries
 * an `hourly` configuration (every other room stays nightly-only).
 */
async function applyHourlyConfigs(connection, ctx, listingId, spec) {
  // eslint-disable-next-line no-restricted-syntax -- seeding must run in a stable, readable order
  for (const unit of spec.units.filter((candidate) => candidate.hourly)) {
    const { hourly } = unit;
    // eslint-disable-next-line no-await-in-loop -- sequential by design
    const currencyId = await getIdByCode(
      connection,
      'currencies',
      hourly.currency,
    );
    // eslint-disable-next-line no-await-in-loop -- sequential by design
    await connection.query(
      `UPDATE bookable_units
       SET hourly_enabled = 1, hourly_price_amount = ?, hourly_price_currency_id = ?,
           hourly_min_duration_hours = ?, hourly_max_duration_hours = ?,
           hourly_available_from = ?, hourly_available_until = ?
       WHERE listing_id = ? AND unit_label = ?`,
      [
        hourly.priceAmount,
        currencyId,
        hourly.minHours,
        hourly.maxHours,
        hourly.availableFrom,
        hourly.availableUntil,
        listingId,
        unit.label,
      ],
    );
  }
}

async function createQaListing(connection, ctx, spec) {
  const listingId = await createFullListing(connection, ctx, spec);
  await applyHourlyConfigs(connection, ctx, listingId, spec);
  await connection.query(
    'UPDATE listing_locations SET latitude = ?, longitude = ? WHERE listing_id = ?',
    [...spec.coordinates, listingId],
  );
  if (spec.contactVisible) {
    await connection.query(
      'UPDATE listings SET is_contact_visible = 1 WHERE id = ?',
      [listingId],
    );
  }
  if (spec.bookingRules)
    await insertBookingRules(connection, listingId, spec.bookingRules);
  await insertRichContent(connection, ctx, listingId, spec);
  await blockClosedWeekdays(connection, ctx, listingId, spec.closedWeekdays);
  return listingId;
}

/** The end state each lifecycle fixture reaches through the real moderation/lifecycle writes. */
async function applyFixtureLifecycle(
  connection,
  ctx,
  listingId,
  fixture,
  moderatorUserId,
) {
  const statusCode = {
    DRAFT: 'DRAFT',
    PENDING_REVIEW: 'PENDING_REVIEW',
    REJECTED: 'DRAFT',
    ARCHIVED: 'ARCHIVED',
  }[fixture.lifecycle];
  const moderationCode = {
    DRAFT: 'PENDING',
    PENDING_REVIEW: 'PENDING',
    REJECTED: 'REJECTED',
    ARCHIVED: 'APPROVED',
  }[fixture.lifecycle];
  const [statusId, moderationStatusId] = await Promise.all([
    getIdByCode(connection, 'listing_statuses', statusCode),
    getIdByCode(connection, 'moderation_statuses', moderationCode),
  ]);
  const isArchived = fixture.lifecycle === 'ARCHIVED';
  await connection.query(
    `UPDATE listings
     SET status_id = ?, moderation_status_id = ?, moderation_notes = ?,
         published_at = ?, archived_at = ?, updated_by = COALESCE(?, updated_by)
     WHERE id = ?`,
    [
      statusId,
      moderationStatusId,
      fixture.moderationNotes ?? null,
      isArchived ? toSqlDateTime(addDays(ctx.now, -90)) : null,
      isArchived ? toSqlDateTime(addDays(ctx.now, -10)) : null,
      fixture.lifecycle === 'REJECTED' ? moderatorUserId : null,
      listingId,
    ],
  );
}

async function loadUnits(connection, listingIdBySlug) {
  const [rows] = await connection.query(
    `SELECT bu.id, bu.listing_id, bu.unit_label, bu.capacity, bu.base_price_amount, but.code AS unit_type_code,
            bu.time_slot_start, bu.time_slot_end, lp.amount AS listing_amount,
            bu.hourly_price_amount
     FROM bookable_units bu
     JOIN bookable_unit_types but ON but.id = bu.bookable_unit_type_id
     JOIN listing_pricing lp ON lp.listing_id = bu.listing_id
     WHERE bu.listing_id IN (?)`,
    [[...listingIdBySlug.values()]],
  );
  const slugById = new Map(
    [...listingIdBySlug].map(([slug, id]) => [id, slug]),
  );
  return new Map(
    rows.map((row) => [
      `${slugById.get(row.listing_id)}|${row.unit_label}`,
      row,
    ]),
  );
}

function unitFor(units, listing, label) {
  const unit = units.get(`${listing}|${label}`);
  if (!unit)
    throw new Error(
      `seedDemoQaEnvironment: unknown unit "${label}" on "${listing}".`,
    );
  return unit;
}

/**
 * Takes `quantity` from every consumed date, refusing a BLOCKED date or one
 * without enough capacity left (so a scenario edit can never seed an
 * impossible calendar), and writes one ledger row per date.
 */
async function consumeCapacity(
  connection,
  ctx,
  { unit, dates, quantity, sourceType, sourceId, actorUserId, reason },
) {
  // eslint-disable-next-line no-restricted-syntax -- sequential lock+write per date, like the service
  for (const date of dates) {
    // eslint-disable-next-line no-await-in-loop -- sequential by design
    const [[row]] = await connection.query(
      'SELECT id, quantity_available, status_id FROM availability_calendar WHERE bookable_unit_id = ? AND date = ?',
      [unit.id, date],
    );
    if (
      !row ||
      row.status_id === ctx.blockedStatusId ||
      row.quantity_available < quantity
    ) {
      throw new Error(
        `seedDemoQaEnvironment: "${unit.unit_label}" has no capacity of ${quantity} on ${date}.`,
      );
    }
    const after = row.quantity_available - quantity;
    // eslint-disable-next-line no-await-in-loop -- sequential by design
    await connection.query(
      'UPDATE availability_calendar SET quantity_available = ? WHERE id = ?',
      [after, row.id],
    );
    // eslint-disable-next-line no-await-in-loop -- sequential by design
    await connection.query(
      `INSERT INTO inventory_ledger
        (bookable_unit_id, date, source_type, source_id, delta, quantity_before, quantity_after, actor_user_id, reason)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        unit.id,
        date,
        sourceType,
        sourceId,
        -quantity,
        row.quantity_available,
        after,
        actorUserId,
        reason,
      ],
    );
  }
}

/** Gives a cancelled/rejected booking's capacity back — `releaseBookedCapacity`'s ledger write. */
async function releaseCapacity(
  connection,
  { unit, dates, quantity, bookingId, actorUserId },
) {
  // eslint-disable-next-line no-restricted-syntax -- sequential lock+write per date, like the service
  for (const date of dates) {
    // eslint-disable-next-line no-await-in-loop -- sequential by design
    const [[row]] = await connection.query(
      'SELECT id, quantity_available FROM availability_calendar WHERE bookable_unit_id = ? AND date = ?',
      [unit.id, date],
    );
    const after = Math.min(row.quantity_available + quantity, unit.capacity);
    // eslint-disable-next-line no-await-in-loop -- sequential by design
    await connection.query(
      'UPDATE availability_calendar SET quantity_available = ? WHERE id = ?',
      [after, row.id],
    );
    // eslint-disable-next-line no-await-in-loop -- sequential by design
    await connection.query(
      `INSERT INTO inventory_ledger
        (bookable_unit_id, date, source_type, source_id, delta, quantity_before, quantity_after, actor_user_id, reason)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        unit.id,
        date,
        LEDGER.BOOKING,
        bookingId,
        after - row.quantity_available,
        row.quantity_available,
        after,
        actorUserId,
        'Booking cancelled/rejected — capacity released',
      ],
    );
  }
}

async function applyCalendarScenario(
  connection,
  ctx,
  units,
  ownerUserId,
  scenario,
) {
  const unit = unitFor(units, scenario.listing, scenario.unit);
  const dateFrom = dateAt(ctx, scenario.from);
  const dateTo = dateAt(ctx, scenario.to);
  if (scenario.kind === 'PRICE') {
    await connection.query(
      `UPDATE availability_calendar SET price_override_amount = ?, price_override_currency_id = ?
       WHERE bookable_unit_id = ? AND date BETWEEN ? AND ?`,
      [scenario.amount, ctx.amdCurrencyId, unit.id, dateFrom, dateTo],
    );
    return;
  }
  const isBlock = scenario.kind === 'BLOCK';
  const [result] = isBlock
    ? await connection.query(
        `INSERT INTO inventory_blocks (bookable_unit_id, date_from, date_to, quantity, reason_code, notes, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          unit.id,
          dateFrom,
          dateTo,
          scenario.quantity,
          scenario.reason,
          scenario.notes,
          ownerUserId,
        ],
      )
    : await connection.query(
        `INSERT INTO external_reservations
          (bookable_unit_id, date_from, date_to, quantity, source_code, guest_name, notes, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          unit.id,
          dateFrom,
          dateTo,
          scenario.quantity,
          scenario.source,
          scenario.guestName,
          scenario.notes,
          ownerUserId,
        ],
      );
  await consumeCapacity(connection, ctx, {
    unit,
    dates: consumedDates(unit.unit_type_code, dateFrom, dateTo),
    quantity: scenario.quantity,
    sourceType: isBlock ? LEDGER.MANUAL_BLOCK : LEDGER.EXTERNAL_RESERVATION,
    sourceId: result.insertId,
    actorUserId: ownerUserId,
    reason: isBlock
      ? `Manual block: ${scenario.reason}`
      : `External reservation: ${scenario.source}`,
  });
}

/**
 * The server-side price of one unit across the range — `BookingService`'s
 * precedence per date: calendar override, then unit base price, then the
 * listing price. A restaurant reservation is always free.
 */
async function priceForOneUnit(connection, unit, dates) {
  if (unit.unit_type_code === 'RESTAURANT_TABLE') return 0;
  const fallback = Number(unit.base_price_amount ?? unit.listing_amount);
  // DATE_FORMAT keeps the calendar date as text — mysql2 would otherwise
  // hand back a local-midnight Date that shifts across UTC.
  const [rows] = await connection.query(
    `SELECT DATE_FORMAT(date, '%Y-%m-%d') AS date, price_override_amount
     FROM availability_calendar WHERE bookable_unit_id = ? AND date IN (?)`,
    [unit.id, dates],
  );
  const overrideByDate = new Map(
    rows.map((row) => [row.date, row.price_override_amount]),
  );
  return dates.reduce(
    (sum, date) => sum + Number(overrideByDate.get(date) ?? fallback),
    0,
  );
}

function bookingTimeline(ctx, spec, { dateFrom, dateTo }) {
  const days = (offset) => toSqlDateTime(addDays(ctx.now, offset));
  if (spec.status === 'COMPLETED') {
    const start = new Date(`${dateFrom}T10:00:00Z`);
    return {
      requestedAt: toSqlDateTime(addDays(start, -14)),
      confirmedAt: toSqlDateTime(addDays(start, -13)),
      completedAt: `${dateTo} 12:00:00`,
    };
  }
  // A request still waiting for the Partner was made a few hours ago — well
  // inside `config.booking.pendingVendorSlaHours`, so the SLA sweep that
  // runs on API start-up never auto-expires it.
  const requestedAt =
    spec.status === 'PENDING_VENDOR'
      ? toSqlDateTime(new Date(ctx.now.getTime() - PENDING_REQUEST_AGE_MS))
      : days(-4);
  return {
    requestedAt,
    confirmedAt: ['CONFIRMED', 'CANCELLED_BY_CUSTOMER'].includes(spec.status)
      ? days(-3)
      : null,
    rejectedAt: spec.status === 'REJECTED' ? days(-3) : null,
    cancelledAt: spec.status === 'CANCELLED_BY_CUSTOMER' ? days(-1) : null,
  };
}

/** The status path a booking took to reach its end state, as `booking_status_history` records it. */
function statusPath(status) {
  return {
    PENDING_VENDOR: ['PENDING_VENDOR'],
    CONFIRMED: ['PENDING_VENDOR', 'CONFIRMED'],
    REJECTED: ['PENDING_VENDOR', 'REJECTED'],
    CANCELLED_BY_CUSTOMER: [
      'PENDING_VENDOR',
      'CONFIRMED',
      'CANCELLED_BY_CUSTOMER',
    ],
    COMPLETED: ['PENDING_VENDOR', 'CONFIRMED', 'COMPLETED'],
  }[status];
}

async function insertBookingRow(connection, ctx, refs, spec, unit, totals) {
  const timeline = bookingTimeline(ctx, spec, totals);
  const isRestaurant = unit.unit_type_code === 'RESTAURANT_TABLE';
  const [result] = await connection.query(
    `INSERT INTO bookings
      (booking_reference, customer_user_id, partner_id, listing_id, booking_type_id, status_id,
       customer_notes, vendor_notes, guest_contact_snapshot, currency_id, subtotal_amount, fees_amount,
       discount_amount, total_amount, payment_method, payment_status_id, requested_at, confirmed_at,
       rejected_at, cancelled_at, completed_at, cancellation_reason, created_by, updated_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0.00, 0.00, ?, 'offline', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      `BK-${toSqlDate(ctx.now).replace(/-/g, '')}-${spec.ref}`,
      refs.customerUserId,
      refs.partnerId,
      unit.listing_id,
      refs.bookingTypeIds.get(refs.bookingTypeByUnitType[unit.unit_type_code]),
      refs.bookingStatusIds.get(spec.status),
      spec.notes ?? null,
      spec.vendorNotes ?? null,
      JSON.stringify(refs.guestContact),
      ctx.amdCurrencyId,
      totals.total.toFixed(2),
      totals.total.toFixed(2),
      refs.paymentNotRequiredId,
      timeline.requestedAt,
      timeline.confirmedAt ?? null,
      timeline.rejectedAt ?? null,
      timeline.cancelledAt ?? null,
      timeline.completedAt ?? null,
      spec.cancellationReason ?? null,
      refs.customerUserId,
      refs.customerUserId,
    ],
  );
  const bookingId = result.insertId;
  const isHourly = spec.mode === BOOKING_MODES.HOURLY;
  const [itemResult] = await connection.query(
    `INSERT INTO booking_items
      (booking_id, bookable_unit_id, booking_mode, unit_label_snapshot, date_from, date_to,
       start_time, end_time, quantity, guest_count, unit_price_amount)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      bookingId,
      unit.id,
      resolveBookingMode(unit.unit_type_code, spec.mode ?? null),
      unit.unit_label,
      totals.dateFrom,
      totals.dateTo,
      spec.startTime ?? unit.time_slot_start ?? null,
      spec.endTime ?? unit.time_slot_end ?? null,
      spec.quantity,
      isRestaurant || isHourly ? spec.guestCount : null,
      totals.unitPrice.toFixed(2),
    ],
  );
  await connection.query(
    'INSERT INTO booking_guests (booking_item_id, full_name) VALUES (?, ?)',
    [itemResult.insertId, QA_ACCOUNTS.customer.fullName],
  );
  const path = statusPath(spec.status);
  // eslint-disable-next-line no-restricted-syntax -- ordered history, must preserve sequence
  for (const [index, toStatus] of path.entries()) {
    const changedBy = ['PENDING_VENDOR', 'CANCELLED_BY_CUSTOMER'].includes(
      toStatus,
    )
      ? refs.customerUserId
      : refs.ownerUserId;
    // eslint-disable-next-line no-await-in-loop -- sequential by design
    await connection.query(
      'INSERT INTO booking_status_history (booking_id, from_status_id, to_status_id, changed_by) VALUES (?, ?, ?, ?)',
      [
        bookingId,
        index === 0 ? null : refs.bookingStatusIds.get(path[index - 1]),
        refs.bookingStatusIds.get(toStatus),
        changedBy,
      ],
    );
  }
  return { bookingId, bookingItemId: itemResult.insertId };
}

/**
 * A single-day booking moves to the nearest day its listing operates —
 * forwards for an upcoming one, backwards for a past one — so it never
 * lands on a closed weekday whatever day the seed runs.
 */
function operatingOffset(ctx, spec) {
  const closed = CLOSED_WEEKDAYS_BY_SLUG.get(spec.listing) ?? [];
  if (spec.from !== spec.to || closed.length === 0) return spec.from;
  const step = spec.from < 0 ? -1 : 1;
  let offset = spec.from;
  while (closed.includes(weekdayOf(dateAt(ctx, offset)))) offset += step;
  return offset;
}

/**
 * Step L6.3B — an hourly stay: rate × hours per room, one timed row per
 * room on its booking item (exactly what booking conversion leaves), never
 * the date's `quantity_available`.
 */
async function createQaHourlyBooking(connection, ctx, units, refs, spec) {
  const unit = unitFor(units, spec.listing, spec.unit);
  const date = dateAt(ctx, spec.from);
  const hours = parseWholeHour(spec.endTime) - parseWholeHour(spec.startTime);
  const unitPrice = Number(unit.hourly_price_amount) * hours;
  const { bookingId, bookingItemId } = await insertBookingRow(
    connection,
    ctx,
    refs,
    spec,
    unit,
    {
      dateFrom: date,
      dateTo: date,
      unitPrice,
      total: unitPrice * spec.quantity,
    },
  );
  await connection.query(
    `INSERT INTO hourly_inventory_reservations
      (bookable_unit_id, date, start_time, end_time, quantity, source_type,
       booking_item_id, actor_user_id)
     VALUES ?`,
    [
      Array.from({ length: spec.quantity }, () => [
        unit.id,
        date,
        spec.startTime,
        spec.endTime,
        1,
        LEDGER.BOOKING,
        bookingItemId,
        refs.customerUserId,
      ]),
    ],
  );
  return { bookingId, ref: spec.ref, listingId: unit.listing_id };
}

async function createQaBooking(connection, ctx, units, refs, spec) {
  if (spec.mode === BOOKING_MODES.HOURLY) {
    return createQaHourlyBooking(connection, ctx, units, refs, spec);
  }
  const unit = unitFor(units, spec.listing, spec.unit);
  const shift = operatingOffset(ctx, spec) - spec.from;
  const dateFrom = dateAt(ctx, spec.from + shift);
  const dateTo = dateAt(ctx, spec.to + shift);
  const dates = consumedDates(unit.unit_type_code, dateFrom, dateTo);
  const isPast = spec.status === 'COMPLETED';
  // A past stay has no calendar rows left, so every date falls back to the
  // unit/listing base price — the price it was booked at.
  const unitPrice = await priceForOneUnit(connection, unit, dates);
  const totals = {
    dateFrom,
    dateTo,
    unitPrice,
    total: unitPrice * spec.quantity,
  };
  const { bookingId } = await insertBookingRow(
    connection,
    ctx,
    refs,
    spec,
    unit,
    totals,
  );
  if (isPast) return { bookingId, ref: spec.ref, listingId: unit.listing_id };

  await consumeCapacity(connection, ctx, {
    unit,
    dates,
    quantity: spec.quantity,
    sourceType: LEDGER.BOOKING,
    sourceId: bookingId,
    actorUserId: refs.customerUserId,
    reason: `Booking BK-${toSqlDate(ctx.now).replace(/-/g, '')}-${spec.ref}`,
  });
  if (['REJECTED', 'CANCELLED_BY_CUSTOMER'].includes(spec.status)) {
    await releaseCapacity(connection, {
      unit,
      dates,
      quantity: spec.quantity,
      bookingId,
      actorUserId:
        spec.status === 'REJECTED' ? refs.ownerUserId : refs.customerUserId,
    });
  }
  return { bookingId, ref: spec.ref, listingId: unit.listing_id };
}

async function loadBookingRefs(connection, ctx, userIds, qaPartner) {
  const bookingTypeByUnitType = {
    HOTEL_ROOM: 'HOTEL_ROOM_BOOKING',
    PROPERTY_UNIT: 'PROPERTY_BOOKING',
    RESTAURANT_TABLE: 'RESTAURANT_RESERVATION',
    TOUR_DEPARTURE: 'TOUR_BOOKING',
    VEHICLE: 'CAR_RENTAL_BOOKING',
  };
  const [bookingTypeIds, bookingStatusIds, paymentNotRequiredId] =
    await Promise.all([
      getIdsByCode(
        connection,
        'booking_types',
        Object.values(bookingTypeByUnitType),
      ),
      getIdsByCode(connection, 'booking_statuses', [
        'PENDING_VENDOR',
        'CONFIRMED',
        'REJECTED',
        'CANCELLED_BY_CUSTOMER',
        'COMPLETED',
      ]),
      getIdByCode(connection, 'payment_statuses', 'NOT_REQUIRED_ON_PLATFORM'),
    ]);
  return {
    bookingTypeByUnitType,
    bookingTypeIds,
    bookingStatusIds,
    paymentNotRequiredId,
    customerUserId: userIds.customer,
    ownerUserId: userIds.partner,
    partnerId: qaPartner.partnerId,
    guestContact: {
      fullName: QA_ACCOUNTS.customer.fullName,
      email: QA_ACCOUNTS.customer.email,
      phone: '+374 10 555 001',
    },
  };
}

async function createQaReviews(connection, bookingsByRef, userIds) {
  const statusIds = await getIdsByCode(connection, 'moderation_statuses', [
    'APPROVED',
    'PENDING',
  ]);
  // eslint-disable-next-line no-restricted-syntax -- seeding must run in a stable, readable order
  for (const review of QA_REVIEWS) {
    const booking = bookingsByRef.get(review.ref);
    // eslint-disable-next-line no-await-in-loop -- sequential by design
    await connection.query(
      `INSERT INTO reviews (customer_user_id, booking_id, listing_id, rating, title, content, status_id, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userIds.customer,
        booking.bookingId,
        booking.listingId,
        review.rating,
        review.title,
        review.content,
        statusIds.get(review.status),
        userIds.customer,
        userIds.customer,
      ],
    );
  }
}

/** One promotion request waiting for an Admin/Moderator decision. */
async function createPendingPromotion(
  connection,
  ctx,
  partnerId,
  listingId,
  requestedBy,
) {
  const [[product]] = await connection.query(
    `SELECT ap.id, ap.ad_placement_type_id, ap.price_amount FROM ad_products ap
     JOIN ad_placement_types apt ON apt.id = ap.ad_placement_type_id
     WHERE apt.code = 'CATEGORY_TOP' AND ap.duration_days = 7`,
  );
  const statusId = await getIdByCode(
    connection,
    'advertisement_statuses',
    'REQUEST_SUBMITTED',
  );
  await connection.query(
    `INSERT INTO advertisements
      (listing_id, partner_id, ad_placement_type_id, ad_product_id, status_id, price_snapshot_amount,
       currency_id, start_date, end_date, requested_by, created_by, updated_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      listingId,
      partnerId,
      product.ad_placement_type_id,
      product.id,
      statusId,
      product.price_amount,
      ctx.amdCurrencyId,
      dateAt(ctx, 7),
      dateAt(ctx, 13),
      requestedBy,
      requestedBy,
      requestedBy,
    ],
  );
}

async function runSequentially(items, task) {
  const results = [];
  // eslint-disable-next-line no-restricted-syntax -- seeding must run in a stable, readable order
  for (const item of items) {
    // eslint-disable-next-line no-await-in-loop -- sequential by design
    results.push(await task(item));
  }
  return results;
}

async function createListings(connection, ctx, specs) {
  const listingIds = await runSequentially(specs, (spec) =>
    createQaListing(connection, ctx, spec),
  );
  return new Map(specs.map((spec, index) => [spec.slug, listingIds[index]]));
}

export default async function seedDemoQaEnvironment(connection) {
  if (config.isProduction) {
    throw new Error(
      'seedDemoQaEnvironment refused: NODE_ENV=production. Synthetic QA accounts must never exist in production.',
    );
  }
  const ctx = {
    ...(await loadCatalogContext(connection)),
    blockedStatusId: await getIdByCode(
      connection,
      'availability_statuses',
      'BLOCKED',
    ),
  };

  const userIds = await createQaAccounts(connection, ctx);
  const { qaPartner, applicantPartnerId } = await createQaCompanies(
    connection,
    ctx,
    userIds,
  );
  ctx.partnersByKey = new Map([['qa', qaPartner]]);

  const listingIdBySlug = await createListings(
    connection,
    ctx,
    QA_PUBLIC_LISTINGS,
  );
  const fixtureIdBySlug = await createListings(
    connection,
    ctx,
    QA_MODERATION_FIXTURES,
  );
  await runSequentially(QA_MODERATION_FIXTURES, (fixture) =>
    applyFixtureLifecycle(
      connection,
      ctx,
      fixtureIdBySlug.get(fixture.slug),
      fixture,
      userIds.moderator,
    ),
  );

  const units = await loadUnits(connection, listingIdBySlug);
  await runSequentially(QA_CALENDAR_SCENARIOS, (scenario) =>
    applyCalendarScenario(connection, ctx, units, userIds.partner, scenario),
  );

  const refs = await loadBookingRefs(connection, ctx, userIds, qaPartner);
  const bookings = await runSequentially(QA_BOOKINGS, (spec) =>
    createQaBooking(connection, ctx, units, refs, spec),
  );
  await createQaReviews(
    connection,
    new Map(bookings.map((booking) => [booking.ref, booking])),
    userIds,
  );
  await createPendingPromotion(
    connection,
    ctx,
    qaPartner.partnerId,
    listingIdBySlug.get('qa-goris-cliffside-resort'),
    userIds.partner,
  );

  return {
    userIds,
    partnerId: qaPartner.partnerId,
    applicantPartnerId,
    listingIds: [...listingIdBySlug.values()],
    fixtureListingIds: [...fixtureIdBySlug.values()],
    bookingIds: bookings.map((booking) => booking.bookingId),
  };
}
