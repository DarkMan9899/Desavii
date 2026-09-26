/**
 * MySQL-backed Listing Metadata repository — Phase 5's read side of the
 * Partner Listing Wizard ("what can a partner set for category X").
 *
 * Deliberately separate from `mysqlListingRepository.js` (which owns
 * `listings`/translations/locations/category+amenity links/media only,
 * per its own header comment) since this repository reads FOUR different
 * metadata systems: the Generic Attribute Engine (`category_attributes`/
 * `attribute_definitions`/`attribute_options`, migration 0014, READ-ONLY —
 * never modified), amenities (`amenity_category_applicability`/
 * `listing_amenities`/`amenity_groups`, also migration 0014, READ-ONLY),
 * and the two new Phase 5 metadata systems (`category_pricing_models`/
 * `pricing_models`, `category_policies`/`policy_definitions`/
 * `policy_options`, migration 0015).
 *
 * This is a *different* query shape from `mysqlSearchRepository.
 * getFilterDefinitions` (which derives *filter* visibility via
 * `filter_definitions`/`filter_groups` for search) — this one derives raw
 * *data-entry* metadata (full options, `is_required`, no filter-group
 * collapsing, no AMENITY-as-one-filter-row). Two legitimately different
 * reads over an overlapping subset of tables, not duplicated logic — the
 * Dynamic Filter System's own code is never imported or modified here.
 */

import { getMysqlPool } from '../../../infrastructure/database/mysqlPool.js';

const ENUM_DATA_TYPE_CODES = ['ENUM', 'MULTI_ENUM'];

function toAttributeMetadata(row) {
  return {
    id: row.id,
    code: row.code,
    dataTypeCode: row.data_type_code,
    unit: row.unit,
    validationMin:
      row.validation_min !== null ? Number(row.validation_min) : null,
    validationMax:
      row.validation_max !== null ? Number(row.validation_max) : null,
    isMultiValued: Boolean(row.is_multi_valued),
    isRequired: Boolean(row.is_required),
    options: [],
  };
}

function toPolicyMetadata(row) {
  return {
    id: row.id,
    code: row.code,
    dataTypeCode: row.data_type_code,
    unit: row.unit,
    isMultiValued: Boolean(row.is_multi_valued),
    isRequired: Boolean(row.is_required),
    options: [],
  };
}

export class MySqlListingMetadataRepository {
  #pool;

  constructor(pool = getMysqlPool()) {
    this.#pool = pool;
  }

