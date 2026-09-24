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

function buildTree(initialPath) {
  return (
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
    </MemoryRouter>
  );
}

// `MemoryRouter` only consults `initialEntries` on first mount — its
// internal history is `useRef`-held, so calling `rerender(buildTree(path))`
// with the SAME `path` after mount re-renders in place (picking up a
// changed `useAuth()` mock) without resetting navigation. Used below to
// simulate `AuthProvider`'s bootstrap resolving mid-session.
function renderApp(initialPath) {
  return render(buildTree(initialPath));
}

beforeEach(() => {
  resetGa4ConsentForTests();
  resetGa4ClientForTests();
  resetGa4InternalTrafficForTests();
  window.gtag = vi.fn();
  // Bootstrap already resolved, anonymous — the baseline for every test
  // below except the dedicated bootstrap-race block, which overrides this
  // explicitly per case.
  useAuth.mockReturnValue({
    roles: [],
    isAuthenticated: false,
    isBootstrapping: false,
  });
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
    useAuth.mockReturnValue({
      roles: ['ADMIN'],
      isAuthenticated: true,
      isBootstrapping: false,
    });
    renderApp('/en');
    act(() => setGa4AnalyticsConsent(GA4_CONSENT_STATES.GRANTED));
    await flush();

    expect(pageViewCallsOf(window.gtag)).toHaveLength(0);
  });

  test('syncs the shared internal-traffic flag used by the event bridge', async () => {
    useAuth.mockReturnValue({
      roles: ['SUPER_ADMIN'],
      isAuthenticated: true,
      isBootstrapping: false,
    });
    renderApp('/en');
    await flush();
    expect(isGa4InternalTrafficSuppressed()).toBe(true);
  });

  test('a plain CUSTOMER role does not suppress', async () => {
    useAuth.mockReturnValue({
      roles: ['CUSTOMER'],
      isAuthenticated: true,
      isBootstrapping: false,
    });
    renderApp('/en');
    await flush();
    expect(isGa4InternalTrafficSuppressed()).toBe(false);
  });

  test('an unauthenticated visitor is never suppressed', async () => {
    useAuth.mockReturnValue({
      roles: [],
      isAuthenticated: false,
      isBootstrapping: false,
    });
    renderApp('/en');
    await flush();
    expect(isGa4InternalTrafficSuppressed()).toBe(false);
  });
});

