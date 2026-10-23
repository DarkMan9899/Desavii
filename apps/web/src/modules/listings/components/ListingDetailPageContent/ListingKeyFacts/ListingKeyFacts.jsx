/**
 * ListingKeyFacts — the category's decisive facts directly under the
 * title (a hotel's stars and check-in, a car's transmission and seats, a
 * tour's duration and languages), so nobody reads prose to find them.
 * Which facts, and where each value comes from, is
 * `listingKeyFacts.js`; this only lays them out. Renders nothing when the
 * listing has none of them.
 *
 * A description list under a heading only assistive technology hears:
 * the page outline stays h1 (title) → h2 (sections), and each fact reads
 * as "label: value".
 */

import { useId } from 'react';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import styles from './ListingKeyFacts.module.scss';

export default function ListingKeyFacts({ facts }) {
  const { t } = useTranslation();
  const headingId = useId();

  if (facts.length === 0) return null;

  return (
    <section className={styles.keyFacts} aria-labelledby={headingId}>
      <h2 id={headingId} className={styles.heading}>
        {t('pages.listingDetail.keyFacts.heading')}
      </h2>
      <dl className={styles.grid}>
        {facts.map((fact) => {
          const Icon = fact.icon;
          return (
            // A `<dl>` group holds only its `<dt>`/`<dd>`; the icon sits
            // inside the term, positioned beside both lines by the styles.
            <div className={styles.fact} key={fact.key}>
              <dt className={styles.label}>
                <Icon
                  className={styles.icon}
                  aria-hidden="true"
                  focusable="false"
                />
                {fact.label}
              </dt>
              <dd className={styles.value}>{fact.value}</dd>
            </div>
          );
        })}
      </dl>
    </section>
  );
}

ListingKeyFacts.propTypes = {
  facts: PropTypes.arrayOf(
    PropTypes.shape({
      key: PropTypes.string.isRequired,
      icon: PropTypes.elementType.isRequired,
      label: PropTypes.string.isRequired,
      value: PropTypes.string.isRequired,
    }),
  ).isRequired,
};
