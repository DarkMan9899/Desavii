/**
 * Seeds Phase 5's pricing-model and policy metadata (migration 0015) —
 * the same "lookup + category-scoping mapping table" pattern
 * `006_search_filters.js` already established for the Generic Attribute
 * Engine, applied to two new, additive concepts (see migration 0015's
 * header comment for why these are separate tables, not a modification of
 * `attribute_definitions`/`category_attributes`).
 *
 * `policy_definitions.code` values are plain strings (`pets_allowed`,
 * `cancellation_policy`, ...); like `attribute_definitions.code`, there is
 * no `name`/label column here — display labels are owned by frontend i18n
 * (`partner.listingWizard.policies.*`), the same convention Phase 4.2
 * established for attribute/filter labels.
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

async function upsertCategoryPricingModel(
  connection,
  categoryId,
  pricingModelId,
  sortOrder,
) {
  await connection.query(
    `INSERT INTO category_pricing_models (category_id, pricing_model_id, sort_order)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE sort_order = VALUES(sort_order)`,
    [categoryId, pricingModelId, sortOrder],
  );
}

async function upsertPolicyDefinition(connection, def, dataTypeIdsByCode) {
  const dataTypeId = dataTypeIdsByCode.get(def.dataType);
  await connection.query(
    `INSERT INTO policy_definitions (code, data_type_id, unit, is_multi_valued)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       data_type_id = VALUES(data_type_id), unit = VALUES(unit),
       is_multi_valued = VALUES(is_multi_valued)`,
    [def.code, dataTypeId, def.unit ?? null, def.multi ? 1 : 0],
  );
  const [[row]] = await connection.query(
    'SELECT id FROM policy_definitions WHERE code = ?',
    [def.code],
  );
  return row.id;
}

async function upsertPolicyOption(
  connection,
  policyDefinitionId,
  code,
  sortOrder,
) {
  await connection.query(
    `INSERT INTO policy_options (policy_definition_id, code, sort_order)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE sort_order = VALUES(sort_order)`,
    [policyDefinitionId, code, sortOrder],
  );
}

async function upsertCategoryPolicy(
  connection,
  categoryId,
  policyDefinitionId,
  isRequired,
  sortOrder,
) {
  await connection.query(
    `INSERT INTO category_policies (category_id, policy_definition_id, is_required, sort_order)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE is_required = VALUES(is_required), sort_order = VALUES(sort_order)`,
    [categoryId, policyDefinitionId, isRequired ? 1 : 0, sortOrder],
  );
}

// --- Data --------------------------------------------------------------

const PRICING_MODELS = [
  { code: 'PER_NIGHT', name: 'Per night' },
  { code: 'PER_PERSON', name: 'Per person' },
  { code: 'PER_DAY', name: 'Per day' },
  { code: 'PER_HOUR', name: 'Per hour' },
];

const CATEGORY_PRICING_MODELS = {
  hotels: ['PER_NIGHT'],
  apartments: ['PER_NIGHT'],
  villas: ['PER_NIGHT'],
  'guest-houses': ['PER_NIGHT'],
  restaurants: ['PER_PERSON'],
  tours: ['PER_PERSON', 'PER_HOUR'],
  'car-rentals': ['PER_DAY'],
  attractions: ['PER_PERSON'],
  // Sprint I: PER_PERSON for admission-style pricing (escape room per
  // player), PER_HOUR for time-block rentals (a bowling lane, a VR pod)
  // — both pricing models already exist.
  'entertainment-venues': ['PER_PERSON', 'PER_HOUR'],
};

const POLICY_DEFINITIONS = [
  { code: 'pets_allowed', dataType: 'BOOLEAN' },
  { code: 'smoking_allowed', dataType: 'BOOLEAN' },
  { code: 'children_allowed', dataType: 'BOOLEAN' },
  { code: 'cancellation_policy', dataType: 'ENUM' },
  { code: 'check_in_time', dataType: 'STRING' },
  { code: 'check_out_time', dataType: 'STRING' },
];

const POLICY_OPTIONS = {
  cancellation_policy: ['FLEXIBLE', 'MODERATE', 'STRICT'],
};

// category slug -> [{ code, isRequired }]
const CATEGORY_POLICIES = {
  hotels: [
    { code: 'pets_allowed', isRequired: false },
    { code: 'smoking_allowed', isRequired: false },
    { code: 'children_allowed', isRequired: false },
    { code: 'cancellation_policy', isRequired: true },
    { code: 'check_in_time', isRequired: true },
    { code: 'check_out_time', isRequired: true },
  ],
  apartments: [
    { code: 'pets_allowed', isRequired: false },
    { code: 'smoking_allowed', isRequired: false },
    { code: 'children_allowed', isRequired: false },
    { code: 'cancellation_policy', isRequired: true },
    { code: 'check_in_time', isRequired: true },
    { code: 'check_out_time', isRequired: true },
  ],
  villas: [
    { code: 'pets_allowed', isRequired: false },
    { code: 'smoking_allowed', isRequired: false },
    { code: 'children_allowed', isRequired: false },
    { code: 'cancellation_policy', isRequired: true },
    { code: 'check_in_time', isRequired: true },
    { code: 'check_out_time', isRequired: true },
  ],
  'guest-houses': [
    { code: 'pets_allowed', isRequired: false },
    { code: 'smoking_allowed', isRequired: false },
    { code: 'children_allowed', isRequired: false },
    { code: 'cancellation_policy', isRequired: true },
    { code: 'check_in_time', isRequired: true },
    { code: 'check_out_time', isRequired: true },
  ],
  restaurants: [
    { code: 'smoking_allowed', isRequired: false },
    { code: 'children_allowed', isRequired: false },
  ],
  tours: [
    { code: 'cancellation_policy', isRequired: true },
    { code: 'children_allowed', isRequired: false },
  ],
  'car-rentals': [
    { code: 'smoking_allowed', isRequired: false },
    { code: 'cancellation_policy', isRequired: true },
  ],
  attractions: [{ code: 'children_allowed', isRequired: false }],
  'entertainment-venues': [{ code: 'children_allowed', isRequired: false }],
};

export default async function seedPricingAndPolicies(connection) {
  await upsertByCode(connection, 'pricing_models', PRICING_MODELS);

  const pricingModelIdsByCode = await getIdsByCode(
    connection,
    'pricing_models',
    PRICING_MODELS.map((m) => m.code),
  );

  // eslint-disable-next-line no-restricted-syntax -- seeding must run in a stable, readable order
  for (const [categorySlug, modelCodes] of Object.entries(
    CATEGORY_PRICING_MODELS,
  )) {
    // eslint-disable-next-line no-await-in-loop -- sequential by design
    const categoryId = await upsertCategoryBySlug(connection, categorySlug);
    // eslint-disable-next-line no-restricted-syntax -- seeding must run in a stable, readable order
    for (const [index, modelCode] of modelCodes.entries()) {
      const pricingModelId = pricingModelIdsByCode.get(modelCode);
      // eslint-disable-next-line no-await-in-loop -- sequential by design
      await upsertCategoryPricingModel(
        connection,
        categoryId,
        pricingModelId,
        index,
      );
    }
  }

  const dataTypeRows = await connection.query(
    'SELECT id, code FROM attribute_data_types',
  );
  const dataTypeIdsByCode = new Map(
    dataTypeRows[0].map((row) => [row.code, row.id]),
  );

  const policyDefinitionIdsByCode = new Map();
  // eslint-disable-next-line no-restricted-syntax -- seeding must run in a stable, readable order
  for (const def of POLICY_DEFINITIONS) {
    // eslint-disable-next-line no-await-in-loop -- sequential by design
    const id = await upsertPolicyDefinition(connection, def, dataTypeIdsByCode);
    policyDefinitionIdsByCode.set(def.code, id);
  }

  // eslint-disable-next-line no-restricted-syntax -- seeding must run in a stable, readable order
  for (const [policyCode, optionCodes] of Object.entries(POLICY_OPTIONS)) {
    const policyDefinitionId = policyDefinitionIdsByCode.get(policyCode);
    // eslint-disable-next-line no-restricted-syntax -- seeding must run in a stable, readable order
    for (const [index, optionCode] of optionCodes.entries()) {
      // eslint-disable-next-line no-await-in-loop -- sequential by design
      await upsertPolicyOption(
        connection,
        policyDefinitionId,
        optionCode,
        index,
      );
    }
  }

  // eslint-disable-next-line no-restricted-syntax -- seeding must run in a stable, readable order
  for (const [categorySlug, policies] of Object.entries(CATEGORY_POLICIES)) {
    // eslint-disable-next-line no-await-in-loop -- sequential by design
    const categoryId = await upsertCategoryBySlug(connection, categorySlug);
    // eslint-disable-next-line no-restricted-syntax -- seeding must run in a stable, readable order
    for (const [index, policy] of policies.entries()) {
      const policyDefinitionId = policyDefinitionIdsByCode.get(policy.code);
      // eslint-disable-next-line no-await-in-loop -- sequential by design
      await upsertCategoryPolicy(
        connection,
        categoryId,
        policyDefinitionId,
        policy.isRequired,
        index,
      );
    }
  }
}
