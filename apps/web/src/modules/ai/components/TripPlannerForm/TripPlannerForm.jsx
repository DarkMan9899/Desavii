/**
 * TripPlannerForm (Stage 15.1) — "I want a 5-day trip in Armenia, budget
 * 800 USD, nature, family." Destination is a real free-text city name,
 * resolved server-side against the real `cities` table
 * (`tripPlannerService.planTrip`) — no client-side city picker exists
 * anywhere in the app yet, so this deliberately mirrors the honest
 * "type it, we resolve it" pattern rather than inventing a dropdown
 * backed by nothing.
 */

import { useState } from 'react';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { Input, Select } from '@desavii/ui/components/form-controls';
import { Button } from '@desavii/ui/components/primitives';
import { Stack, Inline, Grid } from '@desavii/ui/components/layout';

const CURRENCIES = ['AMD', 'USD', 'EUR'];

export default function TripPlannerForm({ onSubmit, isSubmitting = false }) {
  const { t } = useTranslation();
  const [destination, setDestination] = useState('');
  const [days, setDays] = useState(5);
  const [budget, setBudget] = useState(500);
  const [currency, setCurrency] = useState('AMD');
  const [interestsText, setInterestsText] = useState('');

  function handleSubmit(event) {
    event.preventDefault();
    const interests = interestsText
      .split(',')
      .map((interest) => interest.trim())
      .filter(Boolean);
    onSubmit({
      destination,
      days: Number(days),
      budget: Number(budget),
      currency,
      interests,
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      aria-label={t('ai.tripPlanner.form.ariaLabel')}
    >
      <Stack gap="4">
        <Input
          label={t('ai.tripPlanner.form.destinationLabel')}
          placeholder={t('ai.tripPlanner.form.destinationPlaceholder')}
          value={destination}
          onChange={(event) => setDestination(event.target.value)}
          required
        />
        <Grid columns={2} gap="4">
          <Input
            type="number"
            min="1"
            max="30"
            label={t('ai.tripPlanner.form.daysLabel')}
            value={days}
            onChange={(event) => setDays(event.target.value)}
            required
          />
          <Inline gap="2" align="flex-end">
            <Input
              type="number"
              min="1"
              label={t('ai.tripPlanner.form.budgetLabel')}
              value={budget}
              onChange={(event) => setBudget(event.target.value)}
              required
            />
            <Select
              ariaLabel={t('ai.tripPlanner.form.currencyLabel')}
              value={currency}
              onChange={(value) => setCurrency(value)}
              options={CURRENCIES.map((code) => ({ value: code, label: code }))}
            />
          </Inline>
        </Grid>
        <Input
          label={t('ai.tripPlanner.form.interestsLabel')}
          placeholder={t('ai.tripPlanner.form.interestsPlaceholder')}
          value={interestsText}
          onChange={(event) => setInterestsText(event.target.value)}
        />
        <Inline justify="flex-end">
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting
              ? t('ai.tripPlanner.form.submitting')
              : t('ai.tripPlanner.form.submit')}
          </Button>
        </Inline>
      </Stack>
    </form>
  );
}

TripPlannerForm.propTypes = {
  onSubmit: PropTypes.func.isRequired,
  isSubmitting: PropTypes.bool,
};
