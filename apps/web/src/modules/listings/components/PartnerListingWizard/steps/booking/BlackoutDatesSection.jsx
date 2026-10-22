/**
 * BlackoutDatesSection — closed date ranges, saved one by one as they are
 * added or removed (the `availability` module's blackout endpoints), so
 * nothing here waits for the step's Continue.
 */

import { useState } from 'react';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { DatePicker } from '@desavii/ui/components/form-controls';
import { Button } from '@desavii/ui/components/primitives';
import {
  useBlackoutsQuery,
  useCreateBlackoutMutation,
  useRemoveBlackoutMutation,
} from '../../../../../availability/index.js';
import ApiErrorAlert from '../../../../../../components/ApiErrorAlert/ApiErrorAlert.jsx';
import styles from './BookingSections.module.scss';

export default function BlackoutDatesSection({ listingId }) {
  const { t } = useTranslation();
  const { locale } = useParams();
  const blackoutsQuery = useBlackoutsQuery(listingId);
  const createBlackoutMutation = useCreateBlackoutMutation();
  const removeBlackoutMutation = useRemoveBlackoutMutation();
  const [range, setRange] = useState({ start: null, end: null });
  const blackouts = blackoutsQuery.data ?? [];

  function handleAdd() {
    if (!range.start || !range.end) return;
    createBlackoutMutation.mutate(
      { listingId, dateFrom: range.start, dateTo: range.end },
      { onSuccess: () => setRange({ start: null, end: null }) },
    );
  }

  return (
    <>
      {/* A rejected add (e.g. an overlapping range) or remove is shown. */}
      <ApiErrorAlert
        error={createBlackoutMutation.error ?? removeBlackoutMutation.error}
      />
      {blackouts.length > 0 && (
        <ul className={styles.blackouts}>
          {blackouts.map((blackout) => (
            <li key={blackout.id}>
              {blackout.date_from} – {blackout.date_to}
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  removeBlackoutMutation.mutate({ id: blackout.id, listingId })
                }
              >
                {t('partner.listingWizard.availability.removeBlackout')}
              </Button>
            </li>
          ))}
        </ul>
      )}
      <div className={styles.blackoutPicker}>
        <DatePicker
          mode="range"
          label={t('partner.listingWizard.availability.addBlackoutRange')}
          value={range}
          onChange={setRange}
          locale={locale}
          placeholder={t('partner.listingWizard.datePicker.selectDate')}
          previousMonthLabel={t(
            'partner.listingWizard.datePicker.previousMonth',
          )}
          nextMonthLabel={t('partner.listingWizard.datePicker.nextMonth')}
        />
        <Button
          variant="secondary"
          loading={createBlackoutMutation.isPending}
          disabled={!range.start || !range.end}
          onClick={() => handleAdd()}
        >
          {t('partner.listingWizard.availability.addBlackout')}
        </Button>
      </div>
    </>
  );
}

BlackoutDatesSection.propTypes = {
  listingId: PropTypes.number.isRequired,
};
