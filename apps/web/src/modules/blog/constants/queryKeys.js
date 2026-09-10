/**
 * Blog query-key factory (FRONTEND_ARCHITECTURE.md §14.1) — every `blog`
 * React Query hook builds its key through this, never an ad hoc array.
 */

const blogKeys = {
  all: ['blog'],
  public: {
    lists: () => [...blogKeys.all, 'public', 'list'],
    list: (filters) => [...blogKeys.public.lists(), { filters }],
    details: () => [...blogKeys.all, 'public', 'detail'],
    detail: (slug, locale) => [...blogKeys.public.details(), slug, locale],
    categories: (locale) => [...blogKeys.all, 'public', 'categories', locale],
    tags: (locale) => [...blogKeys.all, 'public', 'tags', locale],
  },
  admin: {
    lists: () => [...blogKeys.all, 'admin', 'list'],
    list: (filters) => [...blogKeys.admin.lists(), { filters }],
    details: () => [...blogKeys.all, 'admin', 'detail'],
    detail: (id) => [...blogKeys.admin.details(), id],
  },
};

export default blogKeys;
