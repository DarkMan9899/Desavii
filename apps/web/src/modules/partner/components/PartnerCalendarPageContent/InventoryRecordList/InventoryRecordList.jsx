/**
 * InventoryRecordList — the Partner calendar's active manual blocks and
 * external reservations (Calendar Excellence).
 *
 * One row per record: its dates (localized, with what they take out of
 * inventory — "1 night" for a hotel room, "2 days" for a tour departure,
 * see `inventorySpan.js`), its labelled details, and its actions. A
 * description list rather than a table, so the same markup reads as one
 * aligned row on a desktop and stacks on a phone without losing any
 * label. Presentational only: the caller supplies each record's details
 * and action buttons.
 */

import { useMemo } from 'react';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { EmptyState } from '@desavii/ui/components/feedback-overlays';
import { createDateFormatter } from '@desavii/ui/utils/dateFormat';
import { describeInventorySpan } from '../inventorySpan.js';
import styles from './InventoryRecordList.module.scss';

const toUtcDate = (iso) => new Date(`${iso}T00:00:00Z`);

export default function InventoryRecordList({
  records,
  bookableUnitType = undefined,
  locale,
  emptyTitle,
  ariaLabel,
}) {
  const { t } = useTranslation();
  const rangeFormatter = useMemo(
    () =>
      createDateFormatter(locale, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        timeZone: 'UTC',
      }),
    [locale],
  );

  if (records.length === 0) {
    return <EmptyState title={emptyTitle} />;
  }

  return (
    <ul className={styles.list} aria-label={ariaLabel}>
      {records.map((record) => {
        const span = describeInventorySpan(
          bookableUnitType,
          record.dateFrom,
          record.dateTo,
        );
        const dates =
          record.dateFrom === record.dateTo
            ? rangeFormatter.format(toUtcDate(record.dateFrom))
            : rangeFormatter.formatRange(
                toUtcDate(record.dateFrom),
                toUtcDate(record.dateTo),
              );
        return (
          <li key={record.id} className={styles.record}>
            <div className={styles.when}>
              <span className={styles.dates}>{dates}</span>
              <span className={styles.span}>
                {t(`partner.calendar.records.${span.unit}`, {
                  count: span.count,
                })}
              </span>
            </div>
            <dl className={styles.details}>
              {record.details.map((detail) => (
                <div key={detail.label} className={styles.detail}>
                  <dt className={styles.detailLabel}>{detail.label}</dt>
                  <dd className={styles.detailValue}>{detail.value}</dd>
                </div>
              ))}
            </dl>
            {record.actions && (
              <div className={styles.actions}>{record.actions}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

InventoryRecordList.propTypes = {
  records: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.number.isRequired,
      dateFrom: PropTypes.string.isRequired,
      dateTo: PropTypes.string.isRequired,
      details: PropTypes.arrayOf(
        PropTypes.shape({
          label: PropTypes.string.isRequired,
          value: PropTypes.node.isRequired,
        }),
      ).isRequired,
      actions: PropTypes.node,
    }),
  ).isRequired,
  bookableUnitType: PropTypes.string,
  locale: PropTypes.string.isRequired,
  emptyTitle: PropTypes.string.isRequired,
  ariaLabel: PropTypes.string.isRequired,
};
