/**
 * SearchMap — the Leaflet map of Map Search (lazy-loaded: Leaflet only
 * downloads for visitors who open the Map). OpenStreetMap tiles, the same
 * key-free provider as the listing page's map.
 *
 * - Fits the results when a different search arrives — or, with a
 *   committed area, that area (reload and Back reopen the same view).
 * - "Search this area" appears only after the visitor pans or zooms
 *   themselves; it commits the visible area as the search's `bbox`.
 *   Moving the map never searches on its own.
 * - "Clear map area" removes a committed area.
 * - A selected private stay shows the area it is somewhere in, not a pin.
 * - The map refits when `fitKey` changes (a different search's markers
 *   arrived): to the committed area if there is one — so reload, Back and
 *   a copied link reopen the same view — otherwise to the markers.
 */

import { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import L from 'leaflet';
import { Circle, MapContainer, TileLayer } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { Search, X } from 'lucide-react';
import useReducedMotion from '../../../../hooks/useReducedMotion.js';
import { mapAreaFromBounds, parseMapArea } from '../../utils/mapArea.js';
import ClusterLayer from './ClusterLayer.jsx';
import {
  APPROXIMATE_RADIUS_METERS,
  DEFAULT_MAP_CENTER,
  DEFAULT_MAP_ZOOM,
  FIT_PADDING_PX,
  OSM_ATTRIBUTION,
  OSM_TILE_URL,
} from './mapConstants.js';
import { mapMarkerShape } from './mapPropShapes.js';
import styles from './SearchMap.module.scss';

/** Closest a fit zooms in, so a single result keeps its surroundings. */
const FIT_MAX_ZOOM = 14;

function areaBounds(area) {
  const { west, south, east, north } = parseMapArea(area);
  return L.latLngBounds([south, west], [north, east]);
}

export default function SearchMap({
  markers,
  fitKey,
  committedArea = undefined,
  selectedListing = undefined,
  coveredHeight = 0,
  activeId = undefined,
  formatPrice,
  onSelectListing,
  onSelectGroup,
  onSearchArea,
  onClearArea,
  children = null,
}) {
  const { t } = useTranslation();
  const prefersReducedMotion = useReducedMotion();
  const [map, setMap] = useState(null);
  const [hasUserMoved, setHasUserMoved] = useState(false);
  // Whether the visitor has handled the map (pointer, wheel, keys) since
  // the last move the page itself made. Only such a move offers "Search
  // this area" — a fit still animating can never swallow it.
  const userIntentRef = useRef(false);
  const shellRef = useRef(null);

  // A different search (or a newly committed/cleared area): show it.
  useEffect(() => {
    if (!map) return;
    userIntentRef.current = false;
    setHasUserMoved(false);
    const options = {
      padding: [FIT_PADDING_PX, FIT_PADDING_PX],
      maxZoom: FIT_MAX_ZOOM,
      animate: !prefersReducedMotion,
    };
    if (committedArea) {
      map.fitBounds(areaBounds(committedArea), { ...options, padding: [0, 0] });
    } else if (markers.length > 0) {
      map.fitBounds(
        L.latLngBounds(
          markers.map((marker) => [marker.latitude, marker.longitude]),
        ),
        options,
      );
    } else {
      map.setView(DEFAULT_MAP_CENTER, DEFAULT_MAP_ZOOM, options);
    }
    // Only a different search refits — never new data for the same one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, fitKey]);

  // Every move ends here; only a move the visitor made offers a search.
  useEffect(() => {
    if (!map) return undefined;
    const container = map.getContainer();
    const INTENT_EVENTS = ['pointerdown', 'wheel', 'keydown'];
    const markIntent = () => {
      userIntentRef.current = true;
    };
    const handleMoveEnd = () => {
      if (userIntentRef.current) setHasUserMoved(true);
    };
    INTENT_EVENTS.forEach((type) =>
      container.addEventListener(type, markIntent, { passive: true }),
    );
    map.on('moveend', handleMoveEnd);
    return () => {
      INTENT_EVENTS.forEach((type) =>
        container.removeEventListener(type, markIntent),
      );
      map.off('moveend', handleMoveEnd);
    };
  }, [map]);

  // The layout around the map can resize it (List/Map switch, split).
  useEffect(() => {
    if (!map || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(shellRef.current);
    return () => observer.disconnect();
  }, [map]);

  // A selection under the preview card (`coveredHeight` of the map's
  // bottom) is brought up just above it.
  useEffect(() => {
    if (!map || !selectedListing || coveredHeight === 0) return;
    const point = map.latLngToContainerPoint([
      selectedListing.latitude,
      selectedListing.longitude,
    ]);
    const limit = map.getSize().y - coveredHeight - FIT_PADDING_PX;
    if (point.y <= limit) return;
    userIntentRef.current = false;
    map.panBy([0, point.y - limit], { animate: !prefersReducedMotion });
    // Only a new selection (or card) moves the map, not its new data.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, selectedListing?.id, coveredHeight]);

  const searchThisArea = () => {
    setHasUserMoved(false);
    onSearchArea(mapAreaFromBounds(map.getBounds()));
  };

  return (
    // `MapContainer` passes no DOM attributes to its element, so the
    // named region is this wrapper (the results stay reachable through
    // the List as well).
    <div
      ref={shellRef}
      className={styles.shell}
      role="region"
      aria-label={t('search.map.region')}
    >
      <MapContainer
        ref={setMap}
        center={DEFAULT_MAP_CENTER}
        zoom={DEFAULT_MAP_ZOOM}
        className={styles.map}
      >
        <TileLayer url={OSM_TILE_URL} attribution={OSM_ATTRIBUTION} />
        <ClusterLayer
          markers={markers}
          selectedId={selectedListing?.id}
          activeId={activeId}
          formatPrice={formatPrice}
          onSelectListing={onSelectListing}
          onSelectGroup={onSelectGroup}
        />
        {selectedListing?.location_precision === 'approximate' && (
          <Circle
            center={[selectedListing.latitude, selectedListing.longitude]}
            radius={APPROXIMATE_RADIUS_METERS}
            interactive={false}
            pathOptions={{ className: styles.approximateArea }}
          />
        )}
      </MapContainer>

      <div className={styles.overlay}>
        <div className={styles.areaButtons}>
          {hasUserMoved && (
            <button
              type="button"
              className={styles.searchArea}
              onClick={searchThisArea}
            >
              <Search size={16} aria-hidden="true" />
              {t('search.map.searchArea')}
            </button>
          )}
          {committedArea && (
            <button
              type="button"
              className={styles.clearArea}
              onClick={onClearArea}
            >
              <X size={16} aria-hidden="true" />
              {t('search.map.clearArea')}
            </button>
          )}
        </div>
        {children}
      </div>
    </div>
  );
}

SearchMap.propTypes = {
  markers: PropTypes.arrayOf(mapMarkerShape).isRequired,
  /** Changes when a different search is shown: the map refits then. */
  fitKey: PropTypes.string.isRequired,
  committedArea: PropTypes.string,
  selectedListing: mapMarkerShape,
  /** Pixels at the map's bottom covered by the preview card. */
  coveredHeight: PropTypes.number,
  activeId: PropTypes.number,
  formatPrice: PropTypes.func.isRequired,
  onSelectListing: PropTypes.func.isRequired,
  onSelectGroup: PropTypes.func.isRequired,
  onSearchArea: PropTypes.func.isRequired,
  onClearArea: PropTypes.func.isRequired,
  /** Messages shown over the map, under the area buttons. */
  children: PropTypes.node,
};
