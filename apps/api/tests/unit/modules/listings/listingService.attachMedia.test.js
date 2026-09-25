/**
 * Step L3 (brief §20): a listing's media object is stored in
 * `StorageProvider` (§19) strictly before the `media` row is inserted —
 * "reject first, store second" means the store can still succeed while
 * the DB write that follows it fails (a stale FK, a transient
 * connection error). This unit-tests `ListingService#attachMedia`'s own
 * cleanup contract in isolation, with every collaborator (repository,
 * storage, ownership check, transaction) mocked/injected — the full,
 * real-DB, real-storage path is already covered by
 * `tests/integration/listings/listingMedia.test.js`.
 */

import { describe, test, expect, jest, beforeAll } from '@jest/globals';
import sharp from 'sharp';

let ListingService;
let isPartnerOwnerMock;
let withTransactionMock;

jest.unstable_mockModule(
  '../../../../src/infrastructure/database/repositories/partnerEmployeeRepository.js',
  () => ({
    isPartnerOwner: (...args) => isPartnerOwnerMock(...args),
  }),
);
jest.unstable_mockModule(
  '../../../../src/infrastructure/database/transaction.js',
  () => ({
    withTransaction: (...args) => withTransactionMock(...args),
  }),
);

beforeAll(async () => {
  ({ ListingService } =
    await import('../../../../src/modules/listings/services/listingService.js'));
});

function buildService(overrides = {}) {
  const listingRepository = {
    findById: jest.fn(),
    lockById: jest.fn(),
    attachMedia: jest.fn(),
    ...overrides.listingRepository,
  };
  const storageProvider = {
    put: jest.fn(),
    delete: jest.fn().mockResolvedValue(undefined),
    ...overrides.storageProvider,
  };
  const auditLogger = { record: jest.fn(), ...overrides.auditLogger };
  const service = new ListingService({
    listingRepository,
    listingMetadataRepository: {},
    storageProvider,
    auditLogger,
    permissionResolver: { hasPermission: jest.fn().mockReturnValue(false) },
  });
  return { service, listingRepository, storageProvider, auditLogger };
}

async function makePng() {
  return sharp({
    create: {
      width: 2,
      height: 2,
      channels: 3,
      background: { r: 1, g: 2, b: 3 },
    },
  })
    .png()
    .toBuffer();
}

const PRINCIPAL = { userId: 99, roles: ['PARTNER'] };

describe('ListingService#attachMedia — orphan cleanup (Step L3 brief §20)', () => {
  test('deletes the just-stored object when the DB insert fails after storage.put already succeeded', async () => {
    isPartnerOwnerMock = jest.fn().mockResolvedValue(true);
    withTransactionMock = jest.fn(async (fn) => fn({}));

    const { service, listingRepository, storageProvider } = buildService();
    listingRepository.findById.mockResolvedValue({
      id: 7,
      partnerId: 1,
      media: [],
    });
    listingRepository.lockById.mockResolvedValue({ id: 7, deletedAt: null });
    storageProvider.put.mockResolvedValue({
      key: 'listings/7/stored-key.png',
      url: 'https://cdn.example/listings/7/stored-key.png',
    });
    listingRepository.attachMedia.mockRejectedValue(new Error('insert failed'));

    await expect(
      service.attachMedia(PRINCIPAL, 7, await makePng(), 'image/png'),
    ).rejects.toThrow('insert failed');

    expect(storageProvider.put).toHaveBeenCalledTimes(1);
    const [storedKey] = storageProvider.put.mock.calls[0];
    expect(storageProvider.delete).toHaveBeenCalledWith(storedKey);
  });

  test('deletes the just-stored object when the row lock finds the listing gone (deleted mid-flight)', async () => {
    isPartnerOwnerMock = jest.fn().mockResolvedValue(true);
    withTransactionMock = jest.fn(async (fn) => fn({}));

    const { service, listingRepository, storageProvider } = buildService();
    listingRepository.findById.mockResolvedValue({
      id: 7,
      partnerId: 1,
      media: [],
    });
    listingRepository.lockById.mockResolvedValue(null);

    storageProvider.put.mockResolvedValue({
      key: 'listings/7/stored-key.png',
      url: 'https://cdn.example/listings/7/stored-key.png',
    });

    await expect(
      service.attachMedia(PRINCIPAL, 7, await makePng(), 'image/png'),
    ).rejects.toThrow('Listing not found.');

    const [storedKey] = storageProvider.put.mock.calls[0];
    expect(storageProvider.delete).toHaveBeenCalledWith(storedKey);
  });

  test('never deletes the stored object when the write succeeds', async () => {
    isPartnerOwnerMock = jest.fn().mockResolvedValue(true);
    withTransactionMock = jest.fn(async (fn) => fn({}));

    const { service, listingRepository, storageProvider } = buildService();
    listingRepository.findById.mockResolvedValue({
      id: 7,
      partnerId: 1,
      media: [],
    });
    listingRepository.lockById.mockResolvedValue({ id: 7, deletedAt: null });
    storageProvider.put.mockResolvedValue({
      key: 'listings/7/stored-key.png',
      url: 'https://cdn.example/listings/7/stored-key.png',
    });
    listingRepository.attachMedia.mockResolvedValue({ id: 55 });

    const media = await service.attachMedia(
      PRINCIPAL,
      7,
      await makePng(),
      'image/png',
    );

    expect(media).toEqual({ id: 55 });
    expect(storageProvider.delete).not.toHaveBeenCalled();
  });

  test('never calls storage.put at all for an image that fails content validation', async () => {
    isPartnerOwnerMock = jest.fn().mockResolvedValue(true);
    withTransactionMock = jest.fn(async (fn) => fn({}));

    const { service, listingRepository, storageProvider } = buildService();
    listingRepository.findById.mockResolvedValue({
      id: 7,
      partnerId: 1,
      media: [],
    });

    const corrupt = Buffer.from('not an image');

    await expect(
      service.attachMedia(PRINCIPAL, 7, corrupt, 'image/png'),
    ).rejects.toThrow('This image is corrupt or could not be read.');

    expect(storageProvider.put).not.toHaveBeenCalled();
    expect(listingRepository.attachMedia).not.toHaveBeenCalled();
  });
});
