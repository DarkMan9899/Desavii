/**
 * EditorialPageHero — the shared compact-breadcrumb + restrained-hero
 * shell for public informational pages (`modules/cms`'s six pages:
 * About/Contact/FAQ/Help Center/Blog/Become a Partner). Extracted from
 * the identical hero pattern already hand-duplicated across
 * `CategoryPageContent`/`DestinationPageContent`/
 * `CompaniesDirectoryPageContent` (a `DestinationArt` backdrop + a
 * `scrim-navy-glow` scrim + an icon/`$font-display` title/lead overlay) —
 * a third module needing the exact same markup is the point at which
 * that pattern earns a real shared component instead of a fourth
 * hand-copy. Deliberately additive: `PageHeader` (the plain white
 * breadcrumb+title used by every authenticated/dashboard page) is
 * untouched — this is a parallel, public-page-only component, not a
 * replacement.
 *
 * `heroSeed` keys the procedural `DestinationArt` backdrop (a page slug
 * string, e.g. `"about"` — `DestinationArt`'s own hash gives each static
 * page a distinct, stable mesh variant instead of six identical bands).
 * Renders only the breadcrumb+hero; each page composes its own
 * below-hero content and owns its own page-level vertical rhythm.
 */

import PropTypes from 'prop-types';
import { Breadcrumbs } from '@desavii/ui/components/navigation';
import RouterLink from '../RouterLink.jsx';
import DestinationArt from '../DestinationArt/DestinationArt.jsx';
import styles from './EditorialPageHero.module.scss';

export default function EditorialPageHero({
  breadcrumbItems,
  heroSeed,
  // Pass 7B: optional, independent overrides forwarded straight to
  // `DestinationArt` — see that component's own header. Omit both for
  // the original seed-hash-only behavior every non-category caller
  // (About/Contact/FAQ/etc.) keeps using unchanged.
  heroMotif = undefined,
  heroMeshVariant = undefined,
  icon: HeroIcon = undefined,
  eyebrow = undefined,
  title,
  lead = undefined,
  children = undefined,
}) {
  return (
    <>
      <Breadcrumbs
        items={breadcrumbItems}
        linkComponent={RouterLink}
        className={styles.breadcrumbs}
      />
      <section className={styles.hero}>
        <DestinationArt
          seed={heroSeed}
          motif={heroMotif}
          meshVariant={heroMeshVariant}
          className={styles.heroArt}
        />
        <div className={styles.heroContent}>
          {HeroIcon && (
            <span className={styles.heroIcon} aria-hidden="true">
              <HeroIcon size={26} />
            </span>
          )}
          {eyebrow && <p className={styles.eyebrow}>{eyebrow}</p>}
          <h1 className={styles.title}>{title}</h1>
          {lead && <p className={styles.lead}>{lead}</p>}
          {children}
        </div>
      </section>
    </>
  );
}

EditorialPageHero.propTypes = {
  breadcrumbItems: PropTypes.arrayOf(
    PropTypes.shape({
      label: PropTypes.string.isRequired,
      href: PropTypes.string.isRequired,
    }),
  ).isRequired,
  heroSeed: PropTypes.oneOfType([PropTypes.number, PropTypes.string])
    .isRequired,
  heroMotif: PropTypes.string,
  heroMeshVariant: PropTypes.number,
  icon: PropTypes.elementType,
  eyebrow: PropTypes.string,
  title: PropTypes.string.isRequired,
  lead: PropTypes.string,
  children: PropTypes.node,
};
