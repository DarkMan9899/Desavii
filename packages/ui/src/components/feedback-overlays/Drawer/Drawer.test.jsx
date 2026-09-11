import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Drawer from './Drawer.jsx';

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
