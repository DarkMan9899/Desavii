import { createRef, forwardRef, useState } from 'react';
import PropTypes from 'prop-types';
import { describe, test, expect, vi, onTestFinished } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Select from './Select.jsx';
import Drawer from '../../feedback-overlays/Drawer/Drawer.jsx';
import Modal from '../../feedback-overlays/Modal/Modal.jsx';

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

    await user.click(screen.getByRole('combobox', { name: 'Room type' }));

    const listbox = screen.getByRole('listbox');
    expect(within(listbox).getAllByRole('option')).toHaveLength(3);
  });

  test('selecting an option via click calls onChange and closes the panel', async () => {
    const user = userEvent.setup();
    render(<ControlledSelect options={ROOM_OPTIONS} label="Room type" />);

    await user.click(screen.getByRole('combobox', { name: 'Room type' }));
    await user.click(screen.getByRole('option', { name: 'Deluxe room' }));

    // The trigger's accessible name stays the field label (Phase 8 fix —
    // matches a native <select>'s own pattern); the current selection is
    // communicated via its visible text content instead.
    const trigger = screen.getByRole('combobox', { name: 'Room type' });
    expect(within(trigger).getByText('Deluxe room')).toBeInTheDocument();
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  test('full keyboard flow: ArrowDown opens, ArrowDown navigates, Enter selects, Escape closes', async () => {
    const user = userEvent.setup();
    render(<ControlledSelect options={ROOM_OPTIONS} label="Room type" />);

    await user.tab();
    expect(screen.getByRole('combobox', { name: 'Room type' })).toHaveFocus();

    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('listbox')).toBeInTheDocument();

    await user.keyboard('{ArrowDown}{Enter}');
    const trigger = screen.getByRole('combobox', { name: 'Room type' });
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

    await user.click(screen.getByRole('combobox', { name: 'Amenities' }));
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

    await user.click(screen.getByRole('combobox', { name: 'Amenities' }));
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

    await user.click(screen.getByRole('combobox', { name: 'Room type' }));
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

    await user.click(screen.getByRole('combobox', { name: 'Country' }));
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
    expect(screen.getByRole('combobox').getAttribute('aria-describedby')).toBe(
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

    await user.click(screen.getByRole('combobox', { name: 'Room type' }));
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

      await user.click(screen.getByRole('combobox', { name: 'Room type' }));
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

    await user.click(screen.getByRole('combobox', { name: 'Room' }));

    const standard = screen.getByRole('option', { name: /^Standard room/ });
    expect(within(standard).getByText('Sleeps 2')).toBeInTheDocument();
    expect(within(standard).getByText('24,000 per night')).toBeInTheDocument();
    expect(standard).toHaveAccessibleName(/Sleeps 2/);
  });

  test('the closed trigger shows only the concise trigger label, never the row facts', async () => {
    const user = userEvent.setup();
    render(<ControlledSelect options={STRUCTURED_OPTIONS} label="Room" />);

    await user.click(screen.getByRole('combobox', { name: 'Room' }));
    await user.click(screen.getByRole('option', { name: /^Family suite/ }));

    const trigger = screen.getByRole('combobox', { name: 'Room' });
    expect(trigger).toHaveTextContent(
      /^Family suite with a very long name that has to wrap$/,
    );
    expect(trigger).not.toHaveTextContent('Sleeps 4');
  });

  test('keyboard selection and type-ahead work on structured options (type-ahead reads the plain label)', async () => {
    const user = userEvent.setup();
    render(<ControlledSelect options={STRUCTURED_OPTIONS} label="Room" />);

    screen.getByRole('combobox', { name: 'Room' }).focus();
    await user.keyboard('{ArrowDown}');
    await user.keyboard('f');
    expect(screen.getByRole('combobox', { name: 'Room' })).toHaveAttribute(
      'aria-activedescendant',
      screen.getByRole('option', { name: /^Family suite/ }).id,
    );
    await user.keyboard('{Enter}');

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Room' })).toHaveTextContent(
      /^Family suite/,
    );
  });

  test('search filters structured options by their plain label', async () => {
    const user = userEvent.setup();
    render(
      <ControlledSelect options={STRUCTURED_OPTIONS} label="Room" searchable />,
    );

    await user.click(screen.getByRole('combobox', { name: 'Room' }));
    await user.type(screen.getByRole('textbox'), 'family');

    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(1);
    expect(options[0]).toHaveAccessibleName(/^Family suite/);
  });

  test('`portal={false}` keeps the panel inside the field', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <ControlledSelect
        options={ROOM_OPTIONS}
        label="Room type"
        portal={false}
      />,
    );

    await user.click(screen.getByRole('combobox', { name: 'Room type' }));

    expect(container).toContainElement(screen.getByRole('listbox'));
  });

  test('by default, outside any overlay, the panel mounts on document.body; picking a row selects it, a press outside closes it', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <div>
        <ControlledSelect options={ROOM_OPTIONS} label="Room type" />
        <p>{OUTSIDE_TEXT}</p>
      </div>,
    );

    await user.click(screen.getByRole('combobox', { name: 'Room type' }));
    const listbox = screen.getByRole('listbox');
    expect(container).not.toContainElement(listbox);
    expect(document.body).toContainElement(listbox);

    await user.click(screen.getByRole('option', { name: 'Suite' }));
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(
      screen.getByRole('combobox', { name: 'Room type' }),
    ).toHaveTextContent('Suite');

    await user.click(screen.getByRole('combobox', { name: 'Room type' }));
    await user.click(screen.getByText(OUTSIDE_TEXT));
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  test('by default, inside a Drawer, the list mounts in the drawer dialog; Escape closes the list first and the drawer second', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <Drawer isOpen onClose={onClose} title="Book">
        <ControlledSelect options={STRUCTURED_OPTIONS} label="Room" />
      </Drawer>,
    );

    await user.click(screen.getByRole('combobox', { name: 'Room' }));
    const drawer = screen.getByRole('dialog', { name: 'Book' });
    expect(drawer).toContainElement(screen.getByRole('listbox'));

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('combobox', { name: 'Room' })).toHaveFocus();

    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

