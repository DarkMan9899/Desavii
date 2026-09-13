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
import styles from './CategoryTopBackground.module.scss';

// One motif + one dominant-color lean per category — same motif set
// `categoryHeroArt.js` already established for this category's hero,
// reused here (not a second motif catalog) so the TOP background and the
// category hero always agree on this category's own visual identity.
// `car-rentals` is deliberately absent — it gets its own dedicated
// `CarRentalTopBackground` above, not this generic treatment.
const THEME_BY_CATEGORY = {
  hotels: { motif: 'arch', lean: 'navy' },
  apartments: { motif: 'sun-waves', lean: 'royal' },
  villas: { motif: 'peaks', lean: 'navy' },
  'guest-houses': { motif: 'door-key', lean: 'gold' },
  restaurants: { motif: 'fork-knife', lean: 'gold' },
  tours: { motif: 'compass', lean: 'royal' },
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
