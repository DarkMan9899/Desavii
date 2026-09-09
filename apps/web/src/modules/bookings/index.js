/**
 * `bookings` module public export surface (FRONTEND_ARCHITECTURE.md
 * §6.2) — the ONLY entry point other modules/pages may import from
 * (§6.3).
 */

export { default as BookingsPageContent } from './components/BookingsPageContent/BookingsPageContent.jsx';
export { default as BookingDetailPageContent } from './components/BookingDetailPageContent/BookingDetailPageContent.jsx';
export { default as BookingCheckoutPageContent } from './components/BookingCheckoutPageContent/BookingCheckoutPageContent.jsx';
// Phase 8 (Auth / User Dashboard): exposed so `profile`'s
// DashboardOverviewContent can genuinely reuse Phase 7's booking UI/data
// layer (a single BookingCard row, its status badge, and the same
// "My Trips" query already powering BookingsPageContent) instead of
// rebuilding any of it.
export { default as BookingCard } from './components/BookingCard/BookingCard.jsx';
export { default as BookingStatusBadge } from './components/BookingStatusBadge/BookingStatusBadge.jsx';
export { useMyBookingsQuery } from './queries/useMyBookingsQuery.js';

// Phase 9 (Partner Dashboard).
export { default as useBookingQuery } from './queries/useBookingQuery.js';
export { default as usePartnerBookingsQuery } from './queries/usePartnerBookingsQuery.js';
// Sprint D-2 (Partner Calendar source-aware UX).
export { default as useUnitBookingsQuery } from './queries/useUnitBookingsQuery.js';
export { default as useConfirmBookingMutation } from './mutations/useConfirmBookingMutation.js';
export { default as useRejectBookingMutation } from './mutations/useRejectBookingMutation.js';
export { default as useCancelBookingMutation } from './mutations/useCancelBookingMutation.js';
// P2.2C: Partner self-service Complete/No-show, reusing the same
// already-authorized endpoints the admin surface calls.
export { default as useCompleteBookingMutation } from './mutations/useCompleteBookingMutation.js';
export { default as useMarkNoShowMutation } from './mutations/useMarkNoShowMutation.js';
export { BOOKING_STATUS_KEYS } from './constants/bookingStatuses.js';
