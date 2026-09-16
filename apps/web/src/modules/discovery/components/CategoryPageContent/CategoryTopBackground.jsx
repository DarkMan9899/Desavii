/**
 * CategoryTopBackground — owner-directed premium card redesign (brief
 * §21-30): "every CATEGORY TOP slider must have its own thematic
 * BACKGROUND ENVIRONMENT behind the cards... the category theme belongs
 * to the slider section/background, not to oversized card geometry."
 *
 * Deliberately reuses two things that already exist rather than
 * inventing new design assets:
 * - `DestinationArt`'s own per-category line-art `Motif` (arch/sun-waves/
 *   peaks/door-key/fork-knife/compass/road/starburst/ticket), rendered
 *   once, large, and faint, as a watermark — never a bespoke illustration
 *   per category, which would be nine unrelated one-off assets to
 *   maintain.
 * - The app's own restrained brand palette (navy/royal-blue/gold —
 *   `packages/ui`'s `_colors.scss`, no new hue tokens invented). Category
 *   differentiation comes from which of the three dominates the gradient
 *   and the motif shape/position, not from a rainbow of new colors — the
 *   same "subtle differences, not nine unrelated designs" principle the
 *   promoted-card depth system already established.
 *
 * Purely decorative (`aria-hidden`) and absolutely positioned behind the
 * real content (`z-index: 0`, content stacks above at the section's own
 * default stacking context) — never intercepts pointer events, never
 * competes with card content for attention (brief: "restrained enough
 * not to overpower cards").
 */

import PropTypes from 'prop-types';
import { Motif } from '../../../../components/DestinationArt/DestinationArt.jsx';
import CarRentalTopBackground from './CarRentalTopBackground.jsx';
import HotelTopBackground from './HotelTopBackground.jsx';
import ApartmentTopBackground from './ApartmentTopBackground.jsx';
import VillaTopBackground from './VillaTopBackground.jsx';
import GuestHouseTopBackground from './GuestHouseTopBackground.jsx';
import RestaurantTopBackground from './RestaurantTopBackground.jsx';
import ToursTopBackground from './ToursTopBackground.jsx';
import styles from './CategoryTopBackground.module.scss';

// One motif + one dominant-color lean per category — same motif set
// `categoryHeroArt.js` already established for this category's hero,
// reused here (not a second motif catalog) so the TOP background and the
// category hero always agree on this category's own visual identity.
// `car-rentals`, `hotels`, `apartments`, `villas`, `guest-houses`,
// `restaurants`, and `tours` are deliberately absent — they get their
// own dedicated environments above, not this generic treatment.
const THEME_BY_CATEGORY = {
  attractions: { motif: 'starburst', lean: 'gold' },
  'entertainment-venues': { motif: 'ticket', lean: 'royal' },
};

export default function CategoryTopBackground({ categorySlug }) {
  // Step 2.1 — Car Rental TOP background only: a dedicated, more elaborate
  // 3D/depth "road" environment replaces the generic gradient+motif
  // treatment for this one category. Every other category keeps the
  // exact same shared treatment below, unchanged.
  if (categorySlug === 'car-rentals') {
    return <CarRentalTopBackground />;
  }
  // Step 2.2 — Hotel TOP background only: a dedicated 3D hospitality/
  // archway environment replaces the generic gradient+motif treatment
  // for this one category, the same way Car Rental's own road
  // environment does above. Every other category keeps the exact same
  // shared treatment below, unchanged.
  if (categorySlug === 'hotels') {
    return <HotelTopBackground />;
  }
  // Step 2.3 — Apartment TOP background only: a dedicated modern urban-
  // living/window-grid environment, deliberately distinct from Hotel's
  // corridor and Car Rental's road. Every other category keeps the exact
  // same shared treatment below, unchanged.
  if (categorySlug === 'apartments') {
    return <ApartmentTopBackground />;
  }
  // Step 2.4 — Villa TOP background only: a dedicated dusk mountain/
  // luxury-retreat environment, deliberately distinct from Hotel's
  // corridor, Car Rental's road, and Apartment's window grids. Every
  // other category keeps the exact same shared treatment below,
  // unchanged.
  if (categorySlug === 'villas') {
    return <VillaTopBackground />;
  }
  // Step 2.5 — Guest House TOP background only: a dedicated warm village-
  // house environment, deliberately distinct from Hotel's corridor, Car
  // Rental's road, Apartment's window grids, and Villa's mountain
  // horizon. Every other category keeps the exact same shared treatment
  // below, unchanged.
  if (categorySlug === 'guest-houses') {
    return <GuestHouseTopBackground />;
  }
  // Step 2.6 — Restaurant TOP background only: a dedicated refined-
  // dining/table-setting environment, deliberately distinct from Hotel's
  // corridor, Car Rental's road, Apartment's window grids, Villa's
  // mountain horizon, and Guest House's village house. Every other
  // category keeps the exact same shared treatment below, unchanged.
  if (categorySlug === 'restaurants') {
    return <RestaurantTopBackground />;
  }
  // Step 2.7 — Tours TOP background only: a dedicated bird's-eye
  // topographic-map/winding-trail environment, deliberately distinct
  // from Hotel's corridor, Car Rental's straight road, Apartment's
  // window grids, Villa's calm dusk retreat, Guest House's village
  // house, and Restaurant's table setting. Every other category keeps
  // the exact same shared treatment below, unchanged.
  if (categorySlug === 'tours') {
    return <ToursTopBackground />;
  }

  const theme = THEME_BY_CATEGORY[categorySlug];
  if (!theme) return null;

  return (
    <div
      className={[styles.background, styles[`lean--${theme.lean}`]].join(' ')}
      aria-hidden="true"
    >
      <svg
        className={styles.motif}
        viewBox="0 0 100 100"
        preserveAspectRatio="xMidYMid meet"
        focusable="false"
      >
        <Motif name={theme.motif} />
      </svg>
    </div>
  );
}

CategoryTopBackground.propTypes = {
  categorySlug: PropTypes.string.isRequired,
};