  async #getAttributes(categoryId) {
    const [rows] = await this.#pool.query(
      `SELECT
         ad.id, ad.code, adt.code AS data_type_code, ad.unit,
         ad.validation_min, ad.validation_max, ad.is_multi_valued,
         ca.is_required, ca.sort_order
       FROM category_attributes ca
       JOIN attribute_definitions ad ON ad.id = ca.attribute_definition_id
       JOIN attribute_data_types adt ON adt.id = ad.data_type_id
       WHERE ca.category_id = ?
       ORDER BY ca.sort_order ASC`,
      [categoryId],
    );
    const attributes = rows.map(toAttributeMetadata);

    const enumAttributeIds = attributes
      .filter((attribute) =>
        ENUM_DATA_TYPE_CODES.includes(attribute.dataTypeCode),
      )
      .map((attribute) => attribute.id);
    if (enumAttributeIds.length === 0) {
      return attributes;
    }

    const [optionRows] = await this.#pool.query(
      `SELECT id, attribute_definition_id, code FROM attribute_options
       WHERE attribute_definition_id IN (?) ORDER BY sort_order ASC`,
      [enumAttributeIds],
    );
    const optionsByAttributeId = new Map();
    optionRows.forEach((row) => {
      if (!optionsByAttributeId.has(row.attribute_definition_id)) {
        optionsByAttributeId.set(row.attribute_definition_id, []);
      }
      optionsByAttributeId
        .get(row.attribute_definition_id)
        .push({ value: row.id, code: row.code });
    });

    return attributes.map((attribute) => ({
      ...attribute,
      options: optionsByAttributeId.get(attribute.id) ?? [],
    }));
  }

  async #getAmenityGroups(categoryId, { localeId, defaultLocaleId }) {
    const [rows] = await this.#pool.query(
      `SELECT
         la.id, COALESCE(lat.name, lat2.name, la.name) AS name,
         ag.code AS group_code, ag.name AS group_name, ag.sort_order AS group_sort_order
       FROM amenity_category_applicability aca
       JOIN listing_amenities la ON la.id = aca.amenity_id
       LEFT JOIN listing_amenity_translations lat ON lat.listing_amenity_id = la.id AND lat.language_id = ?
       LEFT JOIN listing_amenity_translations lat2 ON lat2.listing_amenity_id = la.id AND lat2.language_id = ?
       LEFT JOIN amenity_groups ag ON ag.id = la.amenity_group_id
       WHERE aca.category_id = ?
       ORDER BY COALESCE(ag.sort_order, 999), name ASC`,
      [localeId, defaultLocaleId, categoryId],
    );

    const groupsByCode = new Map();
    rows.forEach((row) => {
      const groupCode = row.group_code ?? 'OTHER';
      if (!groupsByCode.has(groupCode)) {
        groupsByCode.set(groupCode, {
          code: groupCode,
          sortOrder: row.group_sort_order ?? 999,
          amenities: [],
        });
      }
      groupsByCode.get(groupCode).amenities.push({
        value: row.id,
        code: row.name,
      });
    });

    return Array.from(groupsByCode.values()).sort(
      (a, b) => a.sortOrder - b.sortOrder,
    );
  }

  async #getPricingModels(categoryId) {
    const [rows] = await this.#pool.query(
      `SELECT pm.id, pm.code, pm.name
       FROM category_pricing_models cpm
       JOIN pricing_models pm ON pm.id = cpm.pricing_model_id
       WHERE cpm.category_id = ?
       ORDER BY cpm.sort_order ASC`,
      [categoryId],
    );
    return rows.map((row) => ({ id: row.id, code: row.code, name: row.name }));
  }

  async #getPolicies(categoryId) {
    const [rows] = await this.#pool.query(
      `SELECT
         pd.id, pd.code, adt.code AS data_type_code, pd.unit, pd.is_multi_valued,
         cp.is_required, cp.sort_order
       FROM category_policies cp
       JOIN policy_definitions pd ON pd.id = cp.policy_definition_id
       JOIN attribute_data_types adt ON adt.id = pd.data_type_id
       WHERE cp.category_id = ?
       ORDER BY cp.sort_order ASC`,
      [categoryId],
    );
    const policies = rows.map(toPolicyMetadata);

    const enumPolicyIds = policies
      .filter((policy) => ENUM_DATA_TYPE_CODES.includes(policy.dataTypeCode))
      .map((policy) => policy.id);
    if (enumPolicyIds.length === 0) {
      return policies;
    }

    const [optionRows] = await this.#pool.query(
      `SELECT id, policy_definition_id, code FROM policy_options
       WHERE policy_definition_id IN (?) ORDER BY sort_order ASC`,
      [enumPolicyIds],
    );
    const optionsByPolicyId = new Map();
    optionRows.forEach((row) => {
      if (!optionsByPolicyId.has(row.policy_definition_id)) {
        optionsByPolicyId.set(row.policy_definition_id, []);
      }
      optionsByPolicyId
        .get(row.policy_definition_id)
        .push({ value: row.id, code: row.code });
    });

    return policies.map((policy) => ({
      ...policy,
      options: optionsByPolicyId.get(policy.id) ?? [],
    }));
  }

  /**
   * @param {number} categoryId
   * @param {{localeId: number|null, defaultLocaleId: number|null}} locale - amenity
   *   names are free-text DB rows (unlike attributes/policies, which the
   *   frontend translates by `code`), so they alone need locale resolution.
   * @returns {Promise<{attributes: object[], amenityGroups: object[], pricingModels: object[], policies: object[]}>}
   */
  async getMetadataForCategory(categoryId, locale) {
    const [attributes, amenityGroups, pricingModels, policies] =
      await Promise.all([
        this.#getAttributes(categoryId),
        this.#getAmenityGroups(categoryId, locale),
        this.#getPricingModels(categoryId),
        this.#getPolicies(categoryId),
      ]);
    return { attributes, amenityGroups, pricingModels, policies };
  }

  // --- Write-side code resolution (ListingService validates/resolves the
  // wizard's attributeValues/policyValues/pricing payloads against these
  // before writing — the wizard only ever deals in codes, never internal
  // ids, same convention search's attr_{code} params use) ---

  /** @returns {Promise<Map<string, {id: number, dataTypeCode: string}>>} */
  // Scoped to one category through the same `category_attributes` link
  // the metadata read uses, so a code that exists globally but isn't
  // offered for the listing's category is treated as unknown (likewise
  // for policies and pricing models below).
  async getAttributeDefinitionsByCode(codes, categoryId) {
    if (codes.length === 0) return new Map();
    const [rows] = await this.#pool.query(
      `SELECT ad.code, ad.id, ad.validation_min, ad.validation_max, adt.code AS data_type_code
       FROM category_attributes ca
       JOIN attribute_definitions ad ON ad.id = ca.attribute_definition_id
       JOIN attribute_data_types adt ON adt.id = ad.data_type_id
       WHERE ca.category_id = ? AND ad.code IN (?)`,
      [categoryId, codes],
    );
    return new Map(
      rows.map((row) => [
        row.code,
        {
          id: row.id,
          dataTypeCode: row.data_type_code,
          validationMin:
            row.validation_min !== null ? Number(row.validation_min) : null,
          validationMax:
            row.validation_max !== null ? Number(row.validation_max) : null,
        },
      ]),
    );
  }

  /** @returns {Promise<Map<string, number>>} option code -> id, scoped to one attribute */
  async getAttributeOptionIdsByCode(attributeDefinitionId, codes) {
    if (codes.length === 0) return new Map();
    const [rows] = await this.#pool.query(
      `SELECT id, code FROM attribute_options
       WHERE attribute_definition_id = ? AND code IN (?)`,
      [attributeDefinitionId, codes],
    );
    return new Map(rows.map((row) => [row.code, row.id]));
  }

  /** @returns {Promise<Map<string, {id: number, dataTypeCode: string}>>} */
  async getPolicyDefinitionsByCode(codes, categoryId) {
    if (codes.length === 0) return new Map();
    const [rows] = await this.#pool.query(
      `SELECT pd.code, pd.id, adt.code AS data_type_code
       FROM category_policies cp
       JOIN policy_definitions pd ON pd.id = cp.policy_definition_id
       JOIN attribute_data_types adt ON adt.id = pd.data_type_id
       WHERE cp.category_id = ? AND pd.code IN (?)`,
      [categoryId, codes],
    );
    return new Map(
      rows.map((row) => [
        row.code,
        { id: row.id, dataTypeCode: row.data_type_code },
      ]),
    );
  }

  /** @returns {Promise<Map<string, number>>} option code -> id, scoped to one policy */
  async getPolicyOptionIdsByCode(policyDefinitionId, codes) {
    if (codes.length === 0) return new Map();
    const [rows] = await this.#pool.query(
      `SELECT id, code FROM policy_options
       WHERE policy_definition_id = ? AND code IN (?)`,
      [policyDefinitionId, codes],
    );
    return new Map(rows.map((row) => [row.code, row.id]));
  }

  /** @returns {Promise<number|null>} */
  async getPricingModelIdByCode(code, categoryId) {
    const [rows] = await this.#pool.query(
      `SELECT pm.id
       FROM category_pricing_models cpm
       JOIN pricing_models pm ON pm.id = cpm.pricing_model_id
       WHERE cpm.category_id = ? AND pm.code = ?
       LIMIT 1`,
      [categoryId, code],
    );
    return rows[0]?.id ?? null;
  }
}

export default MySqlListingMetadataRepository;
