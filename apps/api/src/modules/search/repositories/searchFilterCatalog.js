/**
 * `GET /search/filters`'s catalog — every filter Search can offer for a
 * category, each with the exact query param it writes and how many
 * publicly visible listings in that category (its "scope") each option
 * would match.
 *
 * Two sources, one shape:
 * - declared: `filter_definitions` rows (attributes and amenities), shown
 *   for a category when `is_global` or their attribute is linked to it
 *   via `category_attributes` (§4.1 of the proposal);
 * - computed (`core/domain/searchComputedFilters.js`): category policies,
 *   room meal plans / hourly stays, and guest rating.
 *
 * Nothing is offered that cannot narrow the results: a definition no
 * listing in scope carries is left out, and every option carries its
 * `count`, so the UI never presents an option that can only empty the
 * page. Amenity labels come from `listing_amenity_translations` in the
 * requested language, falling back to the platform default language and
 * then to the canonical name — never English while a translation exists.
 * Attribute and policy options are stable codes the web app labels from
 * its translated catalog vocabulary.
 *
 * Read-only, small (a category has tens of filters, not thousands), and
 * cached per category + locale on the client.
 */

import { scopeActive } from '../../../infrastructure/database/softDelete.js';
import { scopePubliclyVisibleListing } from '../../listings/repositories/listingVisibilitySql.js';
import { MEAL_PLANS } from '../../../core/domain/roomAttributes.js';
import {
  POLICY_PARAM_PREFIX,
  ROOM_PARAM_PREFIX,
  FILTERABLE_POLICY_DATA_TYPES,
  TOGGLE_ON_VALUE,
  ROOM_FILTERS,
  RATING_PARAM,
  GUEST_RATING_FILTER_CODE,
  RATING_THRESHOLDS,
} from '../../../core/domain/searchComputedFilters.js';
import {
  ENUM_DATA_TYPE_CODES,
  ATTRIBUTE_VALUE_TABLES,
} from './attributeValueTables.js';

const NUMERIC_VALUE_TABLES = ['INTEGER', 'DECIMAL', 'DATE'].map(
  (code) => ATTRIBUTE_VALUE_TABLES[code],
);

const GROUPS = Object.freeze({
  RATING: 'RATING',
  BOOKING: 'BOOKING',
});

/** Room facts take the first sort slots of BOOKING; policies follow. */
const POLICY_SORT_OFFSET = 10;

/** `listings` rows a Search visitor can actually see, optionally narrowed to one category. */
function scopeSql(categoryId) {
  const categoryJoin =
    categoryId !== undefined
      ? 'JOIN listing_category_listing scope_lcl ON scope_lcl.listing_id = l.id AND scope_lcl.category_id = ?'
      : '';
  return {
    sql: `
      SELECT l.id FROM listings l
      JOIN listing_statuses ls ON ls.id = l.status_id
      ${categoryJoin}
      WHERE ${scopeActive('l')} AND ${scopePubliclyVisibleListing()}
    `,
    params: categoryId !== undefined ? [categoryId] : [],
  };
}

function countMap(rows, keyColumn = 'id') {
  return new Map(rows.map((row) => [row[keyColumn], Number(row.n)]));
}

function definition({
  code,
  groupCode,
  groupSortOrder,
  sortOrder,
  inputType,
  valueSource,
  param,
  isAdvanced,
  listingCount,
  options = [],
  unit = null,
  min = null,
  max = null,
}) {
  return {
    code,
    groupCode,
    groupSortOrder,
    sortOrder,
    inputType,
    valueSource,
    param,
    isAdvanced,
    listingCount,
    options,
    unit,
    min,
    max,
  };
}

