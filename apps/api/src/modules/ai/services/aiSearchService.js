/**
 * AiSearchService (Stage 15.2) — "cheap hotels with a pool in Yerevan" ->
 * real marketplace filters: a keyword phrase, a category id, and amenity
 * ids, all resolved against real data the same way `TripPlannerService`
 * resolves a destination and interests. The AI call only restates the
 * query as a short keyword phrase (`prompts/search.js`); it is never
 * trusted to invent a category, amenity, or city id itself — those are
 * matched deterministically here against `searchService.searchCategories()`
 * and `searchService.getFilterDefinitions()`, the exact same catalog
 * `GET /search/filters` already serves to `DynamicFilterPanel`.
 *
 * Home AI discovery (docs/HOME_REBUILD.md): the destination is resolved
 * the same way — the query is matched against the real destinations
 * catalog in the traveller's locale (names and slugs), so "a quiet hotel
 * in Dilijan" becomes Dilijan's real city id, never one the model wrote.
 * Categories are matched in that locale too, so HY/RU queries resolve.
 * `getAvailability` tells the Home whether a real model is behind this
 * feature at all (see `ProviderRegistry.isModelBacked`).
 */

import {
  AuthenticationError,
  ValidationError,
} from '../../../errors/AppError.js';
import { buildAiSearchPrompt } from '../prompts/search.js';
import { FEATURE_CODES } from '../constants/featureCodes.js';

const AMENITY_VALUE_SOURCE = 'AMENITY';

export class AiSearchService {
  #searchService;

  #aiService;

  constructor({ searchService, aiService }) {
    this.#searchService = searchService;
    this.#aiService = aiService;
  }

  /** Free-text query matched against real, existing category names — never invented (mirrors `TripPlannerService`'s interest matching). */
  async #resolveCategory(query, locale) {
    const categories = await this.#searchService.searchCategories(locale);
    const lowerQuery = query.toLowerCase();
    return (
      categories.find((category) =>
        lowerQuery.includes(String(category.name).toLowerCase()),
      ) ?? null
    );
  }

  /**
   * The real destination the query names, by its localized name or its
   * slug; the longest match wins, so a city whose name contains another's
   * is not mistaken for it. No match yields no destination — never a guess.
   */
  async #resolveCity(query, locale) {
    const destinations = await this.#searchService.searchDestinations(locale);
    const lowerQuery = query.toLowerCase();
    const matches = destinations
      .map((destination) => {
        const names = [destination.name, destination.slug]
          .filter(Boolean)
          .map((name) => String(name).toLowerCase())
          .filter((name) => lowerQuery.includes(name));
        return {
          destination,
          length: Math.max(0, ...names.map((n) => n.length)),
        };
      })
      .filter(({ length }) => length > 0)
      .sort((a, b) => b.length - a.length);
    return matches[0]?.destination ?? null;
  }

  /** Whether a real language model answers this feature (the deterministic `local` provider does not count). */
  getAvailability() {
    return { available: this.#aiService.getStatus().modelBacked };
  }

  /** Matches the query against the resolved category's real amenity options (`GET /search/filters`'s own catalog) — an unmatched category yields no amenities rather than a guess. */
  async #resolveAmenityIds(query, categoryId) {
    if (!categoryId) return [];
    const filterGroups =
      await this.#searchService.getFilterDefinitions(categoryId);
    const lowerQuery = query.toLowerCase();
    const amenityIds = new Set();
    filterGroups.forEach((group) => {
      (group.definitions ?? []).forEach((definition) => {
        if (definition.valueSource !== AMENITY_VALUE_SOURCE) return;
        (definition.options ?? []).forEach((option) => {
          if (lowerQuery.includes(String(option.code).toLowerCase())) {
            amenityIds.add(option.value);
          }
        });
      });
    });
    return Array.from(amenityIds);
  }

  // eslint-disable-next-line class-methods-use-this -- kept as an instance method for consistency with the rest of the class
  #extractKeyword(content, fallback) {
    try {
      const parsed = JSON.parse(content);
      if (
        parsed &&
        typeof parsed.originalQuery === 'string' &&
        parsed.originalQuery.trim()
      ) {
        return parsed.originalQuery.trim();
      }
    } catch {
      // A real provider's free-text restatement isn't JSON — its content
      // itself IS the keyword phrase the prompt asked for.
      if (content && content.trim()) return content.trim();
    }
    return fallback;
  }

  async parseQuery(principal, { query, locale }) {
    if (!principal) throw new AuthenticationError();
    const trimmed = (query ?? '').trim();
    if (!trimmed) {
      throw new ValidationError('Search query is required.', [
        { field: 'query', issue: 'REQUIRED' },
      ]);
    }

    const [category, city] = await Promise.all([
      this.#resolveCategory(trimmed, locale),
      this.#resolveCity(trimmed, locale),
    ]);
    const amenityIds = await this.#resolveAmenityIds(
      trimmed,
      category?.id ?? null,
    );

    const { system, user } = buildAiSearchPrompt({ query: trimmed });
    const { content, providerCode, cacheHit } = await this.#aiService.complete({
      principal,
      featureCode: FEATURE_CODES.SEARCH_PARSE,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    });
    const keyword = this.#extractKeyword(content, trimmed);

    return {
      keyword,
      categoryId: category?.id ?? null,
      categoryName: category?.name ?? null,
      cityId: city?.id ?? null,
      cityName: city?.name ?? null,
      amenityIds,
      providerCode,
      cacheHit,
    };
  }
}

export default AiSearchService;
