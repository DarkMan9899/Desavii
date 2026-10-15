/**
 * ConfigEntityPanel — Stage 11.5 (Marketplace Configuration). The one
 * generic list+create+edit+delete panel shared by all six lookup-entity
 * tabs (categories, amenities, pricing models, countries, regions,
 * cities) on `AdminMarketplaceConfigPageContent` — see that file's own
 * header comment and `useAdminConfigResource.js`'s header comment for
 * why a single generic component, not six near-duplicate ones.
 *
 * The parent supplies data-shape knowledge (`columns`, `fields`,
 * `emptyValues`, `toFormValues`, `getRowLabel`) and every user-facing
 * string (`copy`) — this component owns only the shared list/modal/
 * confirm/toast mechanics, mirroring
 * `AdminListingModerationPageContent`'s established local-`Modal`-for-a-
 * controlled-form pattern (`useConfirm()` can't host a live input).
 *
 * `canWrite` (Phase 14.10 cleanup) hides Add/Edit/Delete entirely for a
 * role that lacks the write permission for this resource
 * (`marketplace.configure` or `settings.manage`, decided by the caller)
 * — a read-only table instead of buttons that always 403 on click.
 */

import { useCallback, useState } from 'react';
import PropTypes from 'prop-types';
import { Stack, Inline } from '@desavii/ui/components/layout';
import { Input, Select } from '@desavii/ui/components/form-controls';
import { Button } from '@desavii/ui/components/primitives';
import { DataTable } from '@desavii/ui/components/dashboard';
import { Modal, ErrorState } from '@desavii/ui/components/feedback-overlays';
import { useConfirm } from '../../../../contexts/ConfirmContext.jsx';
import { useToast } from '../../../../contexts/ToastContext.jsx';
import useSelectTexts from '../../../../hooks/useSelectTexts.js';

export default function ConfigEntityPanel({
  heading,
  addLabel,
  columns,
  rows,
  isPending,
  isError,
  onRetry,
  fields,
  emptyValues,
  toFormValues,
  getRowLabel,
  resource,
  copy,
  canWrite = true,
}) {
  const selectTexts = useSelectTexts();
  const confirm = useConfirm();
  const { showToast } = useToast();
  const [formTarget, setFormTarget] = useState(null); // null | 'create' | row
  const [values, setValues] = useState(emptyValues);

  function openCreate() {
    setValues(emptyValues);
    setFormTarget('create');
  }

  function openEdit(row) {
    setValues(toFormValues(row));
    setFormTarget(row);
  }

  // Stable reference matters, not just style: this is `Modal`'s `onClose`,
  // and the form it wraps has controlled inputs — `useFocusTrap`'s effect
  // depends on `onClose`, so a fresh reference on every keystroke-driven
  // re-render would tear the keydown listener/focus-restore effect down
  // and rebuild it every keystroke (the exact bug already fixed once in
  // `AdminListingModerationPageContent`'s reject dialog).
  const closeForm = useCallback(() => setFormTarget(null), []);

  function setField(name, value) {
    setValues((prev) => ({ ...prev, [name]: value }));
  }

  // An unselected optional `select`/number field holds `''` in local
  // state (a controlled input can't hold `null`) — translated to a real
  // `null` here so the backend's `.nullable()` Zod schemas accept it
  // instead of failing `.coerce.number()` on an empty string.
  function buildPayload() {
    const payload = {};
    fields.forEach((field) => {
      const raw = values[field.name];
      payload[field.name] = raw === '' && !field.required ? null : raw;
    });
    return payload;
  }

  // Two entry points share this: the `<form>`'s native submit (Enter key)
  // and the footer's Save button — the latter lives in `Modal`'s footer
  // slot, outside the `<form>` element, so it can't rely on a submit
  // event and calls this directly instead.
  async function submitForm() {
    const payload = buildPayload();
    try {
      if (formTarget === 'create') {
        await resource.createMutation.mutateAsync(payload);
        showToast(copy.createSuccess, { variant: 'success' });
      } else {
        await resource.updateMutation.mutateAsync({
          id: formTarget.id,
          ...payload,
        });
        showToast(copy.updateSuccess, { variant: 'success' });
      }
      setFormTarget(null);
    } catch {
      showToast(copy.saveError, { variant: 'danger' });
    }
  }

  function handleFormSubmit(event) {
    event.preventDefault();
    submitForm();
  }

  async function handleDelete(row) {
    const label = getRowLabel(row);
    const confirmed = await confirm({
      title: copy.deleteConfirmTitle(label),
      description: copy.deleteConfirmDescription,
      confirmLabel: copy.deleteAction,
      cancelLabel: copy.cancelAction,
      variant: 'danger',
    });
    if (!confirmed) return;
    try {
      await resource.deleteMutation.mutateAsync(row.id);
      showToast(copy.deleteSuccess, { variant: 'success' });
    } catch {
      showToast(copy.deleteError, { variant: 'danger' });
    }
  }

  const tableColumns = canWrite
    ? [
        ...columns,
        {
          key: 'actions',
          header: '',
          render: (row) => (
            <Inline gap="2">
              <Button variant="ghost" size="sm" onClick={() => openEdit(row)}>
                {copy.editAction}
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => handleDelete(row)}
              >
                {copy.deleteAction}
              </Button>
            </Inline>
          ),
        },
      ]
    : columns;

  const isFormOpen = formTarget !== null;
  const isSaving =
    resource.createMutation.isPending || resource.updateMutation.isPending;

  return (
    <Stack gap="4">
      <Inline justify="space-between" align="center">
        <h2>{heading}</h2>
        {canWrite && (
          <Button variant="primary" size="sm" onClick={() => openCreate()}>
            {addLabel}
          </Button>
        )}
      </Inline>

      {isError ? (
        <ErrorState
          title={copy.errorTitle}
          retryLabel={copy.errorRetry}
          onRetry={onRetry}
        />
      ) : (
        <DataTable
          columns={tableColumns}
          rows={rows}
          isLoading={isPending}
          emptyTitle={copy.emptyTitle}
          emptyDescription={copy.emptyDescription}
        />
      )}

      {isFormOpen && (
        <Modal
          isOpen
          onClose={closeForm}
          title={
            formTarget === 'create'
              ? copy.formCreateTitle
              : copy.formEditTitle(getRowLabel(formTarget))
          }
          size="sm"
          footer={
            <Inline gap="3" justify="flex-end">
              <Button variant="ghost" onClick={() => closeForm()}>
                {copy.cancelAction}
              </Button>
              <Button
                variant="primary"
                onClick={() => submitForm()}
                loading={isSaving}
              >
                {copy.saveAction}
              </Button>
            </Inline>
          }
        >
          <form onSubmit={handleFormSubmit}>
            <Stack gap="3">
              {fields.map((field) => {
                if (field.type === 'select') {
                  return (
                    <Select
                      placeholder={selectTexts.placeholder}
                      searchPlaceholder={selectTexts.searchPlaceholder}
                      noOptionsMessage={selectTexts.noOptionsMessage}
                      key={field.name}
                      label={field.label}
                      options={field.options}
                      value={values[field.name] ?? ''}
                      onChange={(value) => setField(field.name, value)}
                    />
                  );
                }
                return (
                  <Input
                    key={field.name}
                    label={field.label}
                    type={field.numeric ? 'number' : 'text'}
                    step={field.step}
                    value={values[field.name] ?? ''}
                    onChange={(event) =>
                      setField(field.name, event.target.value)
                    }
                    required={field.required}
                  />
                );
              })}
            </Stack>
          </form>
        </Modal>
      )}
    </Stack>
  );
}

