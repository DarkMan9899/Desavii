/**
 * Seeds languages, currencies, and Armenia's location hierarchy
 * (Sprint 5 §15): "Armenia as initial seed country", "Armenian, English
 * and Russian locales", "AMD, USD and EUR currencies", plus regions and
 * representative cities.
 */

async function upsertLanguage(connection, { code, name, isDefault }) {
  await connection.query(
    `INSERT INTO languages (code, name, is_default) VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE name = VALUES(name), is_default = VALUES(is_default)`,
    [code, name, isDefault ? 1 : 0],
  );
  const [rows] = await connection.query(
    'SELECT id FROM languages WHERE code = ?',
    [code],
  );
  return rows[0].id;
}

async function upsertCurrency(
  connection,
  { code, symbol, name, decimalPlaces },
) {
  await connection.query(
    `INSERT INTO currencies (code, symbol, name, decimal_places, is_active) VALUES (?, ?, ?, ?, 1)
     ON DUPLICATE KEY UPDATE symbol = VALUES(symbol), name = VALUES(name), decimal_places = VALUES(decimal_places)`,
    [code, symbol, name, decimalPlaces],
  );
}

async function upsertCountry(connection, { isoCode, name }) {
  await connection.query(
    `INSERT INTO countries (iso_code, name) VALUES (?, ?)
     ON DUPLICATE KEY UPDATE name = VALUES(name)`,
    [isoCode, name],
  );
  const [rows] = await connection.query(
    'SELECT id FROM countries WHERE iso_code = ?',
    [isoCode],
  );
  return rows[0].id;
}

async function upsertRegion(connection, { countryId, name }) {
  await connection.query(
    `INSERT INTO regions (country_id, name) VALUES (?, ?)
     ON DUPLICATE KEY UPDATE name = VALUES(name)`,
    [countryId, name],
  );
  const [rows] = await connection.query(
    'SELECT id FROM regions WHERE country_id = ? AND name = ?',
    [countryId, name],
  );
  return rows[0].id;
}

async function upsertCity(
  connection,
  { regionId, name, slug, latitude, longitude },
) {
  await connection.query(
    `INSERT INTO cities (region_id, name, slug, latitude, longitude) VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE name = VALUES(name), region_id = VALUES(region_id),
       latitude = VALUES(latitude), longitude = VALUES(longitude)`,
    [regionId, name, slug, latitude, longitude],
  );
  const [rows] = await connection.query(
    'SELECT id FROM cities WHERE slug = ?',
    [slug],
  );
  return rows[0].id;
}

async function upsertTranslation(
  connection,
  table,
  fkColumn,
  { entityId, languageId, name },
) {
  await connection.query(
    `INSERT INTO ${table} (${fkColumn}, language_id, name) VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE name = VALUES(name)`,
    [entityId, languageId, name],
  );
}

