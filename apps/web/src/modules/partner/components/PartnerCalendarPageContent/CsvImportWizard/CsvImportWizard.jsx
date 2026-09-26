/**
 * CsvImportWizard — Phase 17 §21: upload -> parse -> preview -> confirm
 * bulk external-reservation import for one bookable unit. Parses
 * client-side (`parseCsv`, dependency-free), then submits only the
 * client-valid rows through the same `POST /availability/external-
 * reservations/bulk-import` endpoint `useBulkImportExternalReservation
 * Mutation` already wraps — no separate CSV-specific backend endpoint,
 * since the server already applies its own authoritative per-row
 * validation (duplicate `externalReference` detection, capacity
 * conflicts) and returns a per-row CREATED/SKIPPED_DUPLICATE/FAILED
 * result regardless of how the caller assembled the rows array.
 *
 * Client-side validation here is a courtesy (catch obviously-broken
 * rows before spending a network round trip), never the source of
 * truth — the confirm step's results always come from the server's own
 * per-row outcomes.
 */

import { useState } from 'react';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { Stack, Inline } from '@desavii/ui/components/layout';
import { Select } from '@desavii/ui/components/form-controls';
import { Button, Badge } from '@desavii/ui/components/primitives';
import { Modal } from '@desavii/ui/components/feedback-overlays';
import { FileDropzone } from '@desavii/ui/components/listing-media';
import { DataTable } from '@desavii/ui/components/dashboard';
import { parseCsv } from '../../../../availability/utils/csvParser.js';
import {
  useBulkImportExternalReservationsMutation,
  EXTERNAL_RESERVATION_SOURCE_CODES,
  INT_UNSIGNED_MAX,
} from '../../../../availability/index.js';
import { useToast } from '../../../../../contexts/ToastContext.jsx';

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function validateRow(row) {
  if (!ISO_DATE_RE.test(row.dateFrom ?? '')) return 'INVALID_DATE_FROM';
  if (!ISO_DATE_RE.test(row.dateTo ?? '')) return 'INVALID_DATE_TO';
  if (row.dateTo < row.dateFrom) return 'DATE_TO_BEFORE_DATE_FROM';
  // Mirrors the bulk-import row schema: an optional integer from 1 to the
  // `INT UNSIGNED` max. `^\d+$` alone accepted "0" and overflow values that
  // the server then rejected for the whole batch.
  if (
    row.quantity &&
    (!/^\d+$/.test(row.quantity) ||
      Number(row.quantity) < 1 ||
      Number(row.quantity) > INT_UNSIGNED_MAX)
  ) {
    return 'INVALID_QUANTITY';
  }
  return null;
}

function toPayloadRow(row) {
  return {
    dateFrom: row.dateFrom,
    dateTo: row.dateTo,
    quantity: row.quantity ? Number(row.quantity) : undefined,
    externalReference: row.externalReference || undefined,
    guestName: row.guestName || undefined,
    guestPhone: row.guestPhone || undefined,
    guestEmail: row.guestEmail || undefined,
    notes: row.notes || undefined,
  };
}

