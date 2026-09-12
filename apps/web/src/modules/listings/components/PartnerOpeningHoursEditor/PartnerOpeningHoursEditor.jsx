/**
 * PartnerOpeningHoursEditor — Pass 6 (Restaurant vertical, owner issue
 * #13). A full-week editor over `PUT /listings/:id/opening-hours`
 * (`useReplaceListingOpeningHoursMutation`, already built alongside the
 * public display). Each day has three real states — Not set / Open /
 * Closed — never just two, because "not set" (no row at all: "hours not
 * published for that day") and "closed" (an explicit, real claim the
 * business is shut that day) mean different things; collapsing them
 * would force a partner who hasn't decided a day's hours yet into
 * falsely claiming it's closed. A day left "Not set" is simply omitted
 * from the PUT payload, matching `listing_opening_hours`'s own "no
 * row = not published" model exactly.
 *
 * Monday-first display (matches the public `ListingOpeningHoursSection`
 * and this app's DatePicker convention) — `day_of_week` itself always
 * stays the real `Date#getDay()` value (0=Sunday) underneath.
 */

import { useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { Input, Select } from '@desavii/ui/components/form-controls';
import { Button, Card } from '@desavii/ui/components/primitives';
import { Stack, Inline } from '@desavii/ui/components/layout';
import {
  Spinner,
  ErrorState,
  Alert,
} from '@desavii/ui/components/feedback-overlays';
import { useToast } from '../../../../contexts/ToastContext.jsx';
import { useListingOpeningHoursQuery } from '../../queries/useListingOpeningHoursQuery.js';
import { useReplaceListingOpeningHoursMutation } from '../../mutations/useReplaceListingOpeningHoursMutation.js';
import { getWeekdayName } from '../../utils/openingHoursStatus.js';

const MONDAY_FIRST_ORDER = [1, 2, 3, 4, 5, 6, 0];
const MODES = ['UNSET', 'OPEN', 'CLOSED'];

function buildInitialRows(weeklyHours, locale) {
  return MONDAY_FIRST_ORDER.map((dayOfWeek) => {
    const day = (weeklyHours ?? []).find(
      (row) => row.day_of_week === dayOfWeek,
    );
    if (!day) {
      return { dayOfWeek, mode: 'UNSET', opensAt: '', closesAt: '' };
    }
    return {
      dayOfWeek,
      mode: day.is_closed ? 'CLOSED' : 'OPEN',
      opensAt: day.opens_at ?? '',
      closesAt: day.closes_at ?? '',
    };
  }).map((row) => ({ ...row, label: getWeekdayName(row.dayOfWeek, locale) }));
}

export default function PartnerOpeningHoursEditor({ listingId }) {
  const { t, i18n } = useTranslation();
  const { showToast } = useToast();
  const hoursQuery = useListingOpeningHoursQuery(listingId);
  const replaceMutation = useReplaceListingOpeningHoursMutation();

  const initialRows = useMemo(
    () => buildInitialRows(hoursQuery.data, i18n.language),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally re-derived only when the query's own data identity changes, not on every render
    [hoursQuery.data, i18n.language],
  );
  const [rows, setRows] = useState(initialRows);
  const [hasEdited, setHasEdited] = useState(false);
  const activeRows = hasEdited ? rows : initialRows;

  if (hoursQuery.isPending) {
    return <Spinner label={t('partner.listingOpeningHours.hoursLoading')} />;
  }
  if (hoursQuery.isError) {
    return (
      <ErrorState
        title={t('partner.listingOpeningHours.hoursErrorTitle')}
        retryLabel={t('partner.listingWizard.retry')}
        onRetry={hoursQuery.refetch}
      />
    );
  }

  function updateRow(dayOfWeek, patch) {
    setHasEdited(true);
    setRows((current) =>
      (hasEdited ? current : initialRows).map((row) =>
        row.dayOfWeek === dayOfWeek ? { ...row, ...patch } : row,
      ),
    );
  }

  const incompleteRows = activeRows.filter(
    (row) => row.mode === 'OPEN' && (!row.opensAt || !row.closesAt),
  );

  function handleSave() {
    const days = activeRows
      .filter((row) => row.mode !== 'UNSET')
      .map((row) =>
        row.mode === 'CLOSED'
          ? { dayOfWeek: row.dayOfWeek, isClosed: true }
          : {
              dayOfWeek: row.dayOfWeek,
              isClosed: false,
              opensAt: row.opensAt,
              closesAt: row.closesAt,
            },
      );
    replaceMutation.mutate(
      { id: listingId, days },
      {
        onSuccess: () => {
          setHasEdited(false);
          showToast(t('partner.listingOpeningHours.saveSuccess'), {
            variant: 'success',
          });
        },
        onError: () => {
          showToast(t('partner.listingOpeningHours.saveError'), {
            variant: 'danger',
          });
        },
      },
    );
  }

  return (
    <Stack gap="4">
      <Stack gap="3">
        {activeRows.map((row) => (
          <Card key={row.dayOfWeek} padding="md">
            <Inline gap="4" wrap align="flex-end">
              <strong>{row.label}</strong>
              <Select
                ariaLabel={row.label}
                options={MODES.map((mode) => ({
                  value: mode,
                  label: t(`partner.listingOpeningHours.mode.${mode}`),
                }))}
                value={row.mode}
                onChange={(mode) => updateRow(row.dayOfWeek, { mode })}
              />
              {row.mode === 'OPEN' && (
                <>
                  <Input
                    type="time"
                    label={t('partner.listingOpeningHours.opensAtLabel')}
                    value={row.opensAt}
                    onChange={(event) =>
                      updateRow(row.dayOfWeek, { opensAt: event.target.value })
                    }
                  />
                  <Input
                    type="time"
                    label={t('partner.listingOpeningHours.closesAtLabel')}
                    value={row.closesAt}
                    onChange={(event) =>
                      updateRow(row.dayOfWeek, { closesAt: event.target.value })
                    }
                  />
                </>
              )}
            </Inline>
          </Card>
        ))}
      </Stack>
      <p>{t('partner.listingOpeningHours.overnightHint')}</p>
      {incompleteRows.length > 0 && (
        <p>{t('partner.listingOpeningHours.incompleteHint')}</p>
      )}
      {replaceMutation.error && (
        <Alert variant="danger">{replaceMutation.error.message}</Alert>
      )}
      <Inline>
        <Button
          variant="primary"
          loading={replaceMutation.isPending}
          disabled={incompleteRows.length > 0}
          onClick={() => handleSave()}
        >
          {t('partner.listingOpeningHours.saveAction')}
        </Button>
      </Inline>
    </Stack>
  );
}

PartnerOpeningHoursEditor.propTypes = {
  listingId: PropTypes.number.isRequired,
};
