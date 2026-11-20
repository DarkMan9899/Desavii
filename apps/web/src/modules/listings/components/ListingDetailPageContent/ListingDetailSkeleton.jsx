/**
 * ListingDetailSkeleton — the Listing Detail loading state: the same
 * frames the page will fill (breadcrumb, the gallery at its own ratio, the
 * header and the pinned panel), at least one screen tall — so nothing
 * shifts when the data arrives, and the site footer never flashes into the
 * first screen only to be pushed away (a large layout shift on phones).
 */

import { useTranslation } from 'react-i18next';
import { Skeleton } from '@desavii/ui/components/feedback-overlays';
import styles from './ListingDetailPageContent.module.scss';

export default function ListingDetailSkeleton() {
  const { t } = useTranslation();
  return (
    <div
      className={styles.skeleton}
      role="status"
      aria-busy="true"
      aria-label={t('pages.listingDetail.loading')}
    >
      <Skeleton variant="text" width="30%" height={20} />
      <div className={styles.skeletonHero} />
      <div className={styles.layout}>
        <div className={styles.main}>
          <Skeleton variant="text" width="50%" height={32} />
          <Skeleton variant="rect" height={160} />
        </div>
        <div className={styles.sidebar}>
          <Skeleton variant="rect" height={280} />
        </div>
      </div>
    </div>
  );
}
