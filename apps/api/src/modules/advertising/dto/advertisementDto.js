/**
 * Advertising module response DTOs (BACKEND_ARCHITECTURE.md Ch.9).
 *
 * `toAdvertisementResponse` is the Admin management shape (every audit/
 * payment/lifecycle field). Public promoted-listing rows reuse
 * `search/dto/searchDto.js#toSearchResultResponse` directly (the
 * controller imports it) — never a second, parallel "public promoted
 * listing" shape, so `SearchResultCard` on the frontend needs no new
 * variant to render either.
 */

export function toAdvertisementResponse(ad) {
  return {
    id: ad.id,
    listing_id: ad.listingId,
    partner_id: ad.partnerId,
    placement_code: ad.placementCode,
    product_id: ad.productId,
    status_code: ad.statusCode,
    price_snapshot_amount: ad.priceSnapshotAmount,
    currency_code: ad.currencyCode,
    start_date: ad.startDate,
    end_date: ad.endDate,
    display_priority: ad.displayPriority,
    impression_count: ad.impressionCount,
    click_count: ad.clickCount,
    requested_by: ad.requestedBy,
    approved_by: ad.approvedBy,
    approved_at: ad.approvedAt,
    payment_marked_paid_by: ad.paymentMarkedPaidBy,
    payment_marked_paid_at: ad.paymentMarkedPaidAt,
    reminder_7d_sent_at: ad.reminder7dSentAt,
    reminder_2d_sent_at: ad.reminder2dSentAt,
    created_at: ad.createdAt,
    updated_at: ad.updatedAt,
    created_by: ad.createdBy,
    updated_by: ad.updatedBy,
  };
}

export function toPlacementCatalogResponse(placements) {
  return placements.map((placement) => ({
    code: placement.code,
    max_concurrent_slots: placement.maxConcurrentSlots,
    products: placement.products.map((product) => ({
      id: product.id,
      name: product.name,
      duration_days: product.durationDays,
      price_amount: product.priceAmount,
      currency_code: product.currencyCode,
    })),
  }));
}
