/**
 * useSearchMapResults — Map Search's state, apart from its presentation:
 * the markers of the current search, the search they belong to, and what
 * the preview shows.
 *
 * - Only the current search's markers are returned: while a changed
 *   search loads (placeholder data) there are none, so a previous result
 *   set is never placed or clustered.
 * - `fitKey` names the search the returned markers belong to and changes
 *   when that search's markers arrive — the map refits then, never on a
 *   refetch of the same search.
 * - The preview shows one listing (`selectedId`, owned by the page so the
 *   List can mark it too) or the listings stacked at one point (`group`).
 *   A selection the new results no longer contain is closed; a new search
 *   closes a group.
 */

import { useCallback, useEffect, useState } from 'react';
import { useSearchMapQuery } from '../queries/useSearchMapQuery.js';
import { toSearchQueryParams } from '../schemas/searchParams.js';

const NO_MARKERS = [];

/**
 * @param {object} options
 * @param {object} options.filters - the committed Search filters
 * @param {string} options.locale
 * @param {boolean} options.isResolved - the URL's catalogs have resolved
 * @param {number|undefined} options.selectedId
 * @param {(id: number|undefined) => void} options.onSelectedChange
 */
export function useSearchMapResults({
  filters,
  locale,
  isResolved,
  selectedId,
  onSelectedChange,
}) {
  const { data, isPending, isError, isPlaceholderData, refetch } =
    useSearchMapQuery(filters, { locale, enabled: isResolved });
  const isSettled = Boolean(data) && !isPlaceholderData;
  const markers = isSettled ? data.data : NO_MARKERS;

  // React's "adjust state while rendering": the search the markers belong
  // to ('' before any) follows the settled data.
  const searchKey = JSON.stringify(toSearchQueryParams(filters, locale));
  const [fitKey, setFitKey] = useState('');
  const [group, setGroup] = useState(null);
  if (isSettled && fitKey !== searchKey) {
    setFitKey(searchKey);
    setGroup(null);
  }

  const selectedListing = markers.find((marker) => marker.id === selectedId);

  useEffect(() => {
    if (isSettled && selectedId !== undefined && !selectedListing) {
      onSelectedChange(undefined);
    }
  }, [isSettled, selectedId, selectedListing, onSelectedChange]);

  const closePreview = useCallback(() => {
    setGroup(null);
    onSelectedChange(undefined);
  }, [onSelectedChange]);

  /** A marker on the map: that listing alone. */
  const selectListing = useCallback(
    (listing) => {
      setGroup(null);
      onSelectedChange(listing.id);
    },
    [onSelectedChange],
  );

  /** A listing picked from a group: the group stays, for "Back". */
  const selectFromGroup = useCallback(
    (listing) => onSelectedChange(listing.id),
    [onSelectedChange],
  );

  const selectGroup = useCallback(
    (listings) => {
      onSelectedChange(undefined);
      setGroup(listings);
    },
    [onSelectedChange],
  );

  const backToGroup = useCallback(
    () => onSelectedChange(undefined),
    [onSelectedChange],
  );

  return {
    markers,
    meta: isSettled ? data.meta : undefined,
    fitKey,
    isLoading: !isResolved || isPending,
    isUpdating: isPlaceholderData,
    isError,
    refetch,
    selectedListing,
    group,
    selectListing,
    selectFromGroup,
    selectGroup,
    backToGroup,
    closePreview,
  };
}

export default useSearchMapResults;
