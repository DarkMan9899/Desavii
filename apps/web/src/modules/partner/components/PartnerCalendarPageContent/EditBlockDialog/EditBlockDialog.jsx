/**
 * EditBlockDialog — move, resize or re-describe an active manual block
 * (Calendar Excellence; `PATCH /availability/blocks/:id`).
 *
 * The server swaps the old dates for the new ones in one transaction, so
 * an edit that no longer fits (`AVAILABILITY_CONFLICT`) or targets a block
 * someone has just removed (`ALREADY_RELEASED`) is refused and the block
 * stays exactly as it was. The dialog stays open on any refusal and says
 * why, next to the field it concerns when there is one.
 */

import { useState } from 'react';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { Modal, Alert } from '@desavii/ui/components/feedback-overlays';
import {
  DatePicker,
  Input,
  Select,
  Textarea,
} from '@desavii/ui/components/form-controls';
import { Button } from '@desavii/ui/components/primitives';
import { Stack, Inline } from '@desavii/ui/components/layout';
import {
  useUpdateInventoryBlockMutation,
  BLOCK_REASON_CODES,
  INT_UNSIGNED_MAX,
  INVENTORY_TEXT_MAX_LENGTH,
} from '../../../../availability/index.js';
import useSelectTexts from '../../../../../hooks/useSelectTexts.js';
import {
  parseApiError,
  getApiErrorSummary,
  getIssueMessage,
} from '../../../../../utils/apiErrorFeedback.js';
import { validateBlockQuantity } from '../inventoryQuantity.js';
import {
  describeInventorySpan,
  exceedsMaxDateSpan,
  MAX_DATE_SPAN_DAYS,
} from '../inventorySpan.js';

const DATE_FIELDS = new Set(['dateFrom', 'dateTo']);

function initialForm(block) {
  return {
    range: { start: block.date_from, end: block.date_to },
    quantity: String(block.quantity),
    reasonCode: block.reason_code,
    notes: block.notes ?? '',
  };
}

export default function EditBlockDialog({
  block,
  listingId,
  bookableUnitType = undefined,
  locale,
  onClose,
  onSaved,
}) {
  const { t } = useTranslation();
  const selectTexts = useSelectTexts();
  const updateMutation = useUpdateInventoryBlockMutation(listingId);
  const [form, setForm] = useState(() => initialForm(block));
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(undefined);

  const { start, end } = form.range;
  const span =
    start && end ? describeInventorySpan(bookableUnitType, start, end) : null;

  function updateField(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: undefined }));
    setFormError(undefined);
  }

  function validate() {
    const nextErrors = {};
    if (!start || !end) {
      nextErrors.range = t('partner.calendar.blocks.datesRequired');
    } else if (exceedsMaxDateSpan(start, end)) {
      nextErrors.range = t('apiErrors.issues.dateSpanTooLong', {
        maximum: MAX_DATE_SPAN_DAYS,
      });
    }
    const quantity = validateBlockQuantity(form.quantity, t);
    if (quantity.error) nextErrors.quantity = quantity.error;
    setErrors(nextErrors);
    return { isValid: Object.keys(nextErrors).length === 0, quantity };
  }

  function showRefusal(error) {
    const parsed = parseApiError(error);
    const fieldErrors = {};
    parsed?.issues.forEach((issue) => {
      if (DATE_FIELDS.has(issue.path)) {
        fieldErrors.range = getIssueMessage(t, issue);
      } else if (issue.path === 'quantity') {
        fieldErrors.quantity = getIssueMessage(t, issue);
      }
    });
    setErrors(fieldErrors);
    setFormError(
      Object.keys(fieldErrors).length > 0
        ? undefined
        : getApiErrorSummary(t, error),
    );
  }

  async function handleSave() {
    const { isValid, quantity } = validate();
    if (!isValid) return;
    try {
      await updateMutation.mutateAsync({
        id: block.id,
        dateFrom: start,
        dateTo: end,
        quantity: quantity.value,
        reasonCode: form.reasonCode,
        notes: form.notes.trim() || undefined,
      });
      onSaved();
    } catch (error) {
      showRefusal(error);
    }
  }

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={t('partner.calendar.blocks.editTitle')}
      closeLabel={t('common.close')}
      preventClose={updateMutation.isPending}
      footer={
        <Inline gap="2" justify="flex-end" wrap>
          <Button
            variant="ghost"
            onClick={onClose}
            disabled={updateMutation.isPending}
          >
            {t('common.cancel')}
          </Button>
          <Button
            variant="primary"
            onClick={() => handleSave()}
            loading={updateMutation.isPending}
          >
            {t('partner.calendar.blocks.editSave')}
          </Button>
        </Inline>
      }
    >
      <Stack gap="4">
        {formError && <Alert variant="danger">{formError}</Alert>}
        <Stack gap="2">
          <DatePicker
            mode="range"
            label={t('partner.calendar.blocks.datesLabel')}
            value={form.range}
            onChange={(range) => updateField('range', range)}
            error={errors.range}
            required
            locale={locale}
            placeholder={t('partner.listingWizard.datePicker.selectDate')}
            previousMonthLabel={t(
              'partner.listingWizard.datePicker.previousMonth',
            )}
            nextMonthLabel={t('partner.listingWizard.datePicker.nextMonth')}
          />
          {span && !errors.range && (
            <p aria-live="polite">
              {t('partner.calendar.blocks.editSpanHint', {
                span: t(`partner.calendar.records.${span.unit}`, {
                  count: span.count,
                }),
              })}
            </p>
          )}
        </Stack>
        <Inline gap="3" wrap align="flex-start">
          <Input
            label={t('partner.calendar.blocks.quantityLabel')}
            type="number"
            min={1}
            max={INT_UNSIGNED_MAX}
            step={1}
            required
            value={form.quantity}
            error={errors.quantity}
            onChange={(event) => updateField('quantity', event.target.value)}
          />
          <Select
            label={t('partner.calendar.blocks.reasonLabel')}
            options={BLOCK_REASON_CODES.map((code) => ({
              value: code,
              label: t(`partner.calendar.blocks.reasonCodes.${code}`),
            }))}
            value={form.reasonCode}
            onChange={(value) => updateField('reasonCode', value)}
            searchPlaceholder={selectTexts.searchPlaceholder}
            noOptionsMessage={selectTexts.noOptionsMessage}
          />
        </Inline>
        <Textarea
          label={t('partner.calendar.blocks.notesLabel')}
          value={form.notes}
          maxLength={INVENTORY_TEXT_MAX_LENGTH.blockNotes}
          onChange={(event) => updateField('notes', event.target.value)}
        />
      </Stack>
    </Modal>
  );
}

EditBlockDialog.propTypes = {
  block: PropTypes.shape({
    id: PropTypes.number.isRequired,
    date_from: PropTypes.string.isRequired,
    date_to: PropTypes.string.isRequired,
    quantity: PropTypes.number.isRequired,
    reason_code: PropTypes.string.isRequired,
    notes: PropTypes.string,
  }).isRequired,
  listingId: PropTypes.number.isRequired,
  bookableUnitType: PropTypes.string,
  locale: PropTypes.string.isRequired,
  onClose: PropTypes.func.isRequired,
  onSaved: PropTypes.func.isRequired,
};