export default function CsvImportWizard({
  unitId,
  listingId = undefined,
  onClose,
  onImported = undefined,
}) {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const bulkImportMutation =
    useBulkImportExternalReservationsMutation(listingId);

  const [step, setStep] = useState('upload');
  const [parsedRows, setParsedRows] = useState([]);
  const [sourceCode, setSourceCode] = useState('OTHER');
  const [results, setResults] = useState([]);
  const [parseError, setParseError] = useState(null);

  const sourceOptions = EXTERNAL_RESERVATION_SOURCE_CODES.map((code) => ({
    value: code,
    label: t(`partner.calendar.external.sourceCodes.${code}`),
  }));

  function handleFilesSelected(files) {
    const file = files[0];
    setParseError(null);
    const reader = new FileReader();
    reader.onload = () => {
      const { rows } = parseCsv(String(reader.result ?? ''));
      if (rows.length === 0) {
        setParseError(t('partner.calendar.csvImport.emptyFileError'));
        return;
      }
      const withValidation = rows.map((row) => ({
        ...row,
        error: validateRow(row),
      }));
      setParsedRows(withValidation);
      setStep('preview');
    };
    reader.onerror = () => {
      setParseError(t('partner.calendar.csvImport.readError'));
    };
    reader.readAsText(file);
  }

  const validRows = parsedRows.filter((row) => !row.error);
  const invalidCount = parsedRows.length - validRows.length;

  async function handleConfirm() {
    try {
      // `apiClient` never unwraps the `{success, data, meta, error}`
      // envelope (its response interceptor is an identity function) —
      // every api/*.js wrapper resolves to that full envelope, so the
      // controller's `{ results }` payload lives at `response.data`,
      // never on `response` itself.
      const response = await bulkImportMutation.mutateAsync({
        unitId,
        sourceCode,
        rows: validRows.map(toPayloadRow),
      });
      setResults(response.data.results ?? []);
      setStep('result');
      onImported?.();
    } catch {
      showToast(t('partner.calendar.csvImport.importError'), {
        variant: 'danger',
      });
    }
  }

  const previewColumns = [
    {
      key: 'range',
      header: t('partner.calendar.csvImport.columns.range'),
      render: (row) => `${row.dateFrom || '—'} – ${row.dateTo || '—'}`,
    },
    {
      key: 'quantity',
      header: t('partner.calendar.csvImport.columns.quantity'),
      render: (row) => row.quantity || '1',
    },
    {
      key: 'guestName',
      header: t('partner.calendar.csvImport.columns.guest'),
      render: (row) => row.guestName || '—',
    },
    {
      key: 'status',
      header: t('partner.calendar.csvImport.columns.status'),
      render: (row) =>
        row.error ? (
          <Badge
            variant="danger"
            label={t(`partner.calendar.csvImport.rowErrors.${row.error}`)}
          />
        ) : (
          <Badge
            variant="success"
            label={t('partner.calendar.csvImport.rowValid')}
          />
        ),
    },
  ];

  const resultColumns = [
    {
      key: 'row',
      header: t('partner.calendar.csvImport.columns.range'),
      render: (row) =>
        validRows[row.index]
          ? `${validRows[row.index].dateFrom} – ${validRows[row.index].dateTo}`
          : '—',
    },
    {
      key: 'status',
      header: t('partner.calendar.csvImport.columns.status'),
      render: (row) => (
        <Badge
          variant={row.status === 'CREATED' ? 'success' : 'warning'}
          label={t(`partner.calendar.csvImport.resultStatuses.${row.status}`, {
            defaultValue: row.status,
          })}
        />
      ),
    },
    {
      key: 'error',
      header: t('partner.calendar.csvImport.columns.error'),
      render: (row) => row.error || '—',
    },
  ];

  const createdCount = results.filter((r) => r.status === 'CREATED').length;

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={t('partner.calendar.csvImport.title')}
      size="lg"
      footer={
        <Inline gap="3" justify="flex-end">
          <Button variant="ghost" onClick={onClose}>
            {step === 'result'
              ? t('partner.calendar.csvImport.doneAction')
              : t('partner.calendar.csvImport.cancelAction')}
          </Button>
          {step === 'preview' && (
            <Button
              variant="primary"
              onClick={() => handleConfirm()}
              loading={bulkImportMutation.isPending}
              disabled={validRows.length === 0}
            >
              {t('partner.calendar.csvImport.confirmAction', {
                count: validRows.length,
              })}
            </Button>
          )}
        </Inline>
      }
    >
      <Stack gap="4">
        {step === 'upload' && (
          <Stack gap="3">
            <p>{t('partner.calendar.csvImport.uploadInstructions')}</p>
            <FileDropzone
              accept=".csv"
              onFilesSelected={(files) => handleFilesSelected(files)}
              onRejected={() =>
                setParseError(t('partner.calendar.csvImport.fileTypeError'))
              }
              label={t('partner.calendar.csvImport.uploadLabel')}
              error={parseError ?? undefined}
            />
          </Stack>
        )}

        {step === 'preview' && (
          <Stack gap="3">
            <Select
              label={t('partner.calendar.external.sourceLabel')}
              options={sourceOptions}
              value={sourceCode}
              onChange={(value) => setSourceCode(value)}
            />
            <p>
              {t('partner.calendar.csvImport.previewSummary', {
                total: parsedRows.length,
                valid: validRows.length,
                invalid: invalidCount,
              })}
            </p>
            <DataTable
              columns={previewColumns}
              rows={parsedRows}
              rowKey={(_row, index) => index}
              emptyTitle={t('partner.calendar.csvImport.emptyFileError')}
            />
          </Stack>
        )}

        {step === 'result' && (
          <Stack gap="3">
            <p>
              {t('partner.calendar.csvImport.resultSummary', {
                created: createdCount,
                total: results.length,
              })}
            </p>
            <DataTable
              columns={resultColumns}
              rows={results}
              rowKey={(row) => row.index}
              emptyTitle={t('partner.calendar.csvImport.emptyFileError')}
            />
          </Stack>
        )}
      </Stack>
    </Modal>
  );
}

CsvImportWizard.propTypes = {
  unitId: PropTypes.number.isRequired,
  listingId: PropTypes.number,
  onClose: PropTypes.func.isRequired,
  onImported: PropTypes.func,
};
