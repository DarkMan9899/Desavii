# Module: notifications

**Specification:** see `FRONTEND_ARCHITECTURE.md` Chapter 6 (Feature
Module Architecture) for this module's dependency rules, and the
corresponding `API_SPECIFICATION.md` module for the endpoints it will
consume.

**Phase 13 status:** implemented — the Notifications Center. `NotificationBell`
(header dropdown, polling unread count every 30s), `NotificationsPageContent`
(full filterable/searchable/paginated list, reused across the customer/
partner/admin route wrappers), and `NotificationPreferencesSection`
(per-category in-app/email toggles). Renders every notification's message
via `constants/notificationCopy.js` — the backend stores only `event_type`

- `payload`, never rendered text (Phase 4.2's "i18n owns all labels" rule).

## Folder contents (per FRONTEND_ARCHITECTURE.md §3.2 / §6.2)

- `components/` — `NotificationBell`, `NotificationDropdown`,
  `NotificationRow`, `NotificationsPageContent`, `NotificationPreferences`
- `queries/` — `useNotificationsQuery`, `useUnreadCountQuery` (this
  codebase's first polling hook), `useNotificationPreferencesQuery` (Ch. 14)
- `mutations/` — mark-read/mark-all-read/archive/delete/update-preference (Ch. 14)
- `utils/` — `formatRelativeTime.js` (re-exports `@desavii/ui`'s
  `Intl.RelativeTimeFormat` formatter with its `date-fns` locale fallback)
- `constants/` — `queryKeys.js`, `notificationCopy.js`
- `index.js` — this module's public export surface (Ch. 6.2) — the ONLY
  entry point other modules may import from (Ch. 6.3's cross-module rule)