async function loadDeclaredDefinitions(pool, categoryId, scope, locale) {
  const conditions = ['fd.is_global = 1'];
  const params = [];
  if (categoryId !== undefined) {
    conditions.push(
      `(fd.value_source = 'ATTRIBUTE' AND ad.id IN (
         SELECT attribute_definition_id FROM category_attributes WHERE category_id = ?
       ))`,
    );
    params.push(categoryId);
  }
  const [rows] = await pool.query(
    `
    SELECT
      fg.code AS group_code, fg.sort_order AS group_sort_order,
      fd.code AS filter_code, fd.sort_order AS filter_sort_order,
      fd.value_source, fd.unit AS filter_unit, fd.is_advanced,
      fit.code AS input_type_code,
      ad.id AS attribute_definition_id, ad.code AS attribute_code,
      ad.validation_min, ad.validation_max, adt.code AS data_type_code
    FROM filter_definitions fd
    JOIN filter_groups fg ON fg.id = fd.filter_group_id
    JOIN filter_input_types fit ON fit.id = fd.input_type_id
    LEFT JOIN attribute_definitions ad ON ad.id = fd.attribute_definition_id
    LEFT JOIN attribute_data_types adt ON adt.id = ad.data_type_id
    WHERE ${conditions.join(' OR ')}
    `,
    params,
  );

  const attributeIds = rows
    .filter((row) => row.attribute_definition_id !== null)
    .map((row) => row.attribute_definition_id);
  const hasAmenityFilter = rows.some((row) => row.value_source === 'AMENITY');

  const [optionRows, optionCounts, valueCounts, amenityRows] =
    await Promise.all([
      attributeIds.length > 0
        ? pool
            .query(
              `SELECT id, attribute_definition_id, code FROM attribute_options
               WHERE attribute_definition_id IN (?) ORDER BY sort_order ASC`,
              [attributeIds],
            )
            .then(([result]) => result)
        : [],
      pool
        .query(
          `SELECT lao.attribute_option_id AS id, COUNT(DISTINCT lao.listing_id) AS n
           FROM listing_attribute_option lao
           JOIN (${scope.sql}) scope ON scope.id = lao.listing_id
           GROUP BY lao.attribute_option_id`,
          scope.params,
        )
        .then(([result]) => countMap(result)),
      pool
        .query(
          `SELECT id, COUNT(DISTINCT listing_id) AS n FROM (
             ${NUMERIC_VALUE_TABLES.map(
               (table) =>
                 `SELECT v.attribute_definition_id AS id, v.listing_id
                  FROM ${table} v JOIN (${scope.sql}) scope ON scope.id = v.listing_id`,
             ).join(' UNION ALL ')}
           ) numeric_values GROUP BY id`,
          NUMERIC_VALUE_TABLES.flatMap(() => scope.params),
        )
        .then(([result]) => countMap(result)),
      hasAmenityFilter && categoryId !== undefined
        ? pool
            .query(
              `SELECT la.id, la.name,
                 COALESCE(lat.name, lat2.name, la.name) AS label,
                 ag.code AS group_code, ag.sort_order AS group_sort_order,
                 COUNT(DISTINCT scope.id) AS n
               FROM listing_amenities la
               JOIN amenity_category_applicability aca
                 ON aca.amenity_id = la.id AND aca.category_id = ?
               LEFT JOIN amenity_groups ag ON ag.id = la.amenity_group_id
               LEFT JOIN listing_amenity_translations lat
                 ON lat.listing_amenity_id = la.id AND lat.language_id = ?
               LEFT JOIN listing_amenity_translations lat2
                 ON lat2.listing_amenity_id = la.id AND lat2.language_id = ?
               LEFT JOIN listing_amenity_listing lal ON lal.amenity_id = la.id
               LEFT JOIN (${scope.sql}) scope ON scope.id = lal.listing_id
               GROUP BY la.id, la.name, label, ag.code, ag.sort_order
               ORDER BY ag.sort_order IS NULL, ag.sort_order, label`,
              [
                categoryId,
                locale.localeId,
                locale.defaultLocaleId,
                ...scope.params,
              ],
            )
            .then(([result]) => result)
        : [],
    ]);

  const optionsByAttribute = new Map();
  optionRows.forEach((option) => {
    if (!optionsByAttribute.has(option.attribute_definition_id)) {
      optionsByAttribute.set(option.attribute_definition_id, []);
    }
    optionsByAttribute.get(option.attribute_definition_id).push({
      value: option.id,
      code: option.code,
      count: optionCounts.get(option.id) ?? 0,
    });
  });

  return rows.map((row) => {
    const shared = {
      code: row.filter_code,
      groupCode: row.group_code,
      groupSortOrder: row.group_sort_order,
      sortOrder: row.filter_sort_order,
      inputType: row.input_type_code,
      valueSource: row.value_source,
      isAdvanced: Boolean(row.is_advanced),
      unit: row.filter_unit,
    };
    if (row.value_source === 'AMENITY') {
      const options = amenityRows.map((amenity) => ({
        value: amenity.id,
        code: amenity.name,
        label: amenity.label,
        group: amenity.group_code,
        count: Number(amenity.n),
      }));
      return definition({
        ...shared,
        param: 'amenityIds',
        options,
        listingCount: Math.max(0, ...options.map((option) => option.count)),
      });
    }
    const param = `attr_${row.attribute_code}`;
    if (ENUM_DATA_TYPE_CODES.includes(row.data_type_code)) {
      const options = optionsByAttribute.get(row.attribute_definition_id) ?? [];
      return definition({
        ...shared,
        param,
        options,
        listingCount: options.reduce((sum, option) => sum + option.count, 0),
      });
    }
    return definition({
      ...shared,
      param,
      min: row.validation_min !== null ? Number(row.validation_min) : null,
      max: row.validation_max !== null ? Number(row.validation_max) : null,
      listingCount: valueCounts.get(row.attribute_definition_id) ?? 0,
    });
  });
}

