/**
 * Listing Detail information depth (docs/LISTING_DETAIL_INFORMATION_DEPTH.md
 * §7) — one representative, fully described listing per public category.
 *
 * The earlier demo layers created these listings with only a few of the
 * structured facts partners can enter, so their Detail pages could not
 * show what a complete listing looks like. This layer fills in the rest
 * through the very tables the Partner Wizard writes — category attributes,
 * amenities, policies, guest notes (EN/HY/RU) and booking rules — so every
 * fact shown is one a partner can also enter and edit; nothing here is a
 * display-only field.
 *
 * Every value agrees with what the listing already says: the Dilijan
 * hike "runs in light rain" (its FAQ), so it is weather-dependent; the
 * Ararat Valley fleet hands its cars over full and charges the refill, so
 * its fuel policy is full-to-full; the Labyrinth's horror room note comes
 * from its own description. Only attributes the earlier layers left
 * empty are written (`cli/seedDemo.js` runs this after them, on a freshly
 * reset database), so nothing is duplicated.
 *
 * Restaurant menu pre-order (docs/BOOKING_WIDGET_REBUILD.md §7): the
 * representative restaurant also gets its Armenian and Russian menus — the
 * same dishes and prices as its English one, written per language as a
 * partner authors them — and one seasonal dish the partner has switched
 * off in each language, so the pre-order's "not available" state is real.
 */

import {
  insertAttributeValue,
  insertLocalizedRows,
  insertPolicyValue,
} from './seedDemoListingRichContent.js';
import { insertRestaurantMenu } from './seedDemoSprintJCatalog.js';

const LANGUAGES = ['en', 'hy', 'ru'];

