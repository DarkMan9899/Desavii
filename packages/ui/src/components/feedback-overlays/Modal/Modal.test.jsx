import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Modal from './Modal.jsx';
import DatePicker from '../../form-controls/DatePicker/DatePicker.jsx';
import Select from '../../form-controls/Select/Select.jsx';

const AMENITY_OPTIONS = [
  { value: 'pool', label: 'Pool' },
  { value: 'spa', label: 'Spa' },
];

describe('Modal (COMPONENT_LIBRARY.md Part II §4)', () => {
  test('renders nothing when closed', () => {
    render(
      <Modal isOpen={false} onClose={() => {}} title="Cancel booking">
        Are you sure?
      </Modal>,
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  test('renders a labelled dialog when open', () => {
    render(
      <Modal isOpen onClose={() => {}} title="Cancel booking">
        Are you sure?
      </Modal>,
    );
    const dialog = screen.getByRole('dialog', { name: 'Cancel booking' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByText('Are you sure?')).toBeInTheDocument();
  });

  test('the close button calls onClose', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <Modal isOpen onClose={onClose} title="Cancel booking">
        Are you sure?
      </Modal>,
    );

    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('Escape calls onClose', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <Modal isOpen onClose={onClose} title="Cancel booking">
        Are you sure?
      </Modal>,
    );

    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // Nested-dismiss contract (useFocusTrap). A multi-select keeps its
  // panel open after an option click, with focus on the listbox itself —
  // the path where Escape used to reach the Modal unhandled.
  test('Escape inside an open multi-select closes only its listbox, then a second Escape closes the modal', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <Modal isOpen onClose={onClose} title="Filters">
        <Select
          label="Amenities"
          options={AMENITY_OPTIONS}
          value={[]}
          onChange={() => {}}
          multiple
        />
      </Modal>,
    );

    await user.click(screen.getByRole('button', { name: 'Amenities' }));
    await user.click(screen.getByRole('option', { name: 'Pool' }));
    expect(screen.getByRole('listbox')).toHaveFocus();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();

    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('clicking the backdrop calls onClose, clicking inside the panel does not', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <Modal isOpen onClose={onClose} title="Cancel booking">
        Are you sure?
      </Modal>,
    );

    await user.click(screen.getByText('Are you sure?'));
    expect(onClose).not.toHaveBeenCalled();

    const backdrop = screen.getByRole('dialog').parentElement;
    await user.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('preventClose hides the close button and blocks Escape/backdrop dismissal', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <Modal isOpen onClose={onClose} title="Processing payment" preventClose>
        Please wait…
      </Modal>,
    );

    expect(
      screen.queryByRole('button', { name: 'Close' }),
    ).not.toBeInTheDocument();

    await user.keyboard('{Escape}');
    const backdrop = screen.getByRole('dialog').parentElement;
    await user.click(backdrop);

    expect(onClose).not.toHaveBeenCalled();
  });

  test('renders an optional footer', () => {
    render(
      <Modal
        isOpen
        onClose={() => {}}
        title="Confirm"
        footer={<button type="button">Confirm</button>}
      >
        Body content
      </Modal>,
    );
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeInTheDocument();
  });

  test('closeLabel prop overrides the default English close-button aria-label', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <Modal isOpen onClose={onClose} title="Cancel booking" closeLabel="Փակել">
        Are you sure?
      </Modal>,
    );

    expect(
      screen.queryByRole('button', { name: 'Close' }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Փակել' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // Sprint L — a caller whose modal content depends on data that isn't
  // ready yet (e.g. ListingGallery's lightbox, with nothing to show
  // before an image is selected) legitimately passes `null` children
  // while `isOpen` is false, since Modal is designed to stay mounted
  // rather than conditionally rendered by its caller.
  test('accepts null children while closed without a PropTypes warning', () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    render(
      <Modal isOpen={false} onClose={() => {}} title="Loading">
        {null}
      </Modal>,
    );

    const propTypeWarning = consoleError.mock.calls.some((args) =>
      String(args[0]).includes('Failed prop type'),
    );
    expect(propTypeWarning).toBe(false);
    consoleError.mockRestore();
  });

  // Same contract as Drawer (shared `internal/Overlay`): a body-level
  // calendar at `$z-dropdown` would paint beneath `$z-modal`.
  test('a DatePicker opened inside the modal renders its calendar within the modal dialog and selects a day', async () => {
    const onClose = vi.fn();
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <Modal isOpen onClose={onClose} title="Filter logs">
        <DatePicker
          label="From"
          value={new Date(2026, 5, 15)}
          onChange={onChange}
        />
      </Modal>,
    );

    await user.click(screen.getByLabelText('From'));
    const modal = screen.getByRole('dialog', { name: 'Filter logs' });
    expect(modal).toContainElement(screen.getByRole('grid'));

    await user.click(screen.getByRole('gridcell', { name: /^Jun 20,/ }));
    expect(onChange).toHaveBeenCalledWith('2026-06-20');
    expect(onClose).not.toHaveBeenCalled();
  });

  test('supports every documented size without throwing', () => {
    ['sm', 'md', 'lg', 'full'].forEach((size) => {
      const { unmount } = render(
        <Modal isOpen onClose={() => {}} title="Test" size={size}>
          Content
        </Modal>,
      );
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      unmount();
    });
  });
});
