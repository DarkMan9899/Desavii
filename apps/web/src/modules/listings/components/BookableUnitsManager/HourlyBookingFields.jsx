/**
 * Step L6.3B — the "Hourly booking" section of the hotel-room form. One
 * explicit opt-in for THIS room only (default off); the settings appear only
 * once it is on. Times are whole hours picked from a list (never free text),
 * so a Partner can only choose what the hourly contract accepts.
 */

import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { Checkbox, Input, Select } from '@desavii/ui/components/form-controls';
import { Inline } from '@desavii/ui/components/layout';
import { CURRENCY_CODES } from '../../constants/currencies.js';
import { formatHour, HOURS_PER_DAY } from '../../utils/hourlyStay.js';
import { HOURLY_DURATION_OPTIONS } from './hourlyBookingSettings.js';
import styles from './BookableUnitForm.module.scss';

const START_HOURS = Array.from({ length: HOURS_PER_DAY }, (_, hour) => hour);
const END_HOURS = Array.from({ length: HOURS_PER_DAY }, (_, hour) => hour + 1);

export default function HourlyBookingFields({
  settings,
  onChange,
  errors = {},
  serverFieldError = () => undefined,
}) {
  const { t } = useTranslation();
  const label = (key) => t(`partner.listingWizard.availability.${key}`);
  const errorFor = (field) =>
    (errors[field] && t(errors[field])) ?? serverFieldError(field);
  const update = (patch) => onChange({ ...settings, ...patch });
  const durationOptions = HOURLY_DURATION_OPTIONS.map((hours) => ({
    value: String(hours),
    label: t('partner.listingWizard.availability.hoursCount', { count: hours }),
  }));
  const hourOptions = (hours) =>
    hours.map((hour) => ({ value: formatHour(hour), label: formatHour(hour) }));

  return (
    <fieldset className={styles.section}>
      <legend className={styles.legend}>{label('hourlyHeading')}</legend>
      <Checkbox
        checked={settings.enabled}
        label={label('hourlyEnabled')}
        error={serverFieldError('hourlyEnabled')}
        onChange={(event) => update({ enabled: event.target.checked })}
      />
      <p className={styles.hint}>{label('hourlyEnabledHint')}</p>

      {settings.enabled && (
        <>
          <Inline gap="4" wrap>
            <Input
              type="number"
              min={0}
              step={0.01}
              label={label('hourlyPriceAmount')}
              value={settings.priceAmount}
              error={errorFor('hourlyPriceAmount')}
              onChange={(event) => update({ priceAmount: event.target.value })}
            />
            <Select
              label={label('hourlyPriceCurrency')}
              placeholder={t('partner.listingWizard.selectPlaceholder')}
              options={CURRENCY_CODES.map((code) => ({
                value: code,
                label: code,
              }))}
              value={settings.currency}
              error={errorFor('hourlyPriceCurrency')}
              onChange={(value) => update({ currency: value })}
            />
          </Inline>
          <Inline gap="4" wrap>
            <Select
              label={label('hourlyMinDuration')}
              placeholder={t('partner.listingWizard.selectPlaceholder')}
              options={durationOptions}
              value={settings.minHours || null}
              error={errorFor('hourlyMinDurationHours')}
              onChange={(value) => update({ minHours: value })}
            />
            <Select
              label={label('hourlyMaxDuration')}
              placeholder={t('partner.listingWizard.selectPlaceholder')}
              options={durationOptions}
              value={settings.maxHours || null}
              error={errorFor('hourlyMaxDurationHours')}
              onChange={(value) => update({ maxHours: value })}
            />
          </Inline>
          <Inline gap="4" wrap>
            <Select
              label={label('hourlyAvailableFrom')}
              placeholder={t('partner.listingWizard.selectPlaceholder')}
              options={hourOptions(START_HOURS)}
              value={settings.availableFrom || null}
              error={errorFor('hourlyAvailableFrom')}
              onChange={(value) => update({ availableFrom: value })}
            />
            <Select
              label={label('hourlyAvailableUntil')}
              placeholder={t('partner.listingWizard.selectPlaceholder')}
              options={hourOptions(END_HOURS)}
              value={settings.availableUntil || null}
              error={errorFor('hourlyAvailableUntil')}
              onChange={(value) => update({ availableUntil: value })}
            />
          </Inline>
          <p className={styles.hint}>{label('hourlyWindowHint')}</p>
        </>
      )}
    </fieldset>
  );
}

export const hourlySettingsShape = PropTypes.shape({
  enabled: PropTypes.bool.isRequired,
  priceAmount: PropTypes.string.isRequired,
  currency: PropTypes.string,
  minHours: PropTypes.string.isRequired,
  maxHours: PropTypes.string.isRequired,
  availableFrom: PropTypes.string.isRequired,
  availableUntil: PropTypes.string.isRequired,
});

HourlyBookingFields.propTypes = {
  settings: hourlySettingsShape.isRequired,
  onChange: PropTypes.func.isRequired,
  errors: PropTypes.objectOf(PropTypes.string),
  serverFieldError: PropTypes.func,
};
