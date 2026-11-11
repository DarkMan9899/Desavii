/**
 * attributeIcons — one icon per category attribute code (`GET
 * /listings/metadata` attributes, seeded in `006_search_filters.js`), for
 * the key facts strip and the specification grid. An attribute without an
 * entry falls back to a neutral info icon, so a newly seeded attribute
 * still renders.
 */

import { Info } from 'lucide-react';
import { ATTRIBUTE_ICONS } from '../../../utils/listingFactIcons.js';

export function resolveAttributeIcon(attributeCode) {
  return ATTRIBUTE_ICONS[attributeCode] ?? Info;
}

export default resolveAttributeIcon;
