import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import i18n from 'i18next';
import InventoryRecordList from './InventoryRecordList.jsx';

const BLOCK = {
  id: 7,
  dateFrom: '2026-10-24',
  dateTo: '2026-10-25',
  details: [
    { label: 'Quantity', value: 5 },
    { label: 'Reason', value: 'Maintenance' },
  ],
  actions: <button type="button" aria-label="Unblock" />,
};

function renderList(overrides = {}) {
  return render(
    <InventoryRecordList
      records={overrides.records ?? [BLOCK]}
      bookableUnitType={overrides.bookableUnitType ?? 'HOTEL_ROOM'}
      locale={overrides.locale ?? 'en'}
      emptyTitle="No active manual blocks."
      ariaLabel="Active blocks (1)"
    />,
  );
}

describe('InventoryRecordList (apps/web/src/modules/partner)', () => {
  beforeAll(() => i18n.changeLanguage('en'));
  afterAll(() => i18n.changeLanguage('hy'));

  test('shows localized dates, what they take out of inventory, every labelled detail and the actions', () => {
    renderList();
    const record = within(
      screen.getByRole('list', { name: 'Active blocks (1)' }),
    ).getByRole('listitem');

    expect(record).toHaveTextContent(/Oct 24\s*–\s*25, 2026/);
    // Hotel nights are checkout-exclusive: 24–25 October is one night.
    expect(record).toHaveTextContent('1 night');
    expect(within(record).getByText('Quantity').tagName).toBe('DT');
    expect(within(record).getByText('5').tagName).toBe('DD');
    expect(within(record).getByText('Maintenance')).toBeInTheDocument();
    expect(
      within(record).getByRole('button', { name: 'Unblock' }),
    ).toBeInTheDocument();
  });

  test('a date-only unit counts both ends as days', () => {
    renderList({ bookableUnitType: 'TOUR_DEPARTURE' });
    expect(screen.getByRole('listitem')).toHaveTextContent('2 days');
  });

  test('a single date is shown once, never as a range', () => {
    renderList({
      records: [{ ...BLOCK, dateTo: BLOCK.dateFrom }],
      bookableUnitType: 'RESTAURANT_TABLE',
    });
    const record = screen.getByRole('listitem');
    expect(record).toHaveTextContent('Oct 24, 2026');
    expect(record).not.toHaveTextContent('–');
    expect(record).toHaveTextContent('1 day');
  });

  test('the dates are the calendar dates themselves in any browser timezone', () => {
    renderList({
      records: [{ ...BLOCK, dateFrom: '2026-11-01', dateTo: '2026-11-03' }],
    });
    expect(screen.getByRole('listitem')).toHaveTextContent(
      /Nov 1\s*–\s*3, 2026/,
    );
  });

  test('shows the empty state when there is nothing to list', () => {
    renderList({ records: [] });
    expect(screen.getByText('No active manual blocks.')).toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });
});

describe('InventoryRecordList in Russian', () => {
  beforeAll(() => i18n.changeLanguage('ru'));
  afterAll(() => i18n.changeLanguage('hy'));

  test.each([
    ['2026-10-24', '2026-10-25', '1 ночь'],
    ['2026-10-24', '2026-10-27', '3 ночи'],
    ['2026-10-20', '2026-10-25', '5 ночей'],
  ])('%s – %s is %s', (dateFrom, dateTo, expected) => {
    renderList({ locale: 'ru', records: [{ ...BLOCK, dateFrom, dateTo }] });
    expect(screen.getByRole('listitem')).toHaveTextContent(expected);
  });
});
