/**
 * i18next configuration.
 *
 * Implements FRONTEND_ARCHITECTURE.md §16: three supported locales
 * (hy/ru/en), namespace-per-module-family, lazy-loaded via
 * i18next-http-backend (never bundling every locale's every namespace
 * into the initial JS payload), with the platform default (Armenian)
 * as the fallback for any missing key — never a raw key name or blank
 * string, matching API_SPECIFICATION.md §15's identical fallback rule
 * on the server side.
 *
 * Sprint 1 scope: wiring + the "common" namespace only (a few
 * placeholder keys, enough to prove the pipeline — see
 * src/translations/{hy,ru,en}/common.json). No real page content exists
 * yet to translate.
 */

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import Backend from 'i18next-http-backend';
import LanguageDetector from 'i18next-browser-languagedetector';
import { SUPPORTED_LOCALES, DEFAULT_LOCALE } from './supportedLocales.js';

// Pass 9 — re-exported for existing callers; `supportedLocales.js` is
// now the canonical source (see its own header for why the split
// happened). Prefer importing directly from there in new code so
// importing a plain constant never has to pull in this file's own
// `i18n.use(...).init(...)` side effect.
export { SUPPORTED_LOCALES, DEFAULT_LOCALE };

// Pass 9 (P1 locale/i18n remediation) — guarded against a real,
// reproduced double-init collision: `SUPPORTED_LOCALES`/`DEFAULT_LOCALE`
// (and `i18n` itself, from `ErrorBoundary.jsx`) are imported by many
// files across the app, and importing even just a named export from an
// ES module still evaluates that module's ENTIRE top-level code —
// including this `.init()` call. In production that happens once
// (`main.jsx` is the first thing to import this file, before anything
// else does), so it was never visibly harmful. Inside the Vitest test
// environment, `tests/setup.js` deliberately configures this SAME
// `i18next` package singleton with its own inline-resources, no-network
// setup FIRST (there is no real server behind jsdom to serve
// `/locales/*.json` from) — and every test that transitively imports
// ANY of `i18n.js`'s many consumers was silently re-running the REAL
// `Backend`+`LanguageDetector` init a second time, discarding that
// working test configuration for one that can never actually resolve a
// namespace fetch in jsdom. `i18n.isInitialized` guards against this:
// once the singleton is configured (by whichever of `main.jsx` or
// `tests/setup.js` runs first), a later import of this file is a no-op
// here, exactly the idempotency real production code already assumed
// this had.
if (!i18n.isInitialized) {
  i18n
    .use(Backend)
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
      supportedLngs: SUPPORTED_LOCALES,
      fallbackLng: DEFAULT_LOCALE,
      ns: ['common'],
      defaultNS: 'common',
      backend: {
        // Namespace files live in `public/locales/` (Vite copies
        // `public/` verbatim to `dist/` at build time, and serves it
        // as-is in dev) — lazy-loaded per FRONTEND_ARCHITECTURE.md
        // §16.3, never bundled upfront. Phase 20 (SEO) fix: this
        // previously pointed at `/src/translations/{{lng}}/{{ns}}.json`,
        // a dev-server-only path (Vite serves raw `src/` files in dev,
        // but never copies them to `dist/`) — every production build
        // silently served raw i18n keys instead of translated text.
        // `public/locales/` is the one path that resolves identically
        // in dev, `vite preview`, and a real production deployment.
        loadPath: '/locales/{{lng}}/{{ns}}.json',
      },
      detection: {
        // The URL locale segment (FRONTEND_ARCHITECTURE.md §4.1) is the
        // authoritative signal — `routes/index.jsx`'s `LocaleValidator`
        // makes this explicit and unconditional on every navigation
        // (Pass 9), not just this passive detector's own best-effort
        // guess at the very first, pre-route resolution.
        order: ['path', 'navigator'],
      },
      interpolation: {
        escapeValue: false, // React already escapes
      },
      react: {
        useSuspense: false,
      },
    });
}

export default i18n;
