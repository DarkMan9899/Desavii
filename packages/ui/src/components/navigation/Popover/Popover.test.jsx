import { describe, test, expect, vi, afterEach } from 'vitest';
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

describe('Popover — viewport containment', () => {
  const VIEWPORT = 768;

  /** Lays the panel out at [left, left + width] until it is shifted. */
  function layOutPanel(left, width) {
    return vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(function rect() {
        const shift = parseFloat(
          this.style.getPropertyValue('--popover-shift-x') || '0',
        );
        const x = left + shift;
        return {
          left: x,
          right: x + width,
          top: 0,
          bottom: 100,
          width,
          height: 100,
        };
      });
  }

  function shiftOf() {
    return screen
      .getByRole('button', { name: ITEM_LABEL })
      .parentElement.style.getPropertyValue('--popover-shift-x');
  }

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('a panel past the right edge slides left to keep the margin clear', () => {
    vi.spyOn(document.documentElement, 'clientWidth', 'get').mockReturnValue(
      VIEWPORT,
    );
    layOutPanel(492, 400);
    renderPopover();
    // 492 + 400 = 892; the right limit is 768 - 8 = 760.
    expect(shiftOf()).toBe('-132px');
  });

  test('a panel past the left edge slides right', () => {
    vi.spyOn(document.documentElement, 'clientWidth', 'get').mockReturnValue(
      VIEWPORT,
    );
    layOutPanel(-40, 300);
    renderPopover();
    expect(shiftOf()).toBe('48px');
  });

  test('a panel that already fits is not moved', () => {
    vi.spyOn(document.documentElement, 'clientWidth', 'get').mockReturnValue(
      VIEWPORT,
    );
    layOutPanel(100, 300);
    renderPopover();
    expect(shiftOf()).toBe('0px');
  });

  test('it is placed again when the window resizes', () => {
    const width = vi
      .spyOn(document.documentElement, 'clientWidth', 'get')
      .mockReturnValue(1440);
    layOutPanel(492, 400);
    renderPopover();
    expect(shiftOf()).toBe('0px');
    width.mockReturnValue(VIEWPORT);
    fireEvent(window, new Event('resize'));
    expect(shiftOf()).toBe('-132px');
  });

  test('a panel opening below the fold is scrolled into view; one in view is left alone', () => {
    vi.spyOn(document.documentElement, 'clientWidth', 'get').mockReturnValue(
      VIEWPORT,
    );
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(800);
    const scrollIntoView = vi.fn();
    HTMLElement.prototype.scrollIntoView = scrollIntoView;
    const rect = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockReturnValue({
        left: 100,
        right: 400,
        top: 600,
        bottom: 900,
        width: 300,
        height: 300,
      });
    const { unmount } = render(
      <Popover
        isOpen
        onClose={vi.fn()}
        trigger={<button type="button">{TRIGGER_LABEL}</button>}
      >
        <button type="button">{ITEM_LABEL}</button>
      </Popover>,
    );
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' });
    unmount();

    scrollIntoView.mockClear();
    rect.mockReturnValue({
      left: 100,
      right: 400,
      top: 100,
      bottom: 400,
      width: 300,
      height: 300,
    });
    renderPopover();
    expect(scrollIntoView).not.toHaveBeenCalled();
    delete HTMLElement.prototype.scrollIntoView;
  });
});
