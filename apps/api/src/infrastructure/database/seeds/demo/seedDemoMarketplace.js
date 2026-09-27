/**
 * Realistic-scale demo marketplace data — Phase 11 pre-flight verification.
 *
 * Deliberately NOT part of `seedAll()` (see `seeds/index.js`): ~218
 * integration tests assert against the minimal, deterministic baseline
 * `seedAll()` produces, and layering 80+ listings / 150+ bookings into
 * that same pipeline would silently break many of them. This module is
 * only ever invoked by `cli/seedDemo.js` (`npm run db:seed:demo`), which
 * runs the normal reset -> migrate -> seedAll sequence first and then
 * layers this on top, always against `travelhub_test`.
 *
 * Uses plain INSERTs (not the idempotent upsert pattern the rest of
 * `seeds/` uses) because it always runs against a just-recreated,
 * demo-data-free database — see `cli/seedDemo.js`'s header for why that
 * invariant holds.
 *
 * Reviews/favorites were originally written directly via SQL (Phase 11,
 * before those backend modules existed) and notifications/messaging/AI/
 * payments later joined them (Phase 13/14/15/16) — all now have real
 * controllers/services, but stay seeded via direct SQL here anyway,
 * shaped to match exactly what those modules' own write paths would
 * have produced, since a demo-scale dataset generated through 150+ real
 * HTTP requests per entity would make this seed script far slower than
 * a reset-and-reseed workflow should be. No table exists at all for
 * partner applications, so that alone is not seeded.
 */

import argon2 from 'argon2';
import { getIdByCode, getIdsByCode } from '../helpers.js';
import { EVENT_TYPES } from '../../../../core/events/eventTypes.js';

// Shared by every demo partner-owner and customer account (25 users
// total) — intentionally simple and publicly documented, exactly like
// `005_dev_accounts.js`'s DEV_CREDENTIALS. Only ever valid on a disposable
// test database; never usable outside a local/sandbox environment.
const DEMO_PASSWORD = 'DemoPass!2024';

// Standard mulberry32 PRNG — deterministic so re-running this seed produces
// the same demo dataset. The bitwise ops are the algorithm itself, not
// stylistic choices, so this function is exempted from `no-bitwise`.
/* eslint-disable no-bitwise, operator-assignment */
function mulberry32(seed) {
  let a = seed;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/* eslint-enable no-bitwise, operator-assignment */

const rng = mulberry32(20260730);
function randomInt(min, max) {
  return Math.floor(rng() * (max - min + 1)) + min;
}
function addDays(date, days) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}
function toSqlDate(date) {
  return date.toISOString().slice(0, 10);
}
function toSqlDateTime(date) {
  return date.toISOString().slice(0, 19).replace('T', ' ');
}
// Inverse of toSqlDateTime — the space-separated string it produces is a
// UTC timestamp, so re-adding the 'Z' here (rather than parsing it as an
// ambiguous local-time string) round-trips back to the exact same instant.
function fromSqlDateTime(value) {
  return new Date(`${value.replace(' ', 'T')}Z`);
}

const CITIES = [
  'yerevan',
  'gyumri',
  'vanadzor',
  'dilijan',
  'sevan',
  'goris',
  'jermuk',
  'ejmiatsin',
];

const AMENITIES_PER_LISTING = 4;

const ADJECTIVES = [
  'Grand',
  'Royal',
  'Sunset',
  'Heritage',
  'Modern',
  'Cozy',
  'Luxury',
  'Boutique',
  'Classic',
  'Riverside',
  'Mountain View',
  'City Center',
  'Family',
  'Elite',
  'Traditional',
  'Panoramic',
];

const LISTINGS_PER_CATEGORY = 16;
// 8 published / 3 draft / 3 pending review / 2 rejected per category ==
// 40/15/15/10 across the 5 categories (80 total).
const STATUS_PLAN = [
  ...Array(8).fill('PUBLISHED'),
  ...Array(3).fill('DRAFT'),
  ...Array(3).fill('PENDING_REVIEW'),
  ...Array(2).fill('REJECTED'),
];

const CATEGORIES = [
  {
    slug: 'hotels',
    listingTypeCode: 'HOTEL',
    bookableUnitTypeCode: 'HOTEL_ROOM',
    bookingTypeCode: 'HOTEL_ROOM_BOOKING',
    pricingModelCode: () => 'PER_NIGHT',
    basePrice: 15000,
    priceStep: 1500,
    stayNights: 3,
    noun: 'Hotel',
    titleTemplate: (adjective, city) => `${adjective} ${city} Hotel`,
    description: (city) =>
      `A comfortable hotel in the heart of ${city}, offering modern rooms, attentive service, and easy access to the city's main attractions. Ideal for both leisure and business travelers exploring Armenia.`,
    partner: {
      legalName: 'Ararat Grand Hotels LLC',
      displayName: 'Ararat Grand Hotels',
      slug: 'ararat-grand-hotels',
      email: 'partner.hotels@example.com',
    },
  },
  {
    slug: 'apartments',
    listingTypeCode: 'PROPERTY',
    bookableUnitTypeCode: 'PROPERTY_UNIT',
    bookingTypeCode: 'PROPERTY_BOOKING',
    pricingModelCode: () => 'PER_NIGHT',
    basePrice: 10000,
    priceStep: 1000,
    stayNights: 4,
    noun: 'Apartment',
    titleTemplate: (adjective, city) => `${adjective} ${city} Apartment`,
    description: (city) =>
      `A fully-furnished apartment in ${city} with a kitchenette, fast WiFi, and a self check-in process — a great home base for a longer stay or a family trip.`,
    partner: {
      legalName: 'Yerevan City Apartments LLC',
      displayName: 'Yerevan City Apartments',
      slug: 'yerevan-city-apartments',
      email: 'partner.apartments@example.com',
    },
  },
  {
    slug: 'tours',
    listingTypeCode: 'TOUR',
    bookableUnitTypeCode: 'TOUR_DEPARTURE',
    bookingTypeCode: 'TOUR_BOOKING',
    pricingModelCode: (index) => (index % 2 === 0 ? 'PER_PERSON' : 'PER_HOUR'),
    basePrice: 8000,
    priceStep: 800,
    stayNights: 1,
    noun: 'Tour',
    titleTemplate: (adjective, city) => `${adjective} ${city} Tour`,
    description: (city) =>
      `A guided tour through ${city} and its surrounding landmarks, led by a local expert. Includes transportation and stops at the region's most photographed viewpoints.`,
    partner: {
      legalName: 'Caucasus Trail Tours LLC',
      displayName: 'Caucasus Trail Tours',
      slug: 'caucasus-trail-tours',
      email: 'partner.tours@example.com',
    },
  },
  {
    slug: 'car-rentals',
    listingTypeCode: 'CAR_RENTAL',
    bookableUnitTypeCode: 'VEHICLE',
    bookingTypeCode: 'CAR_RENTAL_BOOKING',
    pricingModelCode: () => 'PER_DAY',
    basePrice: 10000,
    priceStep: 1000,
    stayNights: 3,
    noun: 'Car Rental',
    titleTemplate: (adjective, city) => `${adjective} Car Rental — ${city}`,
    description: (city) =>
      `A well-maintained rental vehicle available for pickup in ${city}, suited for exploring Armenia's highways and mountain roads. Unlimited mileage, full insurance included.`,
    partner: {
      legalName: 'Armenia Auto Rentals LLC',
      displayName: 'Armenia Auto Rentals',
      slug: 'armenia-auto-rentals',
      email: 'partner.carrentals@example.com',
    },
  },
  {
    slug: 'attractions',
    listingTypeCode: 'ATTRACTION',
    // No dedicated bookable-unit/booking-type vocabulary exists for
    // "experiences" — reusing TOUR_DEPARTURE/TOUR_BOOKING (the closest
    // existing scheduled-per-person concept) rather than inventing a new
    // lookup row, per CLAUDE.md's "never duplicate functionality."
    bookableUnitTypeCode: 'TOUR_DEPARTURE',
    bookingTypeCode: 'TOUR_BOOKING',
    pricingModelCode: () => 'PER_PERSON',
    basePrice: 5000,
    priceStep: 500,
    stayNights: 1,
    noun: 'Experience',
    titleTemplate: (adjective, city) => `${adjective} ${city} Experience`,
    description: (city) =>
      `A hands-on local experience in ${city} — think cooking classes, craft workshops, or a guided photo walk — designed to connect visitors with Armenian culture beyond the standard sightseeing route.`,
    partner: {
      legalName: 'Highland Experiences LLC',
      displayName: 'Highland Experiences',
      slug: 'highland-experiences',
      email: 'partner.experiences@example.com',
    },
  },
];

const CUSTOMER_NAMES = [
  'Anna Harutyunyan',
  'Davit Sargsyan',
  'Mariam Petrosyan',
  'Karen Avetisyan',
  'Lilit Grigoryan',
  'Narek Hovhannisyan',
  'Sofia Manukyan',
  'Arman Ghazaryan',
  'Elena Simonyan',
  'Tigran Vardanyan',
  'James Whitfield',
  'Sophie Bernard',
  'Lucas Meyer',
  'Olivia Fitzgerald',
  'Ahmed Al-Farsi',
  'Chiara Rossi',
  'Ivan Petrov',
  'Emma Johansson',
  'Daniel Cohen',
  'Yuki Tanaka',
];

