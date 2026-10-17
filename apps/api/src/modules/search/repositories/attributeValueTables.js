/**
 * Generic Attribute Engine storage facts shared by Search's query builder
 * (`mysqlSearchRepository.js`) and its filter catalog
 * (`searchFilterCatalog.js`): which data types store option ids, and which
 * typed table holds every other primitive (§2.3 of the proposal).
 */

export const ENUM_DATA_TYPE_CODES = Object.freeze(['ENUM', 'MULTI_ENUM']);

export const ATTRIBUTE_VALUE_TABLES = Object.freeze({
  INTEGER: 'listing_attribute_values_integer',
  DECIMAL: 'listing_attribute_values_decimal',
  BOOLEAN: 'listing_attribute_values_boolean',
  STRING: 'listing_attribute_values_string',
  DATE: 'listing_attribute_values_date',
});
