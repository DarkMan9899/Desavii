/**
 * SectionForm — Pass 6 (Partner Menu Authoring). One field: a section's
 * title (e.g. "Appetizers"). Shared by create and edit, same shape as
 * `MenuForm.jsx`.
 */

import { useState } from 'react';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { Input } from '@desavii/ui/components/form-controls';
import { Button } from '@desavii/ui/components/primitives';
import { Stack, Inline } from '@desavii/ui/components/layout';

export default function SectionForm({
  initialValues = {},
  isSubmitting = false,
  submitLabel,
  onSubmit,
  onCancel = undefined,
}) {
  const { t } = useTranslation();
  const [title, setTitle] = useState(initialValues.title ?? '');

  const titleMissing = title.trim() === '';

  function handleSubmit() {
    onSubmit({ title: title.trim() });
  }

  return (
    <Stack gap="3">
      <Input
        label={t('partner.listingMenu.sectionTitleLabel')}
        placeholder={t('partner.listingMenu.sectionTitlePlaceholder')}
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        required
      />
      <Inline gap="2">
        <Button
          variant="primary"
          size="sm"
          loading={isSubmitting}
          disabled={titleMissing}
          onClick={() => handleSubmit()}
        >
          {submitLabel}
        </Button>
        {onCancel && (
          <Button variant="ghost" size="sm" onClick={onCancel}>
            {t('partner.listingWizard.cancel')}
          </Button>
        )}
      </Inline>
    </Stack>
  );
}

SectionForm.propTypes = {
  initialValues: PropTypes.shape({ title: PropTypes.string }),
  isSubmitting: PropTypes.bool,
  submitLabel: PropTypes.string.isRequired,
  onSubmit: PropTypes.func.isRequired,
  onCancel: PropTypes.func,
};
