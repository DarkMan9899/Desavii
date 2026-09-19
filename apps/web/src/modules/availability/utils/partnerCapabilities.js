/**
 * Frontend mirror of `apps/api/src/core/domain/partnerCapabilities.js`
 * (Phase 17 §14). UI-only gating (hide/disable an action a role can't
 * perform) — the server is the real enforcement authority, already
 * tested independently; this only exists so the UI doesn't invite a
 * receptionist to tap a button that will 403.
 */

export const PARTNER_CAPABILITIES = Object.freeze({
  VIEW_AVAILABILITY: 'VIEW_AVAILABILITY',
  MANAGE_AVAILABILITY: 'MANAGE_AVAILABILITY',
  MANAGE_EXTERNAL_RESERVATIONS: 'MANAGE_EXTERNAL_RESERVATIONS',
  MANAGE_MANUAL_BLOCKS: 'MANAGE_MANUAL_BLOCKS',
  MANAGE_CONNECTIONS: 'MANAGE_CONNECTIONS',
  VIEW_SYNC_LOGS: 'VIEW_SYNC_LOGS',
  // P1.3 (Master Roadmap) — mirrors the backend's own addition
  // (`apps/api/src/core/domain/partnerCapabilities.js`) exactly.
  MANAGE_COMPANY_PROFILE: 'MANAGE_COMPANY_PROFILE',
  // P1.4 (Master Roadmap) — mirrors the backend's own addition
  // (`apps/api/src/core/domain/partnerCapabilities.js`) exactly.
  MANAGE_STAFF: 'MANAGE_STAFF',
  // Step A6 (Partner Analytics Dashboard UI) — mirrors the backend's own
  // A5 addition (`apps/api/src/core/domain/partnerCapabilities.js`)
  // exactly: granted to MANAGER and ANALYTICS_VIEWER only.
  VIEW_ANALYTICS: 'VIEW_ANALYTICS',
});

const ROLE_CAPABILITIES = Object.freeze({
  MANAGER: Object.freeze(Object.values(PARTNER_CAPABILITIES)),
  BOOKING_MANAGER: Object.freeze([
    PARTNER_CAPABILITIES.VIEW_AVAILABILITY,
    PARTNER_CAPABILITIES.MANAGE_AVAILABILITY,
    PARTNER_CAPABILITIES.MANAGE_EXTERNAL_RESERVATIONS,
    PARTNER_CAPABILITIES.MANAGE_MANUAL_BLOCKS,
    PARTNER_CAPABILITIES.VIEW_SYNC_LOGS,
  ]),
  EDITOR: Object.freeze([PARTNER_CAPABILITIES.VIEW_AVAILABILITY]),
  ANALYTICS_VIEWER: Object.freeze([
    PARTNER_CAPABILITIES.VIEW_AVAILABILITY,
    PARTNER_CAPABILITIES.VIEW_SYNC_LOGS,
    PARTNER_CAPABILITIES.VIEW_ANALYTICS,
  ]),
});

/**
 * @param {string|null|undefined} roleCode - `activePartner.role` from `usePartner()`.
 * @param {string} capability
 * @returns {boolean}
 */
export function roleHasCapability(roleCode, capability) {
  if (roleCode === 'OWNER') return true;
  if (!roleCode) return false;
  const granted = ROLE_CAPABILITIES[roleCode];
  return granted ? granted.includes(capability) : false;
}

export default { PARTNER_CAPABILITIES, roleHasCapability };
