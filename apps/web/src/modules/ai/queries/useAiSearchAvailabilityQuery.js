/**
 * `useAiSearchAvailabilityQuery` — wraps `GET /ai/search/availability`:
 * whether a real language model answers AI search right now. It only
 * changes when the platform's AI configuration does, so it is cached for
 * the session; a failed check counts as unavailable (never as AI).
 */

import { useQuery } from '@tanstack/react-query';
import { getAiSearchAvailability } from '../../../api/ai.js';
import aiKeys from '../constants/queryKeys.js';

export function useAiSearchAvailabilityQuery() {
  return useQuery({
    queryKey: aiKeys.searchAvailability(),
    queryFn: () => getAiSearchAvailability(),
    select: (response) => response.data.available === true,
    staleTime: Infinity,
    retry: false,
  });
}

export default useAiSearchAvailabilityQuery;
