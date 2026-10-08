import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Drawer from './Drawer.jsx';
import DatePicker from '../../form-controls/DatePicker/DatePicker.jsx';
import Select from '../../form-controls/Select/Select.jsx';

const UNIT_OPTIONS = [
  { value: 'standard', label: 'Standard room' },
  { value: 'suite', label: 'Suite' },
];

describe('Drawer (COMPONENT_LIBRARY.md Part II §4)', () => {
  test('renders nothing when closed', () => {
    render(
      <Drawer isOpen={false} onClose={() => {}} title="Filters">
        Filter options
      </Drawer>,
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  test('renders a labelled dialog when open, identical accessibility contract to Modal', () => {
    render(
      <Drawer isOpen onClose={() => {}} title="Filters">
        Filter options
      </Drawer>,
    );
    const dialog = screen.getByRole('dialog', { name: 'Filters' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
  });

  test('the close button calls onClose', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <Drawer isOpen onClose={onClose} title="Filters">
        Filter options
      </Drawer>,
    );

    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('Escape calls onClose', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <Drawer isOpen onClose={onClose} title="Filters">
        Filter options
      </Drawer>,
    );

    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('clicking the backdrop calls onClose, clicking inside the panel does not', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <Drawer isOpen onClose={onClose} title="Filters">
        Filter options
      </Drawer>,
    );

    await user.click(screen.getByText('Filter options'));
    expect(onClose).not.toHaveBeenCalled();

    const backdrop = screen.getByRole('dialog').parentElement;
    await user.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('preventClose hides the close button and blocks Escape/backdrop dismissal', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <Drawer isOpen onClose={onClose} title="In progress" preventClose>
        Please wait…
      </Drawer>,
    );

    expect(
      screen.queryByRole('button', { name: 'Close' }),
    ).not.toBeInTheDocument();

    await user.keyboard('{Escape}');
    const backdrop = screen.getByRole('dialog').parentElement;
    await user.click(backdrop);

    expect(onClose).not.toHaveBeenCalled();
  });

  // Sprint M — Drawer used to hardcode ariaLabel="Close" on its close
  // button with no override, unlike Modal's own closeLabel prop, so
  // every Drawer in the app (mobile nav included) always announced
  // "Close" in English regardless of locale.
  test('closeLabel prop overrides the default English close-button aria-label', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <Drawer isOpen onClose={onClose} title="Filters" closeLabel="Փակել">
        Filter options
      </Drawer>,
    );

    expect(
      screen.queryByRole('button', { name: 'Close' }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Փակել' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // Regression: the mobile booking Drawer's date pickers painted their
  // calendar on `document.body` at `$z-dropdown`, beneath this drawer's
  // `$z-drawer` layer — no day could be tapped on a phone. The calendar
  // must mount inside the drawer's own aria-modal dialog.
  test('a DatePicker opened inside the drawer renders its calendar within the drawer dialog and selects a day', async () => {
    const onClose = vi.fn();
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <Drawer isOpen onClose={onClose} title="Reserve">
        <DatePicker
          label="Check-in"
          value={new Date(2026, 5, 15)}
          onChange={onChange}
        />
      </Drawer>,
    );

    await user.click(screen.getByLabelText('Check-in'));
    const drawer = screen.getByRole('dialog', { name: 'Reserve' });
    expect(drawer).toContainElement(screen.getByRole('grid'));

    await user.click(screen.getByRole('gridcell', { name: /^Jun 20,/ }));
    expect(onChange).toHaveBeenCalledWith('2026-06-20');
    expect(onClose).not.toHaveBeenCalled();
  });

  // Nested-dismiss contract (useFocusTrap): the mobile booking Drawer
  // holds a DatePicker and a Select, and Escape inside either used to
  // close the calendar/listbox and the whole Drawer with it.
  describe('Escape inside a nested popup', () => {
    test('closes only an open DatePicker, then a second Escape closes the drawer', async () => {
      const onClose = vi.fn();
      const user = userEvent.setup();
      render(
        <Drawer isOpen onClose={onClose} title="Book">
          <DatePicker label="Dates" mode="range" onChange={() => {}} />
        </Drawer>,
      );

      await user.click(screen.getByLabelText('Dates'));
      expect(screen.getByRole('grid')).toBeInTheDocument();

      await user.keyboard('{Escape}');
      expect(screen.queryByRole('grid')).not.toBeInTheDocument();
      expect(onClose).not.toHaveBeenCalled();
      expect(screen.getByLabelText('Dates')).toHaveFocus();

      await user.keyboard('{Escape}');
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    test('closes only an open Select, then a second Escape closes the drawer', async () => {
      const onClose = vi.fn();
      const user = userEvent.setup();
      render(
        <Drawer isOpen onClose={onClose} title="Book">
          <Select label="Unit" options={UNIT_OPTIONS} onChange={() => {}} />
        </Drawer>,
      );

      await user.click(screen.getByRole('button', { name: 'Unit' }));
      expect(screen.getByRole('listbox')).toBeInTheDocument();

      await user.keyboard('{Escape}');
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
      expect(onClose).not.toHaveBeenCalled();
      expect(screen.getByRole('button', { name: 'Unit' })).toHaveFocus();

      await user.keyboard('{Escape}');
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  test('supports every documented anchor without throwing', () => {
    ['auto', 'right', 'bottom'].forEach((anchor) => {
      const { unmount } = render(
        <Drawer isOpen onClose={() => {}} title="Test" anchor={anchor}>
          Content
        </Drawer>,
      );
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      unmount();
    });
  });
});
