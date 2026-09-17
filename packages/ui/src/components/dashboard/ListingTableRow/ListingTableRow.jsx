/**
 * ListingTableRow — COMPONENT_LIBRARY.md Part II §8 "Listing Table Row",
 * the Partner Dashboard's dense listing-management row
 * (`PartnerListingsList.jsx`). Purely presentational: `statusBadge`/
 * `typeBadge` are pre-rendered nodes and `actions` is a free-form slot,
 * since the four listing states (DRAFT/PUBLISHED/UNPUBLISHED/ARCHIVED)
 * each have a different legal action set — a binary `onPublishToggle`
 * prop can't express that, so the caller composes its own action
 * buttons instead. Rendered as a standalone row (its real consumer
 * lists these in a `Stack`, not a `<table>`), so this is a `<div>` row,
 * not a `<tr>`.
 */

import PropTypes from 'prop-types';
import Card from '../../primitives/Card/Card.jsx';
import styles from './ListingTableRow.module.scss';

export default function ListingTableRow({
  title,
  thumbnailUrl = undefined,
  typeBadge = undefined,
  statusBadge = undefined,
  updatedAtLabel = undefined,
  lifecycleInfo = undefined,
  actions = undefined,
  isLoading = false,
}) {
  if (isLoading) {
    return (
      <Card as="div" padding="md" className={styles.row}>
        <div className={styles.skeletonThumbnail} aria-hidden="true" />
        <div className={styles.skeletonText} aria-hidden="true" />
      </Card>
    );
  }

  return (
    <Card as="div" padding="md" className={styles.row}>
      {thumbnailUrl ? (
        <img
          src={thumbnailUrl}
          alt=""
          className={styles.thumbnail}
          loading="lazy"
        />
      ) : (
        <div className={styles.thumbnailPlaceholder} aria-hidden="true" />
      )}
      <div className={styles.content}>
        <div className={styles.titleRow}>
          <p className={styles.title}>{title}</p>
          {typeBadge}
          {statusBadge}
        </div>
        {updatedAtLabel && <p className={styles.updatedAt}>{updatedAtLabel}</p>}
        {lifecycleInfo && (
          <div className={styles.lifecycleInfo}>{lifecycleInfo}</div>
        )}
      </div>
      {actions && <div className={styles.actions}>{actions}</div>}
    </Card>
  );
}

ListingTableRow.propTypes = {
  title: PropTypes.string.isRequired,
  thumbnailUrl: PropTypes.string,
  typeBadge: PropTypes.node,
  statusBadge: PropTypes.node,
  updatedAtLabel: PropTypes.string,
  // Listing Lifetime / Renewal, Step B5 — a free-form node (unlike
  // `updatedAtLabel`'s plain string) rendered on its own line, since the
  // lifecycle status is itself a composed badge + exact-date text, not a
  // single label string.
  lifecycleInfo: PropTypes.node,
  actions: PropTypes.node,
  isLoading: PropTypes.bool,
};
