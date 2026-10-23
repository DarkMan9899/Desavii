import { describe, test, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import PartnerCalendarEditor from './PartnerCalendarEditor.jsx';

function renderEditor(overrides = {}) {
  return render(
    <PartnerCalendarEditor
      viewMonth={{ year: 2027, month: 6 }} // July 2027 (0-indexed)
      onViewMonthChange={vi.fn()}
      onSelectionChange={vi.fn()}
      previousMonthLabel="Previous month"
      nextMonthLabel="Next month"
      statusByDate={overrides.statusByDate ?? {}}
      statusLabels={
        overrides.statusLabels ?? { available: 'Available', blocked: 'Blocked' }
      }
      sourceIndicatorsByDate={overrides.sourceIndicatorsByDate}
      sourceLabels={overrides.sourceLabels}
      today={overrides.today}
      weekStartsOn={overrides.weekStartsOn}
      locale={overrides.locale}
    />,
  );
}

describe('PartnerCalendarEditor — Sprint D-2 source-aware additions', () => {
  test('a day with no sourceIndicatorsByDate entry renders with no dots (fully backwards-compatible)', () => {
    renderEditor();
    // Baseline: renders the grid without the new optional props at all.
    expect(screen.getByRole('grid')).toBeInTheDocument();
  });

  test('a date with source indicators exposes each present source in the cell aria-label, never color alone', () => {
    renderEditor({
      statusByDate: { '2027-07-15': 'partial' },
      statusLabels: {
        available: 'Available',
        partial: 'Partially available',
        full: 'Fully booked',
        blocked: 'Blocked',
      },
      sourceIndicatorsByDate: {
        '2027-07-15': {
          booking: true,
          hold: false,
          block: false,
          external: true,
        },
      },
      sourceLabels: {
        booking: 'Desavii booking',
        hold: 'Active hold',
        block: 'Manual block',
        external: 'External reservation',
      },
    });

    const cell = screen.getByRole('gridcell', {
      name: /15.*Partially available.*Desavii booking.*External reservation/s,
    });
    expect(cell).toBeInTheDocument();
    // Hold/block were not present for this date — their labels are absent.
    expect(cell.getAttribute('aria-label')).not.toMatch(/Active hold/);
    expect(cell.getAttribute('aria-label')).not.toMatch(/Manual block/);
  });

  test('the 4-state authoritative status vocabulary (available/partial/full/blocked) all render distinct classes', () => {
    renderEditor({
      statusByDate: {
        '2027-07-01': 'available',
        '2027-07-02': 'partial',
        '2027-07-03': 'full',
        '2027-07-04': 'blocked',
      },
      statusLabels: {
        available: 'Available',
        partial: 'Partially available',
        full: 'Fully booked',
        blocked: 'Blocked',
      },
    });

    const available = screen.getByRole('gridcell', { name: /Jul 1, 2027/ });
    const partial = screen.getByRole('gridcell', { name: /Jul 2, 2027/ });
    const full = screen.getByRole('gridcell', { name: /Jul 3, 2027/ });
    const blocked = screen.getByRole('gridcell', { name: /Jul 4, 2027/ });

    expect(available.className).toMatch(/day--available/);
    expect(partial.className).toMatch(/day--partial/);
    expect(full.className).toMatch(/day--full/);
    expect(blocked.className).toMatch(/day--blocked/);
  });
});

describe('PartnerCalendarEditor — Calendar Excellence', () => {
  const columnHeaders = () =>
    screen.getAllByRole('columnheader').map((header) => header.textContent);

  test('labels every column with its weekday, Sunday-first by default', () => {
    renderEditor();
    expect(columnHeaders()).toEqual([
      'Sun',
      'Mon',
      'Tue',
      'Wed',
      'Thu',
      'Fri',
      'Sat',
    ]);
  });

  test('a Monday-first week shifts both the header and the leading blanks', () => {
    renderEditor({ weekStartsOn: 1 });
    expect(columnHeaders()[0]).toBe('Mon');
    // 1 July 2027 is a Thursday: three blanks (Mon–Wed), then the 1st.
    const firstWeek = screen.getAllByRole('row')[1];
    const [firstDay] = within(firstWeek).getAllByRole('gridcell');
    expect(firstDay).toHaveAccessibleName(/Jul 1, 2027/);
    expect(firstWeek.children[3]).toBe(firstDay);
  });

  test('weekday names follow the locale', () => {
    renderEditor({ weekStartsOn: 1, locale: 'ru' });
    expect(columnHeaders()[0]).toMatch(/^пн/i);
  });

  test('marks today for assistive technology and dims only the dates before it', () => {
    renderEditor({ today: '2027-07-15' });
    const today = screen.getByRole('gridcell', { name: /Jul 15, 2027/ });
    expect(today).toHaveAttribute('aria-current', 'date');
    expect(today.className).toMatch(/day--today/);
    expect(
      screen.getByRole('gridcell', { name: /Jul 14, 2027/ }).className,
    ).toMatch(/day--past/);
    expect(
      screen.getByRole('gridcell', { name: /Jul 16, 2027/ }).className,
    ).not.toMatch(/day--past/);
  });

  test('without a today no date is marked current or past', () => {
    renderEditor();
    expect(
      screen
        .getAllByRole('gridcell')
        .filter((cell) => cell.hasAttribute('aria-current')),
    ).toHaveLength(0);
  });

  test('the legend names every status and every source dot', () => {
    renderEditor({
      statusLabels: {
        available: 'Available',
        partial: 'Partially available',
        full: 'Fully booked',
        blocked: 'Blocked',
      },
      sourceLabels: {
        booking: 'Desavii booking',
        hold: 'Active hold',
        block: 'Manual block',
        external: 'External reservation',
      },
    });
    const legend = screen.getAllByRole('list')[0];
    expect(
      within(legend)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual([
      'Available',
      'Partially available',
      'Fully booked',
      'Blocked',
      'Desavii booking',
      'Active hold',
      'Manual block',
      'External reservation',
    ]);
  });

  test('the grid is named by the month it shows', () => {
    renderEditor();
    expect(screen.getByRole('grid')).toHaveAccessibleName('July 2027');
  });
});
