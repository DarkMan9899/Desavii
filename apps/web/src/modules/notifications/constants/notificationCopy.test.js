import { describe, test, expect } from 'vitest';
import { getNotificationCopy } from './notificationCopy.js';

// Every event type the backend actually publishes a notification row for
// (apps/api/src/modules/notifications/events/notificationListener.js's
// own `eventBus.subscribe` calls) — kept in sync by hand since the two
// packages don't share a build step. If a future subscription is added
// there without a matching entry here, that event silently falls back to
// the generic copy (safe, but worth a deliberate translation) rather than
// leaking its raw code — this list is what catches the gap early.
const KNOWN_EVENT_TYPES = [
  'booking.created',
  'booking.confirmed',
  'booking.rejected',
  'booking.cancelled',
  'booking.completed',
  'review.submitted',
  'review.rejected',
  'message.sent',
  'favorite.added',
  'partner.approved',
  'partner.rejected',
  'partner.needs_changes',
  'listing.approved',
  'listing.rejected',
  'listing.expiring_soon',
  'payment.succeeded',
  'payment.failed',
  'refund.succeeded',
  'inventory.sync_failed',
  'inventory.sync_conflict',
  'inventory.sync_recovered',
  'partner.staff_added',
  'review.reported',
  'refund.review_required',
];

describe('getNotificationCopy (apps/web/src/modules/notifications)', () => {
  test.each(KNOWN_EVENT_TYPES)(
    'maps %s to a real translation key, not the generic fallback',
    (eventType) => {
      const copy = getNotificationCopy(eventType, {});
      expect(copy.isAnnouncement).toBe(false);
      expect(copy.key).not.toBe('notifications.copy.generic');
      expect(copy.key.startsWith('notifications.copy.')).toBe(true);
    },
  );

  test('an unrecognized event type falls back to the generic key, never the raw code', () => {
    const copy = getNotificationCopy('some.future_event_v2', {
      anything: 'here',
    });
    expect(copy.isAnnouncement).toBe(false);
    expect(copy.key).toBe('notifications.copy.generic');
    // The interpolation params must never carry the raw event type through
    // to the rendered string — `notifications.copy.generic` itself no
    // longer contains a `{{eventType}}` placeholder, but this guards
    // against a future edit to either side silently reintroducing the leak.
    expect(copy.params).not.toHaveProperty('eventType');
    expect(JSON.stringify(copy)).not.toContain('some.future_event_v2');
  });

  test('admin.announcement renders the authored title/body directly, not a lookup key', () => {
    const copy = getNotificationCopy('admin.announcement', {
      title: 'Scheduled maintenance',
      body: 'Tonight at 2am.',
    });
    expect(copy.isAnnouncement).toBe(true);
    expect(copy.title).toBe('Scheduled maintenance');
    expect(copy.body).toBe('Tonight at 2am.');
  });

  test('a payload-less unknown event still resolves without throwing', () => {
    expect(() => getNotificationCopy('totally.unknown')).not.toThrow();
  });
});