ConfigEntityPanel.propTypes = {
  heading: PropTypes.node.isRequired,
  addLabel: PropTypes.node.isRequired,
  columns: PropTypes.arrayOf(
    PropTypes.shape({
      key: PropTypes.string.isRequired,
      header: PropTypes.node,
      render: PropTypes.func,
    }),
  ).isRequired,
  // Row shape genuinely varies per entity (category/amenity/pricing
  // model/country/region/city each have their own columns) — this panel
  // is deliberately shape-agnostic about row data, so `objectOf` (any
  // key/value pair) rather than a fixed `shape`.
  rows: PropTypes.arrayOf(PropTypes.objectOf(PropTypes.node)).isRequired,
  isPending: PropTypes.bool.isRequired,
  isError: PropTypes.bool.isRequired,
  onRetry: PropTypes.func.isRequired,
  fields: PropTypes.arrayOf(
    PropTypes.shape({
      name: PropTypes.string.isRequired,
      label: PropTypes.node.isRequired,
      type: PropTypes.oneOf(['text', 'select']),
      numeric: PropTypes.bool,
      step: PropTypes.string,
      required: PropTypes.bool,
      options: PropTypes.arrayOf(
        PropTypes.shape({
          value: PropTypes.string.isRequired,
          label: PropTypes.node.isRequired,
        }),
      ),
    }),
  ).isRequired,
  emptyValues: PropTypes.objectOf(PropTypes.string).isRequired,
  toFormValues: PropTypes.func.isRequired,
  getRowLabel: PropTypes.func.isRequired,
  resource: PropTypes.shape({
    createMutation: PropTypes.shape({
      mutateAsync: PropTypes.func.isRequired,
      isPending: PropTypes.bool,
    }).isRequired,
    updateMutation: PropTypes.shape({
      mutateAsync: PropTypes.func.isRequired,
      isPending: PropTypes.bool,
    }).isRequired,
    deleteMutation: PropTypes.shape({
      mutateAsync: PropTypes.func.isRequired,
    }).isRequired,
  }).isRequired,
  canWrite: PropTypes.bool,
  copy: PropTypes.shape({
    formCreateTitle: PropTypes.node.isRequired,
    formEditTitle: PropTypes.func.isRequired,
    deleteConfirmTitle: PropTypes.func.isRequired,
    deleteConfirmDescription: PropTypes.node.isRequired,
    saveAction: PropTypes.node.isRequired,
    cancelAction: PropTypes.node.isRequired,
    editAction: PropTypes.node.isRequired,
    deleteAction: PropTypes.node.isRequired,
    emptyTitle: PropTypes.node.isRequired,
    emptyDescription: PropTypes.node.isRequired,
    errorTitle: PropTypes.node.isRequired,
    errorRetry: PropTypes.node.isRequired,
    createSuccess: PropTypes.node.isRequired,
    updateSuccess: PropTypes.node.isRequired,
    deleteSuccess: PropTypes.node.isRequired,
    saveError: PropTypes.node.isRequired,
    deleteError: PropTypes.node.isRequired,
  }).isRequired,
};
