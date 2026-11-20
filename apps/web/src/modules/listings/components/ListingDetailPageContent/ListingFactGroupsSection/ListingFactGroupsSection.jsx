/**
 * ListingFactGroupsSection — a section of grouped category facts on the
 * public Listing Detail page: "Tour details" ("How the tour runs", "Who
 * it's for"), "Meeting and pickup", "Vehicle specifications" (car, engine
 * and drive, driver and mileage)…
 *
 * The groups arrive resolved by `listingFactGroups.js`, which only keeps
 * facts the listing really has; a section with one group shows no
 * sub-heading. Each group is a definition list (`FactList`).
 */

import PropTypes from 'prop-types';
import { Section } from '@desavii/ui/components/layout';
import { FactList, factRowShape } from '../MetadataValueDisplay.jsx';
import styles from './ListingFactGroupsSection.module.scss';

export default function ListingFactGroupsSection({
  heading,
  groups,
  sectionId = undefined,
  columns = 3,
}) {
  if (groups.length === 0) return null;
  return (
    <Section spacing="none" aria-label={heading}>
      <h2 id={sectionId}>{heading}</h2>
      <div className={styles.groups}>
        {groups.map((group) => (
          <div className={styles.group} key={group.key}>
            {group.heading && (
              <h3 className={styles.groupHeading}>{group.heading}</h3>
            )}
            <FactList rows={group.rows} columns={columns} />
          </div>
        ))}
      </div>
    </Section>
  );
}

const factGroupShape = PropTypes.shape({
  key: PropTypes.string.isRequired,
  heading: PropTypes.string,
  rows: PropTypes.arrayOf(factRowShape).isRequired,
});

ListingFactGroupsSection.propTypes = {
  heading: PropTypes.string.isRequired,
  groups: PropTypes.arrayOf(factGroupShape).isRequired,
  sectionId: PropTypes.string,
  // Long free-text facts (pickup details) read better in two columns.
  columns: PropTypes.oneOf([2, 3]),
};
