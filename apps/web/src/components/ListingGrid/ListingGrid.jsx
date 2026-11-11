/**
 * ListingGrid — the shared responsive card grid for a full page of
 * listing cards (`ListingCard`) (1 column mobile, 2 mobile-large, 3
 * tablet, 4 laptop+) — the same breakpoint scale `SearchResults` already
 * uses. Extracted so `CategoryPageContent`/`DestinationPageContent` stop
 * reaching for the generic `Grid` layout primitive's `columns="auto"`
 * mode, which follows UI_UX_GUIDELINES.docx's raw 4/8/12-column table
 * (meant for arbitrary dashboard layout, one grid cell per child) rather
 * than a card grid — on desktop that put 8-12 narrow `SearchResultCard`s
 * in a single row with heavily truncated content. A plain `.module.scss`
 * grid instead matches the established pattern already used by
 * `SearchResults`, `RelatedListings`, and `CompaniesDirectoryPageContent`.
 */

import PropTypes from 'prop-types';
import styles from './ListingGrid.module.scss';

export default function ListingGrid({ children }) {
  return <div className={styles.grid}>{children}</div>;
}

ListingGrid.propTypes = {
  children: PropTypes.node.isRequired,
};