const REVIEW_TEMPLATES = [
  {
    rating: 5,
    title: 'Exceeded expectations',
    content:
      'Everything was exactly as described, and the host was very responsive. Would book again without hesitation.',
  },
  {
    rating: 5,
    title: 'Wonderful experience',
    content:
      'One of the highlights of our trip to Armenia. Highly recommended to anyone visiting the area.',
  },
  {
    rating: 4,
    title: 'Great value',
    content:
      'Solid experience overall, a couple of small things could be improved but nothing that affected the trip.',
  },
  {
    rating: 4,
    title: 'Would recommend',
    content:
      'Comfortable, well-located, and easy to book. Minor communication delays but otherwise smooth.',
  },
  {
    rating: 3,
    title: 'Decent, some issues',
    content:
      'It was okay — met basic expectations but felt a bit overpriced for what was offered.',
  },
  {
    rating: 2,
    title: 'Below expectations',
    content:
      'A few things did not match the listing description. The host resolved it eventually, but it took some effort.',
  },
];

async function upsertPartnerUser(
  connection,
  { email, fullName },
  { activeStatusId, enLanguageId, amdCurrencyId },
) {
  const [firstName, ...rest] = fullName.split(' ');
  const lastName = rest.join(' ') || firstName;
  const passwordHash = await argon2.hash(DEMO_PASSWORD);
  const normalizedEmail = email.trim().toLowerCase();

  const [result] = await connection.query(
    `INSERT INTO users
      (email, normalized_email, password_hash, first_name, last_name, status_id,
       is_email_verified, email_verified_at, preferred_language_id, preferred_currency_id)
     VALUES (?, ?, ?, ?, ?, ?, 1, UTC_TIMESTAMP(3), ?, ?)`,
    [
      email,
      normalizedEmail,
      passwordHash,
      firstName,
      lastName,
      activeStatusId,
      enLanguageId,
      amdCurrencyId,
    ],
  );
  return result.insertId;
}

async function assignCustomerRole(connection, userId, customerRoleId) {
  await connection.query(
    'INSERT IGNORE INTO role_user (role_id, user_id) VALUES (?, ?)',
    [customerRoleId, userId],
  );
}

