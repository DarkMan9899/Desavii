/**
 * Locale-aware relative timestamp ("2 hours ago") — the shared
 * `@desavii/ui` formatter, per FRONTEND_ARCHITECTURE.md §17.2. Messaging
 * must never depend on Notifications (Phase 14's hard architecture
 * constraint); both modules now read the same design-system utility
 * instead of keeping duplicated copies.
 */

export { formatRelativeTime } from '@desavii/ui/utils/relativeTimeFormat';
