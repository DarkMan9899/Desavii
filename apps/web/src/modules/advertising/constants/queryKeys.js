/**
 * Advertising query-key factory (FRONTEND_ARCHITECTURE.md §14.1) — every
 * `advertising` React Query hook builds its key through this, never an ad
 * hoc array.
 */

const advertisingKeys = {
  all: ['advertising'],
  catalog: () => [...advertisingKeys.all, 'catalog'],
  lists: () => [...advertisingKeys.all, 'list'],
  list: (filters) => [...advertisingKeys.lists(), { filters }],
  details: () => [...advertisingKeys.all, 'detail'],
  detail: (id) => [...advertisingKeys.details(), id],
  homeFeatured: (locale) => [...advertisingKeys.all, 'home-featured', locale],
  categoryTop: (categoryId, locale) => [
    ...advertisingKeys.all,
    'category-top',
    categoryId,
    locale,
  ],
};

export default advertisingKeys;
