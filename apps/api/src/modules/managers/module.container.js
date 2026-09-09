/**
 * Managers module DI container (BACKEND_ARCHITECTURE.md §17).
 *
 * Depends on `partnerService` (validate a target company exists) and
 * `userService` (validate/promote a target user) — both public Service
 * interfaces, never a second Repository over their tables (§4's
 * cross-module rule).
 */

import { MySqlManagerRepository } from './repositories/mysqlManagerRepository.js';
import { ManagerService } from './services/managerService.js';
import { createManagerController } from './controllers/managerController.js';

export default function createManagersContainer({
  partnerService,
  userService,
  permissionResolver,
  auditLogger,
}) {
  const managerRepository = new MySqlManagerRepository();
  const managerService = new ManagerService({
    managerRepository,
    partnerService,
    userService,
    permissionResolver,
    auditLogger,
  });
  const managerController = createManagerController(managerService);

  return {
    managerRepository,
    managerService,
    managerController,
  };
}
