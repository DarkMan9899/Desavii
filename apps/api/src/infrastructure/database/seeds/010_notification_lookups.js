/**
 * Seeds the two Notifications lookup tables (migration 0021), extended
 * in Phase 14 with the MESSAGE category, Phase 16 with the PAYMENT
 * category, and Sprint E with the PROMOTION category. Only categories
 * with a real publisher wired are seeded — this is exactly that
 * one-row-insert extension the original header comment anticipated.
 */

import { upsertByCode } from './helpers.js';

export default async function seedNotificationLookups(connection) {
  await upsertByCode(connection, 'notification_categories', [
    { code: 'BOOKING', name: 'Booking' },
    { code: 'REVIEW', name: 'Review' },
    { code: 'FAVORITE', name: 'Favorite' },
    { code: 'PARTNER', name: 'Partner' },
    { code: 'LISTING', name: 'Listing' },
    { code: 'ADMIN', name: 'Admin' },
    { code: 'MESSAGE', name: 'Message' },
    { code: 'PAYMENT', name: 'Payment' },
    { code: 'PROMOTION', name: 'Promotion' },
  ]);

  await upsertByCode(connection, 'notification_priorities', [
    { code: 'LOW', name: 'Low' },
    { code: 'NORMAL', name: 'Normal' },
    { code: 'HIGH', name: 'High' },
    { code: 'URGENT', name: 'Urgent' },
  ]);
}
