/**
 * SearchMapPanel — Map Search: the markers of the current search
 * (`useSearchMapResults`, the same filters as the List), what the map says
 * about them (`MapMessages`), and the preview a marker opens
 * (`MapPreview`). Nothing here navigates or books by itself.
 *
 * The Leaflet map is lazy-loaded; a map that fails (its chunk, Leaflet, or
 * the request) is replaced by an error with a retry, and the rest of
 * Search — the List included — keeps working.
 */

import { lazy, Suspense, useCallback, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { ErrorState, Spinner } from '@desavii/ui/components/feedback-overlays';
import { useCurrency } from '../../../../contexts/CurrencyContext.jsx';
import useMediaQuery from '../../../../hooks/useMediaQuery.js';
import { formatMoney } from '../../../../utils/formatMoney.js';
import { useSearchMapResults } from '../../hooks/useSearchMapResults.js';
import MapErrorBoundary from './MapErrorBoundary.jsx';
import MapMessages from './MapMessages.jsx';
import MapPreview from './MapPreview.jsx';
import { SPLIT_LAYOUT_MEDIA_QUERY } from './mapConstants.js';
import styles from './SearchMapPanel.module.scss';

function loadSearchMap() {
  return import('./SearchMap.jsx');
}

export default function SearchMapPanel({
  filters,
  isResolved,
  selectedId = undefined,
  activeId = undefined,
  onSelectedChange,
  onAreaChange,
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const { currency, rates } = useCurrency();
  const isSplit = useMediaQuery(SPLIT_LAYOUT_MEDIA_QUERY);
  const panelRef = useRef(null);
  const [coveredHeight, setCoveredHeight] = useState(0);
  // A failed map chunk is retried with a fresh `lazy` (a rejected one
  // would only rethrow).
  const [SearchMap, setSearchMap] = useState(() => lazy(loadSearchMap));

  const results = useSearchMapResults({
    filters,
    locale,
    isResolved,
    selectedId,
    onSelectedChange,
  });

  const formatPrice = useCallback(
    (amountAmd) => formatMoney({ amountAmd, currency, locale, rates }),
    [currency, locale, rates],
  );

  const commitArea = (bbox) => {
    results.closePreview();
    onAreaChange(bbox);
  };

  const errorState = (onRetry) => (
    <div className={styles.fallback}>
      <ErrorState
        title={t('search.map.error.title')}
        description={t('search.map.error.description')}
        retryLabel={t('search.map.error.retry')}
        onRetry={onRetry}
      />
    </div>
  );

  if (results.isError) return errorState(results.refetch);

  return (
    <div ref={panelRef} className={styles.panel}>
      <MapErrorBoundary
        renderFallback={(retry) =>
          errorState(() => {
            setSearchMap(() => lazy(loadSearchMap));
            retry();
          })
        }
      >
        <Suspense
          fallback={
            <div className={styles.fallback}>
              <Spinner label={t('search.map.loading')} />
            </div>
          }
        >
          <SearchMap
            markers={results.markers}
            fitKey={results.fitKey}
            committedArea={filters.bbox}
            selectedListing={results.selectedListing}
            coveredHeight={coveredHeight}
            activeId={activeId}
            formatPrice={formatPrice}
            onSelectListing={results.selectListing}
            onSelectGroup={results.selectGroup}
            onSearchArea={commitArea}
            onClearArea={() => onAreaChange(undefined)}
          >
            <MapMessages
              isLoading={results.isLoading}
              isUpdating={results.isUpdating}
              meta={results.meta}
              hasArea={Boolean(filters.bbox)}
            />
          </SearchMap>
        </Suspense>
      </MapErrorBoundary>

      <MapPreview
        isCard={isSplit}
        scopeRef={panelRef}
        listing={results.selectedListing}
        group={results.group}
        formatPrice={formatPrice}
        onSelectFromGroup={results.selectFromGroup}
        onBack={results.backToGroup}
        onClose={results.closePreview}
        onCoveredHeightChange={setCoveredHeight}
      />
    </div>
  );
}

SearchMapPanel.propTypes = {
  /** The committed Search filters (`useSearchFilters`). */
  filters: PropTypes.shape({ bbox: PropTypes.string }).isRequired,
  isResolved: PropTypes.bool.isRequired,
  selectedId: PropTypes.number,
  activeId: PropTypes.number,
  onSelectedChange: PropTypes.func.isRequired,
  /** `(bbox | undefined)`: commit or clear the map area. */
  onAreaChange: PropTypes.func.isRequired,
};
