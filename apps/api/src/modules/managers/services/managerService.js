/**
 * ManagerService — public Service for the Managers module (Sprint F).
 *
 * Two distinct authorization boundaries, kept in two clearly separate
 * groups of methods below:
 *
 * - Admin-side (promote a user to MANAGER, assign/unassign companies,
 *   review a Manager's roster/performance) — gated by the real
 *   `manager.assign` permission (ADMIN/SUPER_ADMIN hold it automatically,
 *   `004_roles_and_permissions.js`).
 * - Manager self-service (list my assigned companies, my dashboard, my
 *   analytics) — gated by holding the global MANAGER role AND, for
 *   anything scoped to one company, a live row in `manager_companies`
 *   (`ListingService`/`BookingService`'s own `isManagerAssignedToPartner`
 *   checks are the enforcement point for listing/booking access itself;
 *   this Service enforces the same boundary for Manager's own
 *   analytics/company-list reads).
 *
 * Depends on Partners' (`getPartnerAdminDetail`, existence-validate a
 * company before assigning it) and Users' (`findById`/`getRoleCodes`/
 * `assignRole`, validate + promote a target user) public Service
 * interfaces only — never a second Repository over either module's own
 * tables (BACKEND_ARCHITECTURE.md §4).
 */

import {
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ValidationError,
} from '../../../errors/AppError.js';

export class ManagerService {
  #managerRepository;

  #partnerService;

  #userService;

  #permissionResolver;

  #auditLogger;

  constructor({
    managerRepository,
    partnerService,
    userService,
    permissionResolver,
    auditLogger,
  }) {
    this.#managerRepository = managerRepository;
    this.#partnerService = partnerService;
    this.#userService = userService;
    this.#permissionResolver = permissionResolver;
    this.#auditLogger = auditLogger;
  }

  async #assertAdminPermission(principal) {
    if (!principal) throw new AuthenticationError();
    const granted = await this.#permissionResolver.hasPermission(
      principal.roles,
      'manager.assign',
    );
    if (!granted) throw new AuthorizationError();
  }

  #assertIsManager(principal) {
    if (!principal) throw new AuthenticationError();
    if (!principal.roles.includes('MANAGER')) throw new AuthorizationError();
  }

  // --- Admin-side ---

  /** Grants the global MANAGER role to an existing user (idempotent — `assignRole` is `INSERT IGNORE`). Reuses `UserService`'s existing role-assignment machinery rather than a parallel one (spec §32). */
  async promoteToManager(principal, userId) {
    await this.#assertAdminPermission(principal);

    const user = await this.#userService.findById(userId);
    if (!user) throw new NotFoundError('User not found.');

    await this.#userService.assignRole(userId, 'MANAGER');

    await this.#auditLogger.record({
      actorId: principal.userId,
      action: 'manager.role_granted',
      targetType: 'user',
      targetId: userId,
    });

    return this.#managerRepository.findManagerUserById(userId);
  }

  async assignCompany(principal, { managerUserId, partnerId }) {
    await this.#assertAdminPermission(principal);

    const roleCodes = await this.#userService.getRoleCodes(managerUserId);
    if (!roleCodes.includes('MANAGER')) {
      throw new ValidationError('This user does not hold the Manager role.', [
        { field: 'managerUserId', issue: 'NOT_A_MANAGER' },
      ]);
    }

    // Existence-validates the target company (throws NotFoundError
    // otherwise) — the calling Admin already holds partner.verify/
    // partner.moderate (ADMIN gets every permission except role.manage),
    // so this always succeeds for any caller who passed the assertion
    // above.
    await this.#partnerService.getPartnerAdminDetail(principal, partnerId);

    const id = await this.#managerRepository.assignCompany({
      managerUserId,
      partnerId,
      assignedBy: principal.userId,
    });

    await this.#auditLogger.record({
      actorId: principal.userId,
      action: 'manager.company_assigned',
      targetType: 'manager_companies',
      targetId: id,
      afterSnapshot: { managerUserId, partnerId },
    });

    return this.#managerRepository.listAssignmentsForManager(managerUserId);
  }

  async unassignCompany(principal, { managerUserId, partnerId }) {
    await this.#assertAdminPermission(principal);

    const removed = await this.#managerRepository.unassignCompany({
      managerUserId,
      partnerId,
      unassignedBy: principal.userId,
    });
    if (!removed) {
      throw new NotFoundError(
        'No active assignment found for this manager and company.',
      );
    }

    await this.#auditLogger.record({
      actorId: principal.userId,
      action: 'manager.company_unassigned',
      targetType: 'manager_companies',
      targetId: partnerId,
      afterSnapshot: { managerUserId, partnerId },
    });

    return this.#managerRepository.listAssignmentsForManager(managerUserId);
  }

  async listManagers(principal, paginationOpts = {}) {
    await this.#assertAdminPermission(principal);
    return this.#managerRepository.listManagersAdmin(paginationOpts);
  }

  async getManagerDetail(principal, managerUserId) {
    await this.#assertAdminPermission(principal);

    const manager =
      await this.#managerRepository.findManagerUserById(managerUserId);
    if (!manager) throw new NotFoundError('Manager not found.');

    const assignments =
      await this.#managerRepository.listAssignmentsForManager(managerUserId);
    const partnerIds = assignments.map((row) => row.partner_id);

    const [dashboard, listingsCreatedCount] = await Promise.all([
      this.#managerRepository.getDashboardStats(partnerIds),
      this.#managerRepository.countListingsCreatedByManager(managerUserId),
    ]);

    return { manager, assignments, dashboard, listingsCreatedCount };
  }

  /** Admin reviewing one Manager's performance (spec §23) — scoped to the TARGET manager's own assigned companies, not the calling admin's. */
  async getAdminAnalyticsForManager(principal, managerUserId, filters = {}) {
    await this.#assertAdminPermission(principal);
    const partnerIds =
      await this.#managerRepository.listAssignedPartnerIds(managerUserId);
    return this.#managerRepository.getAnalytics(partnerIds, filters);
  }

  // --- Manager self-service ---

  async listMyCompanies(principal) {
    this.#assertIsManager(principal);
    return this.#managerRepository.listAssignmentsForManager(principal.userId);
  }

  async getDashboard(principal) {
    this.#assertIsManager(principal);
    const partnerIds = await this.#managerRepository.listAssignedPartnerIds(
      principal.userId,
    );
    const [dashboard, listingsCreatedCount] = await Promise.all([
      this.#managerRepository.getDashboardStats(partnerIds),
      this.#managerRepository.countListingsCreatedByManager(principal.userId),
    ]);
    return { ...dashboard, listingsCreatedCount };
  }

  /**
   * `filters.companyId`, if present, must be one of the Manager's own
   * assigned companies — never trusted from the client alone (spec §20/
   * §31). A guessed companyId the Manager isn't assigned to is rejected
   * outright rather than silently ignored.
   */
  async getAnalytics(principal, filters = {}) {
    this.#assertIsManager(principal);
    const partnerIds = await this.#managerRepository.listAssignedPartnerIds(
      principal.userId,
    );
    if (filters.companyId && !partnerIds.includes(filters.companyId)) {
      throw new AuthorizationError();
    }
    return this.#managerRepository.getAnalytics(partnerIds, filters);
  }
}

export default ManagerService;
