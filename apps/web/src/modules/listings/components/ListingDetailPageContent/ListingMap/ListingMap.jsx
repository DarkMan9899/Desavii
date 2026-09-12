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
 */

import PropTypes from 'prop-types';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import configureLeafletIcons from '../../../../../utils/configureLeafletIcons.js';
import styles from './ListingMap.module.scss';

configureLeafletIcons();

const DEFAULT_ZOOM = 14;

export default function ListingMap({
  latitude,
  longitude,
  popupLabel = undefined,
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
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Marker position={position}>
          <Popup>{popupLabel}</Popup>
        </Marker>
      </MapContainer>
    </div>
  );
}

ListingMap.propTypes = {
  latitude: PropTypes.number.isRequired,
  longitude: PropTypes.number.isRequired,
  popupLabel: PropTypes.string,
};
