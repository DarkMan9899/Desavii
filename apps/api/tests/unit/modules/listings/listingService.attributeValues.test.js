/**
 * Step L5 (brief §15) — BOOLEAN / DATE / STRING attribute values are
 * checked against the exact wire contract the wizard sends
 * (`apps/web/src/modules/listings/utils/attributeValueMapping.js`).
 * No seeded category currently offers an attribute of these three types,
 * so the integration suite cannot reach these branches through real
 * metadata; this exercises `ListingService#updateListing` with the
 * metadata repository stubbed to return one such definition.
 */

import { describe, test, expect, jest, beforeAll } from '@jest/globals';

let ListingService;
let ValidationError;

jest.unstable_mockModule(
  '../../../../src/infrastructure/database/repositories/partnerEmployeeRepository.js',
  () => ({ isPartnerOwner: async () => true }),
);
jest.unstable_mockModule(
  '../../../../src/infrastructure/database/transaction.js',
  () => ({ withTransaction: async (fn) => fn({}) }),
);

beforeAll(async () => {
  ({ ListingService } =
    await import('../../../../src/modules/listings/services/listingService.js'));
  ({ ValidationError } = await import('../../../../src/errors/AppError.js'));
});

const PRINCIPAL = { userId: 99, roles: ['PARTNER'] };
const CATEGORY_ID = 7;

function buildService(dataTypeCode) {
  const listingRepository = {
    lockById: jest.fn().mockResolvedValue({
      partnerId: 1,
      statusCode: 'DRAFT',
      deletedAt: null,
    }),
    findById: jest
      .fn()
      .mockResolvedValue({ id: 5, slug: 'x', categoryIds: [CATEGORY_ID] }),
    update: jest.fn(),
    replaceAttributeValues: jest.fn(),
  };
  const listingMetadataRepository = {
    getAttributeDefinitionsByCode: jest
      .fn()
      .mockResolvedValue(
        new Map([
          [
            'attr',
            { id: 11, dataTypeCode, validationMin: null, validationMax: null },
          ],
        ]),
      ),
  };
  const service = new ListingService({
    listingRepository,
    listingMetadataRepository,
    storageProvider: {},
    auditLogger: { record: jest.fn() },
    permissionResolver: { hasPermission: jest.fn().mockReturnValue(false) },
  });
  return { service, listingRepository, listingMetadataRepository };
}

async function expectRejected(dataTypeCode, value, expectedDetail) {
  const { service, listingRepository } = buildService(dataTypeCode);
  const promise = service.updateListing(PRINCIPAL, 5, {
    attributeValues: [{ code: 'attr', value }],
  });
  await expect(promise).rejects.toBeInstanceOf(ValidationError);
  await promise.catch((err) => {
    expect(err.details).toEqual([
      { field: 'attributeValues.attr', ...expectedDetail },
    ]);
  });
  expect(listingRepository.update).not.toHaveBeenCalled();
  expect(listingRepository.replaceAttributeValues).not.toHaveBeenCalled();
}

describe('ListingService — scalar attribute values (Step L5)', () => {
  test('the definition lookup is scoped to the listing primary category', async () => {
    const { service, listingMetadataRepository } = buildService('BOOLEAN');
    await service
      .updateListing(PRINCIPAL, 5, {
        attributeValues: [{ code: 'attr', value: 'nope' }],
      })
      .catch(() => {});
    expect(
      listingMetadataRepository.getAttributeDefinitionsByCode,
    ).toHaveBeenCalledWith(['attr'], CATEGORY_ID);
  });

  test('BOOLEAN rejects the string "false" instead of storing it as true', async () => {
    await expectRejected('BOOLEAN', 'false', {
      issue: 'invalid_type',
      received: 'string',
    });
  });

  test('BOOLEAN rejects a number', async () => {
    await expectRejected('BOOLEAN', 1, {
      issue: 'invalid_type',
      received: 'number',
    });
  });

  test.each([
    ['a malformed date', '26-02-2026'],
    ['an impossible calendar date', '2026-02-30'],
    ['a non-string', 20260210],
  ])('DATE rejects %s', async (_label, value) => {
    await expectRejected('DATE', value, { issue: 'invalid_date' });
  });

  test('STRING rejects a whitespace-only value', async () => {
    await expectRejected('STRING', '   ', {
      issue: 'too_small',
      type: 'string',
      minimum: 1,
    });
  });

  test('STRING rejects a value over the VARCHAR(255) column', async () => {
    await expectRejected('STRING', 'x'.repeat(256), {
      issue: 'too_big',
      type: 'string',
      maximum: 255,
    });
  });

  test('STRING rejects a non-string value', async () => {
    await expectRejected('STRING', true, {
      issue: 'invalid_type',
      received: 'boolean',
    });
  });

  test.each([
    ['BOOLEAN', true, 1],
    ['BOOLEAN', false, 0],
    ['DATE', '2026-02-28', '2026-02-28'],
    ['STRING', '  Սենյակ 255  ', 'Սենյակ 255'],
    ['STRING', 'я'.repeat(255), 'я'.repeat(255)],
  ])('%s accepts %p (stored as %p)', async (dataTypeCode, value, stored) => {
    const { service, listingRepository } = buildService(dataTypeCode);
    listingRepository.findById
      .mockResolvedValueOnce({ id: 5, slug: 'x', categoryIds: [CATEGORY_ID] })
      .mockResolvedValue(null);

    await service
      .updateListing(PRINCIPAL, 5, {
        attributeValues: [{ code: 'attr', value }],
      })
      .catch(() => {});

    expect(listingRepository.replaceAttributeValues).toHaveBeenCalledTimes(1);
    const [, written] = listingRepository.replaceAttributeValues.mock.calls[0];
    expect(written).toEqual([
      { attributeDefinitionId: 11, dataTypeCode, value: stored },
    ]);
  });
});
