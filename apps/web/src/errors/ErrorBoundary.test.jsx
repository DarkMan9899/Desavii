import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ErrorBoundary from './ErrorBoundary.jsx';

// Redesign phase (2026, i18n remediation) — the fallback UI used to be
// two hardcoded English strings, shown to every locale whenever a render
// error is caught; this test locks in the real fix, not a mock.
function Bomb() {
  throw new Error('boom');
}

describe('ErrorBoundary (apps/web/src/errors)', () => {
  test('renders localized fallback copy (not hardcoded English) when a child throws', () => {
    // The boundary logs via console.error — expected here, not a real
    // failure; silenced so the test output stays readable.
    vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>,
    );

    // The shared test i18n instance defaults to `hy` (tests/setup.js) —
    // asserting the Armenian copy (not the old hardcoded English) is
    // what actually proves this reads from the translation resources.
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Տեղի ունեցավ անսպասելի սխալ',
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Խնդրում ենք թարմացնել էջը',
    );
  });

  // Sprint L — the fallback used to be two lines of plain text with no
  // way forward for the user; it now offers a real action button, using
  // window.location.reload() rather than useNavigate() since this
  // fallback renders with no Router context available (ErrorBoundary
  // sits above AppProviders/the router in App.jsx).
  test('the fallback action button reloads the page', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const reload = vi.fn();
    const originalLocation = window.location;
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...originalLocation, reload },
    });

    const user = userEvent.setup();
    render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>,
    );

    await user.click(screen.getByRole('button', { name: 'Թարմացնել էջը' }));
    expect(reload).toHaveBeenCalledTimes(1);

    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
    });
  });

  test('renders children normally when nothing throws', () => {
    render(
      <ErrorBoundary>
        <p>Safe content</p>
      </ErrorBoundary>,
    );

    expect(screen.getByText('Safe content')).toBeInTheDocument();
  });
});
