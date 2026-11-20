/**
 * listingRules — the listing's rules as the Policies section lists them
 * (`PolicyList`: icon · short title · short value): the category policies
 * the partner set, then the booking rules the reservation panel already
 * enforces (`listing.booking_rules`) — a minimum or maximum stay and how
 * far ahead a booking must be made — so a traveller learns a restriction
 * before the panel refuses a date, not after. A stay rule reads in the
 * listing's own unit, exactly as the Wizard collects it
 * (`resolveBookableUnitProfile`'s `stayRules`): nights for lodging, rental
 * days for a car, and not at all for a tour, a table or a ticket.
 *
 * Values are the stored ones, formatted by `formatMetadataValue`; a yes/no
 * rule reads "Allowed" / "Not allowed". Rules read in a fixed order —
 * arrival and departure first — whatever order the category declares. A
 * rule without a value is left out; a one-night minimum and a zero-hour
 * notice are no restriction and are left out too.
 *
 * P2.1 integrity check: `cancellation_policy`'s label (Flexible/Moderate/
 * Strict) is collected and displayed only, never consulted by the refund
 * decision (`cancellationRefundPolicy.js`: every customer cancellation is
 * reviewed manually). Its row says so in its expandable explanation; no
 * refund percentage or window is invented here.
 */

import { fromPolicyValuesResponse } from './policyValueMapping.js';
import { formatMetadataValue } from './metadataValueFormat.js';
import resolvePolicyIcon from './policyIcons.js';
import { resolveBookableUnitProfile } from './resolveBookableUnitProfile.js';

const RULE_ORDER = [
  'check_in_time',
  'check_out_time',
  'minimum_stay',
  'maximum_stay',
  'advance_booking',
  'cancellation_policy',
  'children_allowed',
  'pets_allowed',
  'smoking_allowed',
  'parties_allowed',
  'fuel_policy',
];

const HOURS_PER_DAY = 24;

function orderOf(code) {
  const index = RULE_ORDER.indexOf(code);
  return index === -1 ? RULE_ORDER.length : index;
}

function title(code, t) {
  return t(`pages.listingDetail.policies.titles.${code}`, {
    defaultValue: t(`partner.listingWizard.policies.${code}`, {
      defaultValue: code,
    }),
  });
}

function policyRules(policies, listing, t, locale) {
  const valuesByCode = fromPolicyValuesResponse(
    policies,
    listing.policy_values,
  );
  return policies
    .map((definition) => ({ definition, value: valuesByCode[definition.code] }))
    .filter(
      ({ value }) => value !== undefined && value !== null && value !== '',
    )
    .map(({ definition, value }) => ({
      code: definition.code,
      description:
        definition.data_type === 'BOOLEAN'
          ? t(
              value
                ? 'pages.listingDetail.policies.allowed'
                : 'pages.listingDetail.policies.notAllowed',
            )
          : formatMetadataValue(definition, value, t, locale),
      details:
        definition.code === 'cancellation_policy'
          ? t('pages.listingDetail.policies.cancellationDisclaimer')
          : undefined,
    }));
}

function advanceNotice(hours, t) {
  return hours % HOURS_PER_DAY === 0
    ? t('pages.listingDetail.policies.values.daysAhead', {
        count: hours / HOURS_PER_DAY,
      })
    : t('pages.listingDetail.policies.values.hoursAhead', { count: hours });
}

// Title and value keys per stay unit (`resolveBookableUnitProfile`).
const STAY_WORDING = {
  nights: { minimum: 'minimum_stay', maximum: 'maximum_stay', value: 'nights' },
  days: { minimum: 'minimum_rental', maximum: 'maximum_rental', value: 'days' },
};

function bookingRuleRows(bookingRules, stayRules, t) {
  if (!bookingRules) return [];
  const {
    minimum_stay_nights: minimumStay,
    maximum_stay_nights: maximumStay,
    advance_booking_min_hours: advanceHours,
  } = bookingRules;
  const wording = STAY_WORDING[stayRules];
  const duration = (count) =>
    t(`pages.listingDetail.policies.values.${wording.value}`, { count });
  return [
    wording &&
      minimumStay > 1 && {
        code: 'minimum_stay',
        titleCode: wording.minimum,
        description: duration(minimumStay),
      },
    wording &&
      maximumStay > 0 && {
        code: 'maximum_stay',
        titleCode: wording.maximum,
        description: duration(maximumStay),
      },
    advanceHours > 0 && {
      code: 'advance_booking',
      description: advanceNotice(advanceHours, t),
    },
  ].filter(Boolean);
}

/**
 * @param {{
 *   policies?: object[],
 *   listing: { listing_type?: string, policy_values?: object[], booking_rules?: object|null },
 *   locale: string,
 * }} input
 * @param {Function} t - i18next `t`
 * @returns {Array<{code: string, icon: Function, title: string, description: string, details?: string}>}
 */
export function resolveListingRules({ policies = [], listing, locale }, t) {
  const stayRules =
    resolveBookableUnitProfile({ listingType: listing.listing_type })
      ?.stayRules ?? null;
  return [
    ...policyRules(policies, listing, t, locale),
    ...bookingRuleRows(listing.booking_rules, stayRules, t),
  ]
    .sort((a, b) => orderOf(a.code) - orderOf(b.code))
    .map(({ titleCode, ...rule }) => ({
      ...rule,
      icon: resolvePolicyIcon(rule.code),
      title: title(titleCode ?? rule.code, t),
    }));
}

export default resolveListingRules;
