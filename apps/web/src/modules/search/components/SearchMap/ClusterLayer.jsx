/**
 * ClusterLayer — the Map Search markers: `supercluster` groups the
 * results for the current view, so the many listings sharing one point
 * (or crowding one city) read as a count instead of an unreadable pile.
 * The index is rebuilt whenever the result set changes — clusters are
 * never computed from a previous search — and re-read on every move.
 *
 * - A cluster zooms in to where it splits. When it never would (listings
 *   at one identical point), its listings are offered as a list instead.
 * - A listing marker is a focusable button (Leaflet's `keyboard`), named
 *   by its title and price, activated by click, Enter or Space; that
 *   opens the preview — it never navigates. Its icon is built once per label; selection and the List
 *   highlight only toggle classes on it, so the focused element stays.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { Marker, useMap, useMapEvents } from 'react-leaflet';
import Supercluster from 'supercluster';
import useReducedMotion from '../../../../hooks/useReducedMotion.js';
import { createClusterIcon, createListingIcon } from './markerIcons.js';
import { CLUSTER_MAX_ZOOM, CLUSTER_RADIUS_PX } from './mapConstants.js';
import { mapMarkerShape } from './mapPropShapes.js';
import styles from './SearchMap.module.scss';

const MAX_LATITUDE = 85;
const MAX_LONGITUDE = 180;
const ACTIVE_Z_OFFSET = 1000;

function readView(map) {
  const bounds = map.getBounds();
  const clamp = (value, limit) => Math.max(-limit, Math.min(limit, value));
  return {
    bbox: [
      clamp(bounds.getWest(), MAX_LONGITUDE),
      clamp(bounds.getSouth(), MAX_LATITUDE),
      clamp(bounds.getEast(), MAX_LONGITUDE),
      clamp(bounds.getNorth(), MAX_LATITUDE),
    ],
    zoom: Math.round(map.getZoom()),
  };
}

/** Keys that activate a `role="button"` element (WAI-ARIA button pattern). */
const ACTIVATION_KEYS = ['Enter', ' '];

/**
 * A Leaflet marker that behaves as a named button: its element carries an
 * accessible name, and Enter or Space activate it (Leaflet itself only
 * does that for a marker with a popup).
 */
function NamedMarker({
  markerRef,
  position,
  icon,
  ariaLabel,
  onActivate,
  zIndexOffset = 0,
}) {
  useEffect(() => {
    markerRef.current?.getElement()?.setAttribute('aria-label', ariaLabel);
  }, [markerRef, icon, ariaLabel]);
  return (
    <Marker
      ref={markerRef}
      position={position}
      icon={icon}
      keyboard
      zIndexOffset={zIndexOffset}
      eventHandlers={{
        click: onActivate,
        keydown: (event) => {
          if (!ACTIVATION_KEYS.includes(event.originalEvent.key)) return;
          event.originalEvent.preventDefault();
          onActivate();
        },
        add: (event) =>
          event.target.getElement()?.setAttribute('aria-label', ariaLabel),
      }}
    />
  );
}
NamedMarker.propTypes = {
  // A React ref to the Leaflet marker instance.
  // eslint-disable-next-line react/forbid-prop-types
  markerRef: PropTypes.object.isRequired,
  position: PropTypes.arrayOf(PropTypes.number).isRequired,
  // A Leaflet DivIcon instance.
  // eslint-disable-next-line react/forbid-prop-types
  icon: PropTypes.object.isRequired,
  ariaLabel: PropTypes.string.isRequired,
  onActivate: PropTypes.func.isRequired,
  zIndexOffset: PropTypes.number,
};

function ClusterMarker({ position, count, onActivate }) {
  const { t } = useTranslation();
  const markerRef = useRef(null);
  const icon = useMemo(
    () => createClusterIcon({ count, className: styles.cluster }),
    [count],
  );
  return (
    <NamedMarker
      markerRef={markerRef}
      position={position}
      icon={icon}
      ariaLabel={t('search.map.cluster', { count })}
      onActivate={onActivate}
    />
  );
}
ClusterMarker.propTypes = {
  position: PropTypes.arrayOf(PropTypes.number).isRequired,
  count: PropTypes.number.isRequired,
  onActivate: PropTypes.func.isRequired,
};

