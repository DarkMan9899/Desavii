/**
 * reservationLabels — tiny shared label resolvers for anything that
 * shows a listing's booking CTA copy or pricing-model suffix.
 * `ListingReservationWidget` (desktop sidebar) and `MobileBookingBar`
 * (Phase 18.11) both need the exact same two lookups; extracted here so
 * neither duplicates the other's i18n fallback chain.
 */

export function resolveBookingCtaLabel(t, bookingCtaKey) {
  return t(bookingCtaKey, {
    defaultValue: t('pages.listingDetail.reservation.requestToBook'),
  });
}

export function resolvePricingModelLabel(t, pricing) {
  if (!pricing?.pricing_model) return undefined;
  return t(`partner.listingWizard.pricingModels.${pricing.pricing_model}`, {
    defaultValue: pricing.pricing_model,
  });
}

/**
 * Step L6.2H1 — `false` only when the listing's stored pricing model is
 * one its category no longer offers (legacy PER_HOUR): the server refuses
 * every hold/booking for it, so no price or booking control is offered.
 * A listing with no pricing row, or one from before the flag existed, is
 * not treated as unbookable here.
 */
export function isPricingModelBookable(pricing) {
  return pricing?.is_model_supported !== false;
}
