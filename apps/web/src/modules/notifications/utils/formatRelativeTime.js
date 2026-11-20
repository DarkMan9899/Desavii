/**
 * Locale-aware relative timestamp ("2 hours ago") for `NotificationRow`.
 * The shared `@desavii/ui` formatter: `Intl.RelativeTimeFormat`, per
 * FRONTEND_ARCHITECTURE.md §17.2, with `date-fns` locale data for browsers
 * whose `Intl` lacks the locale (desktop Google Chrome has no Armenian) —
 * never a hand-rolled pluralization table.
 */

export { formatRelativeTime } from '@desavii/ui/utils/relativeTimeFormat';
