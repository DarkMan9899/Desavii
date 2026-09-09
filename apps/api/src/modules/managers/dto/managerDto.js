/**
 * Managers module response DTOs (Sprint F).
 */

export function toManagerSummaryResponse(row) {
  return {
    user_id: row.user_id,
    first_name: row.first_name,
    last_name: row.last_name,
    email: row.email,
    created_at: row.created_at,
    assigned_company_count: Number(row.assigned_company_count ?? 0),
  };
}

export function toAssignmentResponse(row) {
  return {
    id: row.id,
    partner_id: row.partner_id,
    display_name: row.display_name,
    slug: row.slug,
    verification_status: row.verification_status_code,
    assigned_at: row.assigned_at,
  };
}

export function toDashboardResponse(dashboard) {
  return {
    counts: dashboard.counts,
    booking_value_by_currency: dashboard.bookingValueByCurrency.map((row) => ({
      currency_code: row.currencyCode,
      total: row.total,
    })),
    bookings_by_day: dashboard.bookingsByDay.map((row) => ({
      day: row.day,
      total: row.total,
    })),
    by_company: dashboard.byCompany.map((row) => ({
      partner_id: row.partnerId,
      display_name: row.displayName,
      booking_count: row.bookingCount,
      confirmed_booking_count: row.confirmedBookingCount,
    })),
    // Only present when the caller merged it in (`ManagerService#getDashboard`)
    // — `toManagerDetailResponse` surfaces the same figure at its own top
    // level instead, so it's never duplicated/inconsistent between the two
    // response shapes.
    ...(dashboard.listingsCreatedCount !== undefined
      ? { listings_created_count: dashboard.listingsCreatedCount }
      : {}),
  };
}

export function toManagerDetailResponse({
  manager,
  assignments,
  dashboard,
  listingsCreatedCount,
}) {
  return {
    manager: {
      user_id: manager.user_id,
      first_name: manager.first_name,
      last_name: manager.last_name,
      email: manager.email,
      created_at: manager.created_at,
    },
    assignments: assignments.map(toAssignmentResponse),
    dashboard: toDashboardResponse(dashboard),
    listings_created_count: listingsCreatedCount,
  };
}

export function toAnalyticsResponse(analytics) {
  return {
    bookings_by_status: analytics.bookingsByStatus.map((row) => ({
      status_code: row.statusCode,
      total: row.total,
    })),
    by_listing: analytics.byListing.map((row) => ({
      listing_id: row.listingId,
      title: row.title,
      booking_count: row.bookingCount,
    })),
    average_booking_value_by_currency:
      analytics.averageBookingValueByCurrency.map((row) => ({
        currency_code: row.currencyCode,
        average: row.average,
        sample_size: row.sampleSize,
      })),
  };
}
