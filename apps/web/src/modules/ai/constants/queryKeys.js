/**
 * AI module query-key factory (FRONTEND_ARCHITECTURE.md §14.1) — every
 * `ai` React Query hook builds its key through this, never an ad hoc array.
 */

const aiKeys = {
  all: ['ai'],
  memory: () => [...aiKeys.all, 'memory'],
  tripPlan: (conversationId) => [...aiKeys.all, 'trip-planner', conversationId],
  recommendations: () => [...aiKeys.all, 'recommendations'],
  searchAvailability: () => [...aiKeys.all, 'search', 'availability'],
};

export default aiKeys;
