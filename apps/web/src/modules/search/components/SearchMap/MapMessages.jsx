/**
 * MapMessages — what the map says over itself: loading/updating (a polite
 * live region, always present), no results (or none in the committed
 * area), more results than the map shows, and results without a location.
 */

import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import styles from './SearchMapPanel.module.scss';

export default function MapMessages({
  isLoading,
  isUpdating,
  meta = undefined,
  hasArea,
}) {
  const { t } = useTranslation();

  let status = null;
  if (isLoading) status = t('search.map.loading');
  else if (isUpdating) status = t('search.map.updating');

  const emptyKey = hasArea ? 'search.map.emptyArea' : 'search.map.empty';
  const unmapped = meta ? meta.total - meta.mappable : 0;

  return (
    <>
      <p className={styles.status} role="status">
        {status}
      </p>
      {meta?.total === 0 && (
        <div className={styles.notice}>
          <p className={styles.noticeTitle}>{t(`${emptyKey}.title`)}</p>
          <p className={styles.noticeText}>{t(`${emptyKey}.description`)}</p>
        </div>
      )}
      {meta?.truncated && (
        <p className={styles.hint}>{t('search.map.truncated')}</p>
      )}
      {unmapped > 0 && (
        <p className={styles.hint}>
          {t('search.map.partial', { count: unmapped })}
        </p>
      )}
    </>
  );
}

MapMessages.propTypes = {
  isLoading: PropTypes.bool.isRequired,
  isUpdating: PropTypes.bool.isRequired,
  meta: PropTypes.shape({
    total: PropTypes.number.isRequired,
    mappable: PropTypes.number.isRequired,
    truncated: PropTypes.bool.isRequired,
  }),
  /** A map area is committed: "no results" means none in it. */
  hasArea: PropTypes.bool.isRequired,
};
