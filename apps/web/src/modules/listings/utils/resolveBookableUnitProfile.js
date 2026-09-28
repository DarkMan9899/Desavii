/**
 * Step L6.2B — everything the Partner unit UI needs to present a listing's
 * bookable units honestly, derived from the listing itself:
 *
 * - `unitType`: the ONE unit type its listing type allows (the backend
 *   enforces the same model) — never a Partner choice.
 * - `terms`: the `partner.listingWizard.unitTerms.*` key set for the
 *   category's own words ("Room type", "Departure", "Vehicle", "Session",
 *   …). Categories sharing a unit type can still differ (Apartments vs
 *   Guest Houses both use PROPERTY_UNIT; Attractions vs Entertainment
 *   Venues both use TOUR_DEPARTURE).
 * - `priceBasis`: what the unit base price is per, from the listing's own
 *   pricing model. `neutral` wherever the label would promise more than
 *   booking actually charges today: a legacy PER_HOUR (not bookable since
 *   Step L6.2H1) and a restaurant's PER_PERSON (charged per reservation).
 * - `stayRules`: whether minimum/maximum stay applies, as `nights`
 *   (lodging) or `days` (car rental), or not at all.
 * - `advanceContext`: what the advance-notice rule is "before".
 * - `singleUnit`: a Car Rental listing is one vehicle model with one unit.
 *
 * @returns {object|null} `null` for a listing type with no unit model.
 */

import PropTypes from 'prop-types';
import {
  getBookableUnitTypeForListingType,
  isSingleUnitListingType,
} from '../../availability/index.js';
import { STAY_RULE_UNIT_BY_LISTING_TYPE } from './bookingRuleWindow.js';
import { resolvePricingModelBasis } from '../../../utils/pricingModelBasis.js';

const TERMS_BY_CATEGORY_SLUG = {
  hotels: 'hotel',
  apartments: 'apartment',
  villas: 'villa',
  'guest-houses': 'guestHouse',
  restaurants: 'restaurant',
  tours: 'tour',
  'car-rentals': 'carRental',
  attractions: 'attraction',
  'entertainment-venues': 'entertainment',
};

// A listing whose category isn't known (yet) still gets its type's words.
const DEFAULT_TERMS_BY_LISTING_TYPE = {
  HOTEL: 'hotel',
  PROPERTY: 'apartment',
  RESTAURANT: 'restaurant',
  TOUR: 'tour',
  CAR_RENTAL: 'carRental',
  ATTRACTION: 'attraction',
};

const ADVANCE_CONTEXT_BY_LISTING_TYPE = {
  HOTEL: 'checkIn',
  PROPERTY: 'checkIn',
  CAR_RENTAL: 'pickup',
  TOUR: 'departure',
  RESTAURANT: 'reservation',
  ATTRACTION: 'visit',
};

/**
 * The `partner.listingWizard.unitPrice(Summary).*` key for a unit price.
 * Also used by the public reservation widget's unit options.
 */
export function resolveUnitPriceBasis(pricingModel, unitType) {
  if (pricingModel === 'PER_PERSON' && unitType === 'RESTAURANT_TABLE') {
    return 'neutral';
  }
  return resolvePricingModelBasis(pricingModel) ?? 'neutral';
}

export const bookableUnitProfileShape = PropTypes.shape({
  unitType: PropTypes.string.isRequired,
  terms: PropTypes.string.isRequired,
  priceBasis: PropTypes.string.isRequired,
  stayRules: PropTypes.oneOf(['nights', 'days']),
  advanceContext: PropTypes.string.isRequired,
  singleUnit: PropTypes.bool.isRequired,
});

export function resolveBookableUnitProfile({
  listingType,
  categorySlug = null,
  pricingModel = null,
}) {
  const unitType = getBookableUnitTypeForListingType(listingType);
  if (!unitType) return null;
  return {
    unitType,
    terms:
      TERMS_BY_CATEGORY_SLUG[categorySlug] ??
      DEFAULT_TERMS_BY_LISTING_TYPE[listingType],
    priceBasis: resolveUnitPriceBasis(pricingModel, unitType),
    stayRules: STAY_RULE_UNIT_BY_LISTING_TYPE[listingType] ?? null,
    advanceContext: ADVANCE_CONTEXT_BY_LISTING_TYPE[listingType],
    singleUnit: isSingleUnitListingType(listingType),
  };
}

export default resolveBookableUnitProfile;
