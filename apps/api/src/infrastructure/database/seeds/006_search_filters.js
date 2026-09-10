/**
 * Seeds the Generic Attribute Engine + Filter Metadata System (Phase 4.2,
 * migration 0014) with a real, representative data set covering every
 * root category `003_taxonomy_and_products.js` already seeds (Hotels,
 * Apartments, Villas, Guest Houses, Restaurants, Tours, Car Rentals,
 * Attractions) — proving "filters change per category" against real
 * categories, not a hypothetical.
 *
 * `filter_definitions.code` deliberately equals `attribute_definitions.
 * code` for every ATTRIBUTE-sourced filter (a 1:1 view for now) — the
 * min/max/exact query semantics come from `input_type` alone, resolved
 * generically by `mysqlSearchRepository.js`'s query builder:
 *   STEPPER      -> only `attr_{code}_min` is ever sent (an "N or more" filter)
 *   RANGE        -> `attr_{code}_min` and/or `attr_{code}_max`
 *   SINGLE/MULTI_SELECT -> `attr_{code}=<attribute_option id>[,<id>...]`
 * This file only seeds data; none of that parsing logic lives here.
 */

import { upsertByCode, getIdsByCode } from './helpers.js';

async function upsertCategoryBySlug(connection, slug) {
  const [rows] = await connection.query(
    'SELECT id FROM listing_categories WHERE slug = ?',
    [slug],
  );
  if (rows.length === 0) {
    throw new Error(
      `No listing_categories row for slug "${slug}" — did 003_taxonomy_and_products.js run first?`,
    );
  }
  return rows[0].id;
}

async function upsertAmenityByName(
  connection,
  name,
  groupCode,
  groupIdsByCode,
) {
  const groupId = groupCode ? groupIdsByCode.get(groupCode) : null;
  const [existing] = await connection.query(
    'SELECT id FROM listing_amenities WHERE name = ?',
    [name],
  );
  if (existing.length > 0) {
    await connection.query(
      'UPDATE listing_amenities SET amenity_group_id = ? WHERE id = ?',
      [groupId, existing[0].id],
    );
    return existing[0].id;
  }
  const [result] = await connection.query(
    'INSERT INTO listing_amenities (name, amenity_group_id) VALUES (?, ?)',
    [name, groupId],
  );
  return result.insertId;
}

async function upsertAmenityTranslation(
  connection,
  { amenityId, languageId, name },
) {
  await connection.query(
    `INSERT INTO listing_amenity_translations (listing_amenity_id, language_id, name)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE name = VALUES(name)`,
    [amenityId, languageId, name],
  );
}

async function upsertAttributeDefinition(connection, def, dataTypeIdsByCode) {
  const dataTypeId = dataTypeIdsByCode.get(def.dataType);
  await connection.query(
    `INSERT INTO attribute_definitions
       (code, data_type_id, unit, validation_min, validation_max, is_multi_valued)
     VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       data_type_id = VALUES(data_type_id), unit = VALUES(unit),
       validation_min = VALUES(validation_min), validation_max = VALUES(validation_max),
       is_multi_valued = VALUES(is_multi_valued)`,
    [
      def.code,
      dataTypeId,
      def.unit ?? null,
      def.min ?? null,
      def.max ?? null,
      def.multi ? 1 : 0,
    ],
  );
  const [[row]] = await connection.query(
    'SELECT id FROM attribute_definitions WHERE code = ?',
    [def.code],
  );
  return row.id;
}

async function upsertAttributeOption(
  connection,
  attributeDefinitionId,
  code,
  sortOrder,
) {
  await connection.query(
    `INSERT INTO attribute_options (attribute_definition_id, code, sort_order)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE sort_order = VALUES(sort_order)`,
    [attributeDefinitionId, code, sortOrder],
  );
  const [[row]] = await connection.query(
    'SELECT id FROM attribute_options WHERE attribute_definition_id = ? AND code = ?',
    [attributeDefinitionId, code],
  );
  return row.id;
}

