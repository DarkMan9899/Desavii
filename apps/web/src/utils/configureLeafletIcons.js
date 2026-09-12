/**
 * Leaflet's default marker icon resolves its image URLs relative to the
 * library's own module location, which breaks under Vite's asset
 * pipeline unless the icon images are re-imported and re-registered
 * explicitly (a well-known Leaflet+bundler interaction, not specific to
 * this app). Shared by every Leaflet consumer (`ListingMap`, Pass 5's
 * `LocationPicker`) so the workaround exists in exactly one place —
 * calling it twice is harmless (it just re-applies the same options),
 * so each consumer can call it unconditionally on import.
 */

import L from 'leaflet';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

export default function configureLeafletIcons() {
  // `_getIconUrl` is Leaflet's own documented property name for this
  // well-known bundler workaround, not a naming choice made here.
  // eslint-disable-next-line no-underscore-dangle
  delete L.Icon.Default.prototype._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: markerIcon2x,
    iconUrl: markerIcon,
    shadowUrl: markerShadow,
  });
}
