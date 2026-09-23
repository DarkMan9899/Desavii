import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useNavigate } from 'react-router-dom';
import Ga4RouteTracker from './Ga4RouteTracker.jsx';
import { useAuth } from '../../contexts/AuthContext.jsx';
import {
  GA4_CONSENT_STATES,
  setGa4AnalyticsConsent,
  resetGa4ConsentForTests,
} from './ga4Consent.js';
import { resetGa4ClientForTests } from './ga4Client.js';
import {
  isGa4InternalTrafficSuppressed,
  resetGa4InternalTrafficForTests,
} from './ga4InternalTraffic.js';

vi.mock('../../contexts/AuthContext.jsx', () => ({ useAuth: vi.fn() }));

function stubConfigured() {
  vi.stubEnv('VITE_GA4_ENABLED', 'true');
  vi.stubEnv('VITE_GA4_MEASUREMENT_ID', 'G-TEST1234');
}

// Real timers throughout — `Ga4RouteTracker`'s own dispatch defers by one
// real macrotask (`setTimeout(fn, 0)`, see its own file header for why);
// this waits comfortably past that without the userEvent+fake-timers
// deadlock real-world click() + `vi.useFakeTimers()` runs into together.
async function flush() {
  await act(async () => {
    await new Promise((resolve) => {
      setTimeout(resolve, 10);
    });
  });
}

function HomePage() {
  const navigate = useNavigate();
  return (
    <div>
      <h1>Home</h1>
      <button type="button" onClick={() => navigate('/en/search')}>
        Go to Search
      </button>
      <button type="button" onClick={() => navigate('/hy')}>
        Switch to HY
      </button>
      <button type="button" onClick={() => navigate('/en/partner/analytics')}>
        Go to Partner Analytics
      </button>
    </div>
  );
}

function SearchPage() {
  const navigate = useNavigate();
  return (
    <div>
      <h1>Search</h1>
      <button type="button" onClick={() => navigate('/en/search?q=hotel')}>
        Apply query filter
      </button>
    </div>
  );
}

function renderApp(initialPath) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Ga4RouteTracker />
      <Routes>
        <Route path="/:locale" element={<HomePage />} />
        <Route path="/:locale/search" element={<SearchPage />} />
        <Route
          path="/:locale/partner/analytics"
          element={<div>Partner Analytics</div>}
        />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  resetGa4ConsentForTests();
  resetGa4ClientForTests();
  resetGa4InternalTrafficForTests();
  window.gtag = vi.fn();
  useAuth.mockReturnValue({ roles: [], isAuthenticated: false });
});

afterEach(() => {
  vi.unstubAllEnvs();
  resetGa4ConsentForTests();
  resetGa4ClientForTests();
  resetGa4InternalTrafficForTests();
});

function pageViewCallsOf(gtagMock) {
  return gtagMock.mock.calls.filter(([, name]) => name === 'page_view');
}

describe('no GA4 traffic before consent (brief §41)', () => {
  test('a fresh mount with UNKNOWN consent sends no page_view', async () => {
    stubConfigured();
    renderApp('/en');
    await flush();
    expect(pageViewCallsOf(window.gtag)).toHaveLength(0);
  });
});

