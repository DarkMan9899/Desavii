import { useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { describe, test, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import useFocusTrap from './useFocusTrap.js';

function Harness({ initialOpen = true, preventClose = false }) {
  const [isOpen, setIsOpen] = useState(initialOpen);
  const containerRef = useRef(null);
  useFocusTrap({
    containerRef,
    isOpen,
    onClose: () => setIsOpen(false),
    preventClose,
  });

  return (
    <div>
      <button type="button">Outside trigger</button>
      {isOpen && (
        <div ref={containerRef} data-testid="trapped">
          <button type="button">First</button>
          {/* Stands in for a nested popup (Select, DatePicker) that
              handles Escape itself and marks it with preventDefault(). */}
          <input
            aria-label="Nested popup"
            onKeyDown={(event) => {
              if (event.key === 'Escape') event.preventDefault();
            }}
          />
          <button type="button">Last</button>
        </div>
      )}
    </div>
  );
}

Harness.propTypes = {
  initialOpen: PropTypes.bool,
  preventClose: PropTypes.bool,
};

describe('useFocusTrap', () => {
  test('moves focus to the first focusable element inside the container on open', () => {
    render(<Harness />);
    expect(screen.getByRole('button', { name: 'First' })).toHaveFocus();
  });

  test('Tab from the last focusable element wraps to the first', () => {
    render(<Harness />);
    screen.getByRole('button', { name: 'Last' }).focus();

    fireEvent.keyDown(document, { key: 'Tab' });

    expect(screen.getByRole('button', { name: 'First' })).toHaveFocus();
  });

  test('Shift+Tab from the first focusable element wraps to the last', () => {
    render(<Harness />);
    expect(screen.getByRole('button', { name: 'First' })).toHaveFocus();

    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });

    expect(screen.getByRole('button', { name: 'Last' })).toHaveFocus();
  });

  test('Escape closes the trap unless preventClose is set', () => {
    render(<Harness />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByTestId('trapped')).not.toBeInTheDocument();
  });

  test('an Escape a nested control already handled (defaultPrevented) does not close the trap', () => {
    render(<Harness />);
    fireEvent.keyDown(screen.getByLabelText('Nested popup'), {
      key: 'Escape',
    });
    expect(screen.getByTestId('trapped')).toBeInTheDocument();
  });

  test('the Escape that closes the trap is itself marked handled', () => {
    render(<Harness />);
    const notCancelled = fireEvent.keyDown(document, { key: 'Escape' });
    expect(notCancelled).toBe(false);
  });

  test('preventClose blocks Escape from closing', () => {
    render(<Harness preventClose />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.getByTestId('trapped')).toBeInTheDocument();
  });

  test('restores focus to the previously focused element on close', () => {
    const outsideButtonHolder = document.createElement('button');
    document.body.appendChild(outsideButtonHolder);
    outsideButtonHolder.focus();

    render(<Harness />);
    fireEvent.keyDown(document, { key: 'Escape' });

    expect(outsideButtonHolder).toHaveFocus();
    document.body.removeChild(outsideButtonHolder);
  });

  test('locks body scroll while open and restores it on close', () => {
    const { unmount } = render(<Harness />);
    expect(document.body.style.overflow).toBe('hidden');

    unmount();
    expect(document.body.style.overflow).not.toBe('hidden');
  });

  test('marks sibling content aria-hidden while open and restores it on close', () => {
    const sibling = document.createElement('div');
    document.body.appendChild(sibling);

    const { unmount } = render(<Harness />);
    expect(sibling).toHaveAttribute('aria-hidden', 'true');

    unmount();
    expect(sibling).not.toHaveAttribute('aria-hidden');
    document.body.removeChild(sibling);
  });

  test('does nothing when never opened', () => {
    render(<Harness initialOpen={false} />);
    expect(document.body.style.overflow).not.toBe('hidden');
  });
});

// A form inside a Drawer re-renders on every keystroke and passes a new
// inline `onClose` each time; the trap must not be rebuilt by that, or
// focus jumps away after the first character.
function TypingHarness() {
  const [isOpen, setIsOpen] = useState(true);
  const [text, setText] = useState('');
  const [closedBy, setClosedBy] = useState('');
  const containerRef = useRef(null);
  useFocusTrap({
    containerRef,
    isOpen,
    onClose: () => {
      setClosedBy(`closed after "${text}"`);
      setIsOpen(false);
    },
  });

  return (
    <div>
      <p>{closedBy}</p>
      {isOpen && (
        <div ref={containerRef}>
          <button type="button" aria-label="First" />
          <input
            aria-label="Price"
            value={text}
            onChange={(event) => setText(event.target.value)}
          />
        </div>
      )}
    </div>
  );
}

describe('useFocusTrap — consumers that re-render while open', () => {
  test('typing in a stateful field keeps focus and every character', async () => {
    const user = userEvent.setup();
    render(<TypingHarness />);
    await user.click(screen.getByRole('textbox', { name: 'Price' }));
    await user.keyboard('20000');
    expect(screen.getByRole('textbox', { name: 'Price' })).toHaveValue('20000');
    expect(screen.getByRole('textbox', { name: 'Price' })).toHaveFocus();
  });

  test('Escape still calls the latest onClose, not the one from the first render', async () => {
    const user = userEvent.setup();
    render(<TypingHarness />);
    await user.click(screen.getByRole('textbox', { name: 'Price' }));
    await user.keyboard('42{Escape}');
    expect(screen.getByText('closed after "42"')).toBeInTheDocument();
  });
});
