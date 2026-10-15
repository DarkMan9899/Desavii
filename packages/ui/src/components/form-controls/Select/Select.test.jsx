import { createRef, forwardRef, useState } from 'react';
import PropTypes from 'prop-types';
import { describe, test, expect, vi, onTestFinished } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Select from './Select.jsx';
import Drawer from '../../feedback-overlays/Drawer/Drawer.jsx';

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

  test('Escape with focus on the listbox (after a multi-select option click) closes the panel and is marked handled', async () => {
    const user = userEvent.setup();
    const handled = [];
    function record(event) {
      if (event.key === 'Escape') handled.push(event.defaultPrevented);
    }
    document.addEventListener('keydown', record);
    onTestFinished(() => document.removeEventListener('keydown', record));
    render(
      <ControlledSelect
        options={ROOM_OPTIONS}
        label="Amenities"
        multiple
        initialValue={[]}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Amenities' }));
    await user.click(screen.getByRole('option', { name: 'Suite' }));
    expect(screen.getByRole('listbox')).toHaveFocus();

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(screen.getByTestId('select-trigger')).toHaveFocus();
    // preventDefault() is what keeps an enclosing Modal/Drawer open
    // (useFocusTrap's nested-dismiss contract).
    expect(handled).toEqual([true]);
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

// Structured options: `content` is what a row shows, `triggerLabel` what
// the closed trigger shows, and `label` stays the plain text search and
// type-ahead use.
function structuredOption(value, name, facts) {
  return {
    value,
    label: name,
    triggerLabel: name,
    content: (
      <span>
        <span>{name}</span>
        {facts.map((fact) => (
          <span key={fact}>{fact}</span>
        ))}
      </span>
    ),
  };
}

const OUTSIDE_TEXT = 'Elsewhere on the page';

const STRUCTURED_OPTIONS = [
  structuredOption('standard', 'Standard room', [
    'Sleeps 2',
    '24,000 per night',
  ]),
  structuredOption(
    'family',
    'Family suite with a very long name that has to wrap',
    ['Sleeps 4', '68,000 per night'],
  ),
];

describe('Select — structured options and portal placement', () => {
  test('a row shows its structured content; its accessible name starts with the name and keeps the facts', async () => {
    const user = userEvent.setup();
    render(<ControlledSelect options={STRUCTURED_OPTIONS} label="Room" />);

    await user.click(screen.getByRole('button', { name: 'Room' }));

    const standard = screen.getByRole('option', { name: /^Standard room/ });
    expect(within(standard).getByText('Sleeps 2')).toBeInTheDocument();
    expect(within(standard).getByText('24,000 per night')).toBeInTheDocument();
    expect(standard).toHaveAccessibleName(/Sleeps 2/);
  });

  test('the closed trigger shows only the concise trigger label, never the row facts', async () => {
    const user = userEvent.setup();
    render(<ControlledSelect options={STRUCTURED_OPTIONS} label="Room" />);

    await user.click(screen.getByRole('button', { name: 'Room' }));
    await user.click(screen.getByRole('option', { name: /^Family suite/ }));

    const trigger = screen.getByRole('button', { name: 'Room' });
    expect(trigger).toHaveTextContent(
      /^Family suite with a very long name that has to wrap$/,
    );
    expect(trigger).not.toHaveTextContent('Sleeps 4');
  });

  test('keyboard selection and type-ahead work on structured options (type-ahead reads the plain label)', async () => {
    const user = userEvent.setup();
    render(<ControlledSelect options={STRUCTURED_OPTIONS} label="Room" />);

    screen.getByRole('button', { name: 'Room' }).focus();
    await user.keyboard('{ArrowDown}');
    await user.keyboard('f');
    expect(screen.getByRole('button', { name: 'Room' })).toHaveAttribute(
      'aria-activedescendant',
      screen.getByRole('option', { name: /^Family suite/ }).id,
    );
    await user.keyboard('{Enter}');

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Room' })).toHaveTextContent(
      /^Family suite/,
    );
  });

  test('search filters structured options by their plain label', async () => {
    const user = userEvent.setup();
    render(
      <ControlledSelect options={STRUCTURED_OPTIONS} label="Room" searchable />,
    );

    await user.click(screen.getByRole('button', { name: 'Room' }));
    await user.type(screen.getByRole('textbox'), 'family');

    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(1);
    expect(options[0]).toHaveAccessibleName(/^Family suite/);
  });

  test('without `portal` the panel stays inside the field, exactly as before', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <ControlledSelect options={ROOM_OPTIONS} label="Room type" />,
    );

    await user.click(screen.getByRole('button', { name: 'Room type' }));

    expect(container).toContainElement(screen.getByRole('listbox'));
  });

  test('with `portal` outside any overlay the panel mounts on document.body; picking a row selects it, a press outside closes it', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <div>
        <ControlledSelect options={ROOM_OPTIONS} label="Room type" portal />
        <p>{OUTSIDE_TEXT}</p>
      </div>,
    );

    await user.click(screen.getByRole('button', { name: 'Room type' }));
    const listbox = screen.getByRole('listbox');
    expect(container).not.toContainElement(listbox);
    expect(document.body).toContainElement(listbox);

    await user.click(screen.getByRole('option', { name: 'Suite' }));
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Room type' })).toHaveTextContent(
      'Suite',
    );

    await user.click(screen.getByRole('button', { name: 'Room type' }));
    await user.click(screen.getByText(OUTSIDE_TEXT));
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  test('with `portal` inside a Drawer the list mounts in the drawer dialog; Escape closes the list first and the drawer second', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <Drawer isOpen onClose={onClose} title="Book">
        <ControlledSelect options={STRUCTURED_OPTIONS} label="Room" portal />
      </Drawer>,
    );

    await user.click(screen.getByRole('button', { name: 'Room' }));
    const drawer = screen.getByRole('dialog', { name: 'Book' });
    expect(drawer).toContainElement(screen.getByRole('listbox'));

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Room' })).toHaveFocus();

    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