async function upsertCategoryAttribute(
  connection,
  categoryId,
  attributeDefinitionId,
  sortOrder,
) {
  await connection.query(
    `INSERT INTO category_attributes (category_id, attribute_definition_id, sort_order)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE sort_order = VALUES(sort_order)`,
    [categoryId, attributeDefinitionId, sortOrder],
  );
}

async function upsertAmenityApplicability(connection, amenityId, categoryId) {
  await connection.query(
    `INSERT INTO amenity_category_applicability (amenity_id, category_id)
     VALUES (?, ?)
     ON DUPLICATE KEY UPDATE amenity_id = VALUES(amenity_id)`,
    [amenityId, categoryId],
  );
}

async function upsertFilterDefinition(
  connection,
  def,
  {
    filterGroupIdsByCode,
    filterInputTypeIdsByCode,
    attributeDefinitionIdsByCode,
  },
) {
  const filterGroupId = filterGroupIdsByCode.get(def.group);
  const inputTypeId = filterInputTypeIdsByCode.get(def.inputType);
  const attributeDefinitionId =
    def.valueSource === 'ATTRIBUTE'
      ? attributeDefinitionIdsByCode.get(def.attributeCode)
      : null;

  await connection.query(
    `INSERT INTO filter_definitions
       (filter_group_id, code, input_type_id, value_source, attribute_definition_id,
        unit, sort_order, is_advanced, is_global)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       filter_group_id = VALUES(filter_group_id), input_type_id = VALUES(input_type_id),
       value_source = VALUES(value_source), attribute_definition_id = VALUES(attribute_definition_id),
       unit = VALUES(unit), sort_order = VALUES(sort_order),
       is_advanced = VALUES(is_advanced), is_global = VALUES(is_global)`,
    [
      filterGroupId,
      def.code,
      inputTypeId,
      def.valueSource,
      attributeDefinitionId,
      def.unit ?? null,
      def.sortOrder ?? 0,
      def.isAdvanced ? 1 : 0,
      def.isGlobal ? 1 : 0,
    ],
  );
}

// --- Data --------------------------------------------------------------

const ATTRIBUTE_DATA_TYPES = [
  { code: 'INTEGER', name: 'Integer' },
  { code: 'DECIMAL', name: 'Decimal' },
  { code: 'BOOLEAN', name: 'Boolean' },
  { code: 'STRING', name: 'String' },
  { code: 'DATE', name: 'Date' },
  { code: 'ENUM', name: 'Single-choice enum' },
  { code: 'MULTI_ENUM', name: 'Multi-choice enum' },
];

const FILTER_INPUT_TYPES = [
  { code: 'RANGE', name: 'Range slider' },
  { code: 'MULTI_SELECT', name: 'Checkbox group' },
  { code: 'SINGLE_SELECT', name: 'Chip group' },
  { code: 'TOGGLE', name: 'Toggle' },
  { code: 'STEPPER', name: 'Numeric stepper' },
];

const FILTER_GROUPS = [
  { code: 'ROOMS', name: 'Rooms & Beds', sortOrder: 1 },
  { code: 'RATING', name: 'Rating', sortOrder: 2 },
  { code: 'DINING', name: 'Dining', sortOrder: 3 },
  { code: 'EXPERIENCE', name: 'Experience', sortOrder: 4 },
  { code: 'VEHICLE', name: 'Vehicle', sortOrder: 5 },
  { code: 'AMENITIES', name: 'Amenities', sortOrder: 6 },
];