async function insertMedia(
  connection,
  {
    mediableType,
    mediableId,
    url,
    isCover,
    ownerUserId,
    imageTypeId,
    completedStatusId,
    approvedStatusId,
    position,
  },
) {
  const [result] = await connection.query(
    `INSERT INTO media
      (mediable_type, mediable_id, media_type_id, url, thumbnail_url, position, is_cover,
       upload_status_id, moderation_status_id, owner_user_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      mediableType,
      mediableId,
      imageTypeId,
      url,
      url,
      position,
      isCover ? 1 : 0,
      completedStatusId,
      approvedStatusId,
      ownerUserId,
    ],
  );
  return result.insertId;
}

export default async function seedDemoMarketplace(connection) {
  const [
    activeStatusId,
    approvedStatusId,
    rejectedStatusId,
    customerRoleId,
    ownerRoleId,
    amdCurrencyId,
    imageTypeId,
    completedUploadStatusId,
    publishedListingStatusId,
    draftListingStatusId,
    pendingReviewListingStatusId,
  ] = await Promise.all([
    getIdByCode(connection, 'user_statuses', 'ACTIVE'),
    getIdByCode(connection, 'moderation_statuses', 'APPROVED'),
    getIdByCode(connection, 'moderation_statuses', 'REJECTED'),
    getIdByCode(connection, 'roles', 'CUSTOMER'),
    getIdByCode(connection, 'partner_employee_roles', 'OWNER'),
    getIdByCode(connection, 'currencies', 'AMD'),
    getIdByCode(connection, 'media_types', 'IMAGE'),
    getIdByCode(connection, 'media_upload_statuses', 'COMPLETED'),
    getIdByCode(connection, 'listing_statuses', 'PUBLISHED'),
    getIdByCode(connection, 'listing_statuses', 'DRAFT'),
    getIdByCode(connection, 'listing_statuses', 'PENDING_REVIEW'),
  ]);

  const enLanguageId = await getIdByCode(connection, 'languages', 'en');
  const userDefaults = { activeStatusId, enLanguageId, amdCurrencyId };

  // `cities` has no `code` column (only `slug`) — resolve directly.
  const [cityRows] = await connection.query(
    'SELECT id, slug FROM cities WHERE slug IN (?)',
    [CITIES],
  );
  const cityIdsBySlug = new Map(cityRows.map((r) => [r.slug, r.id]));
  const categoryIds = new Map();
  // eslint-disable-next-line no-restricted-syntax -- seeding must run in a stable, readable order
  for (const category of CATEGORIES) {
    // eslint-disable-next-line no-await-in-loop -- sequential by design, seed scripts are not hot paths
    const [[row]] = await connection.query(
      'SELECT id FROM listing_categories WHERE slug = ?',
      [category.slug],
    );
    categoryIds.set(category.slug, row.id);
  }

  // --- Customers (20) -----------------------------------------------------
  const customerIds = [];
  // eslint-disable-next-line no-restricted-syntax -- seeding must run in a stable, readable order
  for (const [index, fullName] of CUSTOMER_NAMES.entries()) {
    const email = `${fullName.toLowerCase().replace(/[^a-z]+/g, '.')}@example.com`;
    // eslint-disable-next-line no-await-in-loop -- sequential by design
    const userId = await upsertPartnerUser(
      connection,
      { email, fullName },
      userDefaults,
    );
    // eslint-disable-next-line no-await-in-loop -- sequential by design
    await assignCustomerRole(connection, userId, customerRoleId);
    customerIds.push({ id: userId, fullName, email, index });
  }

  // --- Partners (5, one per category) -------------------------------------
  const partnersByCategory = new Map();
  // eslint-disable-next-line no-restricted-syntax -- seeding must run in a stable, readable order
  for (const category of CATEGORIES) {
    const { legalName, displayName, slug, email } = category.partner;
    // eslint-disable-next-line no-await-in-loop -- sequential by design
    const ownerUserId = await upsertPartnerUser(
      connection,
      { email, fullName: displayName },
      userDefaults,
    );
    // eslint-disable-next-line no-await-in-loop -- sequential by design
    const [partnerResult] = await connection.query(
      `INSERT INTO partners
        (legal_name, display_name, slug, email,
         verification_status_id, moderation_status_id, owner_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        legalName,
        displayName,
        slug,
        email,
        approvedStatusId,
        approvedStatusId,
        ownerUserId,
      ],
    );
    const partnerId = partnerResult.insertId;
    // P1.3 (migration 0031) moved `description` off `partners` and onto
    // `partner_translations`, one row per locale — this seed only ever
    // authors the English copy, same as every other demo-content string
    // here.
    // eslint-disable-next-line no-await-in-loop -- sequential by design
    await connection.query(
      'INSERT INTO partner_translations (partner_id, language_id, description) VALUES (?, ?, ?)',
      [
        partnerId,
        enLanguageId,
        `${displayName} is one of desavii's demo partner organizations, showcasing ${category.noun.toLowerCase()} listings across Armenia.`,
      ],
    );
    // eslint-disable-next-line no-await-in-loop -- sequential by design
    await connection.query(
      'INSERT INTO partner_employees (partner_id, user_id, role_id) VALUES (?, ?, ?)',
      [partnerId, ownerUserId, ownerRoleId],
    );
    // eslint-disable-next-line no-await-in-loop -- sequential by design
    const logoMediaId = await insertMedia(connection, {
      mediableType: 'partner',
      mediableId: partnerId,
      url: `/assets/images/demo/partners/${category.slug}-logo.svg`,
      isCover: true,
      ownerUserId,
      imageTypeId,
      completedStatusId: completedUploadStatusId,
      approvedStatusId,
      position: 0,
    });
    // eslint-disable-next-line no-await-in-loop -- sequential by design
    await connection.query(
      'UPDATE partners SET logo_media_id = ? WHERE id = ?',
      [logoMediaId, partnerId],
    );
    partnersByCategory.set(category.slug, { id: partnerId, ownerUserId });
  }

  const listingTypeIdsByCode = await getIdsByCode(
    connection,
    'listing_types',
    CATEGORIES.map((c) => c.listingTypeCode),
  );
  const bookableUnitTypeIdsByCode = await getIdsByCode(
    connection,
    'bookable_unit_types',
    [...new Set(CATEGORIES.map((c) => c.bookableUnitTypeCode))],
  );
  const pricingModelIdsByCode = await getIdsByCode(
    connection,
    'pricing_models',
    ['PER_NIGHT', 'PER_PERSON', 'PER_DAY', 'PER_HOUR'],
  );
  // Step L6.1: each demo listing's amenities come from its own category's
  // applicability set (`amenity_category_applicability`, seeded by
  // 006_search_filters.js) — the same source the Partner UI and the API
  // write rule use — instead of one hotel-style pool for every category.
  const [applicabilityRows] = await connection.query(
    `SELECT category_id, amenity_id FROM amenity_category_applicability
     ORDER BY category_id, amenity_id`,
  );
  const applicableAmenityIdsByCategoryId = new Map();
  applicabilityRows.forEach((row) => {
    if (!applicableAmenityIdsByCategoryId.has(row.category_id)) {
      applicableAmenityIdsByCategoryId.set(row.category_id, []);
    }
    applicableAmenityIdsByCategoryId.get(row.category_id).push(row.amenity_id);
  });

  // --- Listings (80+, 16 per category) ------------------------------------
  // listings[categorySlug] -> array of { id, status, bookableUnitId }
  const listingsByCategory = new Map();
  const now = new Date();

  // eslint-disable-next-line no-restricted-syntax -- seeding must run in a stable, readable order
  for (const category of CATEGORIES) {
    const partner = partnersByCategory.get(category.slug);
    const categoryId = categoryIds.get(category.slug);
    const listingTypeId = listingTypeIdsByCode.get(category.listingTypeCode);
    const bookableUnitTypeId = bookableUnitTypeIdsByCode.get(
      category.bookableUnitTypeCode,
    );
    const records = [];

    // eslint-disable-next-line no-restricted-syntax -- seeding must run in a stable, readable order
    for (let i = 0; i < LISTINGS_PER_CATEGORY; i += 1) {
      const city = CITIES[i % CITIES.length];
      const adjective = ADJECTIVES[i % ADJECTIVES.length];
      const cityLabel = city.charAt(0).toUpperCase() + city.slice(1);
      const title = category.titleTemplate(adjective, cityLabel);
      const slug = `demo-${category.slug}-${title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '')}`;
      const requestedStatus = STATUS_PLAN[i];
      const isRejected = requestedStatus === 'REJECTED';
      // A "rejected" listing has been sent back to draft by a moderator —
      // there is no dedicated listing_statuses.REJECTED row (see the
      // module header), so it's represented as status_id=DRAFT +
      // moderation_status_id=REJECTED, mirroring the real
      // PENDING_REVIEW -> DRAFT transition a rejection causes.
      const listingStatusIdByRequestedStatus = {
        PUBLISHED: publishedListingStatusId,
        DRAFT: draftListingStatusId,
        PENDING_REVIEW: pendingReviewListingStatusId,
        REJECTED: draftListingStatusId,
      };
      const statusId = listingStatusIdByRequestedStatus[requestedStatus];
      const moderationStatusId = isRejected
        ? rejectedStatusId
        : approvedStatusId;
      const publishedAt =
        requestedStatus === 'PUBLISHED'
          ? toSqlDateTime(addDays(now, -randomInt(5, 200)))
          : null;

      // eslint-disable-next-line no-await-in-loop -- sequential by design
      const [listingResult] = await connection.query(
        `INSERT INTO listings
          (partner_id, listing_type_id, slug, status_id, moderation_status_id, published_at, created_by, updated_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          partner.id,
          listingTypeId,
          slug,
          statusId,
          moderationStatusId,
          publishedAt,
          partner.ownerUserId,
          partner.ownerUserId,
        ],
      );
      const listingId = listingResult.insertId;

      // eslint-disable-next-line no-await-in-loop -- sequential by design
      await connection.query(
        `INSERT INTO listing_translations (listing_id, language_id, title, summary, description)
         VALUES (?, ?, ?, ?, ?)`,
        [
          listingId,
          enLanguageId,
          title,
          `${adjective} ${category.noun.toLowerCase()} located in ${cityLabel}, Armenia.`,
          category.description(cityLabel),
        ],
      );

      // eslint-disable-next-line no-await-in-loop -- sequential by design
      await connection.query(
        `INSERT INTO listing_locations (listing_id, city_id, latitude, longitude)
         VALUES (?, ?, ?, ?)`,
        [listingId, cityIdsBySlug.get(city), null, null],
      );

      // eslint-disable-next-line no-await-in-loop -- sequential by design
      await connection.query(
        'INSERT INTO listing_category_listing (listing_id, category_id) VALUES (?, ?)',
        [listingId, categoryId],
      );

      // Up to 4 amenities, rotating through the category's OWN applicable
      // set for variety per listing (Step L6.1 — never another category's).
      const categoryAmenityIds =
        applicableAmenityIdsByCategoryId.get(categoryId) ?? [];
      const amenitySlice = Array.from(
        {
          length: Math.min(AMENITIES_PER_LISTING, categoryAmenityIds.length),
        },
        (_, offset) =>
          categoryAmenityIds[(i + offset) % categoryAmenityIds.length],
      );
      // eslint-disable-next-line no-restricted-syntax -- seeding must run in a stable, readable order
      for (const amenityId of amenitySlice) {
        // eslint-disable-next-line no-await-in-loop -- sequential by design
        await connection.query(
          'INSERT IGNORE INTO listing_amenity_listing (listing_id, amenity_id) VALUES (?, ?)',
          [listingId, amenityId],
        );
      }

      const pricingModelCode = category.pricingModelCode(i);
      const amount = (category.basePrice + i * category.priceStep).toFixed(2);
      // eslint-disable-next-line no-await-in-loop -- sequential by design
      await connection.query(
        `INSERT INTO listing_pricing (listing_id, pricing_model_id, amount, currency_id)
         VALUES (?, ?, ?, ?)`,
        [
          listingId,
          pricingModelIdsByCode.get(pricingModelCode),
          amount,
          amdCurrencyId,
        ],
      );

      // 3 placeholder photos per listing, first marked as cover.
      // eslint-disable-next-line no-restricted-syntax -- seeding must run in a stable, readable order
      for (let photoIndex = 0; photoIndex < 3; photoIndex += 1) {
        const imageNumber = ((i + photoIndex) % 8) + 1;
        // eslint-disable-next-line no-await-in-loop -- sequential by design
        await insertMedia(connection, {
          mediableType: 'listing',
          mediableId: listingId,
          url: `/assets/images/demo/${category.slug}/${category.slug}-${imageNumber}.svg`,
          isCover: photoIndex === 0,
          ownerUserId: partner.ownerUserId,
          imageTypeId,
          completedStatusId: completedUploadStatusId,
          approvedStatusId,
          position: photoIndex,
        });
      }

      // eslint-disable-next-line no-await-in-loop -- sequential by design
      const [bookableUnitResult] = await connection.query(
        `INSERT INTO bookable_units
          (listing_id, bookable_unit_type_id, source_table, source_id, capacity, created_by, updated_by)
         VALUES (?, ?, 'listings', ?, ?, ?, ?)`,
        [
          listingId,
          bookableUnitTypeId,
          listingId,
          randomInt(2, 6),
          partner.ownerUserId,
          partner.ownerUserId,
        ],
      );

      records.push({
        id: listingId,
        status: requestedStatus,
        title,
        slug,
        bookableUnitId: bookableUnitResult.insertId,
        pricingAmount: Number(amount),
        currencyId: amdCurrencyId,
        stayNights: category.stayNights,
        bookingTypeId: null, // filled below once booking_type ids are resolved
        partnerId: partner.id,
        partnerOwnerId: partner.ownerUserId,
      });
    }

    listingsByCategory.set(category.slug, records);
  }

  const bookingTypeIdsByCode = await getIdsByCode(connection, 'booking_types', [
    ...new Set(CATEGORIES.map((c) => c.bookingTypeCode)),
  ]);
  CATEGORIES.forEach((category) => {
    const bookingTypeId = bookingTypeIdsByCode.get(category.bookingTypeCode);
    listingsByCategory.get(category.slug).forEach((record) => {
      // eslint-disable-next-line no-param-reassign -- building up the in-memory record set
      record.bookingTypeId = bookingTypeId;
    });
  });

  const publishedListings = CATEGORIES.flatMap((category) =>
    listingsByCategory
      .get(category.slug)
      .filter((record) => record.status === 'PUBLISHED'),
  );

  // --- Bookings (150+) -----------------------------------------------------
  const [
    pendingVendorStatusId,
    confirmedStatusId,
    cancelledByCustomerStatusId,
    cancelledByVendorStatusId,
    completedStatusId,
    payAtPropertyStatusId,
    paidOfflineStatusId,
    notRequiredStatusId,
  ] = await Promise.all([
    getIdByCode(connection, 'booking_statuses', 'PENDING_VENDOR'),
    getIdByCode(connection, 'booking_statuses', 'CONFIRMED'),
    getIdByCode(connection, 'booking_statuses', 'CANCELLED_BY_CUSTOMER'),
    getIdByCode(connection, 'booking_statuses', 'CANCELLED_BY_VENDOR'),
    getIdByCode(connection, 'booking_statuses', 'COMPLETED'),
    getIdByCode(connection, 'payment_statuses', 'PAY_AT_PROPERTY'),
    getIdByCode(connection, 'payment_statuses', 'PAID_OFFLINE'),
    getIdByCode(connection, 'payment_statuses', 'NOT_REQUIRED_ON_PLATFORM'),
  ]);

  const BOOKING_STATUS_CYCLE = [
    'PENDING',
    'CONFIRMED',
    'CANCELLED',
    'COMPLETED',
  ];
  const TOTAL_BOOKINGS = 152;
  const completedBookingIds = [];
  const bookingEventRecords = [];
  let bookingCounter = 0;

  // eslint-disable-next-line no-restricted-syntax -- seeding must run in a stable, readable order
  for (let i = 0; i < TOTAL_BOOKINGS; i += 1) {
    const listing = publishedListings[i % publishedListings.length];
    const customer = customerIds[i % customerIds.length];
    // Deliberately NOT `i % BOOKING_STATUS_CYCLE.length`: since
    // customerIds.length (20) is a multiple of the cycle length (4),
    // `i % 4` is fully determined by `i % 20` — every booking belonging
    // to the same customer would land on the exact same status, so a
    // single customer's "My Bookings" page would only ever show one
    // status. Cycling on `i`'s position within each customer-sized block
    // instead means every customer sees a real mix of statuses across
    // their ~7-8 bookings.
    const cycleStatus =
      BOOKING_STATUS_CYCLE[
        Math.floor(i / customerIds.length) % BOOKING_STATUS_CYCLE.length
      ];
    // A "still pending" booking must stay within the real 48h vendor-
    // response SLA (BOOKING_PENDING_VENDOR_SLA_HOURS) — this same backend
    // runs a live scheduled sweep that auto-expires any PENDING_VENDOR
    // booking past that window, so a `requestedAt` of, say, 90 days ago
    // would get silently flipped to EXPIRED the moment the sweep job next
    // runs. Confirmed/cancelled/completed bookings have already moved
    // past that window in real life, so they keep the wider historical
    // spread.
    const requestedAt =
      cycleStatus === 'PENDING'
        ? addDays(now, -randomInt(0, 1))
        : addDays(now, -randomInt(2, 180));

    let statusId;
    let confirmedAt = null;
    let cancelledAt = null;
    let completedAt = null;
    let paymentStatusId;
    let dateFrom;
    const changedByVendor = listing.partnerOwnerId;
    // `i % 2` alternates evenly within any block of consecutive `i`
    // values regardless of block size, so vendor/customer cancellations
    // split evenly both overall and within a single status-block.
    const byVendor = i % 2 === 0;

    if (cycleStatus === 'PENDING') {
      statusId = pendingVendorStatusId;
      paymentStatusId = notRequiredStatusId;
      dateFrom = addDays(now, randomInt(5, 60));
    } else if (cycleStatus === 'CONFIRMED') {
      statusId = confirmedStatusId;
      confirmedAt = toSqlDateTime(addDays(requestedAt, 1));
      paymentStatusId = payAtPropertyStatusId;
      dateFrom = addDays(now, randomInt(3, 45));
    } else if (cycleStatus === 'CANCELLED') {
      statusId = byVendor
        ? cancelledByVendorStatusId
        : cancelledByCustomerStatusId;
      confirmedAt = toSqlDateTime(addDays(requestedAt, 1));
      cancelledAt = toSqlDateTime(addDays(requestedAt, 3));
      paymentStatusId = notRequiredStatusId;
      dateFrom = addDays(requestedAt, 10);
    } else {
      statusId = completedStatusId;
      confirmedAt = toSqlDateTime(addDays(requestedAt, 1));
      completedAt = toSqlDateTime(addDays(requestedAt, listing.stayNights + 2));
      paymentStatusId = paidOfflineStatusId;
      dateFrom = addDays(requestedAt, 3);
    }

    const dateTo = addDays(dateFrom, listing.stayNights);
    const bookingReference = `BK-${toSqlDate(now).replace(/-/g, '')}-${String(bookingCounter).padStart(8, '0')}`;
    bookingCounter += 1;

    const guestContactSnapshot = JSON.stringify({
      fullName: customer.fullName,
      email: customer.email,
      phone: `+374 9${String(10000000 + customer.index * 137).slice(0, 7)}`,
    });

    // eslint-disable-next-line no-await-in-loop -- sequential by design
    const [bookingResult] = await connection.query(
      `INSERT INTO bookings
        (booking_reference, customer_user_id, partner_id, listing_id, booking_type_id, status_id,
         guest_contact_snapshot, currency_id, subtotal_amount, fees_amount, discount_amount, total_amount,
         payment_method, payment_status_id, requested_at, confirmed_at, cancelled_at, completed_at,
         created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0.00, 0.00, ?, 'offline', ?, ?, ?, ?, ?, ?, ?)`,
      [
        bookingReference,
        customer.id,
        listing.partnerId,
        listing.id,
        listing.bookingTypeId,
        statusId,
        guestContactSnapshot,
        listing.currencyId,
        listing.pricingAmount,
        listing.pricingAmount,
        paymentStatusId,
        toSqlDateTime(requestedAt),
        confirmedAt,
        cancelledAt,
        completedAt,
        customer.id,
        customer.id,
      ],
    );
    const bookingId = bookingResult.insertId;

    // eslint-disable-next-line no-await-in-loop -- sequential by design
    const [bookingItemResult] = await connection.query(
      `INSERT INTO booking_items (booking_id, bookable_unit_id, date_from, date_to, quantity, unit_price_amount)
       VALUES (?, ?, ?, ?, 1, ?)`,
      [
        bookingId,
        listing.bookableUnitId,
        toSqlDate(dateFrom),
        toSqlDate(dateTo),
        listing.pricingAmount,
      ],
    );

    // eslint-disable-next-line no-await-in-loop -- sequential by design
    await connection.query(
      'INSERT INTO booking_guests (booking_item_id, full_name) VALUES (?, ?)',
      [bookingItemResult.insertId, customer.fullName],
    );

    // Append-only status history mirroring the real transition path for
    // each final status (BACKEND_ARCHITECTURE.md §97's "every transition
    // is atomic and auditable" — demo data should look like it, too).
    const historyRows = [[null, pendingVendorStatusId, customer.id]];
    if (cycleStatus !== 'PENDING') {
      historyRows.push([
        pendingVendorStatusId,
        confirmedStatusId,
        changedByVendor,
      ]);
    }
    if (cycleStatus === 'CANCELLED') {
      historyRows.push([
        confirmedStatusId,
        statusId,
        byVendor ? changedByVendor : customer.id,
      ]);
    } else if (cycleStatus === 'COMPLETED') {
      historyRows.push([confirmedStatusId, completedStatusId, changedByVendor]);
    }
    // eslint-disable-next-line no-restricted-syntax -- seeding must run in a stable, readable order
    for (const [fromStatusId, toStatusId, changedBy] of historyRows) {
      // eslint-disable-next-line no-await-in-loop -- sequential by design
      await connection.query(
        `INSERT INTO booking_status_history (booking_id, from_status_id, to_status_id, changed_by)
         VALUES (?, ?, ?, ?)`,
        [bookingId, fromStatusId, toStatusId, changedBy],
      );
    }

    if (cycleStatus === 'COMPLETED') {
      completedBookingIds.push({
        bookingId,
        listingId: listing.id,
        customer,
        partnerOwnerId: listing.partnerOwnerId,
      });
    }

    bookingEventRecords.push({
      bookingId,
      bookingReference,
      listingId: listing.id,
      partnerId: listing.partnerId,
      partnerOwnerId: listing.partnerOwnerId,
      customerId: customer.id,
      totalAmount: listing.pricingAmount,
      currencyId: listing.currencyId,
      cycleStatus,
      byVendor,
      requestedAt,
      confirmedAt,
      cancelledAt,
      completedAt,
    });
  }

  // --- Reviews (half of completed bookings) -------------------------------
  const reviewRecords = [];
  // eslint-disable-next-line no-restricted-syntax -- seeding must run in a stable, readable order
  for (const [index, entry] of completedBookingIds.entries()) {
    if (index % 2 === 0) {
      const template = REVIEW_TEMPLATES[index % REVIEW_TEMPLATES.length];
      // eslint-disable-next-line no-await-in-loop -- sequential by design
      const [reviewResult] = await connection.query(
        `INSERT INTO reviews (customer_user_id, booking_id, listing_id, rating, title, content, status_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          entry.customer.id,
          entry.bookingId,
          entry.listingId,
          template.rating,
          template.title,
          template.content,
          approvedStatusId,
        ],
      );
      reviewRecords.push({ reviewId: reviewResult.insertId, entry, template });
    }
  }

  // --- Favorites (2-4 published listings per customer) --------------------
  const favoriteRecords = [];
  // eslint-disable-next-line no-restricted-syntax -- seeding must run in a stable, readable order
  for (const customer of customerIds) {
    const favoriteCount = randomInt(2, 4);
    const seen = new Set();
    // eslint-disable-next-line no-restricted-syntax -- seeding must run in a stable, readable order
    for (let f = 0; f < favoriteCount; f += 1) {
      const listing =
        publishedListings[randomInt(0, publishedListings.length - 1)];
      if (!seen.has(listing.id)) {
        seen.add(listing.id);
        favoriteRecords.push({ customer, listing });
        // eslint-disable-next-line no-await-in-loop -- sequential by design
        await connection.query(
          'INSERT IGNORE INTO favorites (customer_user_id, listing_id) VALUES (?, ?)',
          [customer.id, listing.id],
        );
      }
    }
  }

  // --- Notifications (booking/review/favorite/partner/listing events, plus
  // one admin announcement) -------------------------------------------------
  // Written directly via SQL (same rationale as reviews/favorites above —
  // no notifications controller/service exists to call), but shaped to
  // match exactly what `notificationListener.js` would have produced for
  // each event: same category/priority per event type, same payload keys,
  // same recipient-resolution rule (booking events route to whichever side
  // didn't cause the transition; review/favorite/listing events route to
  // the listing's partner owner).
  const [notificationCategoryIds, notificationPriorityIds] = await Promise.all([
    getIdsByCode(connection, 'notification_categories', [
      'BOOKING',
      'REVIEW',
      'FAVORITE',
      'PARTNER',
      'LISTING',
      'ADMIN',
    ]),
    getIdsByCode(connection, 'notification_priorities', [
      'LOW',
      'NORMAL',
      'HIGH',
      'URGENT',
    ]),
  ]);
  const [[adminUserRow]] = await connection.query(
    'SELECT id FROM users WHERE email = ?',
    ['admin@travelhub.dev'],
  );
  const adminUserId = adminUserRow.id;

  // Randomized unread/read/archived mix (1-in-4 unread, half read, 1-in-4
  // archived) so every tab/filter on the Notifications page has something
  // to show. Deliberately per-row `randomInt`, not a fixed-length cycle
  // keyed off insertion order: this loop's per-customer step (20, from
  // `customerIds.length`) is itself a multiple of a 4-length cycle, which
  // would make every one of a given customer's rows land on the exact
  // same phase — a real customer would see 100% unread or 100% archived
  // rows, never an actual mix. `randomInt` decorrelates read-state from
  // recipient identity entirely.
  let notificationSeq = 0;

  async function insertNotification({
    recipientUserId,
    eventType,
    categoryCode,
    priorityCode,
    actorId,
    resourceType,
    resourceId,
    payload,
    metadata = {},
    createdAt,
  }) {
    if (!recipientUserId) return;
    const roll = randomInt(1, 4);
    const readState =
      // eslint-disable-next-line no-nested-ternary -- three-way mapping is clearer inline than a lookup table for a one-off roll
      roll === 1 ? 'unread' : roll === 4 ? 'archived' : 'read';
    notificationSeq += 1;
    const isRead = readState !== 'unread';
    const isArchived = readState === 'archived';
    const readAt = isRead
      ? toSqlDateTime(addDays(createdAt, randomInt(0, 2)))
      : null;
    const archivedAt = isArchived
      ? toSqlDateTime(addDays(createdAt, randomInt(1, 3)))
      : null;
    await connection.query(
      `INSERT INTO notifications
        (recipient_user_id, event_id, event_type, category_id, priority_id, actor_id,
         resource_type, resource_id, payload, metadata, is_read, read_at, is_archived, archived_at, created_at)
       VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        recipientUserId,
        eventType,
        notificationCategoryIds.get(categoryCode),
        notificationPriorityIds.get(priorityCode),
        actorId,
        resourceType,
        resourceId,
        JSON.stringify(payload),
        JSON.stringify(metadata),
        isRead ? 1 : 0,
        readAt,
        isArchived ? 1 : 0,
        archivedAt,
        toSqlDateTime(createdAt),
      ],
    );
  }

  // Booking lifecycle notifications — one per booking, routed exactly like
  // the real listener routes each event type.
  // eslint-disable-next-line no-restricted-syntax -- seeding must run in a stable, readable order
  for (const record of bookingEventRecords) {
    if (record.cycleStatus === 'PENDING') {
      // eslint-disable-next-line no-await-in-loop -- sequential by design
      await insertNotification({
        recipientUserId: record.partnerOwnerId,
        eventType: EVENT_TYPES.BOOKING_CREATED,
        categoryCode: 'BOOKING',
        priorityCode: 'HIGH',
        actorId: record.customerId,
        resourceType: 'booking',
        resourceId: record.bookingId,
        payload: {
          bookingReference: record.bookingReference,
          listingId: record.listingId,
          totalAmount: record.totalAmount,
        },
        createdAt: record.requestedAt,
      });
    } else if (record.cycleStatus === 'CONFIRMED') {
      // eslint-disable-next-line no-await-in-loop -- sequential by design
      await insertNotification({
        recipientUserId: record.customerId,
        eventType: EVENT_TYPES.BOOKING_CONFIRMED,
        categoryCode: 'BOOKING',
        priorityCode: 'HIGH',
        actorId: record.partnerOwnerId,
        resourceType: 'booking',
        resourceId: record.bookingId,
        payload: { bookingReference: record.bookingReference },
        createdAt: fromSqlDateTime(record.confirmedAt),
      });
    } else if (record.cycleStatus === 'CANCELLED') {
      const recipientUserId = record.byVendor
        ? record.customerId
        : record.partnerOwnerId;
      const actorId = record.byVendor
        ? record.partnerOwnerId
        : record.customerId;
      // eslint-disable-next-line no-await-in-loop -- sequential by design
      await insertNotification({
        recipientUserId,
        eventType: EVENT_TYPES.BOOKING_CANCELLED,
        categoryCode: 'BOOKING',
        priorityCode: 'NORMAL',
        actorId,
        resourceType: 'booking',
        resourceId: record.bookingId,
        payload: { bookingReference: record.bookingReference },
        createdAt: fromSqlDateTime(record.cancelledAt),
      });
    } else {
      // eslint-disable-next-line no-await-in-loop -- sequential by design
      await insertNotification({
        recipientUserId: record.customerId,
        eventType: EVENT_TYPES.BOOKING_COMPLETED,
        categoryCode: 'BOOKING',
        priorityCode: 'LOW',
        actorId: record.partnerOwnerId,
        resourceType: 'booking',
        resourceId: record.bookingId,
        payload: { bookingReference: record.bookingReference },
        createdAt: fromSqlDateTime(record.completedAt),
      });
    }
  }

  // Review-received notifications, to the reviewed listing's partner owner.
  // eslint-disable-next-line no-restricted-syntax -- seeding must run in a stable, readable order
  for (const { reviewId, entry, template } of reviewRecords) {
    // eslint-disable-next-line no-await-in-loop -- sequential by design
    await insertNotification({
      recipientUserId: entry.partnerOwnerId,
      eventType: EVENT_TYPES.REVIEW_SUBMITTED,
      categoryCode: 'REVIEW',
      priorityCode: 'NORMAL',
      actorId: entry.customer.id,
      resourceType: 'review',
      resourceId: reviewId,
      payload: { listingId: entry.listingId, rating: template.rating },
      createdAt: now,
    });
  }

  // Favorite-added notifications, to the favorited listing's partner owner.
  // eslint-disable-next-line no-restricted-syntax -- seeding must run in a stable, readable order
  for (const { customer, listing } of favoriteRecords) {
    // eslint-disable-next-line no-await-in-loop -- sequential by design
    await insertNotification({
      recipientUserId: listing.partnerOwnerId,
      eventType: EVENT_TYPES.FAVORITE_ADDED,
      categoryCode: 'FAVORITE',
      priorityCode: 'LOW',
      actorId: customer.id,
      resourceType: 'listing',
      resourceId: listing.id,
      payload: { listingId: listing.id },
      createdAt: now,
    });
  }

  // Partner-approved notifications, one per demo partner.
  // eslint-disable-next-line no-restricted-syntax -- seeding must run in a stable, readable order
  for (const category of CATEGORIES) {
    const partner = partnersByCategory.get(category.slug);
    // eslint-disable-next-line no-await-in-loop -- sequential by design
    await insertNotification({
      recipientUserId: partner.ownerUserId,
      eventType: EVENT_TYPES.PARTNER_APPROVED,
      categoryCode: 'PARTNER',
      priorityCode: 'HIGH',
      actorId: adminUserId,
      resourceType: 'partner',
      resourceId: partner.id,
      payload: { partnerName: category.partner.displayName },
      createdAt: addDays(now, -randomInt(30, 200)),
    });
  }

  // Listing-approved notifications — first 2 published listings per
  // category (a representative sample, not all 40 published listings).
  // eslint-disable-next-line no-restricted-syntax -- seeding must run in a stable, readable order
  for (const category of CATEGORIES) {
    const partner = partnersByCategory.get(category.slug);
    const published = listingsByCategory
      .get(category.slug)
      .filter((record) => record.status === 'PUBLISHED')
      .slice(0, 2);
    // eslint-disable-next-line no-restricted-syntax -- seeding must run in a stable, readable order
    for (const listing of published) {
      // eslint-disable-next-line no-await-in-loop -- sequential by design
      await insertNotification({
        recipientUserId: partner.ownerUserId,
        eventType: EVENT_TYPES.LISTING_APPROVED,
        categoryCode: 'LISTING',
        priorityCode: 'NORMAL',
        actorId: adminUserId,
        resourceType: 'listing',
        resourceId: listing.id,
        payload: { listingId: listing.id, slug: listing.slug },
        createdAt: addDays(now, -randomInt(5, 200)),
      });
    }
  }

  // One admin announcement, broadcast to every demo customer + partner
  // owner — the Admin/Partner/Customer notification surfaces all share
  // this same real announcement pipeline (`event_id` NULL, one row per
  // recipient), never a fabricated one-off.
  const announcementPayload = {
    title: 'Upcoming platform maintenance window',
    body: 'desavii will undergo scheduled maintenance this weekend between 02:00 and 04:00 (Yerevan time). Booking and search may be briefly unavailable during this window.',
  };
  const announcementRecipients = [
    ...customerIds.map((c) => c.id),
    ...[...partnersByCategory.values()].map((p) => p.ownerUserId),
  ];
  // eslint-disable-next-line no-restricted-syntax -- seeding must run in a stable, readable order
  for (const recipientUserId of announcementRecipients) {
    // eslint-disable-next-line no-await-in-loop -- sequential by design
    await insertNotification({
      recipientUserId,
      eventType: 'admin.announcement',
      categoryCode: 'ADMIN',
      priorityCode: 'NORMAL',
      actorId: adminUserId,
      resourceType: null,
      resourceId: null,
      payload: announcementPayload,
      metadata: { audience: { type: 'ALL' } },
      createdAt: addDays(now, -randomInt(0, 3)),
    });
  }

  // --- Messaging (conversations + messages + reactions + attachments) ----
  // Real Customer<->Partner conversations (two customers per partner) plus
  // one Admin-support conversation — written directly via SQL (same
  // rationale as reviews/favorites/notifications above), but shaped
  // exactly like the real schema `mysqlConversationRepository.js` owns:
  // no stored participant role, per-participant read cursor via
  // `conversation_participants.last_read_message_id`. Attachments reuse
  // the same `media` table + already-seeded local SVG placeholders every
  // listing/partner logo uses (`mediable_type = 'message'`), never a new
  // asset or a second attachment table.
  const CUSTOMER_MESSAGE_TEMPLATES = [
    'Hi! Is this still available for the dates I need?',
    'Could you tell me more about the cancellation policy?',
    'Thanks for the quick reply, that works for us.',
    'Is early check-in possible?',
    'Great, looking forward to it!',
  ];
  const PARTNER_MESSAGE_TEMPLATES = [
    'Hello! Yes, it is available — happy to help with your booking.',
    'Our standard policy allows a full refund up to 48 hours before check-in.',
    "Glad it works for you! Here's a photo in case it helps.",
    'Early check-in is usually possible — we will confirm closer to your arrival.',
    'Perfect, see you then!',
  ];

  let conversationSeq = 0;
  let messageSeq = 0;
  let messagingReactionSeq = 0;

  async function seedConversation({
    participantUserIds,
    messages,
    attachmentOnMessageIndex,
    attachmentUrl,
  }) {
    conversationSeq += 1;
    const [conversationResult] = await connection.query(
      'INSERT INTO conversations (created_by, created_at) VALUES (?, ?)',
      [participantUserIds[0], toSqlDateTime(messages[0].createdAt)],
    );
    const conversationId = conversationResult.insertId;

    // eslint-disable-next-line no-restricted-syntax -- seeding must run in a stable, readable order
    for (const userId of participantUserIds) {
      // eslint-disable-next-line no-await-in-loop -- sequential by design
      await connection.query(
        `INSERT INTO conversation_participants (conversation_id, user_id, joined_at)
         VALUES (?, ?, ?)`,
        [conversationId, userId, toSqlDateTime(messages[0].createdAt)],
      );
    }

    const insertedMessages = [];
    // eslint-disable-next-line no-restricted-syntax -- seeding must run in a stable, readable order
    for (const [index, message] of messages.entries()) {
      messageSeq += 1;
      // eslint-disable-next-line no-await-in-loop -- sequential by design
      const [messageResult] = await connection.query(
        `INSERT INTO messages (conversation_id, sender_user_id, body, created_at)
         VALUES (?, ?, ?, ?)`,
        [
          conversationId,
          message.senderUserId,
          message.body,
          toSqlDateTime(message.createdAt),
        ],
      );
      const messageId = messageResult.insertId;
      insertedMessages.push({
        id: messageId,
        senderUserId: message.senderUserId,
      });

      if (index === attachmentOnMessageIndex) {
        // eslint-disable-next-line no-await-in-loop -- sequential by design
        await insertMedia(connection, {
          mediableType: 'message',
          mediableId: messageId,
          url: attachmentUrl,
          isCover: false,
          ownerUserId: message.senderUserId,
          imageTypeId,
          completedStatusId: completedUploadStatusId,
          approvedStatusId,
          position: 0,
        });
      }
    }

    const lastMessage = insertedMessages[insertedMessages.length - 1];
    // eslint-disable-next-line no-await-in-loop -- sequential by design
    await connection.query(
      'UPDATE conversations SET last_message_at = ? WHERE id = ?',
      [toSqlDateTime(messages[messages.length - 1].createdAt), conversationId],
    );

    // Realistic, decorrelated unread mix (0-2 unread messages per
    // non-newest-sender participant) — a fixed-depth cycle would make
    // every conversation land on the exact same read state, the same
    // class of bug already fixed once for notifications above.
    // eslint-disable-next-line no-restricted-syntax -- seeding must run in a stable, readable order
    for (const userId of participantUserIds) {
      const isLastSender = userId === lastMessage.senderUserId;
      let lastReadMessageId = null;
      if (isLastSender) {
        lastReadMessageId = lastMessage.id;
      } else {
        const unreadCount = randomInt(0, Math.min(2, insertedMessages.length));
        const readIndex = insertedMessages.length - unreadCount - 1;
        lastReadMessageId =
          readIndex >= 0 ? insertedMessages[readIndex].id : null;
      }
      // eslint-disable-next-line no-await-in-loop -- sequential by design
      await connection.query(
        `UPDATE conversation_participants SET last_read_message_id = ?
         WHERE conversation_id = ? AND user_id = ?`,
        [lastReadMessageId, conversationId, userId],
      );
    }

    return insertedMessages;
  }

  // eslint-disable-next-line no-restricted-syntax -- seeding must run in a stable, readable order
  for (const [categoryIndex, category] of CATEGORIES.entries()) {
    const partner = partnersByCategory.get(category.slug);
    const conversationCustomers = [
      customerIds[(categoryIndex * 2) % customerIds.length],
      customerIds[(categoryIndex * 2 + 1) % customerIds.length],
    ];

    // eslint-disable-next-line no-restricted-syntax -- seeding must run in a stable, readable order
    for (const [pairIndex, customer] of conversationCustomers.entries()) {
      const startedDaysAgo = randomInt(2, 10);
      const messages = [];
      const messageCount = randomInt(3, 5);
      // eslint-disable-next-line no-restricted-syntax -- seeding must run in a stable, readable order
      for (let i = 0; i < messageCount; i += 1) {
        const fromCustomer = i % 2 === 0;
        messages.push({
          senderUserId: fromCustomer ? customer.id : partner.ownerUserId,
          body: fromCustomer
            ? CUSTOMER_MESSAGE_TEMPLATES[i % CUSTOMER_MESSAGE_TEMPLATES.length]
            : PARTNER_MESSAGE_TEMPLATES[i % PARTNER_MESSAGE_TEMPLATES.length],
          createdAt: addDays(
            now,
            -startedDaysAgo + Math.floor((i * startedDaysAgo) / messageCount),
          ),
        });
      }

      // eslint-disable-next-line no-await-in-loop -- sequential by design
      await seedConversation({
        participantUserIds: [customer.id, partner.ownerUserId],
        messages,
        // An image attachment on the first partner conversation of every
        // category — reuses that category's already-seeded listing photo,
        // never a new asset.
        attachmentOnMessageIndex: pairIndex === 0 ? 2 : undefined,
        attachmentUrl: `/assets/images/demo/${category.slug}/${category.slug}-1.svg`,
      });
    }
  }

  // One Admin-support conversation, mirroring the real "future Support
  // role" use case the brief names — a customer reaching out to Admin
  // directly, with no partner involved.
  const supportCustomer = customerIds[0];
  // eslint-disable-next-line no-await-in-loop -- sequential by design
  const supportMessages = await seedConversation({
    participantUserIds: [supportCustomer.id, adminUserId],
    messages: [
      {
        senderUserId: supportCustomer.id,
        body: "Hi, I'm having trouble finding my booking confirmation email. Can you help?",
        createdAt: addDays(now, -1),
      },
      {
        senderUserId: adminUserId,
        body: "Hello! I can see your booking is confirmed — I've resent the confirmation email, please check your inbox.",
        createdAt: addDays(now, -1),
      },
      {
        senderUserId: supportCustomer.id,
        body: 'Got it, thank you for the quick help!',
        createdAt: now,
      },
    ],
  });

  // A couple of reactions, on real messages from the conversations above.
  // eslint-disable-next-line no-restricted-syntax -- seeding must run in a stable, readable order
  for (const { id: messageId, senderUserId } of supportMessages.slice(1)) {
    messagingReactionSeq += 1;
    // eslint-disable-next-line no-await-in-loop -- sequential by design
    await connection.query(
      `INSERT IGNORE INTO message_reactions (message_id, user_id, reaction_code)
       VALUES (?, ?, ?)`,
      [
        messageId,
        senderUserId === adminUserId ? supportCustomer.id : adminUserId,
        '👍',
      ],
    );
  }

  // --- AI Platform demo data (Phase 15.7) ---------------------------------
  // Real usage-log rows (backs the Admin AI usage dashboard), a real
  // trip-planner conversation, and real affinity memory — all shaped to
  // match exactly what the live AI Service/aiListener.js write paths
  // already produce, not fabricated fields. `local` is this app's real,
  // key-independent default provider (LocalHeuristicProvider), so these
  // rows are honest even with zero external API keys configured.
  const aiDemoCustomer = customerIds[0];
  const yerevanCityId = cityIdsBySlug.get('yerevan');
  const hotelsCategoryId = categoryIds.get('hotels');

  const AI_USAGE_LOG_PLAN = [
    {
      featureCode: 'trip_planner',
      promptTokens: 210,
      completionTokens: 95,
      latencyMs: 4,
      cacheHit: false,
    },
    {
      featureCode: 'search_parse',
      promptTokens: 90,
      completionTokens: 30,
      latencyMs: 2,
      cacheHit: false,
    },
    {
      featureCode: 'search_parse',
      promptTokens: 90,
      completionTokens: 30,
      latencyMs: 1,
      cacheHit: true,
    },
    {
      featureCode: 'assistant',
      promptTokens: 180,
      completionTokens: 60,
      latencyMs: 3,
      cacheHit: false,
    },
    {
      featureCode: 'recommendations',
      promptTokens: 140,
      completionTokens: 45,
      latencyMs: 2,
      cacheHit: false,
    },
    {
      featureCode: 'listing_description',
      promptTokens: 160,
      completionTokens: 120,
      latencyMs: 3,
      cacheHit: false,
      partnerId: partnersByCategory.get('hotels').id,
    },
    {
      featureCode: 'moderation',
      promptTokens: 70,
      completionTokens: 25,
      latencyMs: 1,
      cacheHit: false,
    },
  ];
  // eslint-disable-next-line no-restricted-syntax -- seeding must run in a stable, readable order
  for (const entry of AI_USAGE_LOG_PLAN) {
    // eslint-disable-next-line no-await-in-loop -- sequential by design
    await connection.query(
      `INSERT INTO ai_usage_logs
         (user_id, partner_id, feature_code, provider_code, model,
          prompt_tokens, completion_tokens, total_tokens, latency_ms,
          cache_hit, succeeded, created_at)
       VALUES (?, ?, ?, 'local', 'local-heuristic-v1', ?, ?, ?, ?, ?, 1, ?)`,
      [
        aiDemoCustomer.id,
        entry.partnerId ?? null,
        entry.featureCode,
        entry.promptTokens,
        entry.completionTokens,
        entry.promptTokens + entry.completionTokens,
        entry.latencyMs,
        entry.cacheHit ? 1 : 0,
        toSqlDateTime(addDays(now, -randomInt(0, 6))),
      ],
    );
  }

  // One real trip-planner conversation for the demo customer, matching
  // the exact turn shape `TripPlannerService`/`AiService` produce.
  const [aiConversationResult] = await connection.query(
    `INSERT INTO ai_conversations (user_id, feature_code, title, created_at, updated_at)
     VALUES (?, 'trip_planner', ?, ?, ?)`,
    [
      aiDemoCustomer.id,
      '3-day trip to Yerevan',
      toSqlDateTime(addDays(now, -2)),
      toSqlDateTime(addDays(now, -2)),
    ],
  );
  const aiConversationId = aiConversationResult.insertId;
  const AI_DEMO_MESSAGES = [
    {
      role: 'user',
      content:
        'Plan a 3-day trip to Yerevan for 2 people, budget around 500 AMD... actually 500000 AMD, we like history and good food.',
    },
    {
      role: 'assistant',
      content:
        "Here's a 3-day itinerary for Yerevan built from real published listings that match your budget and interests, with a mix of historic sights and highly-rated places to eat each day.",
      promptTokens: 240,
      completionTokens: 110,
      latencyMs: 4,
    },
  ];
  // eslint-disable-next-line no-restricted-syntax -- seeding must run in a stable, readable order
  for (const message of AI_DEMO_MESSAGES) {
    // eslint-disable-next-line no-await-in-loop -- sequential by design
    await connection.query(
      `INSERT INTO ai_messages
         (conversation_id, role, content, provider_code, model,
          prompt_tokens, completion_tokens, latency_ms, cache_hit, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
      [
        aiConversationId,
        message.role,
        message.content,
        message.role === 'assistant' ? 'local' : null,
        message.role === 'assistant' ? 'local-heuristic-v1' : null,
        message.promptTokens ?? null,
        message.completionTokens ?? null,
        message.latencyMs ?? null,
        toSqlDateTime(addDays(now, -2)),
      ],
    );
  }

  // Real affinity memory for the same demo customer — the exact shape
  // `events/aiListener.js` writes passively from real
  // BOOKING_COMPLETED/REVIEW_SUBMITTED/FAVORITE_ADDED events, seeded
  // directly here so `GET /ai/recommendations` has real signals to work
  // from for this account without waiting for those events to replay.
  await connection.query(
    `INSERT INTO ai_user_memory (user_id, memory_key, memory_value)
     VALUES (?, ?, JSON_OBJECT('label', ?, 'count', ?))`,
    [aiDemoCustomer.id, `category_affinity:${hotelsCategoryId}`, 'Hotels', 3],
  );
  await connection.query(
    `INSERT INTO ai_user_memory (user_id, memory_key, memory_value)
     VALUES (?, ?, JSON_OBJECT('label', ?, 'count', ?))`,
    [aiDemoCustomer.id, `destination_affinity:${yerevanCityId}`, 'Yerevan', 2],
  );

  // --- Online Payments (Phase 16) ------------------------------------------
  // A realistic mix of payment/refund states layered onto a subset of
  // CONFIRMED/COMPLETED bookings, connected to real bookings/customers/
  // partners. Written directly via SQL (same rationale as reviews/
  // favorites/notifications/messaging/AI above), but shaped to match
  // exactly what `PaymentService`'s real write path produces: same
  // `payment_transactions`/`financial_ledger_entries` entry-type
  // vocabulary, same `bookings.payment_status_id` mapping
  // (`BOOKING_PAYMENT_STATUS_BY_INTENT_STATUS` in `paymentService.js`),
  // same price-snapshot rule (base/fees/discount/total copied from the
  // booking at "creation" time, tax always 0.00 — no tax engine exists).
  const [
    paymentIntentStatusIds,
    refundStatusIds,
    awaitingPaymentStatusId,
    paidOnlineStatusId,
    paymentFailedStatusId,
    partiallyRefundedOnlineStatusId,
    refundedOnlineStatusId,
  ] = await Promise.all([
    getIdsByCode(connection, 'payment_intent_statuses', [
      'PROCESSING',
      'SUCCEEDED',
      'FAILED',
      'PARTIALLY_REFUNDED',
      'REFUNDED',
    ]),
    getIdsByCode(connection, 'refund_statuses', ['SUCCEEDED']),
    getIdByCode(connection, 'payment_statuses', 'AWAITING_PAYMENT'),
    getIdByCode(connection, 'payment_statuses', 'PAID_ONLINE'),
    getIdByCode(connection, 'payment_statuses', 'PAYMENT_FAILED'),
    getIdByCode(connection, 'payment_statuses', 'PARTIALLY_REFUNDED_ONLINE'),
    getIdByCode(connection, 'payment_statuses', 'REFUNDED_ONLINE'),
  ]);
  const bookingPaymentStatusIdByCode = new Map([
    ['AWAITING_PAYMENT', awaitingPaymentStatusId],
    ['PAID_ONLINE', paidOnlineStatusId],
    ['PAYMENT_FAILED', paymentFailedStatusId],
    ['PARTIALLY_REFUNDED_ONLINE', partiallyRefundedOnlineStatusId],
    ['REFUNDED_ONLINE', refundedOnlineStatusId],
  ]);

  // Every outcome a real customer can hit via `LocalPaymentProvider`
  // (`intentStatus`/`simulateScenario` mirror its own vocabulary exactly),
  // plus what each one means for the booking's coarse payment status and
  // whether a follow-up refund is layered on afterward. `finalIntentStatus`
  // only differs from `intentStatus` for the two refund outcomes, since
  // those payments were fully captured (`SUCCEEDED`) before the refund
  // moved them to their terminal refunded state.
  const PAYMENT_OUTCOME_CONFIG = {
    SUCCEEDED: {
      intentStatus: 'SUCCEEDED',
      captured: true,
      bookingStatusCode: 'PAID_ONLINE',
      simulateScenario: 'SUCCESS',
    },
    FAILED: {
      intentStatus: 'FAILED',
      captured: false,
      bookingStatusCode: 'PAYMENT_FAILED',
      simulateScenario: 'DECLINE',
    },
    PROCESSING: {
      intentStatus: 'PROCESSING',
      captured: false,
      bookingStatusCode: 'AWAITING_PAYMENT',
      simulateScenario: 'PROCESSING',
    },
    PARTIALLY_REFUNDED: {
      intentStatus: 'SUCCEEDED',
      finalIntentStatus: 'PARTIALLY_REFUNDED',
      captured: true,
      bookingStatusCode: 'PARTIALLY_REFUNDED_ONLINE',
      simulateScenario: 'SUCCESS',
      refundPortion: 0.5,
    },
    REFUNDED: {
      intentStatus: 'SUCCEEDED',
      finalIntentStatus: 'REFUNDED',
      captured: true,
      bookingStatusCode: 'REFUNDED_ONLINE',
      simulateScenario: 'SUCCESS',
      refundPortion: 1,
    },
  };
  const PAYMENT_OUTCOME_CYCLE = [
    'SUCCEEDED',
    'SUCCEEDED',
    'FAILED',
    'SUCCEEDED',
    'PROCESSING',
    'SUCCEEDED',
    'SUCCEEDED',
    'PARTIALLY_REFUNDED',
    'SUCCEEDED',
    'REFUNDED',
    'SUCCEEDED',
    'FAILED',
  ];
  const REFUND_REASON_POOL = [
    'Guest requested a partial refund due to a shortened stay.',
    'Guest cancelled part of the reservation after check-in.',
    'Support-approved goodwill refund.',
  ];

  // Only CONFIRMED/COMPLETED bookings realistically carry a successful
  // online payment — a PENDING booking has nothing to pay for yet, and a
  // CANCELLED one never reached a payable state in this demo dataset.
  const paymentCandidates = bookingEventRecords.filter(
    (entry) =>
      entry.cycleStatus === 'CONFIRMED' || entry.cycleStatus === 'COMPLETED',
  );
  const PAYMENT_SEED_COUNT = Math.min(30, paymentCandidates.length);
  let paymentCounter = 0;
  let refundCounter = 0;

  // eslint-disable-next-line no-restricted-syntax -- seeding must run in a stable, readable order
  for (let p = 0; p < PAYMENT_SEED_COUNT; p += 1) {
    const entry = paymentCandidates[p];
    const outcomeCode = PAYMENT_OUTCOME_CYCLE[p % PAYMENT_OUTCOME_CYCLE.length];
    const config = PAYMENT_OUTCOME_CONFIG[outcomeCode];
    const paidAt = fromSqlDateTime(entry.confirmedAt);
    const paidAtSql = toSqlDateTime(paidAt);

    const paymentReference = `PAY-${toSqlDate(now).replace(/-/g, '')}-${String(
      paymentCounter,
    ).padStart(8, '0')}`;
    paymentCounter += 1;

    const capturedAmount = config.captured ? entry.totalAmount : '0.00';
    const refundedAmount = config.refundPortion
      ? (Number(entry.totalAmount) * config.refundPortion).toFixed(2)
      : '0.00';
    const failureCode = outcomeCode === 'FAILED' ? 'card_declined' : null;
    const failureMessage =
      outcomeCode === 'FAILED' ? 'The card was declined.' : null;
    const finalIntentStatusCode =
      config.finalIntentStatus ?? config.intentStatus;

    // eslint-disable-next-line no-await-in-loop -- sequential by design
    const [paymentResult] = await connection.query(
      `INSERT INTO payments
        (payment_reference, booking_id, customer_user_id, partner_id, provider_code,
         status_id, base_amount, fees_amount, tax_amount, discount_amount, total_amount,
         currency_id, captured_amount, refunded_amount, failure_code, failure_message,
         metadata, created_at, succeeded_at, failed_at, created_by)
       VALUES (?, ?, ?, ?, 'local', ?, ?, 0.00, 0.00, 0.00, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        paymentReference,
        entry.bookingId,
        entry.customerId,
        entry.partnerId,
        paymentIntentStatusIds.get(finalIntentStatusCode),
        entry.totalAmount,
        entry.totalAmount,
        entry.currencyId,
        capturedAmount,
        refundedAmount,
        failureCode,
        failureMessage,
        JSON.stringify({ simulateScenario: config.simulateScenario }),
        paidAtSql,
        config.captured ? paidAtSql : null,
        outcomeCode === 'FAILED' ? paidAtSql : null,
        entry.customerId,
      ],
    );
    const paymentId = paymentResult.insertId;

    // eslint-disable-next-line no-await-in-loop -- sequential by design
    await connection.query(
      `INSERT INTO payment_attempts
        (payment_id, attempt_number, provider_code, status_id, failure_code, failure_message, created_at)
       VALUES (?, 1, 'local', ?, ?, ?, ?)`,
      [
        paymentId,
        paymentIntentStatusIds.get(config.intentStatus),
        failureCode,
        failureMessage,
        paidAtSql,
      ],
    );

    // eslint-disable-next-line no-await-in-loop -- sequential by design
    await connection.query(
      `INSERT INTO payment_transactions (payment_id, type, amount, currency_id, actor_id, metadata, created_at)
       VALUES (?, 'PAYMENT_CREATED', ?, ?, ?, NULL, ?)`,
      [
        paymentId,
        entry.totalAmount,
        entry.currencyId,
        entry.customerId,
        paidAtSql,
      ],
    );
    if (outcomeCode === 'FAILED') {
      // eslint-disable-next-line no-await-in-loop -- sequential by design
      await connection.query(
        `INSERT INTO payment_transactions (payment_id, type, amount, currency_id, actor_id, metadata, created_at)
         VALUES (?, 'PAYMENT_FAILED', NULL, NULL, ?, ?, ?)`,
        [
          paymentId,
          entry.customerId,
          JSON.stringify({ failureCode, failureMessage }),
          paidAtSql,
        ],
      );
    } else if (config.captured) {
      // eslint-disable-next-line no-await-in-loop -- sequential by design
      await connection.query(
        `INSERT INTO payment_transactions (payment_id, type, amount, currency_id, actor_id, metadata, created_at)
         VALUES (?, 'PAYMENT_CAPTURED', ?, ?, ?, NULL, ?)`,
        [
          paymentId,
          entry.totalAmount,
          entry.currencyId,
          entry.customerId,
          paidAtSql,
        ],
      );
    }

    if (config.captured) {
      // eslint-disable-next-line no-await-in-loop -- sequential by design
      await connection.query(
        `INSERT INTO financial_ledger_entries
          (entry_type, payment_id, booking_id, partner_id, amount, currency_id, description, created_at)
         VALUES ('CUSTOMER_PAYMENT_RECEIVED', ?, ?, NULL, ?, ?, ?, ?)`,
        [
          paymentId,
          entry.bookingId,
          entry.totalAmount,
          entry.currencyId,
          `Payment received for booking #${entry.bookingId}`,
          paidAtSql,
        ],
      );
      // eslint-disable-next-line no-await-in-loop -- sequential by design
      await connection.query(
        `INSERT INTO financial_ledger_entries
          (entry_type, payment_id, booking_id, partner_id, amount, currency_id, description, created_at)
         VALUES ('PARTNER_PAYABLE_ACCRUED', ?, ?, ?, ?, ?, ?, ?)`,
        [
          paymentId,
          entry.bookingId,
          entry.partnerId,
          entry.totalAmount,
          entry.currencyId,
          `Payable accrued for booking #${entry.bookingId}`,
          paidAtSql,
        ],
      );
    }

    // eslint-disable-next-line no-await-in-loop -- sequential by design
    await connection.query(
      'UPDATE bookings SET payment_status_id = ? WHERE id = ?',
      [
        bookingPaymentStatusIdByCode.get(config.bookingStatusCode),
        entry.bookingId,
      ],
    );

    if (config.refundPortion) {
      const refundedAt = addDays(paidAt, randomInt(1, 5));
      const refundedAtSql = toSqlDateTime(refundedAt);
      const refundReference = `RF-${toSqlDate(now).replace(/-/g, '')}-${String(
        refundCounter,
      ).padStart(8, '0')}`;
      const reason =
        REFUND_REASON_POOL[refundCounter % REFUND_REASON_POOL.length];
      refundCounter += 1;

      // eslint-disable-next-line no-await-in-loop -- sequential by design
      const [refundResult] = await connection.query(
        `INSERT INTO refunds
          (refund_reference, payment_id, amount, currency_id, reason, status_id, provider_code, requested_by, created_at, succeeded_at)
         VALUES (?, ?, ?, ?, ?, ?, 'local', ?, ?, ?)`,
        [
          refundReference,
          paymentId,
          refundedAmount,
          entry.currencyId,
          reason,
          refundStatusIds.get('SUCCEEDED'),
          adminUserId,
          refundedAtSql,
          refundedAtSql,
        ],
      );
      const refundId = refundResult.insertId;

      // eslint-disable-next-line no-restricted-syntax -- seeding must run in a stable, readable order
      for (const type of ['REFUND_CREATED', 'REFUND_SUCCEEDED']) {
        // eslint-disable-next-line no-await-in-loop -- sequential by design
        await connection.query(
          `INSERT INTO payment_transactions (payment_id, refund_id, type, amount, currency_id, actor_id, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            paymentId,
            refundId,
            type,
            refundedAmount,
            entry.currencyId,
            adminUserId,
            refundedAtSql,
          ],
        );
      }

      // eslint-disable-next-line no-await-in-loop -- sequential by design
      await connection.query(
        `INSERT INTO financial_ledger_entries
          (entry_type, payment_id, refund_id, booking_id, partner_id, amount, currency_id, description, created_at)
         VALUES ('REFUND_ISSUED', ?, ?, ?, NULL, ?, ?, ?, ?)`,
        [
          paymentId,
          refundId,
          entry.bookingId,
          `-${refundedAmount}`,
          entry.currencyId,
          `Refund issued for booking #${entry.bookingId}`,
          refundedAtSql,
        ],
      );
      // eslint-disable-next-line no-await-in-loop -- sequential by design
      await connection.query(
        `INSERT INTO financial_ledger_entries
          (entry_type, payment_id, refund_id, booking_id, partner_id, amount, currency_id, description, created_at)
         VALUES ('PARTNER_PAYABLE_REVERSED', ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          paymentId,
          refundId,
          entry.bookingId,
          entry.partnerId,
          `-${refundedAmount}`,
          entry.currencyId,
          `Payable reversed for booking #${entry.bookingId}`,
          refundedAtSql,
        ],
      );
    }
  }

  return {
    partners: partnersByCategory.size,
    customers: customerIds.length,
    listings: [...listingsByCategory.values()].flat().length,
    publishedListings: publishedListings.length,
    bookings: TOTAL_BOOKINGS,
    completedBookings: completedBookingIds.length,
    notifications: notificationSeq,
    conversations: conversationSeq,
    messages: messageSeq,
    messageReactions: messagingReactionSeq,
    aiUsageLogs: AI_USAGE_LOG_PLAN.length,
    aiConversations: 1,
    aiMessages: AI_DEMO_MESSAGES.length,
    aiMemoryEntries: 2,
    payments: paymentCounter,
    refunds: refundCounter,
  };
}