async function loadPolicyDefinitions(pool, categoryId, scope) {
  if (categoryId === undefined) return [];
  const [policies] = await pool.query(
    `SELECT pd.id, pd.code, adt.code AS data_type_code, cp.sort_order
     FROM category_policies cp
     JOIN policy_definitions pd ON pd.id = cp.policy_definition_id
     JOIN attribute_data_types adt ON adt.id = pd.data_type_id
     WHERE cp.category_id = ? AND adt.code IN (?)`,
    [categoryId, FILTERABLE_POLICY_DATA_TYPES],
  );
  if (policies.length === 0) return [];
  const policyIds = policies.map((policy) => policy.id);
  const [[optionRows], [valueRows]] = await Promise.all([
    pool.query(
      `SELECT policy_definition_id, code FROM policy_options
       WHERE policy_definition_id IN (?) ORDER BY sort_order ASC`,
      [policyIds],
    ),
    pool.query(
      `SELECT lpv.policy_definition_id, lpv.value, COUNT(DISTINCT lpv.listing_id) AS n
       FROM listing_policy_values lpv
       JOIN (${scope.sql}) scope ON scope.id = lpv.listing_id
       WHERE lpv.policy_definition_id IN (?)
       GROUP BY lpv.policy_definition_id, lpv.value`,
      [...scope.params, policyIds],
    ),
  ]);
  const countOf = (policyId, value) =>
    Number(
      valueRows.find(
        (row) => row.policy_definition_id === policyId && row.value === value,
      )?.n ?? 0,
    );

  return policies.map((policy) => {
    const shared = {
      code: policy.code,
      groupCode: GROUPS.BOOKING,
      groupSortOrder: null,
      // After the room facts (meal plan, hourly stays) in the same group.
      sortOrder: POLICY_SORT_OFFSET + (policy.sort_order ?? 0),
      valueSource: 'POLICY',
      param: `${POLICY_PARAM_PREFIX}${policy.code}`,
      isAdvanced: true,
    };
    if (policy.data_type_code === 'BOOLEAN') {
      const count = countOf(policy.id, TOGGLE_ON_VALUE);
      return definition({
        ...shared,
        inputType: 'TOGGLE',
        listingCount: count,
        options: [{ value: TOGGLE_ON_VALUE, code: TOGGLE_ON_VALUE, count }],
      });
    }
    const options = optionRows
      .filter((option) => option.policy_definition_id === policy.id)
      .map((option) => ({
        value: option.code,
        code: option.code,
        count: countOf(policy.id, option.code),
      }));
    return definition({
      ...shared,
      inputType: 'MULTI_SELECT',
      options,
      listingCount: options.reduce((sum, option) => sum + option.count, 0),
    });
  });
}