// Geometry jsdom does not compute: the trigger's rect and the panel's
// natural height, so placement can be checked against a known layout
// (jsdom's viewport is 1024 x 768).
function mockGeometry({ trigger, panelHeight }) {
  const rectSpy = vi
    .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
    .mockImplementation(function rect() {
      return this.dataset.testid === 'select-trigger'
        ? { ...trigger, right: trigger.left + trigger.width }
        : { top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0 };
    });
  const heightSpy = vi
    .spyOn(HTMLElement.prototype, 'scrollHeight', 'get')
    .mockImplementation(function height() {
      return this.querySelector(':scope > [role="listbox"]') ? panelHeight : 0;
    });
  onTestFinished(() => {
    rectSpy.mockRestore();
    heightSpy.mockRestore();
  });
}

function panelVar(name) {
  return screen.getByRole('listbox').parentElement.style.getPropertyValue(name);
}

const MANY_OPTIONS = Array.from({ length: 8 }, (_, index) => ({
  value: `option-${index}`,
  label: `Option ${index}`,
}));

describe('Select — overlay, placement, keyboard and state hardening', () => {
  test('by default, inside a Modal, the list mounts in the modal dialog; Escape closes the list first and the modal second', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <Modal isOpen onClose={onClose} title="Promote">
        <ControlledSelect options={ROOM_OPTIONS} label="Placement" />
      </Modal>,
    );

    await user.click(screen.getByRole('combobox', { name: 'Placement' }));
    expect(screen.getByRole('dialog', { name: 'Promote' })).toContainElement(
      screen.getByRole('listbox'),
    );

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('combobox', { name: 'Placement' })).toHaveFocus();

    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('near the bottom of the viewport the panel opens above the trigger', async () => {
    mockGeometry({
      trigger: { top: 600, bottom: 640, left: 100, width: 300, height: 40 },
      panelHeight: 200,
    });
    const user = userEvent.setup();
    render(<ControlledSelect options={ROOM_OPTIONS} label="Status" />);

    await user.click(screen.getByRole('combobox', { name: 'Status' }));

    expect(panelVar('--select-panel-top')).toBe('396px');
    expect(panelVar('--select-panel-left')).toBe('100px');
    expect(panelVar('--select-panel-width')).toBe('300px');
  });

  test('when neither side fits, the panel takes the roomier side and is capped to it', async () => {
    mockGeometry({
      trigger: { top: 300, bottom: 340, left: 100, width: 300, height: 40 },
      panelHeight: 600,
    });
    const user = userEvent.setup();
    render(<ControlledSelect options={ROOM_OPTIONS} label="Status" />);

    await user.click(screen.getByRole('combobox', { name: 'Status' }));

    expect(panelVar('--select-panel-top')).toBe('344px');
    expect(panelVar('--select-panel-max-height')).toBe('416px');
  });

  test('a narrow trigger near the right edge gets a readable panel kept inside the viewport', async () => {
    mockGeometry({
      trigger: { top: 100, bottom: 140, left: 950, width: 60, height: 40 },
      panelHeight: 150,
    });
    const user = userEvent.setup();
    render(<ControlledSelect options={ROOM_OPTIONS} label="Role" />);

    await user.click(screen.getByRole('combobox', { name: 'Role' }));

    expect(panelVar('--select-panel-width')).toBe('240px');
    expect(panelVar('--select-panel-left')).toBe('776px');
  });

  test('opening a single-select starts on the selected option and keeps the active option scrolled into view', async () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    onTestFinished(() => {
      delete Element.prototype.scrollIntoView;
    });
    const user = userEvent.setup();
    render(
      <ControlledSelect
        options={MANY_OPTIONS}
        label="Status"
        initialValue="option-6"
      />,
    );
    const trigger = screen.getByRole('combobox', { name: 'Status' });

    await user.click(trigger);
    const selected = screen.getByRole('option', { name: 'Option 6' });
    expect(trigger).toHaveAttribute('aria-activedescendant', selected.id);
    expect(scrollIntoView.mock.contexts).toContain(selected);

    await user.keyboard('{ArrowDown}');
    const next = screen.getByRole('option', { name: 'Option 7' });
    expect(trigger).toHaveAttribute('aria-activedescendant', next.id);
    expect(scrollIntoView.mock.contexts.at(-1)).toBe(next);
    expect(scrollIntoView).toHaveBeenLastCalledWith({ block: 'nearest' });
  });

  test('closing by a press outside leaves no stale search text for the next opening', async () => {
    const user = userEvent.setup();
    render(
      <div>
        <ControlledSelect options={ROOM_OPTIONS} label="Room type" searchable />
        <p>{OUTSIDE_TEXT}</p>
      </div>,
    );

    await user.click(screen.getByRole('combobox', { name: 'Room type' }));
    await user.type(screen.getByRole('textbox'), 'sui');
    expect(screen.getAllByRole('option')).toHaveLength(1);
    await user.click(screen.getByText(OUTSIDE_TEXT));

    await user.click(screen.getByRole('combobox', { name: 'Room type' }));
    expect(screen.getByRole('textbox')).toHaveValue('');
    expect(screen.getAllByRole('option')).toHaveLength(3);
  });

  // jsdom has no sequential focus navigation of its own, so this checks
  // the handoff — the browser's Tab then continues from the trigger (the
  // web app's sharedSelect.spec.js covers the real move to the next field).
  test('Tab from the search field closes the list and hands focus back to the trigger, so focus is never lost with the panel', async () => {
    const user = userEvent.setup();
    render(
      <ControlledSelect options={ROOM_OPTIONS} label="Room type" searchable />,
    );
    const trigger = screen.getByRole('combobox', { name: 'Room type' });

    await user.click(trigger);
    const search = screen.getByRole('textbox');
    expect(search).toHaveFocus();
    fireEvent.keyDown(search, { key: 'Tab' });

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  test('the trigger is a combobox that exposes required and invalid state', () => {
    render(
      <ControlledSelect
        options={ROOM_OPTIONS}
        label="Room type"
        required
        error="Choose a room type"
      />,
    );

    const trigger = screen.getByRole('combobox', { name: 'Room type' });
    expect(trigger).toHaveAttribute('aria-haspopup', 'listbox');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toHaveAttribute('aria-required', 'true');
    expect(trigger).toHaveAttribute('aria-invalid', 'true');
    expect(trigger).toHaveAccessibleDescription('Choose a room type');
  });

  test('a disabled option is announced as disabled, skipped by the arrows and not selectable by click', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <Select
        label="Room type"
        value={undefined}
        onChange={onChange}
        options={[
          { value: 'standard', label: 'Standard room' },
          { value: 'deluxe', label: 'Deluxe room', disabled: true },
          { value: 'suite', label: 'Suite' },
        ]}
      />,
    );
    const trigger = screen.getByRole('combobox', { name: 'Room type' });

    await user.click(trigger);
    const disabled = screen.getByRole('option', { name: 'Deluxe room' });
    expect(disabled).toHaveAttribute('aria-disabled', 'true');
    await user.click(disabled);
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('listbox')).toBeInTheDocument();

    await user.keyboard('{ArrowDown}{ArrowDown}');
    expect(trigger).toHaveAttribute(
      'aria-activedescendant',
      screen.getByRole('option', { name: 'Suite' }).id,
    );
  });

  test('a controlled value set or reset from outside (a form reset) is reflected in the trigger', () => {
    const { rerender } = render(
      <Select
        label="Room type"
        placeholder="Choose a room"
        options={ROOM_OPTIONS}
        value="suite"
        onChange={vi.fn()}
      />,
    );
    const trigger = screen.getByRole('combobox', { name: 'Room type' });
    expect(trigger).toHaveTextContent('Suite');

    rerender(
      <Select
        label="Room type"
        placeholder="Choose a room"
        options={ROOM_OPTIONS}
        value={null}
        onChange={vi.fn()}
      />,
    );
    expect(trigger).toHaveTextContent('Choose a room');
  });

  test('long Armenian and Russian labels keep their full text as option names and in the trigger, and type-ahead reads them', async () => {
    const armenian = 'Լյուքս համար Արարատի և Մասիսի համայնապատկերով';
    const russian = 'Семейный номер с видом на Арарат и гостиной';
    const user = userEvent.setup();
    render(
      <ControlledSelect
        label="Room"
        options={[
          { value: 'hy', label: armenian },
          { value: 'ru', label: russian },
        ]}
      />,
    );
    const trigger = screen.getByRole('combobox', { name: 'Room' });

    trigger.focus();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('option', { name: armenian })).toBeInTheDocument();
    await user.keyboard('С');
    expect(trigger).toHaveAttribute(
      'aria-activedescendant',
      screen.getByRole('option', { name: russian }).id,
    );
    await user.keyboard('{Enter}');

    expect(trigger).toHaveTextContent(russian);
  });
});
