/**
 * ListingMap — Leaflet + OpenStreetMap tiles, module-scoped (not
 * `packages/ui`) per the same precedent `home`'s `Showcase` component
 * set for `embla-carousel`: a heavy, single-feature third-party-backed
 * component lives with its one consumer, not in the shared, otherwise
 * dependency-light design-system package. No API key required — OSM's
 * public tile servers are free to use under their tile usage policy.
 *
 * The default Leaflet marker icon resolves its image URLs relative to
 * the library's own module location, which breaks under Vite's asset
 * pipeline unless the icon images are re-imported and re-registered
 * explicitly (a well-known Leaflet+bundler interaction, not specific to
 * this app) — done once here since this is the only place Leaflet is
 * used.
 *
 * `isApproximate` (a private stay, `location.location_precision`): the
 * API already sends the Search Map's grid-cell centre, never the home's
 * stored point; the map draws that whole area — the same dashed circle
 * Search Map draws — instead of a pin that would look exact.
 */

import PropTypes from 'prop-types';
import { Circle, MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import configureLeafletIcons from '../../../../../utils/configureLeafletIcons.js';
import {
  APPROXIMATE_RADIUS_METERS,
  OSM_ATTRIBUTION,
  OSM_TILE_URL,
} from '../../../../../utils/mapPresentation.js';
import styles from './ListingMap.module.scss';

configureLeafletIcons();

const DEFAULT_ZOOM = 14;

export default function ListingMap({
  latitude,
  longitude,
  popupLabel = undefined,
  isApproximate = false,
}) {
  const position = [latitude, longitude];

  return (
    // `MapContainer` only forwards recognized Leaflet options to its
    // container div, not arbitrary DOM attributes — `role`/`aria-label`
    // are set on this wrapper instead, the same landmark a plain map
    // embed would need.
    <div role="region" aria-label={popupLabel} className={styles.wrapper}>
      <MapContainer
        center={position}
        zoom={DEFAULT_ZOOM}
        scrollWheelZoom={false}
        className={styles.map}
      >
        <TileLayer attribution={OSM_ATTRIBUTION} url={OSM_TILE_URL} />
        {isApproximate ? (
          <Circle
            center={position}
            radius={APPROXIMATE_RADIUS_METERS}
            interactive={false}
            pathOptions={{ className: styles.approximateArea }}
          />
        ) : (
          <Marker position={position}>
            <Popup>{popupLabel}</Popup>
          </Marker>
        )}
      </MapContainer>
    </div>
  );
}

ListingMap.propTypes = {
  latitude: PropTypes.number.isRequired,
  longitude: PropTypes.number.isRequired,
  popupLabel: PropTypes.string,
  isApproximate: PropTypes.bool,
};