function ListingMarker({
  marker,
  position,
  price,
  isSelected,
  isActive,
  onSelect,
}) {
  const markerRef = useRef(null);
  const isApproximate = marker.location_precision === 'approximate';
  const label = price || marker.title;
  const icon = useMemo(
    () =>
      createListingIcon({
        label,
        className: [styles.pill, isApproximate && styles.approximate]
          .filter(Boolean)
          .join(' '),
      }),
    [label, isApproximate],
  );

  // The changing states go onto the existing pill (see the file header).
  useEffect(() => {
    const pill = markerRef.current?.getElement()?.firstElementChild;
    if (!pill) return;
    pill.classList.toggle(styles.pillSelected, isSelected);
    pill.classList.toggle(styles.pillActive, isActive && !isSelected);
  }, [icon, isSelected, isActive]);

  return (
    <NamedMarker
      markerRef={markerRef}
      position={position}
      icon={icon}
      ariaLabel={price ? `${marker.title}, ${price}` : marker.title}
      onActivate={() => onSelect(marker)}
      zIndexOffset={isSelected || isActive ? ACTIVE_Z_OFFSET : 0}
    />
  );
}
ListingMarker.propTypes = {
  marker: mapMarkerShape.isRequired,
  position: PropTypes.arrayOf(PropTypes.number).isRequired,
  price: PropTypes.string.isRequired,
  isSelected: PropTypes.bool.isRequired,
  isActive: PropTypes.bool.isRequired,
  onSelect: PropTypes.func.isRequired,
};

export default function ClusterLayer({
  markers,
  selectedId = undefined,
  activeId = undefined,
  formatPrice,
  onSelectListing,
  onSelectGroup,
}) {
  const map = useMap();
  const prefersReducedMotion = useReducedMotion();
  const [view, setView] = useState(() => readView(map));
  useMapEvents({ moveend: () => setView(readView(map)) });

  const index = useMemo(() => {
    const clusterIndex = new Supercluster({
      radius: CLUSTER_RADIUS_PX,
      maxZoom: CLUSTER_MAX_ZOOM,
    });
    clusterIndex.load(
      markers.map((marker) => ({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [marker.longitude, marker.latitude],
        },
        properties: { marker },
      })),
    );
    return clusterIndex;
  }, [markers]);

  const features = useMemo(
    () => index.getClusters(view.bbox, view.zoom),
    [index, view],
  );

  return features.map((feature) => {
    const [longitude, latitude] = feature.geometry.coordinates;
    const position = [latitude, longitude];

    if (feature.properties.cluster) {
      const clusterId = feature.properties.cluster_id;
      const expand = () => {
        const zoom = index.getClusterExpansionZoom(clusterId);
        if (zoom > CLUSTER_MAX_ZOOM) {
          onSelectGroup(
            index
              .getLeaves(clusterId, Infinity)
              .map((leaf) => leaf.properties.marker),
          );
          return;
        }
        // The cluster's own element goes away as it splits: keep keyboard
        // focus in the map, one Tab away from the markers it became.
        const container = map.getContainer();
        const hadFocus = container.contains(document.activeElement);
        map.setView(position, zoom, { animate: !prefersReducedMotion });
        if (hadFocus) container.focus({ preventScroll: true });
      };
      return (
        <ClusterMarker
          key={`cluster-${clusterId}`}
          position={position}
          count={feature.properties.point_count}
          onActivate={expand}
        />
      );
    }

    const { marker } = feature.properties;
    return (
      <ListingMarker
        key={`listing-${marker.id}`}
        marker={marker}
        position={position}
        price={marker.price_amount ? formatPrice(marker.price_amount) : ''}
        isSelected={marker.id === selectedId}
        isActive={marker.id === activeId}
        onSelect={onSelectListing}
      />
    );
  });
}

ClusterLayer.propTypes = {
  markers: PropTypes.arrayOf(mapMarkerShape).isRequired,
  selectedId: PropTypes.number,
  activeId: PropTypes.number,
  formatPrice: PropTypes.func.isRequired,
  onSelectListing: PropTypes.func.isRequired,
  onSelectGroup: PropTypes.func.isRequired,
};
