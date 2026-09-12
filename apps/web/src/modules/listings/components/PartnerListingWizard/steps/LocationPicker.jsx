/**
 * LocationPicker — Pass 5 (owner issue #7, Partner location authoring).
 * `LocationStep` previously only offered two raw number inputs for
 * latitude/longitude, with no visual way to find or confirm a spot on a
 * map — exactly the "forced to type lat/lng manually" gap flagged for
 * this pass. This adds a click-to-place Leaflet map (the same free
 * OSM-tile stack `ListingMap` already uses — no paid provider) as a
 * second, synchronized way to set the same two fields; the number
 * inputs stay for precise entry/editing and remain the field of record.
 *
 * Deliberately dumb/controlled: takes the current `latitude`/`longitude`
 * (numbers or `undefined`) and an `onPick(lat, lng)` callback, no
 * internal form state of its own — `LocationStep` is the single source
 * of truth via react-hook-form.
 */

import { useEffect } from 'react';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import {
  MapContainer,
  TileLayer,
  Marker,
  useMap,
  useMapEvents,
} from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import configureLeafletIcons from '../../../../../utils/configureLeafletIcons.js';
import styles from './LocationPicker.module.scss';

configureLeafletIcons();

// Armenia's own approximate geographic centroid — a real, published
// coordinate for the country as a whole (never a specific venue's
// position), used only as the map's initial framing before a partner
// has picked or typed anything.
const ARMENIA_CENTER = [40.0691, 45.0382];
const ARMENIA_ZOOM = 7;
const PICKED_ZOOM = 13;

function ClickToPlace({ onPick }) {
  useMapEvents({
    click(event) {
      onPick(event.latlng.lat, event.latlng.lng);
    },
  });
  return null;
}

ClickToPlace.propTypes = { onPick: PropTypes.func.isRequired };

// Leaflet's `MapContainer` only reads `center`/`zoom` at mount — moving
// the marker afterward (by click OR by typing into the number fields)
// needs an explicit `setView` call, done here via `useMap()` rather than
// remounting the whole map on every coordinate change.
function RecenterOnChange({ position = null }) {
  const map = useMap();
  useEffect(() => {
    if (position) map.setView(position, Math.max(map.getZoom(), PICKED_ZOOM));
  }, [map, position]);
  return null;
}

RecenterOnChange.propTypes = {
  // eslint-disable-next-line react/forbid-prop-types -- a plain [lat, lng] tuple or null, not a data-shape worth a full PropTypes.shape
  position: PropTypes.array,
};

export default function LocationPicker({
  latitude = undefined,
  longitude = undefined,
  onPick,
}) {
  const { t } = useTranslation();
  const hasPosition =
    typeof latitude === 'number' &&
    !Number.isNaN(latitude) &&
    typeof longitude === 'number' &&
    !Number.isNaN(longitude);
  const position = hasPosition ? [latitude, longitude] : null;

  return (
    <div className={styles.wrapper}>
      <p className={styles.hint}>
        {t('partner.listingWizard.location.mapHint')}
      </p>
      <MapContainer
        center={position ?? ARMENIA_CENTER}
        zoom={position ? PICKED_ZOOM : ARMENIA_ZOOM}
        scrollWheelZoom={false}
        className={styles.map}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <ClickToPlace onPick={onPick} />
        <RecenterOnChange position={position} />
        {position && <Marker position={position} />}
      </MapContainer>
    </div>
  );
}

LocationPicker.propTypes = {
  latitude: PropTypes.number,
  longitude: PropTypes.number,
  onPick: PropTypes.func.isRequired,
};