const AMENITY_GROUPS = [
  { code: 'WELLNESS', name: 'Wellness', sortOrder: 1 },
  { code: 'OUTDOOR', name: 'Outdoor', sortOrder: 2 },
  { code: 'KITCHEN_LAUNDRY', name: 'Kitchen & Laundry', sortOrder: 3 },
  { code: 'CONNECTIVITY', name: 'Connectivity', sortOrder: 4 },
  {
    code: 'ACCESSIBILITY_SAFETY',
    name: 'Accessibility & Safety',
    sortOrder: 5,
  },
  { code: 'FAMILY_PETS', name: 'Family & Pets', sortOrder: 6 },
  { code: 'FOOD_SERVICE', name: 'Food & Service', sortOrder: 7 },
  { code: 'DINING', name: 'Dining', sortOrder: 8 },
  // Sprint C-1 (Accommodation room-level product data) — room-specific
  // amenities (`bookable_unit_amenity_listing`), grouped separately from
  // the listing/hotel-level groups above purely for the Partner room
  // authoring UI's own grouping; the amenities themselves still live in
  // the one shared `listing_amenities` catalog (some, like Air
  // Conditioning/Balcony/Washing Machine below, are reused verbatim from
  // their existing listing-level group — a room genuinely having its own
  // AC unit is not a modeling conflict with a building having central AC).
  { code: 'IN_ROOM', name: 'In-Room', sortOrder: 9 },
];

// name -> amenity group code. The 8 names already seeded by
// 003_taxonomy_and_products.js are included so they get grouped too —
// `upsertAmenityByName` updates in place rather than duplicating.
const AMENITIES = [
  ['WiFi', 'CONNECTIVITY'],
  ['Parking', 'ACCESSIBILITY_SAFETY'],
  ['Pool', 'WELLNESS'],
  ['Air Conditioning', 'CONNECTIVITY'],
  ['Breakfast Included', 'FOOD_SERVICE'],
  ['Pet Friendly', 'FAMILY_PETS'],
  ['Airport Shuttle', 'FOOD_SERVICE'],
  ['Non-Smoking Rooms', 'FOOD_SERVICE'],
  ['Jacuzzi', 'WELLNESS'],
  ['Sauna', 'WELLNESS'],
  ['Gym', 'WELLNESS'],
  ['Garden', 'OUTDOOR'],
  ['BBQ', 'OUTDOOR'],
  ['Terrace', 'OUTDOOR'],
  ['Balcony', 'OUTDOOR'],
  ['Fireplace', 'OUTDOOR'],
  ['Kitchen', 'KITCHEN_LAUNDRY'],
  ['Washing Machine', 'KITCHEN_LAUNDRY'],
  ['Elevator', 'ACCESSIBILITY_SAFETY'],
  ['Security', 'ACCESSIBILITY_SAFETY'],
  ['Wheelchair Accessible', 'ACCESSIBILITY_SAFETY'],
  ['EV Charger', 'ACCESSIBILITY_SAFETY'],
  ['Family Friendly', 'FAMILY_PETS'],
  ['Business Center', 'FOOD_SERVICE'],
  ['Outdoor Seating', 'DINING'],
  ['Live Music', 'DINING'],
  // Sprint C-1 — new room-specific amenities (see AMENITY_GROUPS' own
  // IN_ROOM comment above for why this is a separate group, not a
  // separate catalog).
  ['Minibar', 'IN_ROOM'],
  ['TV', 'IN_ROOM'],
  ['Kettle', 'IN_ROOM'],
  ['Desk', 'IN_ROOM'],
  ['Safe', 'IN_ROOM'],
  ['Kitchenette', 'IN_ROOM'],
];

