import { createRef, forwardRef, useState } from 'react';
import PropTypes from 'prop-types';
import { describe, test, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Select from './Select.jsx';

const ROOM_OPTIONS = [
  { value: 'standard', label: 'Standard room' },
  { value: 'deluxe', label: 'Deluxe room' },
  { value: 'suite', label: 'Suite' },
];

// `forwardRef`-wrapped so the "ref forwarding" tests below can pass a ref
// through this test harness to the real `Select` underneath, the same
// way React Hook Form's `Controller` does in real usage.
const ControlledSelect = forwardRef(function ControlledSelect(
  { initialValue = undefined, options, ...rest },
  ref,
) {
  const [value, setValue] = useState(initialValue);
  return (
    <Select
      ref={ref}
      // eslint-disable-next-line react/jsx-props-no-spreading -- test helper forwards arbitrary Select props
      {...rest}
      options={options}
      value={value}
      onChange={setValue}
    />
  );
});

/* eslint-disable react/require-default-props -- every optional prop below
   is a test-harness convenience with an inline default, not a defaultProps
   candidate (mirrors Select.jsx's own convention). */
ControlledSelect.propTypes = {
  // eslint-disable-next-line react/forbid-prop-types -- test helper accepts arbitrary initial values
  initialValue: PropTypes.any,
  // eslint-disable-next-line react/forbid-prop-types -- test helper forwards options through to Select
  options: PropTypes.array.isRequired,
};
/* eslint-enable react/require-default-props */

describe('Select / Dropdown (COMPONENT_LIBRARY.md Part II §2)', () => {
  test('is closed by default and opens on trigger click, showing options via role="listbox"', async () => {
    const user = userEvent.setup();
    render(<ControlledSelect options={ROOM_OPTIONS} label="Room type" />);

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Room type' }));

    const listbox = screen.getByRole('listbox');
    expect(within(listbox).getAllByRole('option')).toHaveLength(3);
  });

  test('selecting an option via click calls onChange and closes the panel', async () => {
    const user = userEvent.setup();
    render(<ControlledSelect options={ROOM_OPTIONS} label="Room type" />);

    await user.click(screen.getByRole('button', { name: 'Room type' }));
    await user.click(screen.getByRole('option', { name: 'Deluxe room' }));

    // The trigger's accessible name stays the field label (Phase 8 fix —
    // matches a native <select>'s own pattern); the current selection is
    // communicated via its visible text content instead.
    const trigger = screen.getByRole('button', { name: 'Room type' });
    expect(within(trigger).getByText('Deluxe room')).toBeInTheDocument();
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  test('full keyboard flow: ArrowDown opens, ArrowDown navigates, Enter selects, Escape closes', async () => {
    const user = userEvent.setup();
    render(<ControlledSelect options={ROOM_OPTIONS} label="Room type" />);

    await user.tab();
    expect(screen.getByRole('button', { name: 'Room type' })).toHaveFocus();

    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('listbox')).toBeInTheDocument();

    await user.keyboard('{ArrowDown}{Enter}');
    const trigger = screen.getByRole('button', { name: 'Room type' });
    expect(within(trigger).getByText('Standard room')).toBeInTheDocument();

    await user.keyboard('{ArrowDown}{Escape}');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  test('multi-select renders removable chips and toggles values without closing the panel', async () => {
    const user = userEvent.setup();
    render(
      <ControlledSelect
        options={ROOM_OPTIONS}
        label="Amenities"
        multiple
        initialValue={[]}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Amenities' }));
    await user.click(screen.getByRole('option', { name: 'Standard room' }));
    await user.click(screen.getByRole('option', { name: 'Suite' }));

    const trigger = screen.getByTestId('select-trigger');

    expect(screen.getByRole('listbox')).toBeInTheDocument();
    expect(within(trigger).getByText('Standard room')).toBeInTheDocument();
    expect(within(trigger).getByText('Suite')).toBeInTheDocument();

    await user.click(
      within(trigger).getByRole('button', { name: 'Remove Standard room' }),
    );
    expect(
      within(trigger).queryByText('Standard room'),
    ).not.toBeInTheDocument();
  });

  test('searchable mode filters the option list as the user types', async () => {
    const user = userEvent.setup();
    render(
      <ControlledSelect options={ROOM_OPTIONS} label="Room type" searchable />,
    );

    await user.click(screen.getByRole('button', { name: 'Room type' }));
    await user.type(screen.getByRole('textbox', { name: /search/i }), 'suite');

    const listbox = screen.getByRole('listbox');
    expect(within(listbox).getAllByRole('option')).toHaveLength(1);
    expect(
      within(listbox).getByRole('option', { name: 'Suite' }),
    ).toBeInTheDocument();
  });

  test('auto-enables search once options exceed the 8-option threshold', async () => {
    const manyOptions = Array.from({ length: 9 }, (_, index) => ({
      value: `opt-${index}`,
      label: `Option ${index}`,
    }));
    const user = userEvent.setup();
    render(<ControlledSelect options={manyOptions} label="Country" />);

    await user.click(screen.getByRole('button', { name: 'Country' }));
    expect(
      screen.getByRole('textbox', { name: /search/i }),
    ).toBeInTheDocument();
  });

  test('renders an accessible error message linked to the trigger', async () => {
    render(
      <ControlledSelect
        options={ROOM_OPTIONS}
        label="Room type"
        error="Please choose a room"
      />,
    );
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Please choose a room');
    expect(screen.getByRole('button').getAttribute('aria-describedby')).toBe(
      alert.id,
    );
  });

  test('the trigger\'s accessible name is the visible label, not its placeholder content (Phase 8 fix — `htmlFor` alone does not label a non-labellable `<div role="button">`)', () => {
    render(<ControlledSelect options={ROOM_OPTIONS} label="Room type" />);
    const trigger = screen.getByTestId('select-trigger');
    expect(trigger).toHaveAccessibleName('Room type');
  });

  test('falls back to ariaLabel when no visible label is given', () => {
    render(
      <ControlledSelect options={ROOM_OPTIONS} ariaLabel="Sort results" />,
    );
    const trigger = screen.getByTestId('select-trigger');
    expect(trigger).toHaveAccessibleName('Sort results');
  });

  test('disabled select cannot be opened', async () => {
    const user = userEvent.setup();
    render(
      <ControlledSelect options={ROOM_OPTIONS} label="Room type" disabled />,
    );

    await user.click(screen.getByRole('button', { name: 'Room type' }));
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  // Sprint L — Select used to be a bare function component: React Hook
  // Form's `Controller` (partner listing type/category, and every other
  // `Controller`-wrapped Select in the app) passes a `ref` down for its
  // focus-on-error integration, which React silently drops before it
  // reaches an unforwarded function component, printing "Function
  // components cannot be given refs" — reproduced live via
  // BasicInfoStep.test.jsx before this fix.
  describe('ref forwarding', () => {
    test('an object ref receives the real trigger DOM node', () => {
      const ref = createRef();
      render(
        <ControlledSelect ref={ref} options={ROOM_OPTIONS} label="Room type" />,
      );
      expect(ref.current).toBe(screen.getByTestId('select-trigger'));
    });

    test('a callback ref receives the real trigger DOM node', () => {
      const refCallback = vi.fn();
      render(
        <ControlledSelect
          ref={refCallback}
          options={ROOM_OPTIONS}
          label="Room type"
        />,
      );
      expect(refCallback).toHaveBeenCalledWith(
        screen.getByTestId('select-trigger'),
      );
    });

    test('does not print the "Function components cannot be given refs" warning', () => {
      const consoleError = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      const ref = createRef();
      render(
        <ControlledSelect ref={ref} options={ROOM_OPTIONS} label="Room type" />,
      );
      const refWarning = consoleError.mock.calls.some((args) =>
        String(args[0]).includes('Function components cannot be given refs'),
      );
      expect(refWarning).toBe(false);
      consoleError.mockRestore();
    });

    test('the component’s own focus-on-close behavior still works with an external ref attached', async () => {
      const user = userEvent.setup();
      const ref = createRef();
      render(
        <ControlledSelect ref={ref} options={ROOM_OPTIONS} label="Room type" />,
      );

      await user.click(screen.getByRole('button', { name: 'Room type' }));
      await user.keyboard('{Escape}');

      expect(screen.getByTestId('select-trigger')).toHaveFocus();
    });
  });
});