async function loadRoomDefinitions(pool, categoryId, scope) {
  if (categoryId === undefined) return [];
  const [[mealPlanRows], [[hourly]]] = await Promise.all([
    pool.query(
      `SELECT bu.meal_plan AS id, COUNT(DISTINCT bu.listing_id) AS n
       FROM bookable_units bu JOIN (${scope.sql}) scope ON scope.id = bu.listing_id
       WHERE bu.deleted_at IS NULL AND bu.meal_plan IS NOT NULL
       GROUP BY bu.meal_plan`,
      scope.params,
    ),
    pool.query(
      `SELECT COUNT(DISTINCT bu.listing_id) AS n
       FROM bookable_units bu JOIN (${scope.sql}) scope ON scope.id = bu.listing_id
       WHERE bu.deleted_at IS NULL AND bu.hourly_enabled = 1`,
      scope.params,
    ),
  ]);
  const mealPlanCounts = countMap(mealPlanRows);
  const mealPlanOptions = MEAL_PLANS.map((code) => ({
    value: code,
    code,
    count: mealPlanCounts.get(code) ?? 0,
  }));
  const hourlyCount = Number(hourly.n);
  return [
    definition({
      code: ROOM_FILTERS.MEAL_PLAN,
      groupCode: GROUPS.BOOKING,
      groupSortOrder: null,
      sortOrder: 0,
      inputType: 'MULTI_SELECT',
      valueSource: 'ROOM',
      param: `${ROOM_PARAM_PREFIX}${ROOM_FILTERS.MEAL_PLAN}`,
      isAdvanced: false,
      options: mealPlanOptions,
      listingCount: mealPlanOptions.reduce(
        (sum, option) => sum + option.count,
        0,
      ),
    }),
    definition({
      code: ROOM_FILTERS.HOURLY_STAYS,
      groupCode: GROUPS.BOOKING,
      groupSortOrder: null,
      sortOrder: 1,
      inputType: 'TOGGLE',
      valueSource: 'ROOM',
      param: `${ROOM_PARAM_PREFIX}${ROOM_FILTERS.HOURLY_STAYS}`,
      isAdvanced: true,
      options: [
        { value: TOGGLE_ON_VALUE, code: TOGGLE_ON_VALUE, count: hourlyCount },
      ],
      listingCount: hourlyCount,
    }),
  ];
}

async function loadRatingDefinition(pool, scope) {
  const [rows] = await pool.query(
    `SELECT AVG(rv.rating) AS average
     FROM reviews rv
     JOIN moderation_statuses rs ON rs.id = rv.status_id
     JOIN (${scope.sql}) scope ON scope.id = rv.listing_id
     WHERE rs.code = 'APPROVED' AND rv.deleted_at IS NULL
     GROUP BY rv.listing_id`,
    scope.params,
  );
  const averages = rows.map((row) => Number(row.average));
  const options = RATING_THRESHOLDS.map((threshold) => ({
    value: String(threshold),
    code: String(threshold),
    count: averages.filter((average) => average >= threshold).length,
  }));
  return definition({
    code: GUEST_RATING_FILTER_CODE,
    groupCode: GROUPS.RATING,
    groupSortOrder: null,
    sortOrder: 1,
    inputType: 'SINGLE_SELECT',
    valueSource: 'REVIEW',
    param: RATING_PARAM,
    isAdvanced: false,
    options,
    listingCount: averages.length,
  });
}

/**
 * @param {import('mysql2/promise').Pool} pool
 * @param {{ categoryId?: number, localeId: number|null, defaultLocaleId: number|null }} input
 * @returns {Promise<Array<{ code: string, sortOrder: number, definitions: object[] }>>}
 */
export async function loadSearchFilterCatalog(
  pool,
  { categoryId, localeId, defaultLocaleId },
) {
  const scope = scopeSql(categoryId);
  const [declared, policies, rooms, rating, [groupRows]] = await Promise.all([
    loadDeclaredDefinitions(pool, categoryId, scope, {
      localeId,
      defaultLocaleId,
    }),
    loadPolicyDefinitions(pool, categoryId, scope),
    loadRoomDefinitions(pool, categoryId, scope),
    loadRatingDefinition(pool, scope),
    pool.query('SELECT code, sort_order FROM filter_groups'),
  ]);
  const groupOrder = new Map(
    groupRows.map((row) => [row.code, row.sort_order]),
  );

  const groups = new Map();
  [rating, ...declared, ...policies, ...rooms]
    .filter((filter) => filter.listingCount > 0)
    .forEach((filter) => {
      if (!groups.has(filter.groupCode)) {
        groups.set(filter.groupCode, {
          code: filter.groupCode,
          sortOrder:
            groupOrder.get(filter.groupCode) ?? Number.MAX_SAFE_INTEGER,
          definitions: [],
        });
      }
      groups.get(filter.groupCode).definitions.push(filter);
    });

  return Array.from(groups.values())
    .map((group) => ({
      ...group,
      definitions: group.definitions.sort((a, b) => a.sortOrder - b.sortOrder),
    }))
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

export default loadSearchFilterCatalog;
