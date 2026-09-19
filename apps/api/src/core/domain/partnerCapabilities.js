/**
 * Partner-employee capability matrix — Phase 17 spec §14 ("Manager /
 * Staff Permissions"). `partner_employee_roles` (OWNER/MANAGER/EDITOR/
 * BOOKING_MANAGER/ANALYTICS_VIEWER, seeded in `seeds/001_lookups.js`) is
 * a partner-scoped RBAC system, deliberately separate from the global
 * `roles`/`permissions` tables (Sprint 5 decision, unchanged here) — a
 * receptionist-style `BOOKING_MANAGER` account must be able to operate
 * inventory without ever touching a partner's financial settings,
 * payouts, or org-wide configuration, and this matrix is what enforces
 * that boundary server-side (never just by hiding a nav item).
 *
 * Pure domain logic — no database access, no request/response shapes.
 * `OWNER` is intentionally NOT special-cased here: every caller of
 * `roleHasCapability` already grants `OWNER` a bypass one level up
 * (mirrors `AvailabilityService#isOwnerOrHasPermission`'s existing
 * "owner always passes" precedent), so this matrix only needs to state
 * what *non-owner* roles may do.
 */

export const PARTNER_CAPABILITIES = Object.freeze({
  VIEW_AVAILABILITY: 'VIEW_AVAILABILITY',
  MANAGE_AVAILABILITY: 'MANAGE_AVAILABILITY',
  MANAGE_EXTERNAL_RESERVATIONS: 'MANAGE_EXTERNAL_RESERVATIONS',
  MANAGE_MANUAL_BLOCKS: 'MANAGE_MANUAL_BLOCKS',
  MANAGE_CONNECTIONS: 'MANAGE_CONNECTIONS',
  VIEW_SYNC_LOGS: 'VIEW_SYNC_LOGS',
  // P1.3 (Master Roadmap): editing the partner's PUBLIC company identity
  // (name, description, logo/cover, contact/social links) — kept
  // OWNER/MANAGER only, same trust tier as MANAGE_CONNECTIONS, not
  // extended to BOOKING_MANAGER/EDITOR: those roles operate day-to-day
  // inventory, not the org's public-facing identity.
  MANAGE_COMPANY_PROFILE: 'MANAGE_COMPANY_PROFILE',
  // P1.4 (Master Roadmap): inviting/removing staff and changing their
  // role — deliberately the same OWNER/MANAGER-only trust tier as
  // MANAGE_COMPANY_PROFILE/MANAGE_CONNECTIONS (a role that can grant or
  // revoke other people's access to the org is at least as sensitive as
  // one that can edit connector credentials or the public profile).
  MANAGE_STAFF: 'MANAGE_STAFF',
  // P1.5 (Master Roadmap): replying to a customer review — a public,
  // permanent, brand-facing statement attributed to the organization,
  // same OWNER/MANAGER-only trust tier as MANAGE_COMPANY_PROFILE (the
  // org's other public-facing identity surface), not extended to
  // BOOKING_MANAGER/EDITOR: those roles operate day-to-day inventory,
  // not public brand voice.
  RESPOND_TO_REVIEWS: 'RESPOND_TO_REVIEWS',
  // Step A5 (Partner Analytics Read API): the only capability that
  // previously had no analytics-adjacent grant at all — `ANALYTICS_VIEWER`
  // existed as a role (Sprint 5 seed) but granted nothing analytics-
  // specific until now. Read-only, so trusted at the same tier as
  // VIEW_AVAILABILITY/VIEW_SYNC_LOGS, not the OWNER/MANAGER-only
  // sensitive-settings tier.
  VIEW_ANALYTICS: 'VIEW_ANALYTICS',
});

// Role -> the set of capabilities it grants, beyond OWNER's implicit
// all-access bypass. `MANAGER` mirrors OWNER for inventory purposes
// (day-to-day operational trust); `BOOKING_MANAGER` gets everything
// operational but never `MANAGE_CONNECTIONS`/`MANAGE_COMPANY_PROFILE`
// (connector credentials and public company identity are both more
// sensitive, less-frequently-changed settings, kept OWNER/MANAGER only);
// `EDITOR`/`ANALYTICS_VIEWER` are read-only here.
const ROLE_CAPABILITIES = Object.freeze({
  MANAGER: Object.freeze([
    PARTNER_CAPABILITIES.VIEW_AVAILABILITY,
    PARTNER_CAPABILITIES.MANAGE_AVAILABILITY,
    PARTNER_CAPABILITIES.MANAGE_EXTERNAL_RESERVATIONS,
    PARTNER_CAPABILITIES.MANAGE_MANUAL_BLOCKS,
    PARTNER_CAPABILITIES.MANAGE_CONNECTIONS,
    PARTNER_CAPABILITIES.VIEW_SYNC_LOGS,
    PARTNER_CAPABILITIES.MANAGE_COMPANY_PROFILE,
    PARTNER_CAPABILITIES.MANAGE_STAFF,
    PARTNER_CAPABILITIES.RESPOND_TO_REVIEWS,
    PARTNER_CAPABILITIES.VIEW_ANALYTICS,
  ]),
  BOOKING_MANAGER: Object.freeze([
    PARTNER_CAPABILITIES.VIEW_AVAILABILITY,
    PARTNER_CAPABILITIES.MANAGE_AVAILABILITY,
    PARTNER_CAPABILITIES.MANAGE_EXTERNAL_RESERVATIONS,
    PARTNER_CAPABILITIES.MANAGE_MANUAL_BLOCKS,
    PARTNER_CAPABILITIES.VIEW_SYNC_LOGS,
  ]),
  EDITOR: Object.freeze([PARTNER_CAPABILITIES.VIEW_AVAILABILITY]),
  // Step A5: the one role this capability exists for — the only
  // analytics-relevant grant this role has.
  ANALYTICS_VIEWER: Object.freeze([
    PARTNER_CAPABILITIES.VIEW_AVAILABILITY,
    PARTNER_CAPABILITIES.VIEW_SYNC_LOGS,
    PARTNER_CAPABILITIES.VIEW_ANALYTICS,
  ]),
});

/**
 * @param {string|null} roleCode - a `partner_employee_roles.code`, or
 *   `null`/`undefined` when the caller isn't a partner employee at all.
 * @param {string} capability - one of `PARTNER_CAPABILITIES`.
 * @returns {boolean}
 */
export function roleHasCapability(roleCode, capability) {
  if (!roleCode) return false;
  const granted = ROLE_CAPABILITIES[roleCode];
  return granted ? granted.includes(capability) : false;
}

export default { PARTNER_CAPABILITIES, roleHasCapability };
