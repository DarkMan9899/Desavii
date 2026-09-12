/**
 * MenuForm — Pass 6 (Partner Menu Authoring). The shared field set for
 * both creating a new menu and editing an existing one, same
 * "showTypeSelector only at creation" convention `BookableUnitForm.jsx`
 * already establishes: `languageCode` is create-only (migration 0045's
 * per-language-menu design — a menu's language never changes after
 * creation, mirroring `updateMenuSchema` not accepting it server-side),
 * while `isActive` is edit-only (a menu doesn't exist yet to toggle at
 * creation time).
 */

import { useState } from 'react';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import {
  Input,
  Textarea,
  Select,
  Switch,
} from '@desavii/ui/components/form-controls';
import { Button } from '@desavii/ui/components/primitives';
import { Stack, Inline } from '@desavii/ui/components/layout';
import { SUPPORTED_LOCALES } from '../../../../translations/i18n.js';

export default function MenuForm({
  initialValues = {},
  showLanguageSelector = false,
  isSubmitting = false,
  submitLabel,
  onSubmit,
  onCancel = undefined,
}) {
  const { t } = useTranslation();
  const [languageCode, setLanguageCode] = useState(
    initialValues.languageCode ?? SUPPORTED_LOCALES[0],
  );
  const [name, setName] = useState(initialValues.name ?? '');
  const [description, setDescription] = useState(
    initialValues.description ?? '',
  );
  const [isActive, setIsActive] = useState(initialValues.isActive ?? true);

  const nameMissing = name.trim() === '';

  function handleSubmit() {
    onSubmit({
      ...(showLanguageSelector ? { languageCode } : {}),
      name: name.trim(),
      description: description.trim() === '' ? undefined : description.trim(),
      ...(!showLanguageSelector ? { isActive } : {}),
    });
  }

  return (
    <Stack gap="4">
      {showLanguageSelector && (
        <Select
          label={t('partner.listingMenu.languageLabel')}
          options={SUPPORTED_LOCALES.map((code) => ({
            value: code,
            label: t(`partner.listingWizard.contentLocale.${code}`),
          }))}
          value={languageCode}
          onChange={setLanguageCode}
        />
      )}
      <Input
        label={t('partner.listingMenu.nameLabel')}
        placeholder={t('partner.listingMenu.namePlaceholder')}
        value={name}
        onChange={(event) => setName(event.target.value)}
        required
      />
      <Textarea
        label={t('partner.listingMenu.descriptionLabel')}
        value={description}
        onChange={(event) => setDescription(event.target.value)}
        rows={2}
      />
      {!showLanguageSelector && (
        <Switch
          checked={isActive}
          onChange={(event) => setIsActive(event.target.checked)}
          label={t('partner.listingMenu.activeLabel')}
        />
      )}
      <Inline gap="2">
        <Button
          variant="primary"
          loading={isSubmitting}
          disabled={nameMissing}
          onClick={() => handleSubmit()}
        >
          {submitLabel}
        </Button>
        {onCancel && (
          <Button variant="ghost" onClick={onCancel}>
            {t('partner.listingWizard.cancel')}
          </Button>
        )}
      </Inline>
    </Stack>
  );
}

MenuForm.propTypes = {
  initialValues: PropTypes.shape({
    languageCode: PropTypes.string,
    name: PropTypes.string,
    description: PropTypes.string,
    isActive: PropTypes.bool,
  }),
  showLanguageSelector: PropTypes.bool,
  isSubmitting: PropTypes.bool,
  submitLabel: PropTypes.string.isRequired,
  onSubmit: PropTypes.func.isRequired,
  onCancel: PropTypes.func,
};
