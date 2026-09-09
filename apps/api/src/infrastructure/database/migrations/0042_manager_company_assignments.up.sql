-- Sprint F (Manager Workspace + Analytics): a Manager is a platform-side
-- role (Admin-assigned to N companies at once, sub-Admin access) —
-- deliberately NOT the same concept as the existing `partner_employee_roles`
-- MANAGER code (a per-company staff role a partner OWNER invites, granting
-- OWNER-adjacent trust within that ONE company only, `partnerCapabilities.js`).
-- Reusing that table/role would collide with its existing semantics, so
-- this is a new, parallel N:M join, mirroring `partner_employees`
-- (migration 0003) shape-for-shape: soft-delete, full created_by/updated_by/
-- deleted_by audit triad, and the same soft-delete-safe uniqueness trick
-- (a generated column so a removed-then-reassigned company can be
-- reassigned without a hard-delete first).
--
-- The MANAGER global role itself is seeded in 004_roles_and_permissions.js
-- alongside CUSTOMER/MODERATOR/ADMIN/SUPER_ADMIN/SUPPORT. Like CUSTOMER,
-- it intentionally holds zero permission_role rows — a Manager's access to
-- a company's listings/bookings is an assignment check against this table
-- (ListingService/BookingService's `isManagerAssignedToPartner`), not an
-- RBAC permission flag; only the ADMIN-side assignment mutation itself
-- (`manager.assign`) is a real permission.

CREATE TABLE IF NOT EXISTS manager_companies (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  manager_user_id BIGINT UNSIGNED NOT NULL,
  partner_id BIGINT UNSIGNED NOT NULL,
  assigned_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  deleted_at DATETIME(3) NULL COMMENT 'Set when Admin unassigns this company from this manager',
  created_by BIGINT UNSIGNED NULL,
  updated_by BIGINT UNSIGNED NULL,
  deleted_by BIGINT UNSIGNED NULL,
  active_manager_partner VARCHAR(41)
    GENERATED ALWAYS AS (IF(deleted_at IS NULL, CONCAT(manager_user_id, ':', partner_id), NULL)) STORED,
  PRIMARY KEY (id),
  CONSTRAINT uq_manager_companies_active_manager_partner UNIQUE (active_manager_partner),
  CONSTRAINT fk_manager_companies_manager_user_id FOREIGN KEY (manager_user_id) REFERENCES users (id),
  CONSTRAINT fk_manager_companies_partner_id FOREIGN KEY (partner_id) REFERENCES partners (id),
  CONSTRAINT fk_manager_companies_created_by FOREIGN KEY (created_by) REFERENCES users (id),
  CONSTRAINT fk_manager_companies_updated_by FOREIGN KEY (updated_by) REFERENCES users (id),
  CONSTRAINT fk_manager_companies_deleted_by FOREIGN KEY (deleted_by) REFERENCES users (id),
  KEY idx_manager_companies_manager_user_id (manager_user_id),
  KEY idx_manager_companies_partner_id (partner_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