/** `{ en: [...], hy: [...], ru: [...] }` per guest-note kind. */
const REPRESENTATIVES = [
  {
    slug: 'demo-vendor-boutique-yerevan-hotel',
    attributeValues: [
      { code: 'property_style', optionCodes: ['BOUTIQUE'] },
      { code: 'total_rooms', value: 18 },
      { code: 'languages_spoken', optionCodes: ['HY', 'RU', 'EN'] },
    ],
    // Its description: "The front desk is staffed around the clock".
    amenityNames: ['24-hour Front Desk'],
  },
  {
    slug: 'demo-vendor-yerevan-city-loft',
    attributeValues: [
      { code: 'space_type', optionCodes: ['ENTIRE_PLACE'] },
      { code: 'floor_area_sqm', value: 48 },
      { code: 'view_type', optionCodes: ['CITY'] },
      { code: 'check_in_method', optionCodes: ['SELF_CHECK_IN'] },
      { code: 'languages_spoken', optionCodes: ['EN', 'RU', 'HY'] },
    ],
    bookingRules: { minimumStayNights: 2 },
  },
  {
    slug: 'sprintj-dilijan-forest-villa',
    attributeValues: [
      { code: 'space_type', optionCodes: ['ENTIRE_PLACE'] },
      { code: 'beds', value: 4 },
      { code: 'bathrooms', value: 2 },
      // Its description: "Three bedrooms suit a group of up to six".
      { code: 'max_guests', value: 6 },
      { code: 'floor_area_sqm', value: 160 },
      { code: 'view_type', optionCodes: ['MOUNTAIN'] },
      { code: 'check_in_method', optionCodes: ['IN_PERSON'] },
      { code: 'languages_spoken', optionCodes: ['HY', 'RU', 'EN'] },
    ],
    bookingRules: { minimumStayNights: 2, maximumStayNights: 14 },
  },
  {
    slug: 'sprintj-goris-cave-country-guesthouse',
    attributeValues: [
      { code: 'space_type', optionCodes: ['PRIVATE_ROOM'] },
      { code: 'bedrooms', value: 1 },
      { code: 'beds', value: 2 },
      { code: 'bathrooms', value: 1 },
      { code: 'max_guests', value: 3 },
      { code: 'view_type', optionCodes: ['MOUNTAIN'] },
      { code: 'check_in_method', optionCodes: ['IN_PERSON'] },
      { code: 'languages_spoken', optionCodes: ['HY', 'RU'] },
    ],
  },
  {
    slug: 'sprintj-toros-armenian-kitchen',
    attributeValues: [
      { code: 'dining_style', optionCodes: ['CASUAL_DINING'] },
      { code: 'dietary_options', optionCodes: ['VEGETARIAN'] },
      { code: 'seating_capacity', value: 70 },
      { code: 'dress_code', optionCodes: ['CASUAL'] },
    ],
    amenityNames: ['High Chairs', 'Step-free Access'],
  },
  {
    slug: 'demo-vendor-dilijan-trail-tour',
    attributeValues: [
      { code: 'tour_format', optionCodes: ['SHARED'] },
      { code: 'guide_type', optionCodes: ['LIVE_GUIDE'] },
      { code: 'transport_modes', optionCodes: ['ON_FOOT'] },
      // Its included items: "Bottled water".
      { code: 'meals_included', optionCodes: ['DRINKS'] },
      // Its FAQ: runs in light rain, rescheduled in severe weather.
      { code: 'weather_policy', optionCodes: ['WEATHER_DEPENDENT'] },
      { code: 'min_group_size', value: 2 },
      { code: 'min_age', value: 8 },
      { code: 'languages_offered', optionCodes: ['HY', 'EN', 'RU'] },
      { code: 'meeting_point_type', optionCodes: ['FIXED_LOCATION'] },
      { code: 'end_point_type', optionCodes: ['RETURNS_TO_START'] },
    ],
    bookingRules: { advanceBookingMinHours: 24 },
    guestNotes: {
      BRING: {
        en: [
          'Comfortable walking shoes with good grip',
          'Layers and a light rain jacket',
          'Snacks for the ridge stop',
        ],
        hy: [
          'Հարմար, չսահող քայլելու կոշիկներ',
          'Շերտավոր հագուստ և թեթև անձրևանոց',
          'Նախուտեստ լեռնաշղթայի կանգառի համար',
        ],
        ru: [
          'Удобная обувь с хорошим протектором',
          'Многослойная одежда и лёгкий дождевик',
          'Перекус для остановки на хребте',
        ],
      },
      KNOW_BEFORE: {
        en: [
          'The trail is unpaved: about 4 hours of walking with some uphill sections',
          'The tour starts at the trailhead car park; getting there is not included',
          'It runs in light rain; in severe weather you are offered a new date or a full refund',
        ],
        hy: [
          'Արահետը չասֆալտապատված է՝ մոտ 4 ժամ քայլք և մի քանի վերելք',
          'Տուրը սկսվում է արահետի ավտոկայանատեղիից, այնտեղ հասնելը ներառված չէ',
          'Թեթև անձրևին տուրն անցկացվում է, իսկ վատ եղանակին կառաջարկվի նոր օր կամ գումարի ամբողջական վերադարձ',
        ],
        ru: [
          'Тропа грунтовая: около 4 часов ходьбы и несколько подъёмов',
          'Тур начинается на парковке у начала тропы, дорога туда не включена',
          'В лёгкий дождь тур проводится, в непогоду предложат другую дату или полный возврат',
        ],
      },
    },
  },
  {
    slug: 'demo-vendor-ararat-valley-fleet',
    // Its description: "three identical, well-maintained Toyota RAV4 SUVs".
    attributeValues: [
      { code: 'vehicle_make', value: 'Toyota' },
      { code: 'vehicle_model', value: 'RAV4' },
      { code: 'vehicle_year', value: 2022 },
      { code: 'body_type', optionCodes: ['SUV'] },
      { code: 'drive_type', optionCodes: ['ALL_WHEEL_DRIVE'] },
      { code: 'fuel_type', optionCodes: ['PETROL'] },
      { code: 'doors', value: 5 },
      { code: 'luggage_capacity', value: 4 },
      { code: 'min_driver_age', value: 21 },
      { code: 'min_license_years', value: 2 },
      { code: 'mileage_policy', optionCodes: ['UNLIMITED'] },
    ],
    // Its included items: a full tank at pick-up, the refill not included.
    policyValues: [{ code: 'fuel_policy', value: 'FULL_TO_FULL' }],
    bookingRules: { advanceBookingMinHours: 12 },
    guestNotes: {
      BRING: {
        en: [
          'Your national driving licence',
          'An International Driving Permit (recommended)',
          'Your passport',
        ],
        hy: [
          'Ձեր ազգային վարորդական վկայականը',
          'Միջազգային վարորդական վկայական (խորհուրդ է տրվում)',
          'Ձեր անձնագիրը',
        ],
        ru: [
          'Национальное водительское удостоверение',
          'Международное водительское удостоверение (рекомендуется)',
          'Паспорт',
        ],
      },
      KNOW_BEFORE: {
        en: [
          'Pick-up and drop-off times are arranged directly with the fleet manager',
        ],
        hy: [
          'Մեքենան վերցնելու և վերադարձնելու ժամերը համաձայնեցվում են ավտոպարկի մենեջերի հետ',
        ],
        ru: [
          'Время получения и возврата автомобиля согласуется напрямую с менеджером автопарка',
        ],
      },
      NOT_ALLOWED: {
        en: ['Smoking in the car'],
        hy: ['Ծխել մեքենայում'],
        ru: ['Курение в автомобиле'],
      },
    },
  },
  {
    slug: 'demo-vendor-certified-yerevan-city-guide',
    attributeValues: [
      { code: 'attraction_type', optionCodes: ['LANDMARK'] },
      { code: 'visit_format', optionCodes: ['GUIDED'] },
      // Its route: Republic Square and the Cascade outdoors, Matenadaran in.
      { code: 'setting', optionCodes: ['MIXED'] },
    ],
    // Required for attractions at publish (PARTNER_LISTING_WIZARD_FIELD_GAP §8).
    policyValues: [{ code: 'cancellation_policy', value: 'FLEXIBLE' }],
    guestNotes: {
      BRING: {
        en: [
          'Comfortable shoes for a full day on foot',
          'Cash or a card for site entry tickets',
        ],
        hy: [
          'Հարմար կոշիկներ՝ ամբողջ օրը ոտքով քայլելու համար',
          'Կանխիկ կամ քարտ՝ մուտքի տոմսերի համար',
        ],
        ru: [
          'Удобная обувь для целого дня пешком',
          'Наличные или карта для входных билетов',
        ],
      },
      KNOW_BEFORE: {
        en: [
          'Museum entry tickets are paid separately on the day',
          'A lunch break is planned, but lunch is not included',
        ],
        hy: [
          'Թանգարանների մուտքի տոմսերը վճարվում են առանձին՝ նույն օրը',
          'Ճաշի ընդմիջում նախատեսված է, բայց ճաշը ներառված չէ',
        ],
        ru: [
          'Билеты в музеи оплачиваются отдельно в день экскурсии',
          'Обеденный перерыв предусмотрен, но обед не включён',
        ],
      },
    },
  },
  {
    slug: 'sprintj-labyrinth-escape-rooms',
    attributeValues: [
      { code: 'venue_type', optionCodes: ['ESCAPE_ROOM'] },
      { code: 'setting', optionCodes: ['INDOOR'] },
      // Its description: "each with its own 60-minute session".
      { code: 'duration_minutes', value: 60 },
      { code: 'max_group_size', value: 6 },
      { code: 'languages_offered', optionCodes: ['HY', 'RU', 'EN'] },
    ],
    // Required for entertainment venues at publish (same decision).
    policyValues: [{ code: 'cancellation_policy', value: 'MODERATE' }],
    guestNotes: {
      KNOW_BEFORE: {
        en: [
          'Arrive 15 minutes before your session for the briefing',
          'The horror room is not recommended for children under 12',
        ],
        hy: [
          'Ժամանեք սեանսից 15 րոպե առաջ՝ ճեպազրույցի համար',
          'Սարսափների սենյակը խորհուրդ չի տրվում 12 տարեկանից փոքր երեխաներին',
        ],
        ru: [
          'Приходите за 15 минут до начала сеанса на инструктаж',
          'Комната ужасов не рекомендуется детям до 12 лет',
        ],
      },
      NOT_ALLOWED: {
        en: ['Phones and cameras inside the rooms'],
        hy: ['Հեռախոսներ և տեսախցիկներ սենյակներում'],
        ru: ['Телефоны и камеры в комнатах'],
      },
    },
  },
];

