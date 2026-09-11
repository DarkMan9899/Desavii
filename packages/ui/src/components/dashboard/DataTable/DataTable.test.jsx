import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import DataTable from './DataTable.jsx';

const COLUMNS = [
  { key: 'name', header: 'Name' },
  { key: 'count', header: 'Count' },
];

describe('DataTable rowKey (Sprint L — key-derivation fix)', () => {
  test('defaults to keying rows by `id` and renders every row without a console warning', () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    const rows = [
      { id: 'a', name: 'Alpha', count: 1 },
      { id: 'b', name: 'Beta', count: 2 },
    ];
    render(<DataTable columns={COLUMNS} rows={rows} emptyTitle="No rows" />);

    expect(screen.getByText('Alpha')).toBeInTheDocument();
    expect(screen.getByText('Beta')).toBeInTheDocument();
    const keyWarning = consoleError.mock.calls.some((args) =>
      String(args[0]).includes('unique "key" prop'),
    );
    expect(keyWarning).toBe(false);
    consoleError.mockRestore();
  });

  // Reproduces the real bug: rows with no `id` field (e.g. GROUP BY
  // aggregate stats, queue objects keyed by `name`) all keyed to the same
  // `undefined` before this fix, since `rowKey` was accepted by several
  // call sites but silently dropped — DataTable never implemented it.
  test('a string rowKey lets rows lacking an `id` field key by another field, with no warning', () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    const rows = [
      { name: 'ingest-queue', count: 3 },
      { name: 'export-queue', count: 5 },
    ];
    render(
      <DataTable
        columns={COLUMNS}
        rows={rows}
        rowKey="name"
        emptyTitle="No rows"
      />,
    );

    expect(screen.getByText('ingest-queue')).toBeInTheDocument();
    expect(screen.getByText('export-queue')).toBeInTheDocument();
    const keyWarning = consoleError.mock.calls.some((args) =>
      String(args[0]).includes('unique "key" prop'),
    );
    expect(keyWarning).toBe(false);
    consoleError.mockRestore();
  });

  test('a function rowKey derives a composite key from the row and its index', () => {
    const rowKey = vi.fn((row) => `${row.feature}:${row.provider}`);
    const rows = [
      { feature: 'search', provider: 'openai', name: 'Row 1', count: 1 },
      { feature: 'search', provider: 'anthropic', name: 'Row 2', count: 2 },
    ];
    render(
      <DataTable
        columns={COLUMNS}
        rows={rows}
        rowKey={rowKey}
        emptyTitle="No rows"
      />,
    );

    expect(rowKey).toHaveBeenCalledWith(rows[0], 0);
    expect(rowKey).toHaveBeenCalledWith(rows[1], 1);
    expect(screen.getByText('Row 1')).toBeInTheDocument();
    expect(screen.getByText('Row 2')).toBeInTheDocument();
  });
});
