/**
 * Leaflet `divIcon`s for Map Search: a price pill per listing and a count
 * bubble per cluster. Built as DOM nodes with `textContent` — never an
 * HTML string — so a listing title or price can never inject markup.
 * The pill's changing states (selected, highlighted from the List) are
 * toggled on the existing node by `ClusterLayer`, so the marker element —
 * and the keyboard focus on it — survives a selection.
 */

import L from 'leaflet';

function element(className, text) {
  const node = document.createElement('span');
  node.className = className;
  node.textContent = text;
  return node;
}

/**
 * The marker's accessible name is set on the marker element itself (see
 * `ClusterLayer`), so the pill text stays purely visual.
 * @param {{ label: string, className: string }} options
 */
export function createListingIcon({ label, className }) {
  return L.divIcon({
    html: element(className, label),
    className: '',
    iconSize: null,
  });
}

export function createClusterIcon({ count, className }) {
  return L.divIcon({
    html: element(className, String(count)),
    className: '',
    iconSize: null,
  });
}
