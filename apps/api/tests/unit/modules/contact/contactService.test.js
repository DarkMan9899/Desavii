import { describe, test, expect, jest } from '@jest/globals';
import { ContactService } from '../../../../src/modules/contact/services/contactService.js';
import {
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ValidationError,
} from '../../../../src/errors/AppError.js';

const ADMIN_PRINCIPAL = { userId: 1, roles: ['ADMIN'] };
const INQUIRY_ROW = {
  id: 7,
  name: 'Ani',
  email: 'ani@example.com',
  subject: 'Question about a hotel booking',
  message: 'Is breakfast included?',
  type_code: 'BOOKING_SUPPORT',
  status_code: 'NEW',
  resolved_at: null,
  resolved_by: null,
  created_at: '2026-09-10T00:00:00.000Z',
  updated_at: '2026-09-10T00:00:00.000Z',
};

function buildService(overrides = {}) {
  const contactRepository = {
    findTypeIdByCode: jest.fn().mockResolvedValue(11),
    findStatusIdByCode: jest.fn().mockResolvedValue(21),
    create: jest.fn().mockResolvedValue(7),
    findById: jest.fn().mockResolvedValue(INQUIRY_ROW),
    list: jest.fn().mockResolvedValue([INQUIRY_ROW]),
    resolve: jest.fn().mockResolvedValue(true),
    ...overrides.contactRepository,
  };
  const permissionResolver = {
    hasPermission: jest.fn().mockResolvedValue(true),
    ...overrides.permissionResolver,
  };
  const auditLogger = { record: jest.fn().mockResolvedValue(undefined) };
  const eventBus = { publish: jest.fn().mockResolvedValue(undefined) };
  const service = new ContactService({
    contactRepository,
    permissionResolver,
    auditLogger,
    eventBus,
  });
  return {
    service,
    contactRepository,
    permissionResolver,
    auditLogger,
    eventBus,
  };
}

describe('ContactService.submitInquiry', () => {
  const VALID_INPUT = {
    typeCode: 'BOOKING_SUPPORT',
    name: 'Ani',
    email: 'ani@example.com',
    subject: 'Question about a hotel booking',
    message: 'Is breakfast included?',
  };

  test('creates an inquiry, audit-logs it, and publishes CONTACT_INQUIRY_SUBMITTED', async () => {
    const { service, contactRepository, auditLogger, eventBus } =
      buildService();

    const result = await service.submitInquiry(VALID_INPUT);

    expect(contactRepository.findTypeIdByCode).toHaveBeenCalledWith(
      'BOOKING_SUPPORT',
    );
    expect(contactRepository.create).toHaveBeenCalledWith({
      typeId: 11,
      statusId: 21,
      name: 'Ani',
      email: 'ani@example.com',
      subject: 'Question about a hotel booking',
      message: 'Is breakfast included?',
    });
    expect(auditLogger.record).toHaveBeenCalledTimes(1);
    expect(auditLogger.record).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: null, targetId: 7 }),
    );
    expect(eventBus.publish).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ id: 7 });
  });

  test('throws ValidationError for an unknown inquiry type code', async () => {
    const { service } = buildService({
      contactRepository: {
        findTypeIdByCode: jest.fn().mockResolvedValue(null),
      },
    });
    await expect(service.submitInquiry(VALID_INPUT)).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  test('never requires a principal (anonymous, public submission)', async () => {
    const { service } = buildService();
    await expect(service.submitInquiry(VALID_INPUT)).resolves.toEqual({
      id: 7,
    });
  });
});

describe('ContactService admin access', () => {
  test('listInquiries throws AuthenticationError with no principal', async () => {
    const { service } = buildService();
    await expect(service.listInquiries(null)).rejects.toBeInstanceOf(
      AuthenticationError,
    );
  });

  test('listInquiries throws AuthorizationError without contact.manage', async () => {
    const { service } = buildService({
      permissionResolver: { hasPermission: jest.fn().mockResolvedValue(false) },
    });
    await expect(service.listInquiries(ADMIN_PRINCIPAL)).rejects.toBeInstanceOf(
      AuthorizationError,
    );
  });

  test('listInquiries returns rows for a permitted principal', async () => {
    const { service, contactRepository } = buildService();
    const rows = await service.listInquiries(ADMIN_PRINCIPAL, {
      limit: 10,
      statusCode: 'NEW',
    });
    expect(contactRepository.list).toHaveBeenCalledWith({
      limit: 10,
      statusCode: 'NEW',
    });
    expect(rows).toEqual([INQUIRY_ROW]);
  });

  test('getInquiry throws NotFoundError for a missing id', async () => {
    const { service } = buildService({
      contactRepository: { findById: jest.fn().mockResolvedValue(null) },
    });
    await expect(
      service.getInquiry(ADMIN_PRINCIPAL, 999),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  test('resolveInquiry moves the inquiry to RESOLVED and audit-logs it', async () => {
    const { service, contactRepository, auditLogger } = buildService();
    await service.resolveInquiry(ADMIN_PRINCIPAL, 7);
    expect(contactRepository.resolve).toHaveBeenCalledWith({
      id: 7,
      statusId: 21,
      resolvedBy: 1,
    });
    expect(auditLogger.record).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 1,
        action: 'contact.inquiry_resolved',
        targetId: 7,
      }),
    );
  });
});
