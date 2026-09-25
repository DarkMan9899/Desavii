/**
 * AvailabilityStep — step 8. Room/unit registration (P2.2A: including
 * occupancy/bed configuration/base price, and — unlike the old version —
 * NOT limited to a single unit; see `BookableUnitsManager`) and managing
 * blackout dates both come from the `availability` module's public
 * exports (`modules/listings` depending on `modules/availability` is the
 * allowed direction — FRONTEND_ARCHITECTURE.md §6.3: "listings may
 * depend on availability"). Booking rules (`minimumStayNights`/
 * `maximumStayNights`/`advanceBookingMinHours`/`advanceBookingMaxDays`)
 * are plain `listing_booking_rules` fields, written through the same
 * `updateListing` mutation every other step uses — no separate
 * availability endpoint exists for them.
 *
 * Doesn't hard-block Continue on "no bookable unit registered yet" —
 * `ReviewStep` is the one authoritative publish-readiness gate (the
 * real check is server-side); this step only offers the action.
 */

import { useState } from 'react';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { Input, DatePicker } from '@desavii/ui/components/form-controls';
import { Button } from '@desavii/ui/components/primitives';
import { Alert } from '@desavii/ui/components/feedback-overlays';
import { Stack } from '@desavii/ui/components/layout';
import {
  useBlackoutsQuery,
  useCreateBlackoutMutation,
  useRemoveBlackoutMutation,
} from '../../../../availability/index.js';
import { useUpdateListingMutation } from '../../../mutations/useUpdateListingMutation.js';
import BookableUnitsManager from '../../BookableUnitsManager/BookableUnitsManager.jsx';
import WizardStepActions from '../WizardStepActions.jsx';

function toOptionalInt(value) {
  return value === '' ? undefined : Number(value);
}

export default function AvailabilityStep({
  listingId,
  categoryId = null,
  initialValues = {},
  onBack = undefined,
  onNext,
}) {
  const { t } = useTranslation();
  const { locale } = useParams();
  const blackoutsQuery = useBlackoutsQuery(listingId);
  const createBlackoutMutation = useCreateBlackoutMutation();
  const removeBlackoutMutation = useRemoveBlackoutMutation();
  const updateListingMutation = useUpdateListingMutation();

  const [blackoutRange, setBlackoutRange] = useState({
    start: null,
    end: null,
  });
  const [rules, setRules] = useState({
    minimumStayNights: initialValues.minimumStayNights ?? '',
    maximumStayNights: initialValues.maximumStayNights ?? '',
    advanceBookingMinHours: initialValues.advanceBookingMinHours ?? '',
    advanceBookingMaxDays: initialValues.advanceBookingMaxDays ?? '',
  });

  const blackouts = blackoutsQuery.data ?? [];

  function setRule(field, value) {
    setRules((current) => ({ ...current, [field]: value }));
  }

  function handleAddBlackout() {
    if (!blackoutRange.start || !blackoutRange.end) return;
    createBlackoutMutation.mutate(
      { listingId, dateFrom: blackoutRange.start, dateTo: blackoutRange.end },
      { onSuccess: () => setBlackoutRange({ start: null, end: null }) },
    );
  }

  function handleRemoveBlackout(id) {
    removeBlackoutMutation.mutate({ id, listingId });
  }

  async function handleContinue() {
    const bookingRules = {
      minimumStayNights: toOptionalInt(rules.minimumStayNights),
      maximumStayNights: toOptionalInt(rules.maximumStayNights),
      advanceBookingMinHours: toOptionalInt(rules.advanceBookingMinHours),
      advanceBookingMaxDays: toOptionalInt(rules.advanceBookingMaxDays),
    };
    const hasAnyRule = Object.values(bookingRules).some(
      (value) => value !== undefined,
    );
    if (hasAnyRule) {
      await updateListingMutation.mutateAsync({
        id: listingId,
        payload: { bookingRules },
      });
    }
    onNext();
  }

  return (
    <div>
      <h2>{t('partner.listingWizard.steps.availability')}</h2>

      <section>
        <h3>{t('partner.listingWizard.availability.units')}</h3>
        <BookableUnitsManager listingId={listingId} categoryId={categoryId} />
      </section>

      <section>
        <h3>{t('partner.listingWizard.availability.blackoutDates')}</h3>
        {blackouts.length > 0 && (
          <ul>
            {blackouts.map((blackout) => (
              <li key={blackout.id}>
                {blackout.date_from} – {blackout.date_to}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleRemoveBlackout(blackout.id)}
                >
                  {t('partner.listingWizard.availability.removeBlackout')}
                </Button>
              </li>
            ))}
          </ul>
        )}
        <DatePicker
          mode="range"
          label={t('partner.listingWizard.availability.addBlackoutRange')}
          value={blackoutRange}
          onChange={setBlackoutRange}
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
          disabled={!blackoutRange.start || !blackoutRange.end}
          onClick={() => handleAddBlackout()}
        >
          {t('partner.listingWizard.availability.addBlackout')}
        </Button>
      </section>

      <section>
        <h3>{t('partner.listingWizard.availability.bookingRules')}</h3>
        {updateListingMutation.error && (
          <Alert variant="danger">{updateListingMutation.error.message}</Alert>
        )}
        <Stack gap="4">
          <Input
            type="number"
            label={t('partner.listingWizard.availability.minimumStayNights')}
            helperText={t(
              'partner.listingWizard.availability.minimumStayNightsHint',
            )}
            value={rules.minimumStayNights}
            onChange={(event) =>
              setRule('minimumStayNights', event.target.value)
            }
          />
          <Input
            type="number"
            label={t('partner.listingWizard.availability.maximumStayNights')}
            helperText={t(
              'partner.listingWizard.availability.maximumStayNightsHint',
            )}
            value={rules.maximumStayNights}
            onChange={(event) =>
              setRule('maximumStayNights', event.target.value)
            }
          />
          <Input
            type="number"
            label={t(
              'partner.listingWizard.availability.advanceBookingMinHours',
            )}
            helperText={t(
              'partner.listingWizard.availability.advanceBookingMinHoursHint',
            )}
            value={rules.advanceBookingMinHours}
            onChange={(event) =>
              setRule('advanceBookingMinHours', event.target.value)
            }
          />
          <Input
            type="number"
            label={t(
              'partner.listingWizard.availability.advanceBookingMaxDays',
            )}
            helperText={t(
              'partner.listingWizard.availability.advanceBookingMaxDaysHint',
            )}
            value={rules.advanceBookingMaxDays}
            onChange={(event) =>
              setRule('advanceBookingMaxDays', event.target.value)
            }
          />
        </Stack>
      </section>

      <WizardStepActions
        onBack={onBack}
        onContinue={() => handleContinue()}
        isSubmitting={updateListingMutation.isPending}
        backLabel={t('partner.listingWizard.back')}
        continueLabel={t('partner.listingWizard.continue')}
      />
    </div>
  );
}

AvailabilityStep.propTypes = {
  listingId: PropTypes.number.isRequired,
  categoryId: PropTypes.number,
  initialValues: PropTypes.shape({
    minimumStayNights: PropTypes.number,
    maximumStayNights: PropTypes.number,
    advanceBookingMinHours: PropTypes.number,
    advanceBookingMaxDays: PropTypes.number,
  }),
  onBack: PropTypes.func,
  onNext: PropTypes.func.isRequired,
};
