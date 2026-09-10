/**
 * Seeds global roles and a representative permission catalog (Sprint 5
 * §4): "The authorization model must be extensible and must not depend
 * only on hard-coded role checks" — every permission below is a data
 * row, attached to roles via permission_role, matching
 * DATABASE_ARCHITECTURE.md §9's "permissions are... attached to roles...
 * never checked by role name directly in application code" rule.
 *
 * Only global roles live here (CUSTOMER/MODERATOR/ADMIN/SUPER_ADMIN/
 * SUPPORT, matching DATABASE_ARCHITECTURE.md §9's documented global set)
 * — partner-scoped roles (Sprint 5's VENDOR_OWNER/VENDOR_STAFF, mapped
 * onto `partner_employee_roles`) are seeded in 001_lookups.js and
 * assigned per-partner via `partner_employees`, never via this table.
 * CUSTOMER intentionally has zero permission_role rows — a customer's
 * access to their own bookings/reviews/favorites is an ownership check
 * (BACKEND_ARCHITECTURE.md §13), not an RBAC permission.
 *
 * SUPPORT (Phase 11 Admin Platform) is a read-only admin-area role: a
 * support agent needs to look up users/bookings/audit history to help a
 * customer, but has none of MODERATOR's moderation rights or ADMIN's
 * write access — see ROLE_PERMISSIONS.SUPPORT below.
 *
 * MANAGER (Sprint F, Manager Workspace) is a sixth global role, distinct
 * from the existing `partner_employee_roles.MANAGER` code (a per-company
 * staff role a partner OWNER invites — see 001_lookups.js). This global
 * MANAGER is Admin-assigned to zero or more companies at once
 * (`manager_companies`, migration 0042) and, like CUSTOMER, intentionally
 * holds zero permission_role rows here: a Manager's access to an assigned
 * company's listings/bookings is an assignment check
 * (`isManagerAssignedToPartner`), not an RBAC permission flag. Only the
 * ADMIN-side mutation that creates/removes an assignment
 * (`manager.assign`, below) is a real permission.
 */

import { upsertByCode, getIdsByCode } from './helpers.js';

const ROLES = [
  { code: 'CUSTOMER', name: 'Customer' },
  { code: 'MODERATOR', name: 'Moderator' },
  { code: 'ADMIN', name: 'Admin' },
  { code: 'SUPER_ADMIN', name: 'Super Admin' },
  { code: 'SUPPORT', name: 'Support' },
  { code: 'MANAGER', name: 'Manager' },
];

const PERMISSIONS = [
  {
    key: 'listing.create',
    module: 'listings',
    description: 'Create a listing',
  },
  {
    key: 'listing.update',
    module: 'listings',
    description: 'Update a listing',
  },
  {
    key: 'listing.delete',
    module: 'listings',
    description: 'Delete a listing',
  },
  {
    key: 'listing.publish',
    module: 'listings',
    description: 'Publish a listing',
  },
  {
    key: 'listing.moderate',
    module: 'listings',
    description: 'Approve or reject a listing',
  },
  {
    key: 'booking.view_all',
    module: 'bookings',
    description: 'View any booking, not only owned bookings',
  },
  {
    key: 'booking.confirm',
    module: 'bookings',
    description: "Confirm a customer's booking request",
  },
  {
    key: 'booking.reject',
    module: 'bookings',
    description: "Reject a customer's booking request",
  },
  {
    key: 'booking.cancel_any',
    module: 'bookings',
    description: 'Cancel any booking',
  },
  {
    key: 'partner.verify',
    module: 'partners',
    description: 'Approve or reject partner verification',
  },
  {
    key: 'partner.moderate',
    module: 'partners',
    description: 'Suspend or moderate a partner account',
  },
  {
    key: 'review.moderate',
    module: 'reviews',
    description: 'Approve, reject, or flag a review',
  },
  {
    key: 'media.moderate',
    module: 'media',
    description: 'Approve, reject, or flag uploaded media',
  },
  {
    key: 'promotion.approve',
    module: 'advertising',
    description: 'Approve a submitted advertisement request',
  },
  {
    key: 'promotion.mark_paid',
    module: 'advertising',
    description: 'Manually mark an advertisement as paid',
  },
  {
    key: 'user.suspend',
    module: 'users',
    description: 'Suspend a user account',
  },
  {
    key: 'user.list',
    module: 'users',
    description: 'List/search user accounts',
  },
  {
    key: 'user.view',
    module: 'users',
    description: "View another user's account (not just one's own)",
  },
  {
    key: 'user.update',
    module: 'users',
    description: "Update another user's account fields (not just one's own)",
  },
  {
    key: 'user.delete',
    module: 'users',
    description: "Deactivate another user's account (not just one's own)",
  },
  {
    key: 'role.manage',
    module: 'admin',
    description: 'Create/edit roles and their permissions',
  },
  {
    key: 'role.assign',
    module: 'admin',
    description: 'Assign a role to a user',
  },
  { key: 'audit.view', module: 'admin', description: 'View audit log entries' },
  {
    key: 'settings.manage',
    module: 'admin',
    description: 'Edit platform configuration',
  },
  {
    key: 'marketplace.configure',
    module: 'admin',
    description:
      'Create/edit/delete marketplace configuration (categories, amenities, pricing models, geography)',
  },
  {
    key: 'cms.manage',
    module: 'cms',
    description: 'Create/edit/delete/publish CMS page content',
  },
  {
    key: 'messaging.view_all',
    module: 'messaging',
    description:
      'View any conversation, not only ones the user participates in',
  },
  {
    key: 'messaging.moderate',
    module: 'messaging',
    description: 'Soft-delete any message',
  },
  {
    key: 'ai.admin_tools',
    module: 'ai',
    description:
      'Access AI moderation aids (duplicate/spam/risk scoring) for listings',
  },
  {
    key: 'ai.usage_view',
    module: 'ai',
    description: 'View aggregate AI usage/cost statistics',
  },
  {
    key: 'payment.view',
    module: 'payments',
    description:
      'View any payment/refund/ledger entry, not only owned bookings/partnerships',
  },
  {
    key: 'payment.refund',
    module: 'payments',
    description: 'Issue a refund for a payment',
  },
  {
    key: 'inventory.view_all',
    module: 'inventory',
    description:
      "View any partner's availability, blocks, external reservations, connections, and sync history — not only owned/employed partnerships (Admin/Support oversight, Phase 17 spec §40)",
  },
  {
    key: 'inventory.manage_all',
    module: 'inventory',
    description:
      "Create/resolve inventory adjustments and sync conflicts on any partner's inventory (Admin intervention, always audit-logged, Phase 17 spec §40)",
  },
  {
    key: 'manager.assign',
    module: 'admin',
    description:
      'Grant/revoke the Manager role and assign/unassign companies to a Manager',
  },
  {
    key: 'contact.manage',
    module: 'contact',
    description: 'View and resolve public Contact form inquiries',
  },
];

