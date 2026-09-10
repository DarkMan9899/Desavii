/**
 * Contact module DI container (BACKEND_ARCHITECTURE.md §17).
 *
 * No dependency on any other module's Service — a contact inquiry is
 * self-contained (name/email/subject/message typed by an anonymous
 * visitor). `userService`/audience resolution for the admin-notification
 * fan-out lives in `notificationListener.js` (Phase 13's own rule this
 * module never bypasses), not here.
 */

import { MySqlContactRepository } from './repositories/mysqlContactRepository.js';
import { ContactService } from './services/contactService.js';
import { createContactController } from './controllers/contactController.js';

export default function createContactContainer({
  permissionResolver,
  auditLogger,
  eventBus,
}) {
  const contactRepository = new MySqlContactRepository();
  const contactService = new ContactService({
    contactRepository,
    permissionResolver,
    auditLogger,
    eventBus,
  });
  const contactController = createContactController(contactService);

  return {
    contactRepository,
    contactService,
    contactController,
  };
}
