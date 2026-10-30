/**
 * useAskDesavii — Home's AI-assisted discovery: a request in the
 * traveller's own words → the server's interpretation (`POST
 * /ai/search/parse`: a keyword phrase plus real destination, category and
 * amenity ids resolved from the catalog) → an intent the traveller checks
 * and edits → the canonical Search state (`useHomeSearch`). The AI never
 * produces listings, prices or availability; `/search` does, from real data.
 *
 * `status` says what the entry can honestly offer right now:
 * - `checking` — availability not known yet;
 * - `unavailable` — no real language model answers (the platform's
 *   deterministic stand-in does not count) — the entry says so instead of
 *   pretending;
 * - `signin` — AI is on but needs an account (the parse route is
 *   rate-limited per user); the request is kept across sign-in;
 * - `ready`.
 *
 * An AI failure never blocks Search: the request stays, and the caller can
 * search with its words at once.
 */

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../../contexts/AuthContext.jsx';
import {
  useAiSearchAvailabilityQuery,
  useParseSearchQueryMutation,
  parsedSearchToFilters,
} from '../../ai/index.js';
import { useSearchFilterDefinitionsQuery } from '../../search/index.js';

/** Where a guest's request waits while they sign in (this tab only). */
export const ASK_DRAFT_KEY = 'desavii.askDesavii.draft';
export const ASK_MAX_LENGTH = 200;
const AMENITY_PARAM = 'amenityIds';

function readDraft() {
  try {
    return window.sessionStorage.getItem(ASK_DRAFT_KEY) ?? '';
  } catch {
    return '';
  }
}

function writeDraft(value) {
  try {
    if (value) window.sessionStorage.setItem(ASK_DRAFT_KEY, value);
    else window.sessionStorage.removeItem(ASK_DRAFT_KEY);
  } catch {
    // Storage blocked (private mode): the request is simply not kept.
  }
}

function amenityIdsOf(filters) {
  const raw = filters.dynamicFilters[AMENITY_PARAM];
  return raw ? raw.split(',').map(Number) : [];
}

/** Localized amenity names from the same filter catalog the Search page shows. */
function amenityLabels(groups = []) {
  const labels = new Map();
  groups.forEach((group) =>
    (group.definitions ?? []).forEach((definition) => {
      if (definition.param !== AMENITY_PARAM) return;
      (definition.options ?? []).forEach((option) =>
        labels.set(Number(option.value), option.label ?? option.code),
      );
    }),
  );
  return labels;
}

export default function useAskDesavii() {
  const { i18n } = useTranslation();
  const { isAuthenticated } = useAuth();
  const availability = useAiSearchAvailabilityQuery();
  const mutation = useParseSearchQueryMutation();
  const [prompt, setPromptState] = useState(readDraft);
  // `{ filters, names }`: the canonical filter patch and the localized
  // names the server returned for what it resolved.
  const [intent, setIntent] = useState(null);

  // A request kept across sign-in is used once, then forgotten.
  useEffect(() => {
    if (isAuthenticated) writeDraft('');
  }, [isAuthenticated]);

  const amenityIds = intent ? amenityIdsOf(intent.filters) : [];
  const { data: filterGroups } = useSearchFilterDefinitionsQuery(
    intent?.filters.categoryId,
    i18n.language,
    { enabled: Boolean(intent?.filters.categoryId) && amenityIds.length > 0 },
  );
  const labels = amenityLabels(filterGroups);

  let status = 'ready';
  if (availability.isPending) status = 'checking';
  else if (availability.data !== true) status = 'unavailable';
  else if (!isAuthenticated) status = 'signin';

  const setPrompt = (value) => {
    setPromptState(value.slice(0, ASK_MAX_LENGTH));
    if (mutation.isError) mutation.reset();
  };

  const ask = () => {
    const query = prompt.trim();
    if (!query || status !== 'ready') return;
    mutation.mutate(
      { query, locale: i18n.language },
      {
        onSuccess: (response) =>
          setIntent({
            filters: parsedSearchToFilters(response.data),
            names: {
              city: response.data.city_name,
              category: response.data.category_name,
            },
          }),
      },
    );
  };

  /** What Desavii understood, one removable part per resolved choice. */
  const parts = [];
  if (intent?.filters.cityId) {
    parts.push({
      key: 'destination',
      type: 'destination',
      label: intent.names.city,
    });
  }
  if (intent?.filters.categoryId) {
    parts.push({
      key: 'category',
      type: 'category',
      label: intent.names.category,
    });
  }
  amenityIds.forEach((id) => {
    if (labels.has(id)) {
      parts.push({
        key: `amenity-${id}`,
        type: 'amenity',
        label: labels.get(id),
        id,
      });
    }
  });
  if (intent?.filters.destination) {
    parts.push({
      key: 'words',
      type: 'words',
      label: intent.filters.destination,
    });
  }

  const removePart = (part) =>
    setIntent((current) => {
      const filters = { ...current.filters };
      if (part.type === 'destination') filters.cityId = undefined;
      if (part.type === 'category') {
        filters.categoryId = undefined;
        filters.dynamicFilters = {};
      }
      if (part.type === 'words') filters.destination = '';
      if (part.type === 'amenity') {
        const rest = amenityIdsOf(filters).filter((id) => id !== part.id);
        filters.dynamicFilters =
          rest.length > 0 ? { [AMENITY_PARAM]: rest.join(',') } : {};
      }
      return { ...current, filters };
    });

  const startOver = () => {
    setIntent(null);
    mutation.reset();
  };

  return {
    status,
    prompt,
    setPrompt,
    ask,
    isAsking: mutation.isPending,
    hasFailed: mutation.isError,
    intent: intent?.filters ?? null,
    parts,
    removePart,
    startOver,
    keepForSignIn: () => writeDraft(prompt.trim()),
  };
}
