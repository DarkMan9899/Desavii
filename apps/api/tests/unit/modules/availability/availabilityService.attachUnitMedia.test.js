/**
 * Step L3.1 (brief §13): `AvailabilityService#attachUnitMedia` now
 * follows the exact same "reject first, store second, clean up on DB
 * failure" contract `ListingService#attachMedia` established in L3 (see
 * `tests/unit/modules/listings/listingService.attachMedia.test.js`,
 * which this mirrors). Every collaborator here is mocked/injected — the
 * full, real-DB, real-storage path is covered by
 * `tests/integration/availability/bookableUnitRoomDetail.test.js`.
 */

import { describe, test, expect, jest, beforeAll } from '@jest/globals';
import sharp from 'sharp';

let AvailabilityService;
let isPartnerOwnerMock;
let withTransactionMock;

jest.unstable_mockModule(
  '../../../../src/infrastructure/database/repositories/partnerEmployeeRepository.js',
  () => ({
    isPartnerOwner: (...args) => isPartnerOwnerMock(...args),
    getPartnerEmployeeRoleCode: jest.fn().mockResolvedValue(null),
  }),
);
jest.unstable_mockModule(
  '../../../../src/infrastructure/database/transaction.js',
  () => ({
    withTransaction: (...args) => withTransactionMock(...args),
  }),
);

beforeAll(async () => {
  ({ AvailabilityService } =
    await import('../../../../src/modules/availability/services/availabilityService.js'));
});

function buildService(overrides = {}) {
  const bookableUnitService = {
    findById: jest.fn(),
    lockById: jest.fn(),
    attachMedia: jest.fn(),
    ...overrides.bookableUnitService,
  };
  const listingService = {
    getListing: jest.fn().mockResolvedValue({ id: 1, partnerId: 1 }),
    ...overrides.listingService,
  };
  const storageProvider = {
    put: jest.fn(),
    delete: jest.fn().mockResolvedValue(undefined),
    ...overrides.storageProvider,
  };
  const auditLogger = { record: jest.fn(), ...overrides.auditLogger };
  const service = new AvailabilityService({
    availabilityCalendarRepository: {},
    reservationHoldRepository: {},
    bookableUnitService,
    blackoutService: {},
    listingService,
    permissionResolver: { hasPermission: jest.fn().mockReturnValue(false) },
    auditLogger,
    inventoryLedgerRepository: {},
    inventoryBlockRepository: {},
    externalReservationRepository: {},
    storageProvider,
  });
  return { service, bookableUnitService, listingService, storageProvider };
}

async function makePng() {
  return sharp({
    create: {
      width: 2,
      height: 2,
      channels: 3,
      background: { r: 4, g: 5, b: 6 },
    },
  })
    .png()
    .toBuffer();
}

const PRINCIPAL = { userId: 99, roles: ['PARTNER'] };

describe('AvailabilityService#attachUnitMedia — orphan cleanup (Step L3.1)', () => {
  test('deletes the just-stored object when the DB insert fails after storage.put already succeeded', async () => {
    isPartnerOwnerMock = jest.fn().mockResolvedValue(true);
    withTransactionMock = jest.fn(async (fn) => fn({}));

    const { service, bookableUnitService, storageProvider } = buildService();
    bookableUnitService.findById.mockResolvedValue({ id: 5, listingId: 1 });
    bookableUnitService.lockById.mockResolvedValue({ id: 5 });
    storageProvider.put.mockResolvedValue({
      key: 'bookable-units/5/stored-key.png',
      url: 'https://cdn.example/bookable-units/5/stored-key.png',
    });
    bookableUnitService.attachMedia.mockRejectedValue(
      new Error('insert failed'),
    );

    await expect(
      service.attachUnitMedia(PRINCIPAL, 5, await makePng(), 'image/png'),
    ).rejects.toThrow('insert failed');

    expect(storageProvider.put).toHaveBeenCalledTimes(1);
    const [storedKey] = storageProvider.put.mock.calls[0];
    expect(storageProvider.delete).toHaveBeenCalledWith(storedKey);
  });

  test('deletes the just-stored object when the row lock finds the unit gone (retired mid-flight)', async () => {
    isPartnerOwnerMock = jest.fn().mockResolvedValue(true);
    withTransactionMock = jest.fn(async (fn) => fn({}));

    const { service, bookableUnitService, storageProvider } = buildService();
    bookableUnitService.findById.mockResolvedValue({ id: 5, listingId: 1 });
    bookableUnitService.lockById.mockResolvedValue(null);
    storageProvider.put.mockResolvedValue({
      key: 'bookable-units/5/stored-key.png',
      url: 'https://cdn.example/bookable-units/5/stored-key.png',
    });

    await expect(
      service.attachUnitMedia(PRINCIPAL, 5, await makePng(), 'image/png'),
    ).rejects.toThrow('Bookable unit not found.');

    const [storedKey] = storageProvider.put.mock.calls[0];
    expect(storageProvider.delete).toHaveBeenCalledWith(storedKey);
  });

  test('never deletes the stored object when the write succeeds', async () => {
    isPartnerOwnerMock = jest.fn().mockResolvedValue(true);
    withTransactionMock = jest.fn(async (fn) => fn({}));

    const { service, bookableUnitService, storageProvider } = buildService();
    bookableUnitService.findById.mockResolvedValue({ id: 5, listingId: 1 });
    bookableUnitService.lockById.mockResolvedValue({ id: 5 });
    storageProvider.put.mockResolvedValue({
      key: 'bookable-units/5/stored-key.png',
      url: 'https://cdn.example/bookable-units/5/stored-key.png',
    });
    bookableUnitService.attachMedia.mockResolvedValue({ id: 77 });

    const media = await service.attachUnitMedia(
      PRINCIPAL,
      5,
      await makePng(),
      'image/png',
    );

    expect(media).toEqual({ id: 77 });
    expect(storageProvider.delete).not.toHaveBeenCalled();
  });

  test('never calls storage.put at all for an image that fails content validation', async () => {
    isPartnerOwnerMock = jest.fn().mockResolvedValue(true);
    withTransactionMock = jest.fn(async (fn) => fn({}));

    const { service, bookableUnitService, storageProvider } = buildService();
    bookableUnitService.findById.mockResolvedValue({ id: 5, listingId: 1 });

    const corrupt = Buffer.from('not an image');

    await expect(
      service.attachUnitMedia(PRINCIPAL, 5, corrupt, 'image/png'),
    ).rejects.toThrow('This image is corrupt or could not be read.');

    expect(storageProvider.put).not.toHaveBeenCalled();
    expect(bookableUnitService.attachMedia).not.toHaveBeenCalled();
  });
});
