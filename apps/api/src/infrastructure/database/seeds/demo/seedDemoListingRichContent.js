/**
 * Phase 18 (Premium Listing Detail Experience) rich demo content for the
 * 6 flagship listings `seedDemoInventoryScenarios.js` already creates —
 * one per category (Hotel, Apartment, Tour, Activity, Guide, Car Rental).
 * Those listings were built for Phase 17's inventory-engine demo and are
 * deliberately thin (1-2 images, no attributes/amenities/policies, no
 * highlights/itinerary/included-items/FAQs) — this module layers real,
 * hand-written, per-category content onto them so the redesigned Listing
 * Detail page has something genuinely rich to render for every category,
 * instead of the near-empty state Phase 17 left behind.
 *
 * Runs immediately after `seedDemoInventoryScenarios` in the same
 * transaction (see `cli/seedDemo.js`/`cli/seedDemoDev.js`), taking the
 * listing ids it returns directly rather than re-resolving by slug.
 * Every one of these 6 listings is freshly INSERTed by that prior step on
 * every run, so — matching this `demo/` family's own established
 * convention (see `seedDemoMarketplace.js`'s header) — every write here
 * is a plain INSERT, not an idempotent upsert, except the `en`
 * translation row, which already exists and must be updated in place
 * rather than duplicated (`listing_translations` is unique per
 * `(listing_id, language_id)`).
 *
 * 2026 stabilization audit (migration 0037): `listing_highlights`/
 * `listing_itinerary_steps`/`listing_included_items`/`listing_faqs` now
 * carry a `language_id`, the same shape `listing_translations` already
 * uses — each flagship below writes a genuine, independently-authored
 * EN/HY/RU set of highlights/included-items/FAQs (and itinerary, for the
 * two categories that have one), not a single language reused three
 * times and not a machine translation of one original. This replaces an
 * earlier, incomplete fix in this same audit that authored this content
 * in Armenian only — that fixed the Armenian-locale page at the direct
 * cost of breaking English/Russian visitors the same way; every locale
 * must render coherently, not just the site's own default one.
 */

import { getIdByCode } from '../helpers.js';

const ATTRIBUTE_VALUE_TABLES = {
  INTEGER: 'listing_attribute_values_integer',
  DECIMAL: 'listing_attribute_values_decimal',
  BOOLEAN: 'listing_attribute_values_boolean',
  STRING: 'listing_attribute_values_string',
  DATE: 'listing_attribute_values_date',
};

/**
 * Sprint J: exported so `seedDemoSprintJCatalog.js` can reuse the exact
 * same translation/attribute/policy/media-insertion primitives this module
 * already established for the 6 Phase 17 flagship listings, rather than
 * re-implementing them (CLAUDE.md "never duplicate functionality").
 */
export async function upsertTranslation(connection, listingId, languageId, t) {
  await connection.query(
    `INSERT INTO listing_translations (listing_id, language_id, title, summary, description)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE title = VALUES(title), summary = VALUES(summary), description = VALUES(description)`,
    [listingId, languageId, t.title, t.summary, t.description],
  );
}

export async function insertAttributeValue(connection, listingId, entry) {
  const [[definition]] = await connection.query(
    `SELECT ad.id, adt.code AS data_type_code
     FROM attribute_definitions ad
     JOIN attribute_data_types adt ON adt.id = ad.data_type_id
     WHERE ad.code = ?`,
    [entry.code],
  );
  if (!definition) {
    throw new Error(
      `seedDemoListingRichContent: unknown attribute code "${entry.code}"`,
    );
  }
  if (entry.optionCodes) {
    // eslint-disable-next-line no-restricted-syntax -- seeding must run in a stable, readable order
    for (const optionCode of entry.optionCodes) {
      // eslint-disable-next-line no-await-in-loop -- sequential by design
      const [[option]] = await connection.query(
        'SELECT id FROM attribute_options WHERE attribute_definition_id = ? AND code = ?',
        [definition.id, optionCode],
      );
      if (!option) {
        throw new Error(
          `seedDemoListingRichContent: unknown option "${optionCode}" for attribute "${entry.code}"`,
        );
      }
      // eslint-disable-next-line no-await-in-loop -- sequential by design
      await connection.query(
        'INSERT INTO listing_attribute_option (listing_id, attribute_option_id) VALUES (?, ?)',
        [listingId, option.id],
      );
    }
    return;
  }
  const table = ATTRIBUTE_VALUE_TABLES[definition.data_type_code];
  await connection.query(
    `INSERT INTO ${table} (listing_id, attribute_definition_id, value) VALUES (?, ?, ?)`,
    [listingId, definition.id, entry.value],
  );
}

export async function insertPolicyValue(connection, listingId, entry) {
  const policyDefinitionId = await getIdByCode(
    connection,
    'policy_definitions',
    entry.code,
  );
  await connection.query(
    'INSERT INTO listing_policy_values (listing_id, policy_definition_id, value) VALUES (?, ?, ?)',
    [listingId, policyDefinitionId, entry.value],
  );
}

export async function insertMedia(
  connection,
  listingId,
  imageTypeId,
  completedUploadStatusId,
  approvedStatusId,
  ownerUserId,
  startPosition,
  category,
  files,
) {
  // eslint-disable-next-line no-restricted-syntax -- seeding must run in a stable, readable order
  for (const [index, file] of files.entries()) {
    const url = `/assets/images/demo/${category}/${file}`;
    // eslint-disable-next-line no-await-in-loop -- sequential by design
    await connection.query(
      `INSERT INTO media
        (mediable_type, mediable_id, media_type_id, url, thumbnail_url, position, is_cover,
         upload_status_id, moderation_status_id, owner_user_id)
       VALUES ('listing', ?, ?, ?, ?, ?, 0, ?, ?, ?)`,
      [
        listingId,
        imageTypeId,
        url,
        url,
        startPosition + index,
        completedUploadStatusId,
        approvedStatusId,
        ownerUserId,
      ],
    );
  }
}

/**
 * Inserts one locale's worth of rows for one of the four per-language
 * rich-content tables, in the given order. Shared by all four content
 * types below — they differ only in table name and column shape.
 */
export async function insertLocalizedRows(
  connection,
  table,
  columns,
  listingId,
  languageId,
  items,
  toRowValues,
) {
  if (!items || items.length === 0) return;
  const values = items.map((item, index) =>
    toRowValues(listingId, languageId, item, index),
  );
  await connection.query(
    `INSERT INTO ${table} (listing_id, language_id, ${columns.join(', ')}) VALUES ?`,
    [values],
  );
}

const LANG_CODES = { en: 'en', hy: 'hy', ru: 'ru' };

