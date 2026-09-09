/**
 * Manager-company assignment lookup (Sprint F). Mirrors
 * `partnerEmployeeRepository.js#isPartnerOwner`'s exact shape/rationale: a
 * single standalone function rather than a full port/adapter pair, since
 * it has few callers (`ListingService`/`BookingService`'s
 * `#isOwnerOrHasPermission`) and one narrow query.
 *
 * A global MANAGER role (`004_roles_and_permissions.js`) holds zero
 * `permission_role` rows by design — this table (`manager_companies`,
 * migration 0042), not an RBAC permission, is the actual source of truth
 * for "may this user act on this partner's listings/bookings."
 */

import { getMysqlPool } from '../mysqlPool.js';

/**
 * @param {number} userId
 * @param {number} partnerId
 * @param {import('mysql2/promise').Pool} [pool]
 * @returns {Promise<boolean>}
 */
export async function isManagerAssignedToPartner(
  userId,
  partnerId,
  pool = getMysqlPool(),
) {
  const [rows] = await pool.query(
    `SELECT id
     FROM manager_companies
     WHERE manager_user_id = ? AND partner_id = ? AND deleted_at IS NULL
     LIMIT 1`,
    [userId, partnerId],
  );

  return rows.length > 0;
}

export default isManagerAssignedToPartner;
