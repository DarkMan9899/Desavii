/**
 * useHomeSearch — the Home search entry's state, using the Search page's
 * own rules so a Home search lands on exactly the results `/search` would
 * show for the same choices:
 *
 * - the same fields and draft rules (`PrimarySearchFields`,
 *   `useSearchDraft`): a real destination (`cityId`), a keyword, the
 *   category, and dates / party size shaped by that category (one date for
 *   a restaurant or a departure, a range for a stay or a rental; no party
 *   field where Search cannot filter by it);
 * - the same normalisation (`normalizeSearchFilters`) on every change, so
 *   switching category keeps or drops the party size and dates exactly as
 *   `/search` would;
 * - the same URL (`buildSearchParams`), so nothing Home sends is a param
 *   `/search` does not read.
 *
 * Unlike the Search page nothing applies live: choices stay local until
 * Search is pressed, which then opens `/search` with them.
 *
 * Ask Desavii (Home AI discovery) feeds the same state: `replaceWith`
 * puts an interpreted request into the fields ("Refine in Search") and
 * `searchWith` opens `/search` with it ("Show results") — the same
 * normalisation and URL either way.
 */

import { useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  useCategoriesQuery,
  useDestinationsQuery,
  useSearchDraft,
  buildSearchParams,
  normalizeSearchFilters,
  parseSearchParams,
  getSearchCapabilities,
} from '../../search/index.js';

/** Exactly what `/search` reads from an empty URL — its own defaults. */
const initialFilters = () => parseSearchParams(new URLSearchParams());

function slugOf(categories, categoryId) {
  return categories.find((category) => category.id === categoryId)?.slug;
}

export default function useHomeSearch() {
  const navigate = useNavigate();
  const { locale } = useParams();
  const [filters, setFilters] = useState(initialFilters);
  // `useSearchDraft.flush()` applies pending input synchronously through
  // `onApply`; the ref lets Search read that result in the same tick
  // instead of the previous render's state.
  const latest = useRef(filters);

  // `undefined` while loading (not `[]`): to the normaliser an empty list
  // means "that city/category does not exist" and would drop the choice.
  const { data: categoryCatalog } = useCategoriesQuery({ locale });
  const { data: destinationCatalog } = useDestinationsQuery({
    locale,
    categoryId: filters.categoryId,
  });
  const categories = categoryCatalog ?? [];
  const destinations = destinationCatalog ?? [];

  // Every change passes through the Search page's own normalisation, so a
  // category switch treats party size and dates exactly as `/search` does.
  const onApply = (patch) => {
    latest.current = normalizeSearchFilters(
      { ...latest.current, ...patch },
      { categories: categoryCatalog, destinations: destinationCatalog },
    ).filters;
    setFilters(latest.current);
  };

  const { dateMode } = getSearchCapabilities(
    slugOf(categories, filters.categoryId),
  );
  const draft = useSearchDraft(filters, onApply, { dateMode });

  const openSearch = () => {
    const query = buildSearchParams(latest.current).toString();
    navigate(`/${locale}/search${query ? `?${query}` : ''}`);
  };

  /** Applies anything still being typed and opens `/search`; returns false when a date range is incomplete. */
  const submit = () => {
    const { dates } = draft.flush();
    if (dates) return false;
    openSearch();
    return true;
  };

  /**
   * Starts the choices over from `patch` (an interpreted request). Its ids
   * were resolved by the server against the real catalog, so the
   * destination list — scoped to the current category — is not consulted.
   */
  const replaceWith = (patch) => {
    latest.current = normalizeSearchFilters(
      { ...initialFilters(), ...patch },
      { categories: categoryCatalog },
    ).filters;
    setFilters(latest.current);
  };

  /** Opens `/search` for an interpreted request, exactly as Search would. */
  const searchWith = (patch) => {
    replaceWith(patch);
    openSearch();
  };

  return {
    filters,
    draft,
    onApply,
    categories,
    destinations,
    submit,
    replaceWith,
    searchWith,
  };
}
