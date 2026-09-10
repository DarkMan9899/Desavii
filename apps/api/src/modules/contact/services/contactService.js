/**
 * Contact module Service (Sprint G — public Contact form).
 *
 * `submitInquiry` is the ONLY public, unauthenticated entry point (route-
 * level `sensitiveRateLimiter`, same tier `auth/module.routes.js` already
 * applies to every other public unauthenticated POST). Layer 2
 * (structural) validation already ran in `contactValidators.js`; this
 * method only does the Layer 3 (database-dependent) type-code lookup.
 * The Admin-side methods mirror `ManagerService`'s
 * `#assertAdminPermission` pattern exactly — permission is enforced both
 * at the route (`requireRole`/`requirePermission`) and again here
 * (defense in depth, same convention every other admin-facing service in
 * this codebase follows).
 */

import {
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
} from '../../../errors/AppError.js';
import { createNoOpEventBus } from '../../../core/events/domainEventBus.js';
import { createDomainEvent } from '../../../core/events/createDomainEvent.js';
import { EVENT_TYPES } from '../../../core/events/eventTypes.js';

const RESOLVED_STATUS_CODE = 'RESOLVED';

export class ContactService {
  #contactRepository;

  #permissionResolver;

  #auditLogger;

  #eventBus;

  constructor({
    contactRepository,
    permissionResolver,
    auditLogger,
    eventBus = createNoOpEventBus(),
  }) {
    this.#contactRepository = contactRepository;
    this.#permissionResolver = permissionResolver;
    this.#auditLogger = auditLogger;
    this.#eventBus = eventBus;
  }

  async #assertAdminPermission(principal) {
    if (!principal) throw new AuthenticationError();
    const granted = await this.#permissionResolver.hasPermission(
      principal.roles,
      'contact.manage',
    );
    if (!granted) throw new AuthorizationError();
  }

  async submitInquiry({ typeCode, name, email, subject, message }) {
    const typeId = await this.#contactRepository.findTypeIdByCode(typeCode);
    if (!typeId) {
      throw new ValidationError('Invalid inquiry type.', [
        { field: 'inquiryType', issue: 'INVALID' },
      ]);
    }
    const newStatusId = await this.#contactRepository.findStatusIdByCode('NEW');

    const inquiryId = await this.#contactRepository.create({
      typeId,
      statusId: newStatusId,
      name,
      email,
      subject,
      message,
    });

    await this.#auditLogger.record({
      actorId: null,
      action: 'contact.inquiry_submitted',
      targetType: 'contact_inquiry',
      targetId: inquiryId,
      afterSnapshot: { typeCode, subject },
    });

    await this.#eventBus.publish(
      createDomainEvent({
        eventType: EVENT_TYPES.CONTACT_INQUIRY_SUBMITTED,
        resourceType: 'contact_inquiry',
        resourceId: inquiryId,
        payload: { inquiryId, typeCode, subject },
      }),
    );

    return { id: inquiryId };
  }

  async listInquiries(principal, { limit, statusCode } = {}) {
    await this.#assertAdminPermission(principal);
    return this.#contactRepository.list({ limit, statusCode });
  }

  async getInquiry(principal, id) {
    await this.#assertAdminPermission(principal);
    const inquiry = await this.#contactRepository.findById(id);
    if (!inquiry) throw new NotFoundError('Contact inquiry not found.');
    return inquiry;
  }

  async resolveInquiry(principal, id) {
    await this.#assertAdminPermission(principal);
    const inquiry = await this.#contactRepository.findById(id);
    if (!inquiry) throw new NotFoundError('Contact inquiry not found.');

    const resolvedStatusId =
      await this.#contactRepository.findStatusIdByCode(RESOLVED_STATUS_CODE);
    await this.#contactRepository.resolve({
      id,
      statusId: resolvedStatusId,
      resolvedBy: principal.userId,
    });

    await this.#auditLogger.record({
      actorId: principal.userId,
      action: 'contact.inquiry_resolved',
      targetType: 'contact_inquiry',
      targetId: id,
      beforeSnapshot: { statusCode: inquiry.status_code },
      afterSnapshot: { statusCode: RESOLVED_STATUS_CODE },
    });

    return this.#contactRepository.findById(id);
  }
}

export default ContactService;