// Feeds listing_amenity_translations, which mysqlListingMetadataRepository's
// getMetadataForCategory() COALESCE(locale, defaultLocale, la.name) chain
// reads — the Partner Listing Wizard's Amenities step renders these,
// unlike attribute/policy labels, which the frontend translates by `code`
// (amenities have no stable code, only this free-text `name`).
const AMENITY_TRANSLATIONS = {
  WiFi: { en: 'WiFi', hy: 'Վայ-ֆայ', ru: 'Wi-Fi' },
  Parking: { en: 'Parking', hy: 'Ավտոկայանատեղի', ru: 'Парковка' },
  Pool: { en: 'Pool', hy: 'Լողավազան', ru: 'Бассейн' },
  'Air Conditioning': {
    en: 'Air Conditioning',
    hy: 'Կլիմայի կարգավորում',
    ru: 'Кондиционер',
  },
  'Breakfast Included': {
    en: 'Breakfast Included',
    hy: 'Նախաճաշը ներառված է',
    ru: 'Завтрак включён',
  },
  'Pet Friendly': {
    en: 'Pet Friendly',
    hy: 'Ընդունվում են ընտանի կենդանիներ',
    ru: 'Можно с животными',
  },
  'Airport Shuttle': {
    en: 'Airport Shuttle',
    hy: 'Օդանավակայանի տրանսֆեր',
    ru: 'Трансфер из аэропорта',
  },
  'Non-Smoking Rooms': {
    en: 'Non-Smoking Rooms',
    hy: 'Ծխելն արգելված է սենյակներում',
    ru: 'Некурящие номера',
  },
  Jacuzzi: { en: 'Jacuzzi', hy: 'Ջակուզի', ru: 'Джакузи' },
  Sauna: { en: 'Sauna', hy: 'Սաունա', ru: 'Сауна' },
  Gym: { en: 'Gym', hy: 'Մարզասրահ', ru: 'Тренажёрный зал' },
  Garden: { en: 'Garden', hy: 'Այգի', ru: 'Сад' },
  BBQ: { en: 'BBQ', hy: 'Բարբեքյու', ru: 'Барбекю' },
  Terrace: { en: 'Terrace', hy: 'Տերասա', ru: 'Терраса' },
  Balcony: { en: 'Balcony', hy: 'Պատշգամբ', ru: 'Балкон' },
  Fireplace: { en: 'Fireplace', hy: 'Բուխարի', ru: 'Камин' },
  Kitchen: { en: 'Kitchen', hy: 'Խոհանոց', ru: 'Кухня' },
  'Washing Machine': {
    en: 'Washing Machine',
    hy: 'Լվացքի մեքենա',
    ru: 'Стиральная машина',
  },
  Elevator: { en: 'Elevator', hy: 'Վերելակ', ru: 'Лифт' },
  Security: { en: 'Security', hy: 'Անվտանգություն', ru: 'Охрана' },
  'Wheelchair Accessible': {
    en: 'Wheelchair Accessible',
    hy: 'Հասանելի հաշմանդամության սայլակով',
    ru: 'Доступно для инвалидных колясок',
  },
  'EV Charger': {
    en: 'EV Charger',
    hy: 'Էլեկտրամեքենայի լիցքավորում',
    ru: 'Зарядка для электромобилей',
  },
  'Family Friendly': {
    en: 'Family Friendly',
    hy: 'Հարմար ընտանիքների համար',
    ru: 'Подходит для семей',
  },
  'Business Center': {
    en: 'Business Center',
    hy: 'Բիզնես կենտրոն',
    ru: 'Бизнес-центр',
  },
  'Outdoor Seating': {
    en: 'Outdoor Seating',
    hy: 'Բացօթյա նստատեղեր',
    ru: 'Места на открытом воздухе',
  },
  'Live Music': {
    en: 'Live Music',
    hy: 'Կենդանի երաժշտություն',
    ru: 'Живая музыка',
  },
  Minibar: { en: 'Minibar', hy: 'Մինի-բար', ru: 'Мини-бар' },
  TV: { en: 'TV', hy: 'Հեռուստացույց', ru: 'Телевизор' },
  Kettle: { en: 'Kettle', hy: 'Թեյնիկ', ru: 'Чайник' },
  Desk: { en: 'Desk', hy: 'Գրասեղան', ru: 'Письменный стол' },
  Safe: { en: 'Safe', hy: 'Սեյֆ', ru: 'Сейф' },
  Kitchenette: { en: 'Kitchenette', hy: 'Փոքր խոհանոց', ru: 'Мини-кухня' },
};

