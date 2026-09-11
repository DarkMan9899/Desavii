import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Modal from './Modal.jsx';

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
