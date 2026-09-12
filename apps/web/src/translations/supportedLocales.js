/**
 * Locale constants — Pass 9 (P1 locale/i18n remediation).
 *
 * Deliberately its own side-effect-free module, split out of `i18n.js`.
 * Before this, `routes/index.jsx` imported `SUPPORTED_LOCALES`/
 * `DEFAULT_LOCALE` directly from `i18n.js` — a plain named-export import,
 * but ES modules evaluate a module's ENTIRE top-level code on import, so
 * this also silently re-ran `i18n.js`'s own `.use(Backend).use(
 * LanguageDetector).use(initReactI18next).init(...)` call every time
 * `routes/index.jsx` (or anything importing it, e.g. `App.jsx`) was
 * loaded. In production this is harmless (`main.jsx` already runs that
 * exact init first, and i18next's `.init()` on an already-initialized
 * instance is idempotent-ish), but inside the Vitest test environment it
 * collided with `tests/setup.js`'s own deliberate, separate,
 * inline-resources i18n configuration (no HTTP backend, since there is
 * no real server to serve `/locales/*.json` from in jsdom) — whichever
 * `.init()` call's module happened to load second silently won,
 * non-deterministically re-pointing the shared i18next singleton at a
 * `Backend` that can never actually resolve in that environment. Found
 * via a real, reproducible test failure once a route-locale-sync test
 * needed `i18n.language` to actually reach a non-default locale.
 *
 * `routes/index.jsx` now imports these two constants from here (no
 * side effect) and the shared `i18next` singleton directly from the
 * `i18next` package itself (already configured by whichever of
 * `main.jsx` (production) or `tests/setup.js` (tests) ran first — the
 * same instance `i18n.js` configures, since it's a true package-level
 * singleton) — never re-triggering `i18n.js`'s own init a second time.
 */

export const SUPPORTED_LOCALES = ['hy', 'ru', 'en'];
export const DEFAULT_LOCALE = 'hy';