// eslint-disable-next-line max-lines-per-function -- one flat, readable content table per flagship listing; splitting it up would only add indirection
export default async function seedDemoListingRichContent(
  connection,
  listingIds,
) {
  const [imageTypeId, completedUploadStatusId, approvedStatusId, languageIds] =
    await Promise.all([
      getIdByCode(connection, 'media_types', 'IMAGE'),
      getIdByCode(connection, 'media_upload_statuses', 'COMPLETED'),
      getIdByCode(connection, 'moderation_statuses', 'APPROVED'),
      (async () => {
        const [rows] = await connection.query(
          'SELECT id, code FROM languages WHERE code IN (?, ?, ?)',
          [LANG_CODES.en, LANG_CODES.hy, LANG_CODES.ru],
        );
        return new Map(rows.map((row) => [row.code, row.id]));
      })(),
    ]);

  const FLAGSHIPS = [
    {
      listingId: listingIds.hotelListingId,
      category: 'hotels',
      images: ['hotels-3.svg', 'hotels-4.svg', 'hotels-5.svg', 'hotels-6.svg'],
      translations: {
        en: {
          title: 'Boutique Yerevan Hotel',
          summary:
            'A design-forward boutique hotel moments from Republic Square, with Standard Rooms and Deluxe Suites.',
          description:
            'Boutique Yerevan Hotel sits on a quiet side street just minutes from Republic Square, blending mid-century Armenian architecture with warm, contemporary interiors. Choose a Standard Room for a comfortable solo or business stay, or step up to a Deluxe Suite with extra space for couples. Every morning starts with a full breakfast spread in the ground-floor café, and the small on-site gym and lounge make it easy to unwind after a day exploring the city. The front desk is staffed around the clock, so late check-ins and early departures are never a problem.',
        },
        hy: {
          title: 'Բուտիկ Հյուրանոց Երևանում',
          summary:
            'Ժամանակակից բուտիկ հյուրանոց Հանրապետության հրապարակի մոտակայքում՝ Ստանդարտ սենյակներով և Դելյուքս ապարտամենտներով։',
          description:
            'Բուտիկ Հյուրանոց Երևանում գտնվում է հանգիստ փողոցում՝ Հանրապետության հրապարակից ընդամենը մի քանի րոպե հեռավորության վրա։ Ընտրեք Ստանդարտ սենյակ հարմարավետ գործուղման կամ մեկանգամյա հանգստի համար, կամ Դելյուքս ապարտամենտ՝ զույգերի համար ընդարձակ տարածքով։ Յուրաքանչյուր առավոտ սկսվում է հարուստ նախաճաշով սրճարանում, իսկ փոքր մարզասրահն ու հանգստի գոտին թույլ են տալիս հանգստանալ քաղաքով զբոսնելուց հետո։ Ընդունարանն աշխատում է շուրջօրյա, ուստի ուշ ժամանումն ու վաղ մեկնումը երբեք խնդիր չեն դառնում։',
        },
        ru: {
          title: 'Бутик-отель в Ереване',
          summary:
            'Современный бутик-отель в нескольких минутах от площади Республики, со стандартными номерами и делюкс-люксами.',
          description:
            'Бутик-отель в Ереване расположен на тихой улице всего в нескольких минутах от площади Республики, сочетая армянскую архитектуру середины века с тёплым современным интерьером. Выберите стандартный номер для комфортной деловой поездки или люкс делюкс с дополнительным пространством для пар. Каждое утро начинается с обильного завтрака в кафе на первом этаже, а небольшой тренажёрный зал и гостиная зона помогают расслабиться после дня прогулок по городу. Стойка регистрации работает круглосуточно, поэтому поздний заезд и ранний выезд никогда не станут проблемой.',
        },
      },
      attributeValues: [{ code: 'star_rating', optionCodes: ['4'] }],
      amenityIds: [1, 4, 5, 2, 19, 11],
      policyValues: [
        { code: 'pets_allowed', value: 'false' },
        { code: 'smoking_allowed', value: 'false' },
        { code: 'children_allowed', value: 'true' },
        { code: 'cancellation_policy', value: 'MODERATE' },
        { code: 'check_in_time', value: '14:00' },
        { code: 'check_out_time', value: '12:00' },
      ],
      highlights: {
        en: [
          {
            iconCode: 'location',
            text: "2 minutes' walk from Republic Square",
          },
          {
            iconCode: 'breakfast',
            text: 'Full breakfast included every morning',
          },
          { iconCode: 'wifi', text: 'Free high-speed WiFi throughout' },
          { iconCode: 'clock', text: '24-hour front desk' },
          { iconCode: 'award', text: '4-star boutique design' },
        ],
        hy: [
          {
            iconCode: 'location',
            text: '2 րոպե քայլքի հեռավորության վրա Հանրապետության հրապարակից',
          },
          {
            iconCode: 'breakfast',
            text: 'Առատ նախաճաշ՝ ներառված յուրաքանչյուր առավոտ',
          },
          {
            iconCode: 'wifi',
            text: 'Անվճար բարձր արագությամբ Wi-Fi ամբողջ հյուրանոցում',
          },
          { iconCode: 'clock', text: 'Շուրջօրյա աշխատող ընդունարան' },
          { iconCode: 'award', text: '4-աստղանի բուտիկ դիզայն' },
        ],
        ru: [
          {
            iconCode: 'location',
            text: 'В 2 минутах ходьбы от площади Республики',
          },
          {
            iconCode: 'breakfast',
            text: 'Полноценный завтрак включён каждое утро',
          },
          {
            iconCode: 'wifi',
            text: 'Бесплатный высокоскоростной Wi-Fi на всей территории',
          },
          { iconCode: 'clock', text: 'Круглосуточная стойка регистрации' },
          { iconCode: 'award', text: '4-звёздочный бутик-дизайн' },
        ],
      },
      included: {
        en: [
          { itemText: 'Daily breakfast', isIncluded: true },
          { itemText: 'Free WiFi', isIncluded: true },
          { itemText: '24-hour front desk', isIncluded: true },
          { itemText: 'Airport transfer', isIncluded: false },
          { itemText: 'Minibar items', isIncluded: false },
          { itemText: 'Spa treatments', isIncluded: false },
        ],
        hy: [
          { itemText: 'Ամենօրյա նախաճաշ', isIncluded: true },
          { itemText: 'Անվճար Wi-Fi', isIncluded: true },
          { itemText: 'Շուրջօրյա ընդունարան', isIncluded: true },
          { itemText: 'Օդանավակայանից տեղափոխում', isIncluded: false },
          { itemText: 'Մինի-բարի ապրանքներ', isIncluded: false },
          { itemText: 'Սպա ընթացակարգեր', isIncluded: false },
        ],
        ru: [
          { itemText: 'Ежедневный завтрак', isIncluded: true },
          { itemText: 'Бесплатный Wi-Fi', isIncluded: true },
          { itemText: 'Круглосуточная стойка регистрации', isIncluded: true },
          { itemText: 'Трансфер из аэропорта', isIncluded: false },
          { itemText: 'Напитки и снеки в мини-баре', isIncluded: false },
          { itemText: 'Спа-процедуры', isIncluded: false },
        ],
      },
      faqs: {
        en: [
          {
            question: 'What time is check-in and check-out?',
            answer:
              'Check-in is from 14:00 and check-out is by 12:00. Early check-in or late check-out can sometimes be arranged with advance notice — just ask the front desk.',
          },
          {
            question: 'Is breakfast included in the room rate?',
            answer:
              'Yes, a full breakfast is included for every stay and served each morning in the ground-floor café.',
          },
          {
            question: 'Do you allow pets?',
            answer: "We're not able to accommodate pets at this property.",
          },
          {
            question: 'Is parking available on-site?',
            answer:
              'Yes, on-site parking is available for guests free of charge, subject to availability.',
          },
          {
            question: 'What is the cancellation policy?',
            answer:
              'This rate follows our moderate cancellation policy — free cancellation up to a set number of days before arrival, details are confirmed at booking.',
          },
        ],
        hy: [
          {
            question: 'Ի՞նչ ժամին է կատարվում ժամանումն ու մեկնումը:',
            answer:
              'Ժամանումը սկսվում է 14:00-ից, իսկ մեկնումը՝ մինչև 12:00-ն։ Վաղաժամ ժամանում կամ ուշացած մեկնում երբեմն հնարավոր է կազմակերպել նախապես տեղեկացնելու դեպքում. պարզապես դիմեք ընդունարան։',
          },
          {
            question: 'Նախաճաշը ներառվա՞ծ է սենյակի գնի մեջ:',
            answer:
              'Այո, առատ նախաճաշը ներառված է յուրաքանչյուր կեցության համար և մատուցվում է ամեն առավոտ գետնահարկի սրճարանում։',
          },
          {
            question: 'Կենդանիներ թույլատրու՞մ եք:',
            answer:
              'Այս օբյեկտում կենդանիներ ընդունելու հնարավորություն չունենք։',
          },
          {
            question: 'Կայանատե՞ղի կա հյուրանոցի տարածքում:',
            answer:
              'Այո, հյուրերի համար հասանելի է անվճար կայանատեղի՝ առկայության դեպքում։',
          },
          {
            question: 'Ի՞նչ է կազմում չեղարկման քաղաքականությունը:',
            answer:
              'Այս սակագինը հետևում է մեր չափավոր չեղարկման քաղաքականությանը՝ անվճար չեղարկում՝ ժամանումից որոշակի օրեր առաջ, մանրամասները հաստատվում են ամրագրման ժամանակ։',
          },
        ],
        ru: [
          {
            question: 'Во сколько заезд и выезд?',
            answer:
              'Заезд с 14:00, выезд до 12:00. Ранний заезд или поздний выезд иногда можно организовать при предварительном уведомлении — обратитесь на стойку регистрации.',
          },
          {
            question: 'Завтрак включён в стоимость номера?',
            answer:
              'Да, полноценный завтрак включён при каждом проживании и подаётся каждое утро в кафе на первом этаже.',
          },
          {
            question: 'Разрешено ли проживание с животными?',
            answer:
              'К сожалению, в этом отеле размещение с животными невозможно.',
          },
          {
            question: 'Есть ли парковка на территории?',
            answer:
              'Да, для гостей доступна бесплатная парковка на территории при наличии мест.',
          },
          {
            question: 'Какова политика отмены?',
            answer:
              'Этот тариф следует нашей умеренной политике отмены — бесплатная отмена за определённое количество дней до заезда, детали подтверждаются при бронировании.',
          },
        ],
      },
    },
    {
      listingId: listingIds.apartmentListingId,
      category: 'apartments',
      images: [
        'apartments-2.svg',
        'apartments-3.svg',
        'apartments-4.svg',
        'apartments-5.svg',
      ],
      translations: {
        en: {
          title: 'Yerevan City Loft',
          summary:
            'A bright self-check-in loft near the Cascade, perfect for couples or solo travelers who want a home base in the city center.',
          description:
            "This self-contained loft sits on a quiet residential street just a short walk from the Cascade and Yerevan's gallery district. The open-plan living area has a fully equipped kitchen, a comfortable queen bed, and large windows that fill the space with natural light. Self-check-in means you can arrive whenever your flight lands, and the building's washing machine makes it easy to settle in for a longer stay. It's a five-minute walk to cafés, bakeries, and the nearest metro stop, with Republic Square about fifteen minutes on foot.",
        },
        hy: {
          title: 'Երևան Սիթի Լոֆթ',
          summary:
            'Լուսավոր, ինքնուրույն մուտքով լոֆթ Կասկադի մոտակայքում՝ գերազանց տարբերակ զույգերի և միայնակ ճանապարհորդների համար։',
          description:
            'Այս ինքնուրույն լոֆթը գտնվում է հանգիստ բնակելի փողոցում՝ Կասկադից և Երևանի գալերեաների թաղամասից ընդամենը մի քանի րոպե հեռավորության վրա։ Բաց հատակագծով հյուրասենյակն ունի լիարժեք սարքավորված խոհանոց, հարմարավետ մահճակալ և մեծ պատուհաններ, որոնք լցնում են տարածքը բնական լույսով։ Ինքնուրույն մուտքի շնորհիվ կարող եք ժամանել ցանկացած ժամի, իսկ շենքի լվացքի մեքենան հեշտացնում է ավելի երկար կեցությունը։ Հինգ րոպե է քայլելով սրճարաններից, հացաբուլկեղենի խանութներից և մոտակա մետրոյի կայարանից, իսկ Հանրապետության հրապարակը՝ մոտավորապես տասնհինգ րոպե։',
        },
        ru: {
          title: 'Ереван Сити Лофт',
          summary:
            'Светлый лофт с самостоятельным заездом рядом с Каскадом — отличный вариант для пар и путешественников в одиночку.',
          description:
            'Этот отдельный лофт расположен на тихой жилой улице всего в нескольких минутах ходьбы от Каскада и галерейного квартала Еревана. В гостиной открытой планировки есть полностью оборудованная кухня, удобная кровать и большие окна, наполняющие пространство естественным светом. Самостоятельный заезд позволяет приехать в любое удобное время, а стиральная машина в здании облегчает более длительное проживание. Пять минут пешком до кафе, пекарен и ближайшей станции метро, а до площади Республики — около пятнадцати минут пешком.',
        },
      },
      attributeValues: [
        { code: 'bedrooms', value: 1 },
        { code: 'bathrooms', value: 1 },
        { code: 'beds', value: 1 },
        { code: 'max_guests', value: 2 },
      ],
      amenityIds: [1, 4, 17, 18, 23],
      policyValues: [
        { code: 'pets_allowed', value: 'false' },
        { code: 'smoking_allowed', value: 'false' },
        { code: 'children_allowed', value: 'true' },
        { code: 'cancellation_policy', value: 'MODERATE' },
        { code: 'check_in_time', value: 'Flexible (self check-in)' },
        { code: 'check_out_time', value: '11:00' },
      ],
      highlights: {
        en: [
          { iconCode: 'location', text: '5-minute walk to the Cascade' },
          { iconCode: 'wifi', text: 'Free WiFi and a dedicated workspace' },
          { iconCode: 'food', text: 'Fully equipped kitchen' },
          {
            iconCode: 'clock',
            text: 'Flexible self check-in, any time of day',
          },
          { iconCode: 'heart', text: 'Quiet residential street' },
        ],
        hy: [
          {
            iconCode: 'location',
            text: '5 րոպե քայլքի հեռավորության վրա Կասկադից',
          },
          {
            iconCode: 'wifi',
            text: 'Անվճար Wi-Fi և առանձնացված աշխատանքային տարածք',
          },
          { iconCode: 'food', text: 'Լիարժեք սարքավորված խոհանոց' },
          {
            iconCode: 'clock',
            text: 'Ճկուն ինքնուրույն մուտք՝ օրվա ցանկացած ժամի',
          },
          { iconCode: 'heart', text: 'Հանգիստ բնակելի փողոց' },
        ],
        ru: [
          { iconCode: 'location', text: '5 минут пешком до Каскада' },
          {
            iconCode: 'wifi',
            text: 'Бесплатный Wi-Fi и рабочее место',
          },
          { iconCode: 'food', text: 'Полностью оборудованная кухня' },
          {
            iconCode: 'clock',
            text: 'Гибкое самостоятельное заселение в любое время',
          },
          { iconCode: 'heart', text: 'Тихая жилая улица' },
        ],
      },
      included: {
        en: [
          { itemText: 'Fully equipped kitchen', isIncluded: true },
          { itemText: 'Free WiFi', isIncluded: true },
          { itemText: 'Washing machine access', isIncluded: true },
          { itemText: 'Daily housekeeping', isIncluded: false },
          { itemText: 'Airport transfer', isIncluded: false },
        ],
        hy: [
          { itemText: 'Լիարժեք սարքավորված խոհանոց', isIncluded: true },
          { itemText: 'Անվճար Wi-Fi', isIncluded: true },
          { itemText: 'Լվացքի մեքենայի հասանելիություն', isIncluded: true },
          { itemText: 'Ամենօրյա մաքրում', isIncluded: false },
          { itemText: 'Օդանավակայանից տեղափոխում', isIncluded: false },
        ],
        ru: [
          { itemText: 'Полностью оборудованная кухня', isIncluded: true },
          { itemText: 'Бесплатный Wi-Fi', isIncluded: true },
          { itemText: 'Доступ к стиральной машине', isIncluded: true },
          { itemText: 'Ежедневная уборка', isIncluded: false },
          { itemText: 'Трансфер из аэропорта', isIncluded: false },
        ],
      },
      faqs: {
        en: [
          {
            question: 'How does check-in work?',
            answer:
              'This apartment uses self check-in, so you can arrive at any time — full instructions are sent before your stay.',
          },
          {
            question: 'Is there a kitchen?',
            answer:
              'Yes, the loft has a fully equipped kitchen including a stove, fridge, and basic cookware.',
          },
          {
            question: 'Is it suitable for families with children?',
            answer:
              'Yes, children are welcome. The loft has one bedroom, so it works best for a small family or a couple.',
          },
          {
            question: 'Is there laundry access?',
            answer:
              'Yes, a washing machine is available in the building for guest use.',
          },
          {
            question: 'How far is it from the city center?',
            answer:
              'Republic Square is about a 15-minute walk, and the Cascade is just 5 minutes away on foot.',
          },
        ],
        hy: [
          {
            question: 'Ինչպե՞ս է իրականացվում ժամանումը:',
            answer:
              'Այս բնակարանն ունի ինքնուրույն մուտքի համակարգ, ուստի կարող եք ժամանել ցանկացած ժամի. ամբողջական հրահանգները ուղարկվում են կեցությունից առաջ։',
          },
          {
            question: 'Խոհանոց կա՞:',
            answer:
              'Այո, լոֆթն ունի լիարժեք սարքավորված խոհանոց՝ վառարանով, սառնարանով և հիմնական խոհանոցային պարագաներով։',
          },
          {
            question: 'Հարմա՞ր է երեխաներով ընտանիքների համար:',
            answer:
              'Այո, երեխաները ողջունելի են։ Լոֆթն ունի մեկ ննջասենյակ, ուստի լավագույնս հարմար է փոքր ընտանիքի կամ զույգի համար։',
          },
          {
            question: 'Լվացքի հնարավորությո՞ւն կա:',
            answer: 'Այո, շենքում հյուրերի համար հասանելի է լվացքի մեքենա։',
          },
          {
            question: 'Որքա՞ն հեռու է քաղաքի կենտրոնից:',
            answer:
              'Հանրապետության հրապարակը մոտավորապես 15 րոպե է քայլքով, իսկ Կասկադը՝ ընդամենը 5 րոպե։',
          },
        ],
        ru: [
          {
            question: 'Как проходит заезд?',
            answer:
              'В этой квартире самостоятельное заселение, поэтому вы можете приехать в любое время — подробные инструкции отправляются перед заездом.',
          },
          {
            question: 'Есть ли кухня?',
            answer:
              'Да, в лофте полностью оборудованная кухня с плитой, холодильником и базовой посудой.',
          },
          {
            question: 'Подходит ли для семей с детьми?',
            answer:
              'Да, дети приветствуются. В лофте одна спальня, поэтому он лучше всего подходит для небольшой семьи или пары.',
          },
          {
            question: 'Есть ли доступ к стирке?',
            answer: 'Да, в здании есть стиральная машина для гостей.',
          },
          {
            question: 'Как далеко до центра города?',
            answer:
              'До площади Республики около 15 минут пешком, а до Каскада — всего 5 минут.',
          },
        ],
      },
    },
    {
      listingId: listingIds.tourListingId,
      category: 'tours',
      images: ['tours-2.svg', 'tours-3.svg', 'tours-4.svg', 'tours-5.svg'],
      translations: {
        en: {
          title: 'Dilijan Trail Tour',
          summary:
            "A guided day hike through Dilijan's forest trails, with morning and afternoon departures to fit your schedule.",
          description:
            "Explore the dense forests and mountain viewpoints around Dilijan on this guided day hike, led by a local trail guide who knows the region's best routes. The trail winds through beech and oak woodland, past a quiet monastery, and up to a ridge with sweeping views over the Dilijan valley. Choose the morning departure for cooler temperatures and better light, or the afternoon group if you'd rather start the day slowly. Suitable for moderately fit walkers — comfortable shoes and a bottle of water are all you need to bring.",
        },
        hy: {
          title: 'Դիլիջանի Արահետների Շրջայց',
          summary:
            'Ուղեկցվող միօրյա արշավ Դիլիջանի անտառային արահետներով՝ առավոտյան և կեսօրից հետո մեկնումներով։',
          description:
            'Բացահայտեք Դիլիջանի շուրջ ընկած խիտ անտառներն ու լեռնային տեսարանները այս ուղեկցվող միօրյա արշավի ընթացքում՝ տեղացի արահետային ուղեկցորդի հետ, ով լավ գիտի տարածաշրջանի լավագույն երթուղիները։ Արահետը գնում է հաճարենու և կաղնու անտառներով, հանգիստ վանքի կողքով և բարձրանում է լեռնաշղթա՝ Դիլիջանի հովտի հիասքանչ տեսարաններով։ Ընտրեք առավոտյան մեկնումը ավելի զով ջերմաստիճանի և լավ լուսավորության համար, կամ կեսօրից հետո խումբը, եթե նախընտրում եք օրը սկսել դանդաղ։',
        },
        ru: {
          title: 'Тур по тропам Дилижана',
          summary:
            'Пеший поход с гидом по лесным тропам Дилижана — утренние и дневные отправления на выбор.',
          description:
            'Исследуйте густые леса и горные смотровые площадки вокруг Дилижана в этом однодневном походе с местным гидом, который знает лучшие маршруты региона. Тропа проходит через буковый и дубовый лес, мимо тихого монастыря и поднимается на хребет с широкими видами на долину Дилижана. Выберите утреннее отправление для более прохладной погоды и хорошего освещения или дневную группу, если предпочитаете начать день неспешно.',
        },
      },
      attributeValues: [
        { code: 'duration_minutes', value: 240 },
        { code: 'difficulty', optionCodes: ['MODERATE'] },
        { code: 'max_group_size', value: 12 },
      ],
      amenityIds: [23],
      policyValues: [
        { code: 'cancellation_policy', value: 'FLEXIBLE' },
        { code: 'children_allowed', value: 'true' },
      ],
      highlights: {
        en: [
          {
            iconCode: 'mountain',
            text: "Guided hike through Dilijan's forest trails",
          },
          {
            iconCode: 'clock',
            text: '2 daily departures — morning and afternoon',
          },
          { iconCode: 'group', text: 'Small groups, up to 12 hikers' },
          { iconCode: 'view', text: 'Ridge viewpoint over the Dilijan valley' },
        ],
        hy: [
          {
            iconCode: 'mountain',
            text: 'Ուղեկցվող արշավ Դիլիջանի անտառային արահետներով',
          },
          {
            iconCode: 'clock',
            text: '2 օրական մեկնում՝ առավոտյան և կեսօրից հետո',
          },
          { iconCode: 'group', text: 'Փոքր խմբեր՝ մինչև 12 մարդ' },
          { iconCode: 'view', text: 'Դիլիջանի հովտի տեսարան լեռնաշղթայից' },
        ],
        ru: [
          {
            iconCode: 'mountain',
            text: 'Поход с гидом по лесным тропам Дилижана',
          },
          {
            iconCode: 'clock',
            text: '2 отправления в день — утром и днём',
          },
          { iconCode: 'group', text: 'Небольшие группы, до 12 человек' },
          {
            iconCode: 'view',
            text: 'Смотровая площадка на хребте с видом на долину Дилижана',
          },
        ],
      },
      itinerary: {
        en: [
          {
            title: 'Meet at the trailhead',
            description:
              'Meet your guide at the Dilijan trailhead car park for a short safety briefing and gear check.',
            durationMinutes: 15,
          },
          {
            title: 'Forest ascent',
            description:
              'Begin the climb through beech and oak woodland, with regular stops to point out local flora and wildlife.',
            durationMinutes: 90,
          },
          {
            title: 'Monastery stop',
            description:
              'Pass a quiet hillside monastery and take a short break to rest and rehydrate.',
            durationMinutes: 20,
          },
          {
            title: 'Ridge viewpoint',
            description:
              'Reach the ridge for panoramic views over the Dilijan valley — the best photo stop of the hike.',
            durationMinutes: 30,
          },
          {
            title: 'Descent and return',
            description:
              'Follow a gentler path back down to the trailhead, arriving in time for lunch in town.',
            durationMinutes: 85,
          },
        ],
        hy: [
          {
            title: 'Հանդիպում արահետի սկզբնակետում',
            description:
              'Հանդիպեք ձեր ուղեկցորդի հետ Դիլիջանի արահետի կայանատեղիում՝ կարճ անվտանգության հրահանգավորման և պարագաների ստուգման համար։',
            durationMinutes: 15,
          },
          {
            title: 'Բարձրացում անտառով',
            description:
              'Սկսեք բարձրանալ հաճարենու և կաղնու անտառով՝ պարբերաբար կանգ առնելով տեղական բուսականությունն ու կենդանական աշխարհը դիտելու համար։',
            durationMinutes: 90,
          },
          {
            title: 'Կանգառ վանքի մոտ',
            description:
              'Անցեք հանգիստ լեռնալանջի վանքի կողքով և կարճ դադար վերցրեք հանգստանալու և ջրի պաշար համալրելու համար։',
            durationMinutes: 20,
          },
          {
            title: 'Տեսարան լեռնաշղթայից',
            description:
              'Հասեք լեռնաշղթա՝ Դիլիջանի հովտի համայնապատկեր տեսարանների համար. արշավի լավագույն լուսանկարահանման կետը։',
            durationMinutes: 30,
          },
          {
            title: 'Իջնում և վերադարձ',
            description:
              'Հետևեք ավելի մեղմ արահետով դեպի ելակետ՝ ժամանակին հասնելով քաղաքում ճաշելու համար։',
            durationMinutes: 85,
          },
        ],
        ru: [
          {
            title: 'Встреча у начала маршрута',
            description:
              'Встретьтесь с гидом на парковке у начала тропы в Дилижане для краткого инструктажа по безопасности и проверки снаряжения.',
            durationMinutes: 15,
          },
          {
            title: 'Подъём через лес',
            description:
              'Начните подъём через буковый и дубовый лес с регулярными остановками, чтобы увидеть местную флору и фауну.',
            durationMinutes: 90,
          },
          {
            title: 'Остановка у монастыря',
            description:
              'Пройдите мимо тихого монастыря на склоне холма и сделайте короткий привал, чтобы отдохнуть и попить воды.',
            durationMinutes: 20,
          },
          {
            title: 'Смотровая площадка на хребте',
            description:
              'Поднимитесь на хребет, откуда открывается панорамный вид на долину Дилижана — лучшее место для фото на маршруте.',
            durationMinutes: 30,
          },
          {
            title: 'Спуск и возвращение',
            description:
              'Спуститесь по более пологой тропе обратно к началу маршрута, успевая к обеду в городе.',
            durationMinutes: 85,
          },
        ],
      },
      included: {
        en: [
          { itemText: 'Local guide', isIncluded: true },
          { itemText: 'Safety briefing', isIncluded: true },
          { itemText: 'Bottled water', isIncluded: true },
          { itemText: 'Transportation to the trailhead', isIncluded: false },
          { itemText: 'Lunch', isIncluded: false },
          { itemText: 'Gratuities', isIncluded: false },
        ],
        hy: [
          { itemText: 'Տեղացի ուղեկցորդ', isIncluded: true },
          { itemText: 'Անվտանգության հրահանգավորում', isIncluded: true },
          { itemText: 'Շշալցված ջուր', isIncluded: true },
          { itemText: 'Տեղափոխում մինչև արահետի սկիզբ', isIncluded: false },
          { itemText: 'Ճաշ', isIncluded: false },
          { itemText: 'Թեյավճարներ', isIncluded: false },
        ],
        ru: [
          { itemText: 'Местный гид', isIncluded: true },
          { itemText: 'Инструктаж по безопасности', isIncluded: true },
          { itemText: 'Бутилированная вода', isIncluded: true },
          { itemText: 'Трансфер до начала маршрута', isIncluded: false },
          { itemText: 'Обед', isIncluded: false },
          { itemText: 'Чаевые', isIncluded: false },
        ],
      },
      faqs: {
        en: [
          {
            question: 'How difficult is the hike?',
            answer:
              'This is a moderate-difficulty trail — around 4 hours with some uphill sections. Basic fitness is enough; no technical climbing is involved.',
          },
          {
            question: 'What should I bring?',
            answer:
              'Comfortable walking shoes, a bottle of water, and weather-appropriate clothing. Snacks are recommended for the ridge stop.',
          },
          {
            question: 'Is transportation to the trailhead included?',
            answer:
              'No, the tour starts at the trailhead car park. Your guide can suggest local taxi options.',
          },
          {
            question: 'Can children join?',
            answer:
              'Yes, children are welcome — the trail is unpaved with some elevation gain, so it suits kids comfortable walking for a few hours.',
          },
          {
            question: 'What happens if it rains?',
            answer:
              "The hike runs in light rain. In case of severe weather, we'll contact you to reschedule or offer a full refund.",
          },
        ],
        hy: [
          {
            question: 'Որքանո՞վ է դժվար արշավը:',
            answer:
              'Սա միջին բարդության արահետ է՝ մոտավորապես 4 ժամ՝ որոշ բարձրացումներով։ Բավական է հիմնական ֆիզիկական պատրաստվածությունը, տեխնիկական մագլցում չի պահանջվում։',
          },
          {
            question: 'Ի՞նչ պետք է վերցնեմ ինձ հետ:',
            answer:
              'Հարմարավետ քայլելու կոշիկներ, շիշ ջուր և եղանակին համապատասխան հագուստ։ Խորհուրդ ենք տալիս թեթև խորտիկներ վերցնել լեռնաշղթայի կանգառի համար։',
          },
          {
            question: 'Արահետի սկիզբ տեղափոխումը ներառվա՞ծ է:',
            answer:
              'Ոչ, տուրը սկսվում է արահետի կայանատեղիից։ Ձեր ուղեկցորդը կարող է առաջարկել տեղական տաքսու տարբերակներ։',
          },
          {
            question: 'Երեխաները կարո՞ղ են մասնակցել:',
            answer:
              'Այո, երեխաները ողջունելի են. արահետը չասֆալտապատված է որոշ բարձրացումով, ուստի հարմար է մի քանի ժամ քայլելուն սովոր երեխաների համար։',
          },
          {
            question: 'Ի՞նչ է լինում անձրևի դեպքում:',
            answer:
              'Արշավն իրականացվում է թեթև անձրևի դեպքում։ Վատ եղանակի դեպքում մենք կկապվենք ձեզ հետ՝ ամսաթիվը փոխելու կամ ամբողջական վերադարձ առաջարկելու համար։',
          },
        ],
        ru: [
          {
            question: 'Насколько сложен поход?',
            answer:
              'Это маршрут средней сложности — около 4 часов с некоторыми подъёмами. Достаточно базовой физической подготовки, техническое скалолазание не требуется.',
          },
          {
            question: 'Что взять с собой?',
            answer:
              'Удобную обувь для ходьбы, бутылку воды и одежду по погоде. Рекомендуем взять перекус для остановки на хребте.',
          },
          {
            question: 'Включён ли трансфер до начала маршрута?',
            answer:
              'Нет, тур начинается на парковке у начала маршрута. Гид может подсказать варианты местного такси.',
          },
          {
            question: 'Могут ли участвовать дети?',
            answer:
              'Да, дети могут участвовать — тропа грунтовая с небольшим набором высоты, подходит детям, которые могут ходить несколько часов.',
          },
          {
            question: 'Что если пойдёт дождь?',
            answer:
              'Поход проводится при небольшом дожде. В случае сильной непогоды мы свяжемся с вами, чтобы перенести дату или полностью вернуть деньги.',
          },
        ],
      },
    },
    {
      listingId: listingIds.activityListingId,
      category: 'attractions',
      images: ['attractions-2.svg', 'attractions-3.svg', 'attractions-4.svg'],
      translations: {
        en: {
          title: 'Yerevan Cooking Workshop',
          summary:
            'A hands-on Armenian cooking class in a small group, with morning and evening sessions to choose from.',
          description:
            "Learn to make traditional Armenian dishes from scratch in this hands-on cooking workshop, led by a local home cook in a warm, welcoming kitchen. You'll prepare a full menu together — usually including dolma, lavash, and a seasonal dessert — before sitting down to enjoy what you've made. The class is kept small so everyone gets real hands-on time at the counter, and both the morning and evening sessions cover the same menu, so pick whichever fits your day better.",
        },
        hy: {
          title: 'Երևանյան Խոհարարական Վարպետության Դաս',
          summary:
            'Գործնական հայկական խոհարարության դասընթաց փոքր խմբում՝ առավոտյան և երեկոյան նստաշրջաններով։',
          description:
            'Սովորեք պատրաստել ավանդական հայկական ուտեստներ զրոյից այս գործնական խոհարարական վարպետության դասին՝ տեղացի տնային խոհարարի ղեկավարությամբ, տաք և հյուրընկալ խոհանոցում։ Դուք միասին կպատրաստեք ամբողջական մենյու, որը սովորաբար ներառում է տոլմա, լավաշ և սեզոնային աղանդեր, այնուհետև կնստեք վայելելու ձեր պատրաստածը։ Դասընթացը մնում է փոքր, որպեսզի բոլորը ստանան իրական գործնական փորձ։',
        },
        ru: {
          title: 'Кулинарный мастер-класс в Ереване',
          summary:
            'Практический мастер-класс по армянской кухне в маленькой группе — утренние и вечерние сеансы на выбор.',
          description:
            'Научитесь готовить традиционные армянские блюда с нуля на этом практическом кулинарном мастер-классе под руководством местного домашнего повара в тёплой, гостеприимной кухне. Вместе вы приготовите полное меню — обычно включающее долму, лаваш и сезонный десерт — а затем сядете насладиться тем, что приготовили. Группа остаётся небольшой, чтобы у каждого было реальное практическое время у стола.',
        },
      },
      attributeValues: [
        { code: 'duration_minutes', value: 180 },
        { code: 'languages_offered', optionCodes: ['EN', 'HY', 'RU'] },
        { code: 'max_group_size', value: 8 },
      ],
      amenityIds: [23],
      policyValues: [{ code: 'children_allowed', value: 'true' }],
      highlights: {
        en: [
          { iconCode: 'food', text: 'Hands-on, small-group cooking class' },
          { iconCode: 'clock', text: 'Morning and evening sessions available' },
          { iconCode: 'heart', text: 'Traditional Armenian recipes' },
          { iconCode: 'group', text: 'Shared meal at the end of class' },
        ],
        hy: [
          {
            iconCode: 'food',
            text: 'Գործնական խոհարարական դասընթաց փոքր խմբում',
          },
          {
            iconCode: 'clock',
            text: 'Հասանելի են առավոտյան և երեկոյան նստաշրջաններ',
          },
          { iconCode: 'heart', text: 'Ավանդական հայկական բաղադրատոմսեր' },
          { iconCode: 'group', text: 'Համատեղ ճաշ դասընթացի ավարտին' },
        ],
        ru: [
          {
            iconCode: 'food',
            text: 'Практический кулинарный мастер-класс в небольшой группе',
          },
          {
            iconCode: 'clock',
            text: 'Доступны утренние и вечерние сеансы',
          },
          { iconCode: 'heart', text: 'Традиционные армянские рецепты' },
          { iconCode: 'group', text: 'Совместная трапеза в конце занятия' },
        ],
      },
      included: {
        en: [
          { itemText: 'All ingredients', isIncluded: true },
          { itemText: 'Apron and recipe cards', isIncluded: true },
          { itemText: 'Meal at the end of class', isIncluded: true },
          { itemText: 'Alcoholic drinks', isIncluded: false },
          { itemText: 'Gratuities', isIncluded: false },
        ],
        hy: [
          { itemText: 'Բոլոր բաղադրիչները', isIncluded: true },
          { itemText: 'Գոգնոց և բաղադրատոմսերի քարտեր', isIncluded: true },
          { itemText: 'Ճաշ դասընթացի ավարտին', isIncluded: true },
          { itemText: 'Ալկոհոլային խմիչքներ', isIncluded: false },
          { itemText: 'Թեյավճարներ', isIncluded: false },
        ],
        ru: [
          { itemText: 'Все ингредиенты', isIncluded: true },
          { itemText: 'Фартук и карточки рецептов', isIncluded: true },
          { itemText: 'Трапеза в конце занятия', isIncluded: true },
          { itemText: 'Алкогольные напитки', isIncluded: false },
          { itemText: 'Чаевые', isIncluded: false },
        ],
      },
      faqs: {
        en: [
          {
            question: 'Do I need any cooking experience?',
            answer:
              'No prior experience is needed — the class is designed for complete beginners as well as confident home cooks.',
          },
          {
            question: 'What dishes will we make?',
            answer:
              'The menu usually includes dolma, fresh lavash, and a seasonal dessert, though ingredients may vary slightly by season.',
          },
          {
            question: 'Is the class suitable for vegetarians?',
            answer:
              "Please let us know about dietary restrictions in advance and we'll do our best to adapt the menu.",
          },
          {
            question: 'How long does the class last?',
            answer:
              'The workshop runs for approximately 3 hours, including the shared meal at the end.',
          },
        ],
        hy: [
          {
            question: 'Խոհարարական փորձ պե՞տք է:',
            answer:
              'Նախնական փորձ պետք չէ. դասընթացը նախատեսված է թե՛ սկսնակների, թե՛ վստահ տնային խոհարարների համար։',
          },
          {
            question: 'Ի՞նչ ուտեստներ ենք պատրաստելու:',
            answer:
              'Մենյուն սովորաբար ներառում է տոլմա, թարմ լավաշ և սեզոնային աղանդեր, թեև բաղադրիչները կարող են փոքր-ինչ տարբերվել՝ կախված սեզոնից։',
          },
          {
            question: 'Դասընթացը հարմա՞ր է վեգետարիանների համար:',
            answer:
              'Խնդրում ենք նախապես տեղեկացնել սննդային սահմանափակումների մասին, և մենք կաշխատենք հարմարեցնել մենյուն։',
          },
          {
            question: 'Որքա՞ն է տևում դասընթացը:',
            answer:
              'Դասընթացը տևում է մոտավորապես 3 ժամ՝ ներառյալ ավարտին համատեղ ճաշը։',
          },
        ],
        ru: [
          {
            question: 'Нужен ли опыт готовки?',
            answer:
              'Предыдущий опыт не требуется — занятие подходит как для новичков, так и для уверенных домашних поваров.',
          },
          {
            question: 'Какие блюда мы будем готовить?',
            answer:
              'Меню обычно включает долму, свежий лаваш и сезонный десерт, хотя ингредиенты могут немного меняться в зависимости от сезона.',
          },
          {
            question: 'Подходит ли занятие для вегетарианцев?',
            answer:
              'Пожалуйста, сообщите о диетических ограничениях заранее, и мы постараемся адаптировать меню.',
          },
          {
            question: 'Сколько длится занятие?',
            answer:
              'Мастер-класс длится примерно 3 часа, включая совместную трапезу в конце.',
          },
        ],
      },
    },
    {
      listingId: listingIds.guideListingId,
      category: 'attractions',
      images: ['attractions-5.svg', 'attractions-6.svg', 'attractions-7.svg'],
      translations: {
        en: {
          title: 'Certified Yerevan City Guide',
          summary:
            'A licensed, multilingual private guide for a full day exploring Yerevan and nearby historic sites.',
          description:
            "Spend a full day with a licensed city guide who speaks English, Russian, and Armenian, and knows Yerevan's history inside out. A typical day covers the city's main landmarks — Republic Square, the Cascade, the Vernissage market, and Matenadaran — with the itinerary shaped around your interests, whether that's architecture, history, food, or a mix of everything. The guide is booked for the whole day rather than by the hour, so there's no need to rush between stops.",
        },
        hy: {
          title: 'Հավաստագրված Երևանյան Ուղեկցորդ',
          summary:
            'Հավաստագրված, բազմալեզու անհատական ուղեկցորդ ամբողջ օրվա ընթացքում Երևանում և մոտակա պատմական վայրերում։',
          description:
            'Անցկացրեք ամբողջ օրը հավաստագրված քաղաքային ուղեկցորդի հետ, ով խոսում է անգլերեն, ռուսերեն և հայերեն և գերազանց գիտի Երևանի պատմությունը։ Բնորոշ օրը ներառում է քաղաքի հիմնական տեսարժան վայրերը՝ Հանրապետության հրապարակը, Կասկադը, Վերնիսաժը և Մատենադարանը, իսկ երթուղին ձևավորվում է ըստ ձեր հետաքրքրությունների։',
        },
        ru: {
          title: 'Сертифицированный гид по Еревану',
          summary:
            'Сертифицированный многоязычный частный гид на целый день по Еревану и близлежащим историческим местам.',
          description:
            'Проведите целый день с сертифицированным городским гидом, который говорит на английском, русском и армянском языках и прекрасно знает историю Еревана. Типичный день охватывает главные достопримечательности города — площадь Республики, Каскад, рынок Вернисаж и Матенадаран, а маршрут выстраивается с учётом ваших интересов.',
        },
      },
      attributeValues: [
        { code: 'duration_minutes', value: 480 },
        { code: 'languages_offered', optionCodes: ['EN', 'HY', 'RU'] },
        { code: 'max_group_size', value: 6 },
      ],
      amenityIds: [2, 21],
      policyValues: [{ code: 'children_allowed', value: 'true' }],
      highlights: {
        en: [
          {
            iconCode: 'verified',
            text: 'Licensed, English/Russian/Armenian-speaking guide',
          },
          {
            iconCode: 'clock',
            text: 'Full-day availability, not billed by the hour',
          },
          {
            iconCode: 'location',
            text: 'Covers Republic Square, the Cascade, Vernissage & more',
          },
          { iconCode: 'users', text: 'Tailored to your interests' },
        ],
        hy: [
          {
            iconCode: 'verified',
            text: 'Հավաստագրված ուղեկցորդ՝ անգլերեն, ռուսերեն և հայերեն լեզուներով',
          },
          {
            iconCode: 'clock',
            text: 'Ամբողջ օրվա հասանելիություն, ոչ ժամավճարով',
          },
          {
            iconCode: 'location',
            text: 'Ընդգրկում է Հանրապետության հրապարակը, Կասկադը, Վերնիսաժը և ավելին',
          },
          { iconCode: 'users', text: 'Հարմարեցված է ձեր հետաքրքրություններին' },
        ],
        ru: [
          {
            iconCode: 'verified',
            text: 'Лицензированный гид, говорящий на английском, русском и армянском',
          },
          {
            iconCode: 'clock',
            text: 'Доступен на целый день, без почасовой оплаты',
          },
          {
            iconCode: 'location',
            text: 'Охватывает площадь Республики, Каскад, Вернисаж и другие места',
          },
          {
            iconCode: 'users',
            text: 'Программа адаптируется под ваши интересы',
          },
        ],
      },
      itinerary: {
        en: [
          {
            title: 'Morning pickup and Republic Square',
            description:
              'Meet your guide and begin with the architecture and history of Republic Square.',
            durationMinutes: 60,
          },
          {
            title: 'The Cascade and modern art',
            description:
              'Walk up the Cascade complex, taking in views over the city and its outdoor sculpture garden.',
            durationMinutes: 90,
          },
          {
            title: 'Vernissage market',
            description:
              "Browse handmade crafts, carpets, and antiques at Yerevan's open-air market.",
            durationMinutes: 60,
          },
          {
            title: 'Lunch break',
            description:
              'A break to enjoy Armenian cuisine at a guide-recommended local restaurant (meal not included).',
            durationMinutes: 60,
          },
          {
            title: 'Matenadaran and old manuscripts',
            description:
              "Visit the Matenadaran to see one of the world's richest collections of ancient manuscripts.",
            durationMinutes: 75,
          },
          {
            title: 'Free time and drop-off',
            description:
              'Wrap up with time for any last requests before being dropped off at your accommodation.',
            durationMinutes: 45,
          },
        ],
        hy: [
          {
            title: 'Առավոտյան վերցնում և Հանրապետության հրապարակ',
            description:
              'Հանդիպեք ձեր ուղեկցորդի հետ և սկսեք Հանրապետության հրապարակի ճարտարապետությունից և պատմությունից։',
            durationMinutes: 60,
          },
          {
            title: 'Կասկադ և ժամանակակից արվեստ',
            description:
              'Բարձրացեք Կասկադ համալիրով՝ վայելելով քաղաքի տեսարաններն ու բացօթյա քանդակների այգին։',
            durationMinutes: 90,
          },
          {
            title: 'Վերնիսաժ շուկա',
            description:
              'Ուսումնասիրեք ձեռագործ իրեր, գորգեր և հնաոճ առարկաներ Երևանի բացօթյա շուկայում։',
            durationMinutes: 60,
          },
          {
            title: 'Ճաշի ընդմիջում',
            description:
              'Ընդմիջում՝ հայկական խոհանոցը վայելելու համար ուղեկցորդի առաջարկած ռեստորանում (ճաշը չի ներառված)։',
            durationMinutes: 60,
          },
          {
            title: 'Մատենադարան և հին ձեռագրեր',
            description:
              'Այցելեք Մատենադարան՝ տեսնելու աշխարհի ամենահարուստ հին ձեռագրերի հավաքածուներից մեկը։',
            durationMinutes: 75,
          },
          {
            title: 'Ազատ ժամանակ և հասցնում',
            description:
              'Ավարտեք վերջին ցանկություններով, նախքան ձեզ ձեր կեցության վայր հասցնելը։',
            durationMinutes: 45,
          },
        ],
        ru: [
          {
            title: 'Утренняя встреча и площадь Республики',
            description:
              'Встретьтесь с гидом и начните с архитектуры и истории площади Республики.',
            durationMinutes: 60,
          },
          {
            title: 'Каскад и современное искусство',
            description:
              'Поднимитесь по комплексу Каскад, наслаждаясь видами на город и садом скульптур под открытым небом.',
            durationMinutes: 90,
          },
          {
            title: 'Рынок Вернисаж',
            description:
              'Осмотрите изделия ручной работы, ковры и антиквариат на открытом рынке Еревана.',
            durationMinutes: 60,
          },
          {
            title: 'Обеденный перерыв',
            description:
              'Перерыв, чтобы насладиться армянской кухней в ресторане, рекомендованном гидом (обед не включён).',
            durationMinutes: 60,
          },
          {
            title: 'Матенадаран и древние рукописи',
            description:
              'Посетите Матенадаран, чтобы увидеть одну из богатейших в мире коллекций древних рукописей.',
            durationMinutes: 75,
          },
          {
            title: 'Свободное время и высадка',
            description:
              'Завершите день с учётом последних пожеланий перед высадкой в месте вашего проживания.',
            durationMinutes: 45,
          },
        ],
      },
      included: {
        en: [
          { itemText: 'Licensed guide for the full day', isIncluded: true },
          { itemText: 'Entry planning for key sites', isIncluded: true },
          { itemText: 'Local recommendations', isIncluded: true },
          { itemText: 'Site entry tickets', isIncluded: false },
          { itemText: 'Lunch', isIncluded: false },
          { itemText: 'Transportation between sites', isIncluded: false },
        ],
        hy: [
          {
            itemText: 'Հավաստագրված ուղեկցորդ ամբողջ օրվա համար',
            isIncluded: true,
          },
          {
            itemText: 'Հիմնական վայրերի այցելության պլանավորում',
            isIncluded: true,
          },
          { itemText: 'Տեղական խորհուրդներ', isIncluded: true },
          { itemText: 'Այցելության տոմսեր', isIncluded: false },
          { itemText: 'Ճաշ', isIncluded: false },
          { itemText: 'Տեղափոխում վայրերի միջև', isIncluded: false },
        ],
        ru: [
          { itemText: 'Лицензированный гид на весь день', isIncluded: true },
          {
            itemText: 'Планирование посещения ключевых мест',
            isIncluded: true,
          },
          { itemText: 'Местные рекомендации', isIncluded: true },
          { itemText: 'Билеты на посещение объектов', isIncluded: false },
          { itemText: 'Обед', isIncluded: false },
          { itemText: 'Транспорт между объектами', isIncluded: false },
        ],
      },
      faqs: {
        en: [
          {
            question: 'What languages does the guide speak?',
            answer: 'English, Russian, and Armenian.',
          },
          {
            question: 'Can the itinerary be customized?',
            answer:
              "Yes — the day is shaped around your interests, whether that's architecture, history, food, or a general overview of the city.",
          },
          {
            question: 'Are entry tickets to sites included?',
            answer:
              'No, entry tickets to museums and attractions are not included and are paid separately.',
          },
          {
            question: 'Is this a group tour?',
            answer:
              'No, this is a private, one-on-one guide booking for your party only.',
          },
        ],
        hy: [
          {
            question: 'Ի՞նչ լեզուներով է խոսում ուղեկցորդը:',
            answer: 'Անգլերեն, ռուսերեն և հայերեն։',
          },
          {
            question: 'Երթուղին կարո՞ղ է հարմարեցվել:',
            answer:
              'Այո՝ օրը կազմվում է ձեր հետաքրքրություններին համապատասխան, լինի դա ճարտարապետություն, պատմություն, խոհանոց, թե քաղաքի ընդհանուր ծանոթացում։',
          },
          {
            question: 'Այցելության տոմսերը ներառվա՞ծ են:',
            answer:
              'Ոչ, թանգարանների և տեսարժան վայրերի տոմսերը ներառված չեն և վճարվում են առանձին։',
          },
          {
            question: 'Սա խմբակա՞յին տուր է:',
            answer: 'Ոչ, սա անհատական ուղեկցում է՝ միայն ձեր խմբի համար։',
          },
        ],
        ru: [
          {
            question: 'На каких языках говорит гид?',
            answer: 'Английский, русский и армянский.',
          },
          {
            question: 'Можно ли изменить маршрут?',
            answer:
              'Да — программа дня строится вокруг ваших интересов, будь то архитектура, история, еда или общее знакомство с городом.',
          },
          {
            question: 'Включены ли билеты на объекты?',
            answer:
              'Нет, билеты в музеи и на достопримечательности не включены и оплачиваются отдельно.',
          },
          {
            question: 'Это групповой тур?',
            answer:
              'Нет, это индивидуальное бронирование гида только для вашей компании.',
          },
        ],
      },
    },
    {
      listingId: listingIds.carRentalListingId,
      category: 'car-rentals',
      images: [
        'car-rentals-2.svg',
        'car-rentals-3.svg',
        'car-rentals-4.svg',
        'car-rentals-5.svg',
      ],
      translations: {
        en: {
          title: 'Ararat Valley Fleet',
          summary:
            "A small, well-maintained SUV rental fleet for self-drive trips across Armenia's highways and mountain roads.",
          description:
            "Ararat Valley Fleet offers a small selection of well-maintained SUVs, each suited to Armenia's mix of highways and unpaved mountain roads. Every vehicle comes with a full tank, comprehensive insurance, and a spare tire, so you can head out to Dilijan, Lake Sevan, or further afield with confidence. Pick-up and drop-off are arranged directly with the fleet manager, and each vehicle is tracked individually, so availability reflects exactly which cars are free on your travel dates.",
        },
        hy: {
          title: 'Արարատյան Հովտի Ավտոպարկ',
          summary:
            'Փոքր, լավ պահպանված ամենագնացների վարձակալման պարկ Հայաստանի մայրուղիներով և լեռնային ճանապարհներով ինքնուրույն ճամփորդությունների համար։',
          description:
            'Արարատյան Հովտի Ավտոպարկը առաջարկում է լավ պահպանված ամենագնացների փոքր ընտրություն, որոնցից յուրաքանչյուրը հարմարեցված է Հայաստանի մայրուղիների և չասֆալտապատված լեռնային ճանապարհների համադրությանը։ Յուրաքանչյուր մեքենա գալիս է լիքը բաքով, համապարփակ ապահովագրությամբ և պահեստային անվադողով, որպեսզի կարողանաք վստահորեն մեկնել Դիլիջան, Սևանա լիճ կամ ավելի հեռու։',
        },
        ru: {
          title: 'Автопарк Араратской долины',
          summary:
            'Небольшой парк ухоженных внедорожников для самостоятельных поездок по шоссе и горным дорогам Армении.',
          description:
            'Автопарк Араратской долины предлагает небольшой выбор ухоженных внедорожников, каждый из которых подходит для сочетания шоссе и грунтовых горных дорог Армении. Каждый автомобиль поставляется с полным баком, полной страховкой и запасным колесом, чтобы вы могли уверенно отправиться в Дилижан, на озеро Севан или ещё дальше.',
        },
      },
      attributeValues: [
        { code: 'transmission', optionCodes: ['AUTOMATIC'] },
        { code: 'seats', value: 5 },
      ],
      amenityIds: [4],
      policyValues: [
        { code: 'smoking_allowed', value: 'false' },
        { code: 'cancellation_policy', value: 'FLEXIBLE' },
      ],
      highlights: {
        en: [
          {
            iconCode: 'car',
            text: 'Well-maintained SUVs for highway and mountain roads',
          },
          { iconCode: 'shield', text: 'Comprehensive insurance included' },
          { iconCode: 'fast', text: 'Full tank at pick-up' },
          {
            iconCode: 'location',
            text: 'Flexible pick-up and drop-off in Yerevan',
          },
        ],
        hy: [
          {
            iconCode: 'car',
            text: 'Լավ պահպանված ամենագնացներ մայրուղիների և լեռնային ճանապարհների համար',
          },
          { iconCode: 'shield', text: 'Համապարփակ ապահովագրություն՝ ներառված' },
          { iconCode: 'fast', text: 'Լիքը բաք վերցնելու պահին' },
          {
            iconCode: 'location',
            text: 'Ճկուն վերցնում և վերադարձ Երևանում',
          },
        ],
        ru: [
          {
            iconCode: 'car',
            text: 'Ухоженные внедорожники для шоссе и горных дорог',
          },
          { iconCode: 'shield', text: 'Полная страховка включена' },
          { iconCode: 'fast', text: 'Полный бак при получении' },
          {
            iconCode: 'location',
            text: 'Гибкое получение и возврат в Ереване',
          },
        ],
      },
      included: {
        en: [
          { itemText: 'Comprehensive insurance', isIncluded: true },
          { itemText: 'Full tank at pick-up', isIncluded: true },
          { itemText: 'Spare tire and roadside kit', isIncluded: true },
          { itemText: 'Fuel refill on return', isIncluded: false },
          { itemText: 'Additional driver fee', isIncluded: false },
          { itemText: 'Child car seat', isIncluded: false },
        ],
        hy: [
          { itemText: 'Համապարփակ ապահովագրություն', isIncluded: true },
          { itemText: 'Լիքը բաք վերցնելու պահին', isIncluded: true },
          {
            itemText: 'Պահեստային անվադող և ճանապարհային հավաքածու',
            isIncluded: true,
          },
          { itemText: 'Վառելիքի լցում վերադարձի ժամանակ', isIncluded: false },
          { itemText: 'Լրացուցիչ վարորդի վճար', isIncluded: false },
          { itemText: 'Մանկական նստատեղ', isIncluded: false },
        ],
        ru: [
          { itemText: 'Полная страховка', isIncluded: true },
          { itemText: 'Полный бак при получении', isIncluded: true },
          { itemText: 'Запасное колесо и дорожный набор', isIncluded: true },
          { itemText: 'Заправка при возврате', isIncluded: false },
          { itemText: 'Плата за дополнительного водителя', isIncluded: false },
          { itemText: 'Детское автокресло', isIncluded: false },
        ],
      },
      faqs: {
        en: [
          {
            question: 'What is included with the rental?',
            answer:
              'Every rental includes comprehensive insurance, a full tank of fuel, and a spare tire.',
          },
          {
            question: 'Do I need an international driving permit?',
            answer:
              'Most foreign licenses are accepted, but we recommend bringing an International Driving Permit alongside your national license.',
          },
          {
            question: 'Can I drive outside Yerevan?',
            answer:
              'Yes, these SUVs are well suited to travel across Armenia, including unpaved mountain roads to places like Dilijan and Lake Sevan.',
          },
          {
            question: 'What is the cancellation policy?',
            answer:
              'This fleet follows a flexible cancellation policy — free cancellation up to a set number of hours before pick-up.',
          },
        ],
        hy: [
          {
            question: 'Ի՞նչ է ներառված վարձակալության մեջ:',
            answer:
              'Յուրաքանչյուր վարձակալություն ներառում է համապարփակ ապահովագրություն, լիքը վառելիքի բաք և պահեստային անվադող։',
          },
          {
            question: 'Միջազգային վարորդական իրավունք պե՞տք է:',
            answer:
              'Օտարերկրյա իրավունքների մեծ մասն ընդունվում է, սակայն խորհուրդ ենք տալիս ձեր ազգային իրավունքի հետ միասին վերցնել նաև միջազգային վարորդական իրավունք։',
          },
          {
            question: 'Կարո՞ղ եմ վարել Երևանից դուրս:',
            answer:
              'Այո, այս ամենագնացները հարմար են Հայաստանով ճամփորդելու համար, ներառյալ չասֆալտապատված լեռնային ճանապարհները դեպի Դիլիջան և Սևանա լիճ։',
          },
          {
            question: 'Ի՞նչ է կազմում չեղարկման քաղաքականությունը:',
            answer:
              'Այս ավտոպարկը հետևում է ճկուն չեղարկման քաղաքականությանը՝ անվճար չեղարկում՝ վերցնելուց որոշակի ժամեր առաջ։',
          },
        ],
        ru: [
          {
            question: 'Что включено в аренду?',
            answer:
              'Каждая аренда включает полную страховку, полный бак топлива и запасное колесо.',
          },
          {
            question: 'Нужны ли международные водительские права?',
            answer:
              'Большинство иностранных прав принимаются, но мы рекомендуем иметь международное водительское удостоверение вместе с национальными правами.',
          },
          {
            question: 'Можно ли ездить за пределы Еревана?',
            answer:
              'Да, эти внедорожники хорошо подходят для поездок по всей Армении, включая грунтовые горные дороги к таким местам, как Дилижан и озеро Севан.',
          },
          {
            question: 'Какова политика отмены?',
            answer:
              'Этот автопарк следует гибкой политике отмены — бесплатная отмена за определённое количество часов до получения автомобиля.',
          },
        ],
      },
    },
  ];

  // eslint-disable-next-line no-restricted-syntax -- seeding must run in a stable, readable order
  for (const flagship of FLAGSHIPS) {
    const { listingId } = flagship;
    // eslint-disable-next-line no-await-in-loop -- sequential by design
    const [[owner]] = await connection.query(
      'SELECT created_by AS ownerUserId FROM listings WHERE id = ?',
      [listingId],
    );

    // eslint-disable-next-line no-restricted-syntax -- seeding must run in a stable, readable order
    for (const [code, t] of Object.entries(flagship.translations)) {
      // eslint-disable-next-line no-await-in-loop -- sequential by design
      await upsertTranslation(connection, listingId, languageIds.get(code), t);
    }

    // eslint-disable-next-line no-restricted-syntax -- seeding must run in a stable, readable order
    for (const entry of flagship.attributeValues) {
      // eslint-disable-next-line no-await-in-loop -- sequential by design
      await insertAttributeValue(connection, listingId, entry);
    }

    if (flagship.amenityIds.length > 0) {
      const values = flagship.amenityIds.map((amenityId) => [
        listingId,
        amenityId,
      ]);
      // eslint-disable-next-line no-await-in-loop -- sequential by design
      await connection.query(
        'INSERT INTO listing_amenity_listing (listing_id, amenity_id) VALUES ?',
        [values],
      );
    }

    // eslint-disable-next-line no-restricted-syntax -- seeding must run in a stable, readable order
    for (const entry of flagship.policyValues) {
      // eslint-disable-next-line no-await-in-loop -- sequential by design
      await insertPolicyValue(connection, listingId, entry);
    }

    // Each of the four rich-content types is authored per-locale
    // (`{ en: [...], hy: [...], ru: [...] }`) — insert one language's
    // ordered list at a time, all tagged with that language's id.
    // eslint-disable-next-line no-restricted-syntax -- seeding must run in a stable, readable order
    for (const [localeCode, highlights] of Object.entries(
      flagship.highlights,
    )) {
      // eslint-disable-next-line no-await-in-loop -- sequential by design
      await insertLocalizedRows(
        connection,
        'listing_highlights',
        ['icon_code', 'text', 'sort_order'],
        listingId,
        languageIds.get(localeCode),
        highlights,
        (lid, langId, h, index) => [lid, langId, h.iconCode, h.text, index],
      );
    }

    if (flagship.itinerary) {
      // eslint-disable-next-line no-restricted-syntax -- seeding must run in a stable, readable order
      for (const [localeCode, steps] of Object.entries(flagship.itinerary)) {
        // eslint-disable-next-line no-await-in-loop -- sequential by design
        await insertLocalizedRows(
          connection,
          'listing_itinerary_steps',
          ['sort_order', 'title', 'description', 'duration_minutes'],
          listingId,
          languageIds.get(localeCode),
          steps,
          (lid, langId, step, index) => [
            lid,
            langId,
            index,
            step.title,
            step.description ?? null,
            step.durationMinutes ?? null,
          ],
        );
      }
    }

    // eslint-disable-next-line no-restricted-syntax -- seeding must run in a stable, readable order
    for (const [localeCode, items] of Object.entries(flagship.included)) {
      // eslint-disable-next-line no-await-in-loop -- sequential by design
      await insertLocalizedRows(
        connection,
        'listing_included_items',
        ['item_text', 'is_included', 'sort_order'],
        listingId,
        languageIds.get(localeCode),
        items,
        (lid, langId, item, index) => [
          lid,
          langId,
          item.itemText,
          item.isIncluded ? 1 : 0,
          index,
        ],
      );
    }

    // eslint-disable-next-line no-restricted-syntax -- seeding must run in a stable, readable order
    for (const [localeCode, faqs] of Object.entries(flagship.faqs)) {
      // eslint-disable-next-line no-await-in-loop -- sequential by design
      await insertLocalizedRows(
        connection,
        'listing_faqs',
        ['question', 'answer', 'sort_order'],
        listingId,
        languageIds.get(localeCode),
        faqs,
        (lid, langId, faq, index) => [
          lid,
          langId,
          faq.question,
          faq.answer,
          index,
        ],
      );
    }

    // eslint-disable-next-line no-await-in-loop -- sequential by design
    await insertMedia(
      connection,
      listingId,
      imageTypeId,
      completedUploadStatusId,
      approvedStatusId,
      owner.ownerUserId,
      2,
      flagship.category,
      flagship.images,
    );
  }

  return { enrichedListingIds: FLAGSHIPS.map((f) => f.listingId) };
}
