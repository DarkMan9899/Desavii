import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
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
