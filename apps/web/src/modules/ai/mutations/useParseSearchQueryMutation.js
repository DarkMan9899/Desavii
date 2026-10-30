/** `useParseSearchQueryMutation` — wraps `POST /ai/search/parse`; variables are `{query, locale}` or a bare query string. */

import { useMutation } from '@tanstack/react-query';
import { parseSearchQuery } from '../../../api/ai.js';

export function useParseSearchQueryMutation() {
  return useMutation({
    mutationFn: (variables) =>
      typeof variables === 'string'
        ? parseSearchQuery(variables)
        : parseSearchQuery(variables.query, variables.locale),
  });
}

export default useParseSearchQueryMutation;
