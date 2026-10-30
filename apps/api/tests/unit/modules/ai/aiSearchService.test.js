import { describe, test, expect, jest } from '@jest/globals';
import { AiSearchService } from '../../../../src/modules/ai/services/aiSearchService.js';
import {
  AuthenticationError,
  ValidationError,
} from '../../../../src/errors/AppError.js';

const PRINCIPAL = { userId: 1, roles: ['CUSTOMER'] };

const FILTER_GROUPS = [
  {
    code: 'amenities',
    definitions: [
      {
        code: 'amenities',
        valueSource: 'AMENITY',
        options: [
          { value: 101, code: 'Pool' },
          { value: 102, code: 'Free Wi-Fi' },
        ],
      },
    ],
  },
];

function buildService(overrides = {}) {
  const searchService = {
    searchCategories: jest.fn().mockResolvedValue([
      { id: 5, name: 'Hotels' },
      { id: 6, name: 'Apartments' },
    ]),
    getFilterDefinitions: jest.fn().mockResolvedValue(FILTER_GROUPS),
    searchDestinations: jest.fn().mockResolvedValue([
      { id: 1, slug: 'yerevan', name: 'Yerevan' },
      { id: 4, slug: 'dilijan', name: 'Դիլիջան' },
      { id: 9, slug: 'sevan', name: 'Sevan' },
    ]),
    ...overrides.searchService,
  };
  const aiService = {
    complete: jest.fn().mockResolvedValue({
      content: JSON.stringify({
        parsedFilters: {},
        originalQuery: 'hotels with a pool in yerevan',
      }),
      providerCode: 'local',
      cacheHit: false,
    }),
    getStatus: jest.fn().mockReturnValue({ modelBacked: true }),
    ...overrides.aiService,
  };
  const service = new AiSearchService({ searchService, aiService });
  return { service, searchService, aiService };
}

describe('AiSearchService', () => {
  test('parseQuery requires a principal', async () => {
    const { service } = buildService();
    await expect(
      service.parseQuery(null, { query: 'hotels in yerevan' }),
    ).rejects.toBeInstanceOf(AuthenticationError);
  });

  test('parseQuery rejects an empty query', async () => {
    const { service } = buildService();
    await expect(
      service.parseQuery(PRINCIPAL, { query: '   ' }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  test('matches free-text against real category names, never inventing one', async () => {
    const { service, searchService } = buildService();
    const result = await service.parseQuery(PRINCIPAL, {
      query: 'hotels with a pool in yerevan',
    });
    expect(searchService.searchCategories).toHaveBeenCalled();
    expect(result.categoryId).toBe(5);
    expect(result.categoryName).toBe('Hotels');
  });

  test('returns no category when nothing in the query matches a real one', async () => {
    const { service } = buildService();
    const result = await service.parseQuery(PRINCIPAL, {
      query: 'somewhere quiet by the lake',
    });
    expect(result.categoryId).toBeNull();
    expect(result.amenityIds).toEqual([]);
  });

  test('matches amenity ids against the resolved category real filter catalog, not invented ones', async () => {
    const { service, searchService } = buildService();
    const result = await service.parseQuery(PRINCIPAL, {
      query: 'hotels with a pool in yerevan',
    });
    expect(searchService.getFilterDefinitions).toHaveBeenCalledWith(5);
    expect(result.amenityIds).toEqual([101]);
  });

  test('never calls getFilterDefinitions when no category was resolved', async () => {
    const { service, searchService } = buildService();
    await service.parseQuery(PRINCIPAL, { query: 'somewhere with a pool' });
    expect(searchService.getFilterDefinitions).not.toHaveBeenCalled();
  });

  test('falls back to the raw query text when the AI response is not parseable JSON', async () => {
    const { service } = buildService({
      aiService: {
        complete: jest.fn().mockResolvedValue({
          content: 'Cozy hotels with a pool near Yerevan',
          providerCode: 'openai',
          cacheHit: false,
        }),
      },
    });
    const result = await service.parseQuery(PRINCIPAL, {
      query: 'hotels with a pool in yerevan',
    });
    expect(result.keyword).toBe('Cozy hotels with a pool near Yerevan');
  });

  // Home AI discovery: the destination comes from the real catalog, in the
  // traveller's locale, by name or slug — never from the model's text.
  test('resolves the destination the query names against the real destinations catalog', async () => {
    const { service, searchService } = buildService();
    const result = await service.parseQuery(PRINCIPAL, {
      query: 'Հանգիստ հյուրանոց Դիլիջանում երկու հոգու համար',
      locale: 'hy',
    });
    expect(searchService.searchDestinations).toHaveBeenCalledWith('hy');
    expect(searchService.searchCategories).toHaveBeenCalledWith('hy');
    expect(result).toMatchObject({ cityId: 4, cityName: 'Դիլիջան' });
  });

  test('matches a destination written in Latin letters by its slug', async () => {
    const { service } = buildService();
    const result = await service.parseQuery(PRINCIPAL, {
      query: 'quiet stay in dilijan for two',
    });
    expect(result.cityId).toBe(4);
  });

  test('prefers the longest destination match, and invents none when nothing matches', async () => {
    const { service } = buildService({
      searchService: {
        searchDestinations: jest.fn().mockResolvedValue([
          { id: 9, slug: 'sevan', name: 'Sevan' },
          { id: 12, slug: 'lake-sevan', name: 'Lake Sevan' },
        ]),
      },
    });
    const named = await service.parseQuery(PRINCIPAL, {
      query: 'a cabin at lake sevan',
    });
    expect(named.cityId).toBe(12);
    const unnamed = await service.parseQuery(PRINCIPAL, {
      query: 'somewhere quiet in the mountains',
    });
    expect(unnamed).toMatchObject({ cityId: null, cityName: null });
  });

  test('is available only when a real model answers (the local stand-in does not count)', () => {
    const { service } = buildService({
      aiService: {
        getStatus: jest.fn().mockReturnValue({ modelBacked: false }),
      },
    });
    expect(service.getAvailability()).toEqual({ available: false });
    expect(buildService().service.getAvailability()).toEqual({
      available: true,
    });
  });

  test('calls the AI gateway with the SEARCH_PARSE feature code, never a provider directly', async () => {
    const { service, aiService } = buildService();
    await service.parseQuery(PRINCIPAL, { query: 'hotels in yerevan' });
    expect(aiService.complete).toHaveBeenCalledWith(
      expect.objectContaining({ featureCode: 'search_parse' }),
    );
  });
});
