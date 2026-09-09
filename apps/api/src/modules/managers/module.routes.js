/**
 * Managers module route wiring (BACKEND_ARCHITECTURE.md §2: route wiring
 * only, no logic).
 *
 * `/admin/*` requires `ADMIN`/`SUPER_ADMIN` outright (mirrors the
 * advertising module's `/admin/*` gate) plus the granular `manager.assign`
 * permission on every mutation — `ManagerService` re-checks the same
 * permission internally (defense in depth, same convention every other
 * admin route in this codebase follows). `/mine/*` is the Manager's own
 * self-service surface, gated by the global MANAGER role;
 * `ManagerService` re-derives the caller's OWN assigned companies from
 * `manager_companies` for every read, never trusting anything from the
 * client.
 */

import { Router } from 'express';
import { validate } from '../../validation/validate.js';
import {
  promoteToManagerSchema,
  managerIdParamsSchema,
  listManagersQuerySchema,
  assignCompanySchema,
  unassignCompanySchema,
  managerAnalyticsQuerySchema,
  adminManagerAnalyticsQuerySchema,
} from './validators/managerValidators.js';

const ADMIN_ROLES = ['ADMIN', 'SUPER_ADMIN'];

export default function createManagerRoutes({ managerController, guards }) {
  const router = Router();
  const { requireAuth, requireRole, requirePermission } = guards;

  const adminRouter = Router();
  adminRouter.use(
    requireAuth,
    requireRole(...ADMIN_ROLES),
    requirePermission('manager.assign'),
  );

  adminRouter.post(
    '/promote',
    validate(promoteToManagerSchema),
    managerController.promote,
  );
  adminRouter.get(
    '/',
    validate(listManagersQuerySchema),
    managerController.list,
  );
  adminRouter.get(
    '/:userId',
    validate(managerIdParamsSchema),
    managerController.getDetail,
  );
  adminRouter.get(
    '/:userId/analytics',
    validate(adminManagerAnalyticsQuerySchema),
    managerController.getAdminAnalyticsForManager,
  );
  adminRouter.post(
    '/:userId/companies',
    validate(assignCompanySchema),
    managerController.assignCompany,
  );
  adminRouter.delete(
    '/:userId/companies/:partnerId',
    validate(unassignCompanySchema),
    managerController.unassignCompany,
  );

  router.use('/admin', adminRouter);

  const mineRouter = Router();
  mineRouter.use(requireAuth, requireRole('MANAGER'));

  mineRouter.get('/companies', managerController.listMyCompanies);
  mineRouter.get('/dashboard', managerController.getMyDashboard);
  mineRouter.get(
    '/analytics',
    validate(managerAnalyticsQuerySchema),
    managerController.getMyAnalytics,
  );

  router.use('/mine', mineRouter);

  return router;
}
