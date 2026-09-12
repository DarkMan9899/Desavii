/**
 * ItemForm — Pass 6 (Partner Menu Authoring). Title/description/price/
 * currency/dietary markers, plus an edit-only active toggle (same
 * "isActive doesn't exist yet at creation" rule `MenuForm.jsx` already
 * follows — `createItemSchema` has no `isActive` field, only
 * `updateItemSchema` does). Deliberately no photo upload here yet — a
 * real per-item image is optional in the schema (`media_id` nullable)
 * and out of this pass's scope; adding it later is additive, not a
 * breaking change to this form's shape.
 */

import { useState } from 'react';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import {
  Input,
  Textarea,
  Select,
  Switch,
  Checkbox,
} from '@desavii/ui/components/form-controls';
import { Button } from '@desavii/ui/components/primitives';
import { Stack, Inline } from '@desavii/ui/components/layout';
import { CURRENCY_CODES } from '../../constants/currencies.js';
import { DIETARY_MARKERS } from '../../constants/dietaryMarkers.js';

export default function ItemForm({
  initialValues = {},
  isEditing = false,
  isSubmitting = false,
  submitLabel,
  onSubmit,
  onCancel = undefined,
}) {
  const { t } = useTranslation();
  const [title, setTitle] = useState(initialValues.title ?? '');
  const [description, setDescription] = useState(
    initialValues.description ?? '',
  );
  const [priceAmount, setPriceAmount] = useState(
    initialValues.priceAmount != null ? String(initialValues.priceAmount) : '',
  );
  const [priceCurrencyCode, setPriceCurrencyCode] = useState(
    initialValues.priceCurrencyCode ?? CURRENCY_CODES[0],
  );
  const [dietaryMarkers, setDietaryMarkers] = useState(
    initialValues.dietaryMarkers ?? [],
  );
  const [isActive, setIsActive] = useState(initialValues.isActive ?? true);

  const titleMissing = title.trim() === '';
  const priceInvalid = priceAmount === '' || Number(priceAmount) < 0;

  function toggleMarker(marker) {
    setDietaryMarkers((current) =>
      current.includes(marker)
        ? current.filter((code) => code !== marker)
        : [...current, marker],
    );
  }

  function handleSubmit() {
    onSubmit({
      title: title.trim(),
      description: description.trim() === '' ? undefined : description.trim(),
      priceAmount: Number(priceAmount),
      priceCurrencyCode,
      dietaryMarkers,
      ...(isEditing ? { isActive } : {}),
    });
  }

  return (
    <Stack gap="3">
      <Input
        label={t('partner.listingMenu.itemTitleLabel')}
        placeholder={t('partner.listingMenu.itemTitlePlaceholder')}
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        required
      />
      <Textarea
        label={t('partner.listingMenu.itemDescriptionLabel')}
        value={description}
        onChange={(event) => setDescription(event.target.value)}
        rows={2}
      />
      <Inline gap="4" wrap align="flex-end">
        <Input
          type="number"
          label={t('partner.listingMenu.priceAmountLabel')}
          value={priceAmount}
          onChange={(event) => setPriceAmount(event.target.value)}
          required
        />
        <Select
          label={t('partner.listingMenu.priceCurrencyLabel')}
          options={CURRENCY_CODES.map((code) => ({ value: code, label: code }))}
          value={priceCurrencyCode}
          onChange={setPriceCurrencyCode}
        />
      </Inline>
      <Stack gap="2">
        <span>{t('partner.listingMenu.dietaryMarkersLabel')}</span>
        <Inline gap="4" wrap>
          {DIETARY_MARKERS.map((marker) => (
            <Checkbox
              key={marker}
              checked={dietaryMarkers.includes(marker)}
              onChange={() => toggleMarker(marker)}
              label={t(`pages.listingDetail.menu.dietaryMarkers.${marker}`)}
            />
          ))}
        </Inline>
      </Stack>
      {isEditing && (
        <Switch
          checked={isActive}
          onChange={(event) => setIsActive(event.target.checked)}
          label={t('partner.listingMenu.itemActiveLabel')}
        />
      )}
      <Inline gap="2">
        <Button
          variant="primary"
          size="sm"
          loading={isSubmitting}
          disabled={titleMissing || priceInvalid}
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

ItemForm.propTypes = {
  initialValues: PropTypes.shape({
    title: PropTypes.string,
    description: PropTypes.string,
    priceAmount: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    priceCurrencyCode: PropTypes.string,
    dietaryMarkers: PropTypes.arrayOf(PropTypes.string),
    isActive: PropTypes.bool,
  }),
  isEditing: PropTypes.bool,
  isSubmitting: PropTypes.bool,
  submitLabel: PropTypes.string.isRequired,
  onSubmit: PropTypes.func.isRequired,
  onCancel: PropTypes.func,
};