const ATTRIBUTE_DEFINITIONS = [
  { code: 'bedrooms', dataType: 'INTEGER', unit: 'rooms', min: 0, max: 20 },
  { code: 'bathrooms', dataType: 'DECIMAL', unit: 'rooms', min: 0, max: 10 },
  { code: 'beds', dataType: 'INTEGER', unit: 'beds', min: 0, max: 30 },
  { code: 'max_guests', dataType: 'INTEGER', unit: 'guests', min: 1, max: 50 },
  { code: 'star_rating', dataType: 'ENUM' },
  { code: 'price_tier', dataType: 'ENUM' },
  { code: 'cuisine', dataType: 'MULTI_ENUM', multi: true },
  {
    code: 'duration_minutes',
    dataType: 'INTEGER',
    unit: 'minutes',
    min: 15,
    max: 720,
  },
  { code: 'difficulty', dataType: 'ENUM' },
  {
    code: 'max_group_size',
    dataType: 'INTEGER',
    unit: 'people',
    min: 1,
    max: 50,
  },
  { code: 'transmission', dataType: 'ENUM' },
  { code: 'seats', dataType: 'INTEGER', unit: 'seats', min: 1, max: 60 },
  // Phase 18 (Premium Listing Detail): additive category-scoped facts,
  // seeded as pure data through the existing Generic Attribute Engine —
  // no new migration required for any of these.
  { code: 'property_style', dataType: 'ENUM' },
  { code: 'total_rooms', dataType: 'INTEGER', unit: 'rooms', min: 1, max: 999 },
  { code: 'view_type', dataType: 'ENUM' },
  {
    code: 'floor_area_sqm',
    dataType: 'INTEGER',
    unit: 'sqm',
    min: 10,
    max: 2000,
  },
  { code: 'languages_offered', dataType: 'MULTI_ENUM', multi: true },
  { code: 'meeting_point_type', dataType: 'ENUM' },
  { code: 'fuel_type', dataType: 'ENUM' },
  { code: 'doors', dataType: 'INTEGER', unit: 'doors', min: 2, max: 6 },
  {
    code: 'luggage_capacity',
    dataType: 'INTEGER',
    unit: 'bags',
    min: 0,
    max: 20,
  },
  {
    code: 'min_driver_age',
    dataType: 'INTEGER',
    unit: 'years',
    min: 18,
    max: 99,
  },
  { code: 'mileage_policy', dataType: 'ENUM' },
];

const ATTRIBUTE_OPTIONS = {
  star_rating: ['1', '2', '3', '4', '5'],
  price_tier: ['$', '$$', '$$$', '$$$$'],
  cuisine: [
    'ARMENIAN',
    'GEORGIAN',
    'ITALIAN',
    'MEDITERRANEAN',
    'EUROPEAN',
    'ASIAN',
  ],
  difficulty: ['EASY', 'MODERATE', 'CHALLENGING'],
  transmission: ['MANUAL', 'AUTOMATIC'],
  property_style: ['BOUTIQUE', 'BUSINESS', 'RESORT', 'BUDGET'],
  view_type: ['SEA', 'MOUNTAIN', 'CITY', 'GARDEN', 'NONE'],
  languages_offered: ['EN', 'HY', 'RU'],
  meeting_point_type: ['HOTEL_PICKUP', 'FIXED_LOCATION'],
  fuel_type: ['PETROL', 'DIESEL', 'ELECTRIC', 'HYBRID'],
  mileage_policy: ['UNLIMITED', 'LIMITED'],
};

const CATEGORY_ATTRIBUTES = {
  hotels: ['star_rating', 'property_style', 'total_rooms'],
  apartments: [
    'bedrooms',
    'bathrooms',
    'beds',
    'max_guests',
    'view_type',
    'floor_area_sqm',
  ],
  villas: [
    'bedrooms',
    'bathrooms',
    'beds',
    'max_guests',
    'view_type',
    'floor_area_sqm',
  ],
  'guest-houses': [
    'bedrooms',
    'bathrooms',
    'beds',
    'max_guests',
    'view_type',
    'floor_area_sqm',
  ],
  restaurants: ['cuisine', 'price_tier'],
  tours: [
    'duration_minutes',
    'difficulty',
    'max_group_size',
    'languages_offered',
    'meeting_point_type',
  ],
  'car-rentals': [
    'transmission',
    'seats',
    'fuel_type',
    'doors',
    'luggage_capacity',
    'min_driver_age',
    'mileage_policy',
  ],
  attractions: ['duration_minutes', 'languages_offered', 'max_group_size'],
  // Sprint I: reuses the same attribute definitions Attractions already
  // uses (an escape room/VR session/bowling lane is the same "scheduled,
  // capacity-limited experience" shape) — no new attribute_definitions
  // row. `languages_offered` is dropped: most entertainment venues run a
  // fixed-language activity, not a guided tour.
  'entertainment-venues': ['duration_minutes', 'max_group_size'],
};