describe('auth bootstrap safety (Step A8.1, brief §14-16)', () => {
  test('internal ADMIN, consent already granted before bootstrap resolves: no page_view during bootstrap, still none once resolved as ADMIN', async () => {
    stubConfigured();
    useAuth.mockReturnValue({
      roles: [],
      isAuthenticated: false,
      isBootstrapping: true,
    });
    const { rerender } = renderApp('/en');
    act(() => setGa4AnalyticsConsent(GA4_CONSENT_STATES.GRANTED));
    await flush();

    expect(pageViewCallsOf(window.gtag)).toHaveLength(0);
    expect(isGa4InternalTrafficSuppressed()).toBe(true);

    useAuth.mockReturnValue({
      roles: ['ADMIN'],
      isAuthenticated: true,
      isBootstrapping: false,
    });
    rerender(buildTree('/en'));
    await flush();

    expect(pageViewCallsOf(window.gtag)).toHaveLength(0);
    expect(isGa4InternalTrafficSuppressed()).toBe(true);
  });

  test('internal MODERATOR: same bootstrap-then-resolve sequence stays suppressed throughout', async () => {
    stubConfigured();
    useAuth.mockReturnValue({
      roles: [],
      isAuthenticated: false,
      isBootstrapping: true,
    });
    const { rerender } = renderApp('/en');
    act(() => setGa4AnalyticsConsent(GA4_CONSENT_STATES.GRANTED));
    await flush();
    expect(pageViewCallsOf(window.gtag)).toHaveLength(0);

    useAuth.mockReturnValue({
      roles: ['MODERATOR'],
      isAuthenticated: true,
      isBootstrapping: false,
    });
    rerender(buildTree('/en'));
    await flush();

    expect(pageViewCallsOf(window.gtag)).toHaveLength(0);
    expect(isGa4InternalTrafficSuppressed()).toBe(true);
  });

  test('normal public user: no page_view during bootstrap, exactly ONE for the current page once bootstrap resolves — no duplicate from the transition', async () => {
    stubConfigured();
    useAuth.mockReturnValue({
      roles: [],
      isAuthenticated: false,
      isBootstrapping: true,
    });
    const { rerender } = renderApp('/en');
    act(() => setGa4AnalyticsConsent(GA4_CONSENT_STATES.GRANTED));
    await flush();
    expect(pageViewCallsOf(window.gtag)).toHaveLength(0);

    useAuth.mockReturnValue({
      roles: [],
      isAuthenticated: false,
      isBootstrapping: false,
    });
    rerender(buildTree('/en'));
    await flush();

    const pageViewCalls = pageViewCallsOf(window.gtag);
    expect(pageViewCalls).toHaveLength(1);
    expect(pageViewCalls[0][2].page_location).toContain('/en');
  });

  test('normal public user: a subsequent eligible navigation after bootstrap resolves is still tracked', async () => {
    stubConfigured();
    const user = userEvent.setup();
    useAuth.mockReturnValue({
      roles: [],
      isAuthenticated: false,
      isBootstrapping: false,
    });
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

  test('ordering A — consent granted BEFORE bootstrap resolves: normal user gets one pageview, internal role gets none', async () => {
    stubConfigured();
    useAuth.mockReturnValue({
      roles: [],
      isAuthenticated: false,
      isBootstrapping: true,
    });
    const { rerender } = renderApp('/en');
    act(() => setGa4AnalyticsConsent(GA4_CONSENT_STATES.GRANTED)); // consent first
    await flush();
    expect(pageViewCallsOf(window.gtag)).toHaveLength(0);

    useAuth.mockReturnValue({
      roles: [],
      isAuthenticated: false,
      isBootstrapping: false,
    }); // bootstrap resolves after
    rerender(buildTree('/en'));
    await flush();
    expect(pageViewCallsOf(window.gtag)).toHaveLength(1);
  });

  test('ordering A — internal role variant: consent granted before bootstrap resolves as SUPPORT stays at zero', async () => {
    stubConfigured();
    useAuth.mockReturnValue({
      roles: [],
      isAuthenticated: false,
      isBootstrapping: true,
    });
    const { rerender } = renderApp('/en');
    act(() => setGa4AnalyticsConsent(GA4_CONSENT_STATES.GRANTED));
    await flush();

    useAuth.mockReturnValue({
      roles: ['SUPPORT'],
      isAuthenticated: true,
      isBootstrapping: false,
    });
    rerender(buildTree('/en'));
    await flush();
    expect(pageViewCallsOf(window.gtag)).toHaveLength(0);
  });

  test('ordering B — bootstrap resolves BEFORE consent is granted: normal user still gets exactly one pageview, no duplicate', async () => {
    stubConfigured();
    useAuth.mockReturnValue({
      roles: [],
      isAuthenticated: false,
      isBootstrapping: true,
    });
    const { rerender } = renderApp('/en');
    await flush();

    useAuth.mockReturnValue({
      roles: [],
      isAuthenticated: false,
      isBootstrapping: false,
    }); // bootstrap resolves first
    rerender(buildTree('/en'));
    await flush();
    expect(pageViewCallsOf(window.gtag)).toHaveLength(0); // consent still not granted

    act(() => setGa4AnalyticsConsent(GA4_CONSENT_STATES.GRANTED)); // consent after
    await flush();
    expect(pageViewCallsOf(window.gtag)).toHaveLength(1);
  });

  test('ordering B — internal role variant: bootstrap resolves as ADMIN before consent is granted stays at zero', async () => {
    stubConfigured();
    useAuth.mockReturnValue({
      roles: [],
      isAuthenticated: false,
      isBootstrapping: true,
    });
    const { rerender } = renderApp('/en');
    await flush();

    useAuth.mockReturnValue({
      roles: ['ADMIN'],
      isAuthenticated: true,
      isBootstrapping: false,
    });
    rerender(buildTree('/en'));
    await flush();

    act(() => setGa4AnalyticsConsent(GA4_CONSENT_STATES.GRANTED));
    await flush();
    expect(pageViewCallsOf(window.gtag)).toHaveLength(0);
  });

  test('no duplicate script/config across the bootstrap-then-resolve transition', async () => {
    stubConfigured();
    useAuth.mockReturnValue({
      roles: [],
      isAuthenticated: false,
      isBootstrapping: true,
    });
    const { rerender } = renderApp('/en');
    act(() => setGa4AnalyticsConsent(GA4_CONSENT_STATES.GRANTED));
    await flush();

    useAuth.mockReturnValue({
      roles: [],
      isAuthenticated: false,
      isBootstrapping: false,
    });
    rerender(buildTree('/en'));
    await flush();
    rerender(buildTree('/en'));
    await flush();

    expect(
      document.querySelectorAll('script[src*="googletagmanager.com"]'),
    ).toHaveLength(1);
    const configCalls = window.gtag.mock.calls.filter(
      ([verb]) => verb === 'config',
    );
    expect(configCalls).toHaveLength(1);
  });
});
