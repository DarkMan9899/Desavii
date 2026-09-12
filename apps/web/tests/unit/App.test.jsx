/**
 * Sprint 1 scope: proves the component-test harness itself works
 * end-to-end (jsdom environment, React Testing Library, the provider
 * tree, react-router, i18next) before any real feature exists to test —
 * the frontend equivalent of apps/api's AppError.test.js harness proof.
 */

import { describe, test, expect, afterEach, beforeAll } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import i18n from 'i18next';
import App from '../../src/app/App.jsx';

// Pre-warms the real `React.lazy(() => import('../pages/HomePage.jsx'))`
// chunk (routes/index.jsx) once, before any test's own timing-sensitive
// `waitFor` starts. Without this, whichever test happens to be the FIRST
// in the whole Vitest run to render a locale-prefixed route pays that
// dynamic import()'s real, cold module-transform cost inline — directly
// observed to occasionally exceed even a generous `waitFor` timeout when
// the full suite runs under heavy parallel load (many other test files'
// workers contending for the same CPU), while every later test in the
// same file benefits from the now-resolved import() promise. This has
// nothing to do with the locale-sync fix itself (a real browser resolves
// an already-bundled route chunk far faster) — it is purely this test
// file's own responsibility to make its assertions deterministic
// regardless of what else the test runner is doing concurrently.
beforeAll(async () => {
  await import('../../src/pages/HomePage.jsx');
});

describe('App bootstrap (FRONTEND_ARCHITECTURE.md §3-4)', () => {
  test('renders the placeholder page under the default locale redirect', async () => {
    window.history.pushState({}, '', '/');
    render(<App />);

    await waitFor(() => {
      expect(window.location.pathname).toBe('/hy');
    });
  });

  test('renders a 404 for an unsupported locale segment', async () => {
    window.history.pushState({}, '', '/xx');
    render(<App />);

    // NotFoundPage was upgraded off literal "404" text to a translated
    // EmptyState (Application Foundation phase) — the test harness's
    // i18n instance defaults to Armenian (tests/setup.js), so this
    // asserts the real translated copy, not a hardcoded English string.
    await waitFor(() => {
      expect(screen.getByText('Էջը չի գտնվել')).toBeInTheDocument();
    });
  });
});

/**
 * Pass 9 (P1 locale/i18n remediation) — regression coverage for the
 * root-caused "/hy can render in English" bug. `LocaleValidator`
 * (routes/index.jsx) previously only synced `document.documentElement
 * .lang` from the route param — nothing ever called
 * `i18n.changeLanguage()` on a route change, so i18next's own active
 * language stayed whatever it was resolved to ONCE, at initial boot
 * (correctly, from the URL, on a real full page load). Any CLIENT-SIDE
 * navigation to a different locale prefix — not just a fresh load —
 * left the URL and `<html lang>` correct while every translated string
 * silently kept rendering in the OLD language. `window.history
 * .pushState` + a `popstate` dispatch (below) is the same client-side,
 * no-reload transition a real `<Link to="/hy/...">` click produces —
 * this is deliberately NOT a fresh `render(<App/>)` per case, since a
 * fresh render's own initial-boot resolution would never have exercised
 * the bug at all.
 */
describe('Pass 9 — route locale is authoritative on every navigation, not just initial boot', () => {
  afterEach(() => {
    cleanup();
  });

  function navigateClientSide(path) {
    window.history.pushState({}, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }

  // A generous, explicit timeout on every `waitFor` in this block: the
  // first render in a given test file has to resolve `HomePage`'s real
  // `React.lazy` dynamic import() cold (never pre-warmed), which can
  // exceed Testing Library's default 1000ms `waitFor` window in a jsdom
  // environment — observed directly: these assertions were flaky in
  // isolation (failing alone, passing once a prior test in the same
  // file had already warmed the same chunk) at the default timeout, and
  // stable at this one. Not a production concern — a real browser
  // resolves an already-bundled route chunk far faster than a cold
  // Vitest transform.
  const WAIT_OPTS = { timeout: 5000 };

  test('A: an active EN language + a direct client-side navigation to /hy renders Armenian, never English', async () => {
    window.history.pushState({}, '', '/en');
    render(<App />);
    await waitFor(() => expect(i18n.language).toBe('en'), WAIT_OPTS);

    navigateClientSide('/hy');

    await waitFor(() => {
      expect(i18n.language).toBe('hy');
      expect(document.documentElement.lang).toBe('hy');
    }, WAIT_OPTS);
    // The real, translated Home heading — not a raw i18n key, not English.
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
        'Բացահայտեք Հայաստանը',
      );
    }, WAIT_OPTS);
  });

  test('B: an active HY language + a direct client-side navigation to /ru renders Russian', async () => {
    window.history.pushState({}, '', '/hy');
    render(<App />);
    await waitFor(() => expect(i18n.language).toBe('hy'), WAIT_OPTS);

    navigateClientSide('/ru');

    await waitFor(() => {
      expect(i18n.language).toBe('ru');
      expect(document.documentElement.lang).toBe('ru');
    }, WAIT_OPTS);
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
        'Откройте Армению',
      );
    }, WAIT_OPTS);
  });

  test('C: a fresh /en load renders English from the first frame', async () => {
    window.history.pushState({}, '', '/en');
    render(<App />);

    await waitFor(() => {
      expect(i18n.language).toBe('en');
      expect(document.documentElement.lang).toBe('en');
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
        'Discover Armenia',
      );
    }, WAIT_OPTS);
  });

  test('E: a refresh-equivalent (fresh render) at /ru/search preserves the URL locale', async () => {
    window.history.pushState({}, '', '/ru/search');
    render(<App />);

    await waitFor(() => {
      expect(window.location.pathname).toBe('/ru/search');
      expect(i18n.language).toBe('ru');
      expect(document.documentElement.lang).toBe('ru');
    }, WAIT_OPTS);
  });

  test('F: browser back/forward through a client-side locale change keeps i18n in sync with the URL', async () => {
    window.history.pushState({}, '', '/en');
    render(<App />);
    await waitFor(() => expect(i18n.language).toBe('en'), WAIT_OPTS);

    navigateClientSide('/hy');
    await waitFor(() => expect(i18n.language).toBe('hy'), WAIT_OPTS);

    // Real browser Back — a genuine popstate to the PREVIOUS history entry.
    window.history.back();
    window.dispatchEvent(new PopStateEvent('popstate'));
    await waitFor(() => {
      expect(window.location.pathname).toBe('/en');
      expect(i18n.language).toBe('en');
    }, WAIT_OPTS);

    window.history.forward();
    window.dispatchEvent(new PopStateEvent('popstate'));
    await waitFor(() => {
      expect(window.location.pathname).toBe('/hy');
      expect(i18n.language).toBe('hy');
    }, WAIT_OPTS);
  });
});
