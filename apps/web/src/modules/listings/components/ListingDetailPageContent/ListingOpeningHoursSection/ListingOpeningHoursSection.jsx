/**
 * ListingOpeningHoursSection — Pass 6 (Restaurant vertical, owner issue
 * #13). Renders a listing's real, partner-authored weekly opening hours
 * (migration 0046): a live "Open now"/"Closed now" status badge (computed
 * client-side — see `openingHoursStatus.js`'s own header for why) plus
 * the full weekly schedule. Never fabricates a status or a day's hours —
 * renders nothing when the partner hasn't authored any hours yet, same
 * "real content or nothing" rule `ListingFaqSection`/`ListingMenuSection`
 * already follow; an individual unauthored day inside an otherwise-real
 * week shows an honest "Hours not listed" line rather than a blank row.
 */

import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { Section, Stack, Inline } from '@desavii/ui/components/layout';
import { Badge } from '@desavii/ui/components/primitives';
import {
  computeOpenNowStatus,
  buildWeeklyScheduleRows,
} from '../../../utils/openingHoursStatus.js';
import styles from './ListingOpeningHoursSection.module.scss';

export default function ListingOpeningHoursSection({
  weeklyHours = [],
  locale = undefined,
  sectionId = undefined,
}) {
  const { t, i18n } = useTranslation();
  if (!weeklyHours || weeklyHours.length === 0) return null;

  const status = computeOpenNowStatus(weeklyHours);
  const rows = buildWeeklyScheduleRows(weeklyHours, locale ?? i18n.language);
  const todayDayOfWeek = new Date().getDay();

  return (
    <Section
      spacing="none"
      aria-label={t('pages.listingDetail.openingHours.heading')}
    >
      <Inline gap="3" align="center" className={styles.heading}>
        <h2 id={sectionId}>{t('pages.listingDetail.openingHours.heading')}</h2>
        {status !== 'UNKNOWN' && (
          <Badge
            variant={status === 'OPEN' ? 'success' : 'neutral'}
            size="sm"
            label={t(
              status === 'OPEN'
                ? 'pages.listingDetail.openingHours.openNow'
                : 'pages.listingDetail.openingHours.closedNow',
            )}
          />
        )}
      </Inline>
      <Stack gap="1" className={styles.schedule}>
        {rows.map((row) => (
          <Inline
            key={row.dayOfWeek}
            justify="space-between"
            gap="4"
            className={[
              styles.row,
              row.dayOfWeek === todayDayOfWeek && styles.rowToday,
            ]
              .filter(Boolean)
              .join(' ')}
          >
            <span className={styles.day}>{row.label}</span>
            <span className={styles.hours}>
              {!row.isPublished &&
                t('pages.listingDetail.openingHours.notListed')}
              {row.isPublished &&
                row.isClosed &&
                t('pages.listingDetail.openingHours.closed')}
              {row.isPublished &&
                !row.isClosed &&
                `${row.opensAt} – ${row.closesAt}`}
            </span>
          </Inline>
        ))}
      </Stack>
    </Section>
  );
}

ListingOpeningHoursSection.propTypes = {
  weeklyHours: PropTypes.arrayOf(
    PropTypes.shape({
      day_of_week: PropTypes.number.isRequired,
      opens_at: PropTypes.string,
      closes_at: PropTypes.string,
      is_closed: PropTypes.bool.isRequired,
    }),
  ),
  locale: PropTypes.string,
  sectionId: PropTypes.string,
};
