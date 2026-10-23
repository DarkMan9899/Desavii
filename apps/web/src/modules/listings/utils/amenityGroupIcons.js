/**
 * amenityGroupIcons — resolves an `amenity_groups.code` (seeded in
 * `006_search_filters.js`'s `AMENITY_GROUPS`) to a `lucide-react` icon.
 * Used for a group heading, and as the icon of an amenity that has no
 * stable code of its own (one an admin added in Marketplace configuration
 * — see `amenityIcons.js`). An unknown group still renders via the
 * fallback.
 */

import {
  Wifi,
  AirVent,
  BedDouble,
  Bath,
  CookingPot,
  UtensilsCrossed,
  ConciergeBell,
  Sparkles,
  Flower2,
  SquareParking,
  PawPrint,
  Accessibility,
  ShieldCheck,
  Music,
  Car,
  CircleCheck,
} from 'lucide-react';

const ICONS_BY_GROUP_CODE = {
  INTERNET_WORK: Wifi,
  CLIMATE: AirVent,
  BEDROOM_LIVING: BedDouble,
  BATHROOM: Bath,
  KITCHEN_LAUNDRY: CookingPot,
  FOOD_DRINK: UtensilsCrossed,
  SERVICES: ConciergeBell,
  WELLNESS: Sparkles,
  OUTDOOR: Flower2,
  PARKING_TRANSPORT: SquareParking,
  FAMILY_PETS: PawPrint,
  ACCESSIBILITY: Accessibility,
  SAFETY_SECURITY: ShieldCheck,
  ENTERTAINMENT: Music,
  VEHICLE: Car,
};

export default function resolveAmenityGroupIcon(groupCode) {
  return ICONS_BY_GROUP_CODE[groupCode] ?? CircleCheck;
}
