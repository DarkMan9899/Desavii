/**
 * Contact query-key factory (FRONTEND_ARCHITECTURE.md §14.1) — every
 * `contact` React Query hook builds its key through this, never an ad
 * hoc array.
 */

const contactKeys = {
  all: ['contact'],
  admin: {
    lists: () => [...contactKeys.all, 'admin', 'list'],
    list: (filters) => [...contactKeys.admin.lists(), { filters }],
    details: () => [...contactKeys.all, 'admin', 'detail'],
    detail: (id) => [...contactKeys.admin.details(), id],
  },
};

export default contactKeys;
