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
import ApiErrorAlert from '../../../../components/ApiErrorAlert/ApiErrorAlert.jsx';
import apiErrorPropType from '../../../../components/ApiErrorAlert/apiErrorPropType.js';
import useApiFieldErrors from '../../../../hooks/useApiFieldErrors.js';
import {
  MENU_NAME_MAX_LENGTH,
  MENU_DESCRIPTION_MAX_LENGTH,
} from '../../constants/textLimits.js';

const INLINE_API_PATHS = ['languageCode', 'name', 'description'];

export default function MenuForm({
  initialValues = {},
  showLanguageSelector = false,
  isSubmitting = false,
  submitLabel,
  onSubmit,
  onCancel = undefined,
  serverError = null,
}) {
  const { t } = useTranslation();
  const { fieldError, clearFieldError } = useApiFieldErrors(serverError);
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
          error={fieldError('languageCode')}
          onChange={(value) => {
            setLanguageCode(value);
            clearFieldError('languageCode');
          }}
        />
      )}
      <Input
        label={t('partner.listingMenu.nameLabel')}
        placeholder={t('partner.listingMenu.namePlaceholder')}
        value={name}
        maxLength={MENU_NAME_MAX_LENGTH}
        error={fieldError('name')}
        onChange={(event) => {
          setName(event.target.value);
          clearFieldError('name');
        }}
        required
      />
      <Textarea
        label={t('partner.listingMenu.descriptionLabel')}
        value={description}
        maxLength={MENU_DESCRIPTION_MAX_LENGTH}
        error={fieldError('description')}
        onChange={(event) => {
          setDescription(event.target.value);
          clearFieldError('description');
        }}
        rows={2}
      />
      {!showLanguageSelector && (
        <Switch
          checked={isActive}
          onChange={(event) => setIsActive(event.target.checked)}
          label={t('partner.listingMenu.activeLabel')}
        />
      )}
      <ApiErrorAlert error={serverError} inlinePaths={INLINE_API_PATHS} />
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
  serverError: apiErrorPropType,
};
