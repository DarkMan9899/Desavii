/**
 * metadataValueFormat — turns a stored category attribute or policy value
 * (`GET /listings/metadata` definitions, domain values from
 * `attributeValueMapping.js` / `policyValueMapping.js`) into the words a
 * traveller reads, in the page's language.
 *
 * Same i18n keys as the Wizard's write side (`partner.listingWizard.
 * {namespace}.{code}` for labels, `partner.listingWizard.options.{code}.
 * {option}` for choices, `partner.listingWizard.units.{unit}` for number
 * suffixes), so a value reads the same where it is entered and where it is
 * shown. Lists read in the page language's own grammar — "English,
 * Armenian and Russian", "անգլերեն, հայերեն և ռուսերեն", "английский,
 * армянский и русский" — with the conjunction owned by the translations,
 * not by `Intl.ListFormat`: browsers shipping reduced ICU data have no
 * Armenian list patterns and silently fall back to English ("09:00 and
 * 14:00" on an Armenian page). Durations read as the cards read them
 * ("4 hours", "90 minutes"); other measured numbers go through the shared
 * Armenian-safe number formatter in the page locale ("1.5" / "1,5",
 * "2,000" / "2 000"). A number without a unit — a vehicle's year — is an
 * identifier, written as stored.
 */

import { createNumberFormatter } from '@desavii/ui/utils/numberFormat';
import { resolveAttributeIcon } from './attributeIcons.js';
import { formatDurationLabel } from '../../../utils/formatDuration.js';

const NUMERIC_DATA_TYPES = ['INTEGER', 'DECIMAL'];
const LIST_SEPARATOR = ', ';

/** "A, B and C" in the page's language. */
export function formatValueList(items, t) {
  if (items.length < 2) return items.join('');
  return t('pages.listingDetail.valueList', {
    items: items.slice(0, -1).join(LIST_SEPARATOR),
    last: items[items.length - 1],
  });
}

/**
 * @param {object} definition - a metadata attribute or policy definition
 * @param {*} value - its domain value
 * @param {Function} t - i18next `t`
 * @param {string} locale - the page language (`i18n.language`)
 */
export function formatMetadataValue(definition, value, t, locale) {
  const resolveOptionLabel = (optionCode) =>
    t(`partner.listingWizard.options.${definition.code}.${optionCode}`, {
      defaultValue: optionCode,
    });

  if (definition.data_type === 'BOOLEAN') {
    return value ? t('pages.listingDetail.yes') : t('pages.listingDetail.no');
  }
  if (definition.data_type === 'MULTI_ENUM') {
    return formatValueList((value ?? []).map(resolveOptionLabel), t);
  }
  if (definition.data_type === 'ENUM') {
    return resolveOptionLabel(value);
  }
  if (NUMERIC_DATA_TYPES.includes(definition.data_type) && definition.unit) {
    if (definition.unit === 'minutes') return formatDurationLabel(value, t);
    const unitLabel = t(`partner.listingWizard.units.${definition.unit}`, {
      count: value,
      defaultValue: definition.unit,
    });
    return `${createNumberFormatter(locale).format(value)} ${unitLabel}`;
  }
  return String(value);
}

/** A stored value the listing actually has (not empty, not an empty list). */
export function hasMetadataValue(value) {
  return (
    value !== undefined &&
    value !== null &&
    value !== '' &&
    !(Array.isArray(value) && value.length === 0)
  );
}

/**
 * One fact row (`FactList`) for an attribute or policy value, labelled as
 * the Wizard labels it.
 *
 * @param {'attributes'|'policies'} namespace
 * @param {string} locale - the page language
 */
export function toMetadataRow(namespace, definition, value, t, locale) {
  return {
    key: definition.code,
    icon: resolveAttributeIcon(definition.code),
    label: t(`partner.listingWizard.${namespace}.${definition.code}`, {
      defaultValue: definition.code,
    }),
    value: formatMetadataValue(definition, value, t, locale),
  };
}