const CATEGORY_AMENITIES = {
  hotels: [
    'WiFi',
    'Parking',
    'Pool',
    'Air Conditioning',
    'Breakfast Included',
    'Airport Shuttle',
    'Non-Smoking Rooms',
    'Gym',
    'Business Center',
    'Elevator',
    'Security',
    'Family Friendly',
    'Wheelchair Accessible',
    // Sprint C-1 (Accommodation room-level product data) — the Partner's
    // room-amenity picker reuses this exact same `GET /listings/metadata
    // ?categoryId=X` call the listing-level Amenities step already makes
    // (same component, same hook), rather than a second amenities
    // endpoint with its own category-scoping rules. A hotel legitimately
    // advertising "TV in every room" as a listing-level amenity too is a
    // reasonable, non-conflicting overlap, not a modeling bug.
    'Minibar',
    'TV',
    'Kettle',
    'Desk',
    'Safe',
    'Kitchenette',
    'Balcony',
    'Washing Machine',
  ],
  apartments: [
    'WiFi',
    'Parking',
    'Air Conditioning',
    'Kitchen',
    'Washing Machine',
    'Elevator',
    'Family Friendly',
    'Pet Friendly',
    'EV Charger',
  ],
  villas: [
    'WiFi',
    'Parking',
    'Pool',
    'Jacuzzi',
    'Sauna',
    'Garden',
    'BBQ',
    'Terrace',
    'Balcony',
    'Fireplace',
    'Air Conditioning',
    'Kitchen',
    'Family Friendly',
    'Pet Friendly',
    'EV Charger',
  ],
  'guest-houses': [
    'WiFi',
    'Parking',
    'Breakfast Included',
    'Garden',
    'Kitchen',
    'Family Friendly',
    'Pet Friendly',
    'Air Conditioning',
  ],
  restaurants: [
    'WiFi',
    'Parking',
    'Air Conditioning',
    'Outdoor Seating',
    'Live Music',
    'Non-Smoking Rooms',
    'Family Friendly',
    'Wheelchair Accessible',
  ],
  tours: ['Family Friendly', 'Wheelchair Accessible'],
  'car-rentals': ['EV Charger', 'Air Conditioning'],
  attractions: ['Wheelchair Accessible', 'Family Friendly', 'Parking'],
  // Sprint I: same amenity set as Attractions plus Air Conditioning —
  // most entertainment venues (escape rooms, VR/gaming centers, bowling)
  // are indoor, unlike Attractions' broader outdoor/sightseeing mix.
  'entertainment-venues': [
    'Wheelchair Accessible',
    'Family Friendly',
    'Parking',
    'Air Conditioning',
  ],
};