const ROLE_PERMISSIONS = {
  SUPER_ADMIN: PERMISSIONS.map((permission) => permission.key),
  ADMIN: PERMISSIONS.map((permission) => permission.key).filter(
    (key) => key !== 'role.manage',
  ),
  MODERATOR: [
    'listing.moderate',
    'review.moderate',
    'media.moderate',
    'partner.moderate',
    'promotion.approve',
    'messaging.moderate',
  ],
  // Read-only admin-area access — enough to look up a user/booking/audit
  // trail while helping a customer, nothing that mutates state.
  SUPPORT: [
    'user.list',
    'user.view',
    'booking.view_all',
    'audit.view',
    'messaging.view_all',
    // View-only, matching every other SUPPORT grant — refunds stay
    // ADMIN/SUPER_ADMIN-only (Phase 16 spec §17: "refund actions only
    // with explicit permission").
    'payment.view',
    // View-only — resolving a sync conflict or adjusting inventory stays
    // ADMIN/SUPER_ADMIN-only, same boundary as payment.refund above.
    'inventory.view_all',
  ],
  CUSTOMER: [],
  // Assignment-based access, not RBAC — see the MANAGER header comment
  // above.
  MANAGER: [],
};

async function upsertPermissions(connection) {
  if (PERMISSIONS.length === 0) return;
  const placeholders = PERMISSIONS.map(() => '(?, ?, ?)').join(', ');
  const values = PERMISSIONS.flatMap((permission) => [
    permission.key,
    permission.module,
    permission.description,
  ]);
  await connection.query(
    `INSERT INTO permissions (\`key\`, module, description) VALUES ${placeholders}
     ON DUPLICATE KEY UPDATE module = VALUES(module), description = VALUES(description)`,
    values,
  );
}

export default async function seedRolesAndPermissions(connection) {
  await upsertByCode(connection, 'roles', ROLES);
  await upsertPermissions(connection);

  const roleIds = await getIdsByCode(
    connection,
    'roles',
    ROLES.map((role) => role.code),
  );
  const [permissionRows] = await connection.query(
    'SELECT id, `key` FROM permissions',
  );
  const permissionIdsByKey = new Map(
    permissionRows.map((row) => [row.key, row.id]),
  );

  // eslint-disable-next-line no-restricted-syntax -- seeding must run in a stable, readable order
  for (const [roleCode, permissionKeys] of Object.entries(ROLE_PERMISSIONS)) {
    if (permissionKeys.length > 0) {
      const roleId = roleIds.get(roleCode);
      const rows = permissionKeys.map((key) => [
        permissionIdsByKey.get(key),
        roleId,
      ]);
      // eslint-disable-next-line no-await-in-loop -- sequential by design
      await connection.query(
        'INSERT IGNORE INTO permission_role (permission_id, role_id) VALUES ?',
        [rows],
      );
    }
  }
}