const MENU_RESTAURANT_SLUG = 'sprintj-toros-armenian-kitchen';

const SEASONAL_DISH = {
  en: {
    title: 'Ghapama (seasonal)',
    description: 'Pumpkin stuffed with rice and dried fruit — autumn only.',
  },
  hy: {
    title: 'Ղափամա (սեզոնային)',
    description: 'Դդում՝ լցոնված բրնձով և չրերով․ միայն աշնանը։',
  },
  ru: {
    title: 'Гапама (сезонное)',
    description: 'Тыква с рисом и сухофруктами — только осенью.',
  },
};
const SEASONAL_DISH_PRICE = 7500;

const LOCALIZED_MENUS = {
  hy: {
    name: 'Ընթրիքի մենյու',
    description: 'Մատուցվում է ամեն օր․ խոհանոցը փակվում է 30 րոպե շուտ։',
    sections: [
      {
        title: 'Նախուտեստներ',
        items: [
          {
            title: 'Տոլմա (6 հատ)',
            description:
              'Խաղողի տերևի մեջ ձեռքով փաթաթված համեմված գառան միս և բրինձ։',
            priceAmount: 2800,
          },
          {
            title: 'Լավաշ պանրով և կանաչիով',
            description: 'Թոնրի լավաշ, չեչիլ պանիր, թարմ կանաչի։',
            priceAmount: 1800,
          },
        ],
      },
      {
        title: 'Խորոված',
        items: [
          {
            title: 'Խոզի խորոված',
            description: 'Մարինացված խոզի փափկամիս՝ խորովված պատվերով։',
            priceAmount: 5500,
          },
          {
            title: 'Հավի խորոված',
            description: 'Մարինացված հավի ազդր՝ խորովված պատվերով։',
            priceAmount: 4800,
          },
          {
            title: 'Գառան խորոված',
            description: 'Մարինացված գառան ազդր՝ խորովված պատվերով։',
            priceAmount: 6800,
          },
          {
            ...SEASONAL_DISH.hy,
            priceAmount: SEASONAL_DISH_PRICE,
            isActive: false,
          },
        ],
      },
      {
        title: 'Ըմպելիքներ',
        items: [
          { title: 'Տնական կոմպոտ', priceAmount: 900 },
          { title: 'Հայկական սուրճ', priceAmount: 700 },
        ],
      },
    ],
  },
  ru: {
    name: 'Ужин',
    description:
      'Подаётся ежедневно, кухня закрывается за 30 минут до закрытия.',
    sections: [
      {
        title: 'Закуски',
        items: [
          {
            title: 'Толма (6 шт.)',
            description:
              'Виноградные листья, завёрнутые вручную, с пряной бараниной и рисом.',
            priceAmount: 2800,
          },
          {
            title: 'Лаваш с сыром и зеленью',
            description: 'Лаваш из тонира, сыр чечил, свежая зелень.',
            priceAmount: 1800,
          },
        ],
      },
      {
        title: 'Хоровац',
        items: [
          {
            title: 'Хоровац из свинины',
            description: 'Маринованная свиная корейка, на гриле под заказ.',
            priceAmount: 5500,
          },
          {
            title: 'Хоровац из курицы',
            description: 'Маринованное куриное бедро, на гриле под заказ.',
            priceAmount: 4800,
          },
          {
            title: 'Хоровац из баранины',
            description: 'Маринованная баранья нога, на гриле под заказ.',
            priceAmount: 6800,
          },
          {
            ...SEASONAL_DISH.ru,
            priceAmount: SEASONAL_DISH_PRICE,
            isActive: false,
          },
        ],
      },
      {
        title: 'Напитки',
        items: [
          { title: 'Домашний компот', priceAmount: 900 },
          { title: 'Армянский кофе', priceAmount: 700 },
        ],
      },
    ],
  },
};

