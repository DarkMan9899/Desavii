import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ToastProvider from '../../../../../providers/ToastProvider.jsx';
import CsvImportWizard from './CsvImportWizard.jsx';
import { useBulkImportExternalReservationsMutation } from '../../../../availability/index.js';

vi.mock('../../../../availability/index.js', async () => {
  const actual = await vi.importActual('../../../../availability/index.js');
  return {
    ...actual,
    useBulkImportExternalReservationsMutation: vi.fn(),
  };
});

function makeCsvFile(content) {
  return new File([content], 'reservations.csv', { type: 'text/csv' });
}

function renderWizard() {
  return render(
    <ToastProvider>
      <CsvImportWizard unitId={5} listingId={1} onClose={vi.fn()} />
    </ToastProvider>,
  );
}

function getFileInput() {
  // FileDropzone's file input is a native, visually-hidden `<input>`
  // associated to its label via `aria-labelledby` (Phase 17 accessibility
  // fix) — not a `role="button"` wrapper — so it's resolved directly by
  // its accessible name. `selector: 'input'` restricts the match to the
  // input itself, since the modal's own `aria-labelledby` title ("...
  // CSV-ից") also matches /CSV/i and would otherwise make this ambiguous.
  return screen.getByLabelText(/CSV/i, { selector: 'input' });
}

describe('CsvImportWizard (apps/web/src/modules/partner)', () => {
  let mutateAsync;

  beforeEach(() => {
    // `apiClient` never unwraps the `{success, data, meta, error}`
    // envelope — every mutation resolves to that full shape.
    mutateAsync = vi.fn().mockResolvedValue({
      data: {
        results: [
          { index: 0, status: 'CREATED', reservationId: 11 },
          { index: 1, status: 'FAILED', error: 'Capacity conflict' },
        ],
      },
    });
    useBulkImportExternalReservationsMutation.mockReturnValue({
      mutateAsync,
      isPending: false,
    });
  });

  test('parsing a CSV with one valid and one invalid row shows a per-row preview', async () => {
    renderWizard();
    const csv =
      'dateFrom,dateTo,guestName\n2026-03-10,2026-03-12,Anna\nnot-a-date,2026-03-12,Bad Row';
    fireEvent.change(getFileInput(), {
      target: { files: [makeCsvFile(csv)] },
    });

    expect(
      await screen.findByText('Գտնվել է 2 տող՝ 1 վավեր, 1 անվավեր։'),
    ).toBeInTheDocument();
    expect(screen.getByText('Վավեր')).toBeInTheDocument();
    expect(screen.getByText('Անվավեր dateFrom')).toBeInTheDocument();
  });

  test('confirming an import sends only the valid rows and shows server results', async () => {
    const user = userEvent.setup();
    renderWizard();
    const csv =
      'dateFrom,dateTo,guestName\n2026-03-10,2026-03-12,Anna\nnot-a-date,2026-03-12,Bad Row';
    fireEvent.change(getFileInput(), {
      target: { files: [makeCsvFile(csv)] },
    });

    await user.click(
      await screen.findByRole('button', { name: 'Ներմուծել 1 տող' }),
    );

    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith({
        unitId: 5,
        sourceCode: 'OTHER',
        rows: [
          {
            dateFrom: '2026-03-10',
            dateTo: '2026-03-12',
            quantity: undefined,
            externalReference: undefined,
            guestName: 'Anna',
            guestPhone: undefined,
            guestEmail: undefined,
            notes: undefined,
          },
        ],
      }),
    );
    expect(
      await screen.findByText('2 տողից 1-ը ստեղծվեց։'),
    ).toBeInTheDocument();
  });

  // Step L4.1 (brief §21) — `quantity: "0"` previously matched the old
  // `^\d+$`-only check (a valid digit string) and was marked client-valid,
  // only for the server's own `positive()` rule to reject it on import.
  test("a row with quantity 0 is flagged invalid, matching the backend's positive() rule", async () => {
    renderWizard();
    const csv =
      'dateFrom,dateTo,quantity,guestName\n2026-03-10,2026-03-12,0,Anna';
    fireEvent.change(getFileInput(), {
      target: { files: [makeCsvFile(csv)] },
    });

    expect(
      await screen.findByText('Գտնվել է 1 տող՝ 0 վավեր, 1 անվավեր։'),
    ).toBeInTheDocument();
    expect(screen.getByText('Անվավեր քանակ')).toBeInTheDocument();
  });

  // Step L4.2 — the bulk-import row schema now caps quantity at the
  // INT UNSIGNED max; an over-limit row would reject the whole batch.
  test.each([
    ['above the INT UNSIGNED max', '4294967296'],
    ['a decimal', '1.5'],
    ['negative', '-2'],
  ])(
    'a row with a quantity %s is flagged invalid',
    async (_label, quantity) => {
      renderWizard();
      const csv = `dateFrom,dateTo,quantity,guestName\n2026-03-10,2026-03-12,${quantity},Anna`;
      fireEvent.change(getFileInput(), {
        target: { files: [makeCsvFile(csv)] },
      });

      expect(
        await screen.findByText('Գտնվել է 1 տող՝ 0 վավեր, 1 անվավեր։'),
      ).toBeInTheDocument();
      expect(screen.getByText('Անվավեր քանակ')).toBeInTheDocument();
    },
  );

  test('a row with a quantity at the INT UNSIGNED max is valid', async () => {
    renderWizard();
    const csv =
      'dateFrom,dateTo,quantity,guestName\n2026-03-10,2026-03-12,4294967295,Anna';
    fireEvent.change(getFileInput(), {
      target: { files: [makeCsvFile(csv)] },
    });

    expect(
      await screen.findByText('Գտնվել է 1 տող՝ 1 վավեր, 0 անվավեր։'),
    ).toBeInTheDocument();
  });

  test('an empty CSV file shows an error instead of advancing to preview', async () => {
    renderWizard();
    fireEvent.change(getFileInput(), {
      target: { files: [makeCsvFile('')] },
    });

    expect(
      await screen.findByText('Այս ֆայլում ներմուծելու տողեր չկան։'),
    ).toBeInTheDocument();
  });
});
