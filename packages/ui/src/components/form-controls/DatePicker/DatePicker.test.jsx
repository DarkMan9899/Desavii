import { useState } from 'react';
import PropTypes from 'prop-types';
import { describe, test, expect, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DatePicker from './DatePicker.jsx';

function ControlledDatePicker({ initialValue = null, ...rest }) {
  const [value, setValue] = useState(initialValue);
  return (
    // eslint-disable-next-line react/jsx-props-no-spreading -- test helper forwards arbitrary DatePicker props
    <DatePicker {...rest} value={value} onChange={setValue} />
  );
}
ControlledDatePicker.propTypes = {
  // eslint-disable-next-line react/forbid-prop-types -- value's shape varies by mode under test
  initialValue: PropTypes.any,
};

describe('DatePicker (COMPONENT_LIBRARY.md Part II §2)', () => {
  test('opens a keyboard-navigable day grid on click', async () => {
    const user = userEvent.setup();
    render(<ControlledDatePicker label="Date of birth" />);

    await user.click(screen.getByLabelText('Date of birth'));

    expect(screen.getByRole('grid')).toBeInTheDocument();
  });

  test('single mode selects a day and closes the panel', async () => {
    const user = userEvent.setup();
    const fixedToday = new Date(2026, 5, 15);
    render(
      <ControlledDatePicker
        label="Travel date"
        mode="single"
        initialValue={fixedToday}
      />,
    );

    await user.click(screen.getByLabelText('Travel date'));
    await user.click(screen.getByRole('gridcell', { name: /^Jun 20,/ }));

    expect(screen.queryByRole('grid')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Travel date')).toHaveTextContent('20');
  });

  test('disabled dates cannot be selected', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const today = new Date();
    const disabledDay = new Date(today.getFullYear(), today.getMonth(), 10);
    const dayLabel = new Intl.DateTimeFormat('en', {
      day: 'numeric',
      month: 'short',
    }).format(disabledDay);

    render(
      <DatePicker
        label="Blackout date"
        value={null}
        onChange={onChange}
        disabledDates={[disabledDay]}
      />,
    );

    await user.click(screen.getByLabelText('Blackout date'));
    const disabledCell = screen.getByRole('gridcell', {
      name: new RegExp(`^${dayLabel},`),
    });
    expect(disabledCell).toBeDisabled();

    await user.click(disabledCell);
    expect(onChange).not.toHaveBeenCalled();
  });

  test('range mode requires a start then an end day', async () => {
    const user = userEvent.setup();
    render(<ControlledDatePicker label="Stay dates" mode="range" />);

    await user.click(screen.getByLabelText('Stay dates'));
    await user.click(screen.getByRole('gridcell', { name: /10/ }));
    expect(screen.getByRole('grid')).toBeInTheDocument();

    await user.click(screen.getByRole('gridcell', { name: /15/ }));
    expect(screen.queryByRole('grid')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Stay dates')).toHaveTextContent('–');
  });

  test('accepts minDate/maxDate as ISO date strings without crashing (real callers, e.g. ListingReservationWidget, pass toISODate() strings, not Date instances)', async () => {
    const user = userEvent.setup();
    const todayISO = new Date().toISOString().slice(0, 10);
    render(<ControlledDatePicker label="Check-in" minDate={todayISO} />);

    await user.click(screen.getByLabelText('Check-in'));

    expect(screen.getByRole('grid')).toBeInTheDocument();
  });

  test('onChange emits plain YYYY-MM-DD strings, not Date instances (real callers — ListingReservationWidget, AvailabilityStep — send value.start/end straight through as dateFrom/dateTo in a JSON request body with no conversion of their own)', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const anchor = new Date(2026, 5, 15);
    render(
      <DatePicker
        label="Travel date"
        mode="single"
        value={anchor}
        onChange={onChange}
      />,
    );

    await user.click(screen.getByLabelText('Travel date'));
    await user.click(screen.getByRole('gridcell', { name: /^Jun 20,/ }));

    expect(onChange).toHaveBeenCalledWith('2026-06-20');
  });

  test('range mode onChange emits {start, end} as YYYY-MM-DD strings', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const anchor = new Date(2026, 5, 1);
    render(
      <DatePicker
        label="Stay dates"
        mode="range"
        value={{ start: anchor, end: null }}
        onChange={onChange}
      />,
    );

    await user.click(screen.getByLabelText('Stay dates'));
    await user.click(screen.getByRole('gridcell', { name: /^Jun 10,/ }));
    expect(onChange).toHaveBeenLastCalledWith({
      start: '2026-06-01',
      end: '2026-06-10',
    });
  });

  test('range mode: clicking the same day twice commits a same-day range (e.g. a one-day car rental)', async () => {
    // Regression test: `rangeStart`/`rangeEnd` used to come straight from
    // `toDate(value.start/end)` with no `startOfDay()` normalization.
    // `toDate()` on a plain `YYYY-MM-DD` string parses it as UTC midnight
    // (the date-only ISO grammar), while the calendar grid's own day
    // cells are always LOCAL midnight (`new Date(year, month, date)`). In
    // any timezone ahead of UTC — this project's own dev/CI environment
    // (`Asia/Yerevan`, UTC+4) included — local midnight of a date is an
    // earlier timestamp than that same date's UTC midnight, so
    // `commitDay`'s `day < rangeStart` check was true even for the exact
    // same day: the second click silently reset the selection back to
    // `{start, end: null}` instead of completing the range, and the panel
    // never closed. Real impact: a customer could never book a same-day
    // car rental or single-day tour by clicking one date twice.
    const user = userEvent.setup();
    render(<ControlledDatePicker label="Rental dates" mode="range" />);

    await user.click(screen.getByLabelText('Rental dates'));
    const day = screen.getByRole('gridcell', { name: /22/ });
    const dayLabel = day.getAttribute('aria-label');
    await user.click(day);
    await user.click(
      screen.getByRole('gridcell', { name: dayLabel, exact: true }),
    );

    expect(screen.queryByRole('grid')).not.toBeInTheDocument();
    const [, monthDay] = dayLabel.match(/^([A-Za-z]+ \d+),/);
    expect(screen.getByLabelText('Rental dates')).toHaveTextContent(
      new RegExp(`${monthDay}.*${monthDay}`),
    );
  });

  // Remediation — the panel used to be a plain `position: absolute`
  // sibling of the trigger, so a real ancestor (the booking widget's own
  // `overflow: hidden`, kept for its decorative gold-sheen accent)
  // clipped or hid the calendar whenever it extended past that
  // ancestor's box. It's now portaled to document.body specifically so
  // no ancestor's overflow can ever clip it again.
  test('the open panel is portaled outside an ancestor with overflow: hidden, not clipped by it', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <div
        data-testid="clipping-ancestor"
        style={{ overflow: 'hidden', height: '40px' }}
      >
        <ControlledDatePicker label="Check-in" />
      </div>,
    );

    await user.click(screen.getByLabelText('Check-in'));

    const clippingAncestor = container.querySelector(
      '[data-testid="clipping-ancestor"]',
    );
    const panel = screen.getByRole('grid').closest('[role="dialog"]');
    expect(panel).toBeInTheDocument();
    expect(clippingAncestor.contains(panel)).toBe(false);
    expect(document.body.contains(panel)).toBe(true);
  });

  test('flips the panel above the trigger when it would overflow the bottom of the viewport', async () => {
    const user = userEvent.setup();
    render(<ControlledDatePicker label="Check-in" />);

    const trigger = screen.getByLabelText('Check-in');
    // Simulate the trigger sitting near the bottom of a short viewport,
    // with the panel too tall to fit below it but room to fit above.
    vi.spyOn(trigger, 'getBoundingClientRect').mockReturnValue({
      top: 700,
      bottom: 730,
      left: 100,
      right: 300,
      width: 200,
      height: 30,
    });
    Object.defineProperty(window, 'innerHeight', {
      writable: true,
      value: 800,
    });

    await user.click(trigger);

    const panel = screen.getByRole('grid').closest('[role="dialog"]');
    vi.spyOn(panel, 'getBoundingClientRect').mockReturnValue({
      top: 0,
      bottom: 400,
      left: 0,
      right: 300,
      width: 300,
      height: 400,
    });
    // Re-trigger the positioning effect the same way a real resize would.
    act(() => {
      window.dispatchEvent(new Event('resize'));
    });

    await vi.waitFor(() => {
      const top = Number.parseFloat(panel.style.top);
      // Below the trigger (bottom 730 + gap) would be 738, well past a
      // panel 400px tall in an 800px-tall viewport - opening upward
      // means the panel's top must land above the trigger's own top.
      expect(top).toBeLessThan(700);
    });
  });
});
