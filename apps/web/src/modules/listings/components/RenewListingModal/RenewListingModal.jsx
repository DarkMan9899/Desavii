/**
 * RenewListingModal — Listing Lifetime / Renewal, Step B5. A compact
 * modal, never the full 11-step wizard (brief §3): pick one of the 4
 * approved publication periods, confirm. Reuses the exact same `ChipGroup`
 * selector `ReviewStep.jsx` already established for this identical
 * choice (Step B3) — one shared period-picker pattern, not a second one.
 *
 * Self-contained: owns its own `useRenewListingMutation` call and the
 * selected-period state, so any caller (`PartnerListingsList.jsx` today,
 * a future Manager equivalent) just renders it with `isOpen`/`listing`/
 * `onClose`/`onRenewed` — no mutation wiring duplicated per caller.
 *
 * A readiness failure (a frozen listing that went stale — brief §7) shows
 * inline via the same itemized-issues `Alert` pattern `ReviewStep.jsx`
 * already uses for publish-readiness errors, never a raw/generic message.
 */

import { useState } from 'react';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { Modal, Alert } from '@desavii/ui/components/feedback-overlays';
import { Button } from '@desavii/ui/components/primitives';
import { ChipGroup } from '@desavii/ui/components/form-controls';
import { useRenewListingMutation } from '../../mutations/useRenewListingMutation.js';
import { PUBLICATION_PERIOD_DAYS_OPTIONS } from '../../constants/publicationPeriod.js';
import { resolveDefaultRenewalPeriod } from '../../utils/listingLifecyclePresentation.js';

const FALLBACK_PERIOD_DAYS = 90;

export default function RenewListingModal({
  isOpen,
  onClose,
  listing,
  onRenewed,
}) {
  const { t } = useTranslation();
  const renewMutation = useRenewListingMutation();
  const [selectedPeriod, setSelectedPeriod] = useState(() =>
    resolveDefaultRenewalPeriod(
      listing,
      PUBLICATION_PERIOD_DAYS_OPTIONS,
      FALLBACK_PERIOD_DAYS,
    ),
  );

  const periodOptions = PUBLICATION_PERIOD_DAYS_OPTIONS.map((days) => ({
    value: String(days),
    label: t('partner.listingWizard.publicationPeriod.dayCount', {
      count: days,
    }),
  }));

  function handlePeriodChange(nextValue) {
    // Same "ignore ChipGroup's own deselect contract" rule ReviewStep.jsx
    // already documents — exactly one period is always selected here too.
    if (nextValue === undefined) return;
    setSelectedPeriod(Number(nextValue));
  }

  async function handleConfirm() {
    try {
      const response = await renewMutation.mutateAsync({
        id: listing.id,
        publicationPeriodDays: selectedPeriod,
      });
      onRenewed(response.data);
      onClose();
    } catch {
      // Surfaced below via renewMutation.error — no further action here.
    }
  }

  const issues = renewMutation.error?.details ?? [];
  const isFrozen = listing.frozen_at != null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t('partner.listings.renew.modalTitle')}
      // "md", not "sm" — still a compact modal (brief §3), but "sm"'s
      // 400px cap left no room for the Confirm/Cancel button pair at any
      // viewport width once translated (the Armenian Confirm label is
      // long); "md" fits them on one line on desktop while `Modal`'s own
      // `.footer` flex-wrap fix still safely stacks them on narrow
      // viewports either way.
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={() => onClose()}>
            {t('partner.listings.renew.cancel')}
          </Button>
          <Button
            variant="primary"
            onClick={() => handleConfirm()}
            loading={renewMutation.isPending}
          >
            {t('partner.listings.renew.confirm')}
          </Button>
        </>
      }
    >
      <p>
        {t(
          isFrozen
            ? 'partner.listings.renew.modalDescriptionFrozen'
            : 'partner.listings.renew.modalDescription',
        )}
      </p>

      {renewMutation.error && (
        <Alert variant="danger">
          {renewMutation.error.message}
          {issues.length > 0 && (
            <ul>
              {issues.map((issue) => (
                <li key={`${issue.field}-${issue.issue}`}>
                  {t(`partner.listingWizard.publishIssues.${issue.issue}`, {
                    field: issue.field,
                    defaultValue: `${issue.field}: ${issue.issue}`,
                  })}
                </li>
              ))}
            </ul>
          )}
        </Alert>
      )}

      <ChipGroup
        label={t('partner.listingWizard.publicationPeriod.heading')}
        options={periodOptions}
        selectedValue={String(selectedPeriod)}
        onChange={(nextValue) => handlePeriodChange(nextValue)}
      />
    </Modal>
  );
}

RenewListingModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  listing: PropTypes.shape({
    id: PropTypes.number.isRequired,
    publication_period_days: PropTypes.number,
    frozen_at: PropTypes.string,
  }).isRequired,
  onRenewed: PropTypes.func.isRequired,
};