const FILTER_DEFINITIONS = [
  {
    code: 'bedrooms',
    group: 'ROOMS',
    inputType: 'STEPPER',
    valueSource: 'ATTRIBUTE',
    attributeCode: 'bedrooms',
    unit: 'rooms',
    sortOrder: 1,
  },
  {
    code: 'bathrooms',
    group: 'ROOMS',
    inputType: 'STEPPER',
    valueSource: 'ATTRIBUTE',
    attributeCode: 'bathrooms',
    unit: 'rooms',
    sortOrder: 2,
  },
  {
    code: 'beds',
    group: 'ROOMS',
    inputType: 'STEPPER',
    valueSource: 'ATTRIBUTE',
    attributeCode: 'beds',
    unit: 'beds',
    sortOrder: 3,
  },
  {
    code: 'max_guests',
    group: 'ROOMS',
    inputType: 'STEPPER',
    valueSource: 'ATTRIBUTE',
    attributeCode: 'max_guests',
    unit: 'guests',
    sortOrder: 4,
  },
  {
    code: 'star_rating',
    group: 'RATING',
    inputType: 'SINGLE_SELECT',
    valueSource: 'ATTRIBUTE',
    attributeCode: 'star_rating',
    sortOrder: 1,
  },
  {
    code: 'price_tier',
    group: 'DINING',
    inputType: 'SINGLE_SELECT',
    valueSource: 'ATTRIBUTE',
    attributeCode: 'price_tier',
    sortOrder: 1,
  },
  {
    code: 'cuisine',
    group: 'DINING',
    inputType: 'MULTI_SELECT',
    valueSource: 'ATTRIBUTE',
    attributeCode: 'cuisine',
    sortOrder: 2,
  },
  {
    code: 'duration_minutes',
    group: 'EXPERIENCE',
    inputType: 'RANGE',
    valueSource: 'ATTRIBUTE',
    attributeCode: 'duration_minutes',
    unit: 'minutes',
    sortOrder: 1,
  },
  {
    code: 'difficulty',
    group: 'EXPERIENCE',
    inputType: 'SINGLE_SELECT',
    valueSource: 'ATTRIBUTE',
    attributeCode: 'difficulty',
    sortOrder: 2,
  },
  {
    code: 'max_group_size',
    group: 'EXPERIENCE',
    inputType: 'STEPPER',
    valueSource: 'ATTRIBUTE',
    attributeCode: 'max_group_size',
    unit: 'people',
    sortOrder: 3,
  },
  {
    code: 'transmission',
    group: 'VEHICLE',
    inputType: 'SINGLE_SELECT',
    valueSource: 'ATTRIBUTE',
    attributeCode: 'transmission',
    sortOrder: 1,
  },
  {
    code: 'seats',
    group: 'VEHICLE',
    inputType: 'STEPPER',
    valueSource: 'ATTRIBUTE',
    attributeCode: 'seats',
    unit: 'seats',
    sortOrder: 2,
  },
  {
    code: 'amenity_ids',
    group: 'AMENITIES',
    inputType: 'MULTI_SELECT',
    valueSource: 'AMENITY',
    isGlobal: true,
    sortOrder: 1,
  },
];

