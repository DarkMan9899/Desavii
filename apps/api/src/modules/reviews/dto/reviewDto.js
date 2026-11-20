/**
 * Reviews module response DTOs (BACKEND_ARCHITECTURE.md Ch.9).
 */

export function toReviewResponse(review) {
  return {
    id: review.id,
    customer_user_id: review.customerUserId,
    booking_id: review.bookingId,
    listing_id: review.listingId,
    rating: review.rating,
    title: review.title,
    content: review.content,
    status: review.statusCode,
    vendor_response: review.vendorResponse,
    vendor_responded_at: review.vendorRespondedAt,
    created_at: review.createdAt,
    updated_at: review.updatedAt,
    // Additive, only present when the repository joined it (listing review
    // lists, not the single-review create response) — the reviewer's
    // display name, never the full user record.
    customer_display_name: review.customerDisplayName ?? undefined,
  };
}

/**
 * Listing Detail redesign — a review as a public listing page shows it:
 * the rating, the words and the company's reply, named "Anna K." (see the
 * repository). Never the reviewer's user id, the booking it came from or
 * its moderation status — `toReviewResponse` stays for the reviewer's own
 * and the admin views.
 */
export function toPublicReviewResponse(review) {
  return {
    id: review.id,
    rating: review.rating,
    title: review.title,
    content: review.content,
    vendor_response: review.vendorResponse,
    vendor_responded_at: review.vendorRespondedAt,
    created_at: review.createdAt,
    customer_display_name: review.customerDisplayName ?? null,
  };
}

export function toReviewSummaryResponse(summary) {
  return {
    listing_id: summary.listingId,
    rating_average: summary.ratingAverage,
    review_count: summary.reviewCount,
  };
}

/** P1.5 (Master Roadmap) — admin moderation queue/detail, additive over the public shape. */
export function toReviewAdminResponse(review) {
  return {
    ...toReviewResponse(review),
    listing_title: review.listingTitle,
    moderation_notes: review.moderationNotes,
    moderated_at: review.moderatedAt,
    moderated_by: review.moderatedBy,
    report_count: review.reportCount,
  };
}

export function toReviewReportResponse(report) {
  return {
    id: report.id,
    review_id: report.reviewId,
    reporter_user_id: report.reporterUserId,
    reason: report.reasonCode,
    reason_name: report.reasonName,
    details: report.details,
    created_at: report.createdAt,
    resolved_at: report.resolvedAt,
  };
}