/**
 * The representative restaurant's HY/RU menus, and the English menu's
 * seasonal dish (switched off) in its grill section.
 */
async function insertRestaurantMenus(connection, languageIds) {
  const [[listing]] = await connection.query(
    `SELECT l.id, l.created_by AS user_id,
            (SELECT id FROM currencies WHERE code = 'AMD') AS currency_id
     FROM listings l WHERE l.slug = ?`,
    [MENU_RESTAURANT_SLUG],
  );
  // eslint-disable-next-line no-restricted-syntax -- seeding must run in a stable, readable order
  for (const [language, menu] of Object.entries(LOCALIZED_MENUS)) {
    // eslint-disable-next-line no-await-in-loop -- sequential by design
    await insertRestaurantMenu(connection, {
      listingId: listing.id,
      languageId: languageIds.get(language),
      currencyId: listing.currency_id,
      userId: listing.user_id,
      ...menu,
    });
  }
  const [[grill]] = await connection.query(
    `SELECT rms.id FROM restaurant_menu_sections rms
     JOIN restaurant_menus rm ON rm.id = rms.menu_id
     WHERE rm.listing_id = ? AND rm.language_id = ? AND rms.title LIKE 'Khorovats%'`,
    [listing.id, languageIds.get('en')],
  );
  await connection.query(
    `INSERT INTO restaurant_menu_items
       (section_id, title, description, price_amount, price_currency_id, is_active, sort_order, created_by, updated_by)
     VALUES (?, ?, ?, ?, ?, 0, 99, ?, ?)`,
    [
      grill.id,
      SEASONAL_DISH.en.title,
      SEASONAL_DISH.en.description,
      SEASONAL_DISH_PRICE,
      listing.currency_id,
      listing.user_id,
      listing.user_id,
    ],
  );
}

