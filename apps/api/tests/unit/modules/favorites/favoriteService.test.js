import { describe, test, expect, jest } from '@jest/globals';
import { FavoriteService } from '../../../../src/modules/favorites/services/favoriteService.js';
import { AuthenticationError } from '../../../../src/errors/AppError.js';

const PRINCIPAL = { userId: 1, roles: ['CUSTOMER'] };

function buildService(overrides = {}) {
  const favoriteRepository = {
    // Step A2: real repository behavior is `true` on a genuine
    // insert/delete, `false` on a no-op — matches every existing test
    // below's expectation of a real state transition unless a test
    // explicitly overrides it to exercise the no-op path.
    add: jest.fn().mockResolvedValue(true),
    remove: jest.fn().mockResolvedValue(true),
    listListingIdsForCustomer: jest.fn().mockResolvedValue([]),
    listForCustomer: jest.fn().mockResolvedValue({ rows: [], meta: {} }),
    ...overrides.favoriteRepository,
  };
  const listingService = {
    getListing: jest
      .fn()
      .mockResolvedValue({ id: 5, statusCode: 'PUBLISHED', partnerId: 9 }),
    ...overrides.listingService,
  };
  const eventBus = {
    publish: jest.fn().mockResolvedValue(undefined),
    ...overrides.eventBus,
  };
  const service = new FavoriteService({
    favoriteRepository,
    listingService,
    eventBus,
  });
  return { service, favoriteRepository, listingService, eventBus };
}

describe('FavoriteService', () => {
  test('addFavorite verifies listing visibility then adds it', async () => {
    const { service, favoriteRepository, listingService } = buildService();
    await service.addFavorite(PRINCIPAL, 5);
    expect(listingService.getListing).toHaveBeenCalledWith(PRINCIPAL, 5);
    expect(favoriteRepository.add).toHaveBeenCalledWith(1, 5);
  });

  test('addFavorite propagates a NotFoundError for an invisible listing without adding it', async () => {
    const notFound = new Error('not found');
    const { service, favoriteRepository } = buildService({
      listingService: { getListing: jest.fn().mockRejectedValue(notFound) },
    });
    await expect(service.addFavorite(PRINCIPAL, 5)).rejects.toBe(notFound);
    expect(favoriteRepository.add).not.toHaveBeenCalled();
  });

  test('addFavorite throws AuthenticationError with no principal', async () => {
    const { service } = buildService();
    await expect(service.addFavorite(null, 5)).rejects.toBeInstanceOf(
      AuthenticationError,
    );
  });

  // Step A2 (Engagement Analytics): a genuine insert publishes
  // FAVORITE_ADDED with the resolved partnerId.
  test('addFavorite publishes FAVORITE_ADDED on a genuine state transition', async () => {
    const { service, eventBus } = buildService();
    await service.addFavorite(PRINCIPAL, 5);
    expect(eventBus.publish).toHaveBeenCalledTimes(1);
    const [event] = eventBus.publish.mock.calls[0];
    expect(event.eventType).toBe('favorite.added');
    expect(event.payload).toEqual({ listingId: 5, partnerId: 9 });
  });

  // Step A2: `INSERT IGNORE` no-op on an already-favorited listing must
  // never fire a second FAVORITE_ADDED event, even though the API call
  // itself still succeeds.
  test('addFavorite does not publish when the listing was already favorited', async () => {
    const { service, eventBus } = buildService({
      favoriteRepository: { add: jest.fn().mockResolvedValue(false) },
    });
    await service.addFavorite(PRINCIPAL, 5);
    expect(eventBus.publish).not.toHaveBeenCalled();
  });

  test('removeFavorite delegates to the repository and publishes FAVORITE_REMOVED on a genuine state transition', async () => {
    const { service, favoriteRepository, eventBus } = buildService();
    await service.removeFavorite(PRINCIPAL, 5);
    expect(favoriteRepository.remove).toHaveBeenCalledWith(1, 5);
    expect(eventBus.publish).toHaveBeenCalledTimes(1);
    const [event] = eventBus.publish.mock.calls[0];
    expect(event.eventType).toBe('favorite.removed');
    expect(event.payload).toEqual({ listingId: 5, partnerId: 9 });
  });

  // Step A2: a repeat removal of an already-absent favorite is a
  // harmless no-op — never a second FAVORITE_REMOVED signal.
  test('removeFavorite does not publish when the favorite was already absent', async () => {
    const { service, eventBus } = buildService({
      favoriteRepository: { remove: jest.fn().mockResolvedValue(false) },
    });
    await service.removeFavorite(PRINCIPAL, 5);
    expect(eventBus.publish).not.toHaveBeenCalled();
  });

  // Step A2: un-favoriting must succeed even if the listing itself is no
  // longer resolvable (unpublished/expired/deleted since it was saved) —
  // the event still publishes, just with a null partnerId.
  test('removeFavorite still publishes with a null partnerId when the listing is no longer resolvable', async () => {
    const { service, eventBus } = buildService({
      listingService: {
        getListing: jest.fn().mockRejectedValue(new Error('not found')),
      },
    });
    await expect(service.removeFavorite(PRINCIPAL, 5)).resolves.toBeUndefined();
    expect(eventBus.publish).toHaveBeenCalledTimes(1);
    const [event] = eventBus.publish.mock.calls[0];
    expect(event.payload).toEqual({ listingId: 5, partnerId: null });
  });

  test('listFavoritedListingIds delegates to the repository', async () => {
    const { service, favoriteRepository } = buildService({
      favoriteRepository: {
        listListingIdsForCustomer: jest.fn().mockResolvedValue([5, 6]),
      },
    });
    const result = await service.listFavoritedListingIds(PRINCIPAL);
    expect(favoriteRepository.listListingIdsForCustomer).toHaveBeenCalledWith(
      1,
    );
    expect(result).toEqual([5, 6]);
  });

  test('listFavorites delegates to the repository with pagination options', async () => {
    const { service, favoriteRepository } = buildService();
    await service.listFavorites(PRINCIPAL, { cursor: 'abc', limit: 10 });
    expect(favoriteRepository.listForCustomer).toHaveBeenCalledWith(1, {
      cursor: 'abc',
      limit: 10,
    });
  });
});
