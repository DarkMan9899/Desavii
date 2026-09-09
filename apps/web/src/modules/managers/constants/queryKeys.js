/**
 * Managers query-key factory (FRONTEND_ARCHITECTURE.md §14.1) — every
 * `managers` React Query hook builds its key through this, never an ad
 * hoc array.
 */

const managersKeys = {
  all: ['managers'],
  admin: {
    lists: () => [...managersKeys.all, 'admin', 'list'],
    list: (filters) => [...managersKeys.admin.lists(), { filters }],
    details: () => [...managersKeys.all, 'admin', 'detail'],
    detail: (userId) => [...managersKeys.admin.details(), userId],
    analytics: (userId, filters) => [
      ...managersKeys.all,
      'admin',
      'analytics',
      userId,
      { filters },
    ],
  },
  mine: {
    companies: () => [...managersKeys.all, 'mine', 'companies'],
    dashboard: () => [...managersKeys.all, 'mine', 'dashboard'],
    analytics: (filters) => [
      ...managersKeys.all,
      'mine',
      'analytics',
      { filters },
    ],
  },
};

export default managersKeys;