export default async function seedReferenceData(connection) {
  const languageIds = {
    en: await upsertLanguage(connection, {
      code: 'en',
      name: 'English',
      isDefault: true,
    }),
    hy: await upsertLanguage(connection, {
      code: 'hy',
      name: 'Հայերեն',
      isDefault: false,
    }),
    ru: await upsertLanguage(connection, {
      code: 'ru',
      name: 'Русский',
      isDefault: false,
    }),
  };

  await upsertCurrency(connection, {
    code: 'AMD',
    symbol: '֏',
    name: 'Armenian Dram',
    decimalPlaces: 2,
  });
  await upsertCurrency(connection, {
    code: 'USD',
    symbol: '$',
    name: 'US Dollar',
    decimalPlaces: 2,
  });
  await upsertCurrency(connection, {
    code: 'EUR',
    symbol: '€',
    name: 'Euro',
    decimalPlaces: 2,
  });
  // Pass 8 (Multi-Currency / CBA FX Pricing) — RU locale's public display
  // currency (brief §5's `getDefaultCurrencyForLocale`: hy->AMD, en->USD,
  // ru->RUB). Genuinely absent before this pass.
  await upsertCurrency(connection, {
    code: 'RUB',
    symbol: '₽',
    name: 'Russian Ruble',
    decimalPlaces: 2,
  });

  const armeniaId = await upsertCountry(connection, {
    isoCode: 'AM',
    name: 'Armenia',
  });
  await upsertTranslation(connection, 'country_translations', 'country_id', {
    entityId: armeniaId,
    languageId: languageIds.hy,
    name: 'Հայաստան',
  });
  await upsertTranslation(connection, 'country_translations', 'country_id', {
    entityId: armeniaId,
    languageId: languageIds.ru,
    name: 'Армения',
  });

  // Armenia's regions (marzes) plus the capital, Yerevan, seeded as its
  // own region-equivalent per common administrative practice.
  const regionNames = [
    'Yerevan',
    'Aragatsotn',
    'Ararat',
    'Armavir',
    'Gegharkunik',
    'Kotayk',
    'Lori',
    'Shirak',
    'Syunik',
    'Tavush',
    'Vayots Dzor',
  ];
  const regionIds = {};
  // eslint-disable-next-line no-restricted-syntax -- seeding must run in a stable, readable order
  for (const name of regionNames) {
    // eslint-disable-next-line no-await-in-loop -- sequential by design, seed scripts are not hot paths
    regionIds[name] = await upsertRegion(connection, {
      countryId: armeniaId,
      name,
    });
  }

  // Representative cities covering the platform's initial tourist-facing
  // destinations — not exhaustive.
  const cities = [
    {
      region: 'Yerevan',
      name: 'Yerevan',
      slug: 'yerevan',
      latitude: 40.1792,
      longitude: 44.4991,
    },
    {
      region: 'Shirak',
      name: 'Gyumri',
      slug: 'gyumri',
      latitude: 40.7942,
      longitude: 43.8452,
    },
    {
      region: 'Lori',
      name: 'Vanadzor',
      slug: 'vanadzor',
      latitude: 40.8128,
      longitude: 44.4886,
    },
    {
      region: 'Tavush',
      name: 'Dilijan',
      slug: 'dilijan',
      latitude: 40.7439,
      longitude: 44.8608,
    },
    {
      region: 'Gegharkunik',
      name: 'Sevan',
      slug: 'sevan',
      latitude: 40.5504,
      longitude: 44.9539,
    },
    {
      region: 'Syunik',
      name: 'Goris',
      slug: 'goris',
      latitude: 39.5106,
      longitude: 46.3384,
    },
    {
      region: 'Vayots Dzor',
      name: 'Jermuk',
      slug: 'jermuk',
      latitude: 39.8447,
      longitude: 45.6772,
    },
    {
      region: 'Armavir',
      name: 'Ejmiatsin',
      slug: 'ejmiatsin',
      latitude: 40.1608,
      longitude: 44.2934,
    },
    // Partner Listing Wizard rebuild: the towns and villages where most
    // tours, attractions and countryside stays actually are — a partner
    // picks the real place, not the nearest of eight cities.
    {
      region: 'Kotayk',
      name: 'Tsaghkadzor',
      slug: 'tsaghkadzor',
      latitude: 40.5326,
      longitude: 44.7206,
    },
    {
      region: 'Kotayk',
      name: 'Garni',
      slug: 'garni',
      latitude: 40.1194,
      longitude: 44.73,
    },
    {
      region: 'Kotayk',
      name: 'Hrazdan',
      slug: 'hrazdan',
      latitude: 40.4976,
      longitude: 44.7663,
    },
    {
      region: 'Kotayk',
      name: 'Abovyan',
      slug: 'abovyan',
      latitude: 40.2739,
      longitude: 44.6256,
    },
    {
      region: 'Aragatsotn',
      name: 'Ashtarak',
      slug: 'ashtarak',
      latitude: 40.2992,
      longitude: 44.3622,
    },
    {
      region: 'Lori',
      name: 'Stepanavan',
      slug: 'stepanavan',
      latitude: 41.0089,
      longitude: 44.3867,
    },
    {
      region: 'Lori',
      name: 'Alaverdi',
      slug: 'alaverdi',
      latitude: 41.0977,
      longitude: 44.6732,
    },
    {
      region: 'Tavush',
      name: 'Ijevan',
      slug: 'ijevan',
      latitude: 40.8789,
      longitude: 45.1492,
    },
    {
      region: 'Vayots Dzor',
      name: 'Yeghegnadzor',
      slug: 'yeghegnadzor',
      latitude: 39.7611,
      longitude: 45.3333,
    },
    {
      region: 'Vayots Dzor',
      name: 'Areni',
      slug: 'areni',
      latitude: 39.7211,
      longitude: 45.1839,
    },
    {
      region: 'Syunik',
      name: 'Sisian',
      slug: 'sisian',
      latitude: 39.5206,
      longitude: 46.0322,
    },
    {
      region: 'Syunik',
      name: 'Tatev',
      slug: 'tatev',
      latitude: 39.3803,
      longitude: 46.2497,
    },
    {
      region: 'Syunik',
      name: 'Kapan',
      slug: 'kapan',
      latitude: 39.2075,
      longitude: 46.4058,
    },
    {
      region: 'Syunik',
      name: 'Meghri',
      slug: 'meghri',
      latitude: 38.903,
      longitude: 46.244,
    },
  ];

  // Every seeded city carries its Armenian and Russian name — Search's
  // destination picker shows these as-is, so a city left out here is
  // shown in Latin script to HY/RU visitors.
  const cityTranslations = {
    yerevan: { hy: 'Երևան', ru: 'Ереван' },
    gyumri: { hy: 'Գյումրի', ru: 'Гюмри' },
    vanadzor: { hy: 'Վանաձոր', ru: 'Ванадзор' },
    dilijan: { hy: 'Դիլիջան', ru: 'Дилижан' },
    sevan: { hy: 'Սևան', ru: 'Севан' },
    goris: { hy: 'Գորիս', ru: 'Горис' },
    jermuk: { hy: 'Ջերմուկ', ru: 'Джермук' },
    ejmiatsin: { hy: 'Էջմիածին', ru: 'Эчмиадзин' },
    tsaghkadzor: { hy: 'Ծաղկաձոր', ru: 'Цахкадзор' },
    garni: { hy: 'Գառնի', ru: 'Гарни' },
    hrazdan: { hy: 'Հրազդան', ru: 'Раздан' },
    abovyan: { hy: 'Աբովյան', ru: 'Абовян' },
    ashtarak: { hy: 'Աշտարակ', ru: 'Аштарак' },
    stepanavan: { hy: 'Ստեփանավան', ru: 'Степанаван' },
    alaverdi: { hy: 'Ալավերդի', ru: 'Алаверди' },
    ijevan: { hy: 'Իջևան', ru: 'Иджеван' },
    yeghegnadzor: { hy: 'Եղեգնաձոր', ru: 'Ехегнадзор' },
    areni: { hy: 'Արենի', ru: 'Арени' },
    sisian: { hy: 'Սիսիան', ru: 'Сисиан' },
    tatev: { hy: 'Տաթև', ru: 'Татев' },
    kapan: { hy: 'Կապան', ru: 'Капан' },
    meghri: { hy: 'Մեղրի', ru: 'Мегри' },
  };

  // eslint-disable-next-line no-restricted-syntax -- seeding must run in a stable, readable order
  for (const city of cities) {
    // eslint-disable-next-line no-await-in-loop -- sequential by design
    const cityId = await upsertCity(connection, {
      regionId: regionIds[city.region],
      name: city.name,
      slug: city.slug,
      latitude: city.latitude,
      longitude: city.longitude,
    });
    const translations = cityTranslations[city.slug];
    if (translations) {
      // eslint-disable-next-line no-await-in-loop -- sequential by design
      await upsertTranslation(connection, 'city_translations', 'city_id', {
        entityId: cityId,
        languageId: languageIds.hy,
        name: translations.hy,
      });
      // eslint-disable-next-line no-await-in-loop -- sequential by design
      await upsertTranslation(connection, 'city_translations', 'city_id', {
        entityId: cityId,
        languageId: languageIds.ru,
        name: translations.ru,
      });
    }
  }

  return { languageIds, armeniaId };
}