export default async function seedSearchFilters(connection) {
  await upsertByCode(connection, 'attribute_data_types', ATTRIBUTE_DATA_TYPES);
  await upsertByCode(connection, 'filter_input_types', FILTER_INPUT_TYPES);
  await upsertByCode(connection, 'filter_groups', FILTER_GROUPS);
  await upsertByCode(connection, 'amenity_groups', AMENITY_GROUPS);

  const [dataTypeRows] = await connection.query(
    'SELECT id, code FROM attribute_data_types',
  );
  const dataTypeIdsByCode = new Map(dataTypeRows.map((r) => [r.code, r.id]));

  const [inputTypeRows] = await connection.query(
    'SELECT id, code FROM filter_input_types',
  );
  const filterInputTypeIdsByCode = new Map(
    inputTypeRows.map((r) => [r.code, r.id]),
  );

  const [groupRows] = await connection.query(
    'SELECT id, code FROM filter_groups',
  );
  const filterGroupIdsByCode = new Map(groupRows.map((r) => [r.code, r.id]));

  const [amenityGroupRows] = await connection.query(
    'SELECT id, code FROM amenity_groups',
  );
  const amenityGroupIdsByCode = new Map(
    amenityGroupRows.map((r) => [r.code, r.id]),
  );

  // Amenities: name -> id, grouped.
  const languageIds = await getIdsByCode(connection, 'languages', [
    'en',
    'hy',
    'ru',
  ]);
  const amenityIdsByName = new Map();
  // eslint-disable-next-line no-restricted-syntax -- seeding must run in a stable, readable order
  for (const [name, groupCode] of AMENITIES) {
    // eslint-disable-next-line no-await-in-loop -- sequential by design
    const id = await upsertAmenityByName(
      connection,
      name,
      groupCode,
      amenityGroupIdsByCode,
    );
    amenityIdsByName.set(name, id);

    const translations = AMENITY_TRANSLATIONS[name];
    // eslint-disable-next-line no-restricted-syntax -- seeding must run in a stable, readable order
    for (const [languageCode, translatedName] of Object.entries(translations)) {
      // eslint-disable-next-line no-await-in-loop -- sequential by design
      await upsertAmenityTranslation(connection, {
        amenityId: id,
        languageId: languageIds.get(languageCode),
        name: translatedName,
      });
    }
  }

  // Attribute definitions.
  const attributeDefinitionIdsByCode = new Map();
  // eslint-disable-next-line no-restricted-syntax -- seeding must run in a stable, readable order
  for (const def of ATTRIBUTE_DEFINITIONS) {
    // eslint-disable-next-line no-await-in-loop -- sequential by design
    const id = await upsertAttributeDefinition(
      connection,
      def,
      dataTypeIdsByCode,
    );
    attributeDefinitionIdsByCode.set(def.code, id);
  }

  // Attribute options (ENUM/MULTI_ENUM).
  // eslint-disable-next-line no-restricted-syntax -- seeding must run in a stable, readable order
  for (const [attributeCode, optionCodes] of Object.entries(
    ATTRIBUTE_OPTIONS,
  )) {
    const attributeDefinitionId =
      attributeDefinitionIdsByCode.get(attributeCode);
    // eslint-disable-next-line no-restricted-syntax -- seeding must run in a stable, readable order
    for (const [index, optionCode] of optionCodes.entries()) {
      // eslint-disable-next-line no-await-in-loop -- sequential by design
      await upsertAttributeOption(
        connection,
        attributeDefinitionId,
        optionCode,
        index,
      );
    }
  }

  // Category <-> attribute links.
  // eslint-disable-next-line no-restricted-syntax -- seeding must run in a stable, readable order
  for (const [categorySlug, attributeCodes] of Object.entries(
    CATEGORY_ATTRIBUTES,
  )) {
    // eslint-disable-next-line no-await-in-loop -- sequential by design
    const categoryId = await upsertCategoryBySlug(connection, categorySlug);
    // eslint-disable-next-line no-restricted-syntax -- seeding must run in a stable, readable order
    for (const [index, attributeCode] of attributeCodes.entries()) {
      const attributeDefinitionId =
        attributeDefinitionIdsByCode.get(attributeCode);
      // eslint-disable-next-line no-await-in-loop -- sequential by design
      await upsertCategoryAttribute(
        connection,
        categoryId,
        attributeDefinitionId,
        index,
      );
    }
  }

  // Category <-> amenity links.
  // eslint-disable-next-line no-restricted-syntax -- seeding must run in a stable, readable order
  for (const [categorySlug, amenityNames] of Object.entries(
    CATEGORY_AMENITIES,
  )) {
    // eslint-disable-next-line no-await-in-loop -- sequential by design
    const categoryId = await upsertCategoryBySlug(connection, categorySlug);
    // eslint-disable-next-line no-restricted-syntax -- seeding must run in a stable, readable order
    for (const amenityName of amenityNames) {
      const amenityId = amenityIdsByName.get(amenityName);
      // eslint-disable-next-line no-await-in-loop -- sequential by design
      await upsertAmenityApplicability(connection, amenityId, categoryId);
    }
  }

  // Filter definitions.
  // eslint-disable-next-line no-restricted-syntax -- seeding must run in a stable, readable order
  for (const def of FILTER_DEFINITIONS) {
    // eslint-disable-next-line no-await-in-loop -- sequential by design
    await upsertFilterDefinition(connection, def, {
      filterGroupIdsByCode,
      filterInputTypeIdsByCode,
      attributeDefinitionIdsByCode,
    });
  }
}
