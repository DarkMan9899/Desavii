/**
 * Category slug -> lucide-react icon lookup. Shared by every surface that
 * represents a marketplace category visually (`CategoryCard` on Home,
 * `CategoryPageContent`'s hero) so the same category always gets the same
 * icon instead of two independently-maintained maps drifting apart.
 */

import {
  Building2,
  Home,
  UtensilsCrossed,
  Map,
  Car,
  Landmark,
  Palmtree,
  BedDouble,
  Compass,
  PartyPopper,
} from 'lucide-react';

export const CATEGORY_ICONS_BY_SLUG = {
  hotels: Building2,
  apartments: Home,
  restaurants: UtensilsCrossed,
  tours: Map,
  'car-rentals': Car,
  attractions: Landmark,
  villas: Palmtree,
  'guest-houses': BedDouble,
  'entertainment-venues': PartyPopper,
};

export const DEFAULT_CATEGORY_ICON = Compass;

export function getCategoryIcon(slug) {
  return CATEGORY_ICONS_BY_SLUG[slug] ?? DEFAULT_CATEGORY_ICON;
}
