import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Popover from './Popover.jsx';

const OUTSIDE_LABEL = 'Outside';
const TRIGGER_LABEL = 'Menu';
const ITEM_LABEL = 'Menu item';

function renderPopover({ isOpen = true, onClose = vi.fn(), children } = {}) {
  render(
    <div>
      <button type="button">{OUTSIDE_LABEL}</button>
      <Popover
        isOpen={isOpen}
        onClose={onClose}
        trigger={<button type="button">{TRIGGER_LABEL}</button>}
      >
        {children ?? <button type="button">{ITEM_LABEL}</button>}
      </Popover>
    </div>,
  );
  return onClose;
}

describe('Popover', () => {
  test('renders the panel only while open', () => {
    renderPopover({ isOpen: false });
    expect(
      screen.queryByRole('button', { name: ITEM_LABEL }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: TRIGGER_LABEL }),
    ).toBeInTheDocument();
  });

  test('a pointer press outside closes it, one inside does not', async () => {
    const user = userEvent.setup();
    const onClose = renderPopover();

    await user.click(screen.getByRole('button', { name: ITEM_LABEL }));
    expect(onClose).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: OUTSIDE_LABEL }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('Escape closes it and is marked handled for any enclosing overlay', () => {
    const onClose = renderPopover();

    const notCancelled = fireEvent.keyDown(document, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(notCancelled).toBe(false);
  });

  // Nested-dismiss contract (shared with useFocusTrap): a control inside
  // the panel that closes its own popup on Escape calls preventDefault(),
  // and that Escape must not also close the Popover around it.
  test('an Escape a nested control already handled does not close it', () => {
    const onClose = renderPopover({
      children: (
        <input
          aria-label="Nested popup"
          onKeyDown={(event) => {
            if (event.key === 'Escape') event.preventDefault();
          }}
        />
      ),
    });

    fireEvent.keyDown(screen.getByLabelText('Nested popup'), {
      key: 'Escape',
    });

    expect(onClose).not.toHaveBeenCalled();
  });

  test('ignores keys other than Escape', () => {
    const onClose = renderPopover();
    fireEvent.keyDown(document, { key: 'Enter' });
    expect(onClose).not.toHaveBeenCalled();
  });
});