describe('consent granted — initial + navigation pageviews', () => {
  test('sends exactly one page_view for the current page once consent is granted', async () => {
    stubConfigured();
    renderApp('/en');
    act(() => setGa4AnalyticsConsent(GA4_CONSENT_STATES.GRANTED));
    await flush();

    const pageViewCalls = pageViewCallsOf(window.gtag);
    expect(pageViewCalls).toHaveLength(1);
    expect(pageViewCalls[0][2]).toMatchObject({
      page_location: expect.stringContaining('/en'),
      locale: 'en',
    });
  });

  test('a genuine navigation to a new public route sends a second page_view', async () => {
    stubConfigured();
    const user = userEvent.setup();
    renderApp('/en');
    act(() => setGa4AnalyticsConsent(GA4_CONSENT_STATES.GRANTED));
    await flush();
    window.gtag.mockClear();

    await user.click(screen.getByRole('button', { name: 'Go to Search' }));
    await flush();

    const pageViewCalls = pageViewCallsOf(window.gtag);
    expect(pageViewCalls).toHaveLength(1);
    expect(pageViewCalls[0][2].page_location).toContain('/en/search');
  });

  test('a query-only change on the same pathname does NOT send another page_view', async () => {
    stubConfigured();
    const user = userEvent.setup();
    renderApp('/en');
    act(() => setGa4AnalyticsConsent(GA4_CONSENT_STATES.GRANTED));
    await flush();

    await user.click(screen.getByRole('button', { name: 'Go to Search' }));
    await flush();
    window.gtag.mockClear();

    await user.click(
      screen.getByRole('button', { name: 'Apply query filter' }),
    );
    await flush();

    expect(pageViewCallsOf(window.gtag)).toHaveLength(0);
  });

  test('a locale-only switch DOES send a new page_view (brief §17)', async () => {
    stubConfigured();
    const user = userEvent.setup();
    renderApp('/en');
    act(() => setGa4AnalyticsConsent(GA4_CONSENT_STATES.GRANTED));
    await flush();
    window.gtag.mockClear();

    await user.click(screen.getByRole('button', { name: 'Switch to HY' }));
    await flush();

    const pageViewCalls = pageViewCallsOf(window.gtag);
    expect(pageViewCalls).toHaveLength(1);
    expect(pageViewCalls[0][2]).toMatchObject({ locale: 'hy' });
  });

  test('page_location never includes a query string', async () => {
    stubConfigured();
    renderApp('/en/search?q=hotel');
    act(() => setGa4AnalyticsConsent(GA4_CONSENT_STATES.GRANTED));
    await flush();

    const [, , params] = window.gtag.mock.calls.find(
      ([, name]) => name === 'page_view',
    );
    expect(params.page_location).not.toContain('?');
    expect(params.page_location).not.toContain('q=hotel');
  });
});

describe('private routes are never tracked (brief §29)', () => {
  test('navigating to Partner Analytics sends zero page_view calls', async () => {
    stubConfigured();
    const user = userEvent.setup();
    renderApp('/en');
    act(() => setGa4AnalyticsConsent(GA4_CONSENT_STATES.GRANTED));
    await flush();
    window.gtag.mockClear();

    await user.click(
      screen.getByRole('button', { name: 'Go to Partner Analytics' }),
    );
    await flush();

    expect(pageViewCallsOf(window.gtag)).toHaveLength(0);
  });
});

describe('internal staff suppression (brief §30)', () => {
  test('an authenticated ADMIN sends no page_view even on a public route', async () => {
    stubConfigured();
    useAuth.mockReturnValue({ roles: ['ADMIN'], isAuthenticated: true });
    renderApp('/en');
    act(() => setGa4AnalyticsConsent(GA4_CONSENT_STATES.GRANTED));
    await flush();

    expect(pageViewCallsOf(window.gtag)).toHaveLength(0);
  });

  test('syncs the shared internal-traffic flag used by the event bridge', async () => {
    useAuth.mockReturnValue({ roles: ['SUPER_ADMIN'], isAuthenticated: true });
    renderApp('/en');
    await flush();
    expect(isGa4InternalTrafficSuppressed()).toBe(true);
  });

  test('a plain CUSTOMER role does not suppress', async () => {
    useAuth.mockReturnValue({ roles: ['CUSTOMER'], isAuthenticated: true });
    renderApp('/en');
    await flush();
    expect(isGa4InternalTrafficSuppressed()).toBe(false);
  });

  test('an unauthenticated visitor is never suppressed', async () => {
    useAuth.mockReturnValue({ roles: [], isAuthenticated: false });
    renderApp('/en');
    await flush();
    expect(isGa4InternalTrafficSuppressed()).toBe(false);
  });
});