async function findListingId(connection, slug) {
  const [[row]] = await connection.query(
    'SELECT id FROM listings WHERE slug = ?',
    [slug],
  );
  if (!row) {
    throw new Error(
      `seedDemoListingInformationDepth: no listing with slug "${slug}" — run the earlier demo layers first`,
    );
  }
  return row.id;
}

async function insertAmenities(connection, listingId, amenityNames) {
  const [rows] = await connection.query(
    'SELECT id FROM listing_amenities WHERE name IN (?) ORDER BY id',
    [amenityNames],
  );
  if (rows.length !== amenityNames.length) {
    throw new Error(
      `seedDemoListingInformationDepth: unknown amenity in ${amenityNames.join(', ')}`,
    );
  }
  await connection.query(
    'INSERT INTO listing_amenity_listing (listing_id, amenity_id) VALUES ?',
    [rows.map((row) => [listingId, row.id])],
  );
}

async function upsertBookingRules(connection, listingId, rules) {
  await connection.query(
    `INSERT INTO listing_booking_rules
       (listing_id, minimum_stay_nights, maximum_stay_nights, advance_booking_min_hours)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       minimum_stay_nights = VALUES(minimum_stay_nights),
       maximum_stay_nights = VALUES(maximum_stay_nights),
       advance_booking_min_hours = VALUES(advance_booking_min_hours)`,
    [
      listingId,
      rules.minimumStayNights ?? null,
      rules.maximumStayNights ?? null,
      rules.advanceBookingMinHours ?? null,
    ],
  );
}

async function insertGuestNotes(
  connection,
  listingId,
  guestNotes,
  languageIds,
) {
  // eslint-disable-next-line no-restricted-syntax -- seeding must run in a stable, readable order
  for (const [kind, byLanguage] of Object.entries(guestNotes)) {
    // eslint-disable-next-line no-restricted-syntax -- seeding must run in a stable, readable order
    for (const language of LANGUAGES) {
      // eslint-disable-next-line no-await-in-loop -- sequential by design
      await insertLocalizedRows(
        connection,
        'listing_guest_notes',
        ['note_kind', 'note_text', 'sort_order'],
        listingId,
        languageIds.get(language),
        byLanguage[language],
        (lid, langId, text, index) => [lid, langId, kind, text, index],
      );
    }
  }
}

export default async function seedDemoListingInformationDepth(connection) {
  const [languageRows] = await connection.query(
    'SELECT id, code FROM languages WHERE code IN (?)',
    [LANGUAGES],
  );
  const languageIds = new Map(languageRows.map((row) => [row.code, row.id]));

  const enriched = [];
  // eslint-disable-next-line no-restricted-syntax -- seeding must run in a stable, readable order
  for (const listing of REPRESENTATIVES) {
    // eslint-disable-next-line no-await-in-loop -- sequential by design
    const listingId = await findListingId(connection, listing.slug);
    // eslint-disable-next-line no-restricted-syntax -- seeding must run in a stable, readable order
    for (const entry of listing.attributeValues) {
      // eslint-disable-next-line no-await-in-loop -- sequential by design
      await insertAttributeValue(connection, listingId, entry);
    }
    if (listing.amenityNames) {
      // eslint-disable-next-line no-await-in-loop -- sequential by design
      await insertAmenities(connection, listingId, listing.amenityNames);
    }
    // eslint-disable-next-line no-restricted-syntax -- seeding must run in a stable, readable order
    for (const entry of listing.policyValues ?? []) {
      // eslint-disable-next-line no-await-in-loop -- sequential by design
      await insertPolicyValue(connection, listingId, entry);
    }
    if (listing.bookingRules) {
      // eslint-disable-next-line no-await-in-loop -- sequential by design
      await upsertBookingRules(connection, listingId, listing.bookingRules);
    }
    if (listing.guestNotes) {
      // eslint-disable-next-line no-await-in-loop -- sequential by design
      await insertGuestNotes(
        connection,
        listingId,
        listing.guestNotes,
        languageIds,
      );
    }
    enriched.push(listing.slug);
  }
  await insertRestaurantMenus(connection, languageIds);
  return {
    enrichedListingSlugs: enriched,
    localizedMenus: MENU_RESTAURANT_SLUG,
  };
}
