/**
 * prerender.mjs — Phase 20 (SEO) §1's architectural centerpiece.
 *
 * Desavii's frontend is a pure client-rendered Vite+React SPA
 * (`useDocumentMeta.js`'s own removed header comment, and every layout in
 * `routes/index.jsx`, confirm there is no SSR/react-helmet anywhere). A
 * crawler requesting any route gets `dist/index.html`'s bare shell —
 * `<div id="root"></div>` and a `<script>` tag — until React executes.
 * That is a real architecture problem for SEO-critical pages (Section 31:
 * "if raw HTML is still essentially an empty SPA shell on SEO-critical
 * pages, Phase 20 is NOT complete").
 *
 * Rather than a framework migration (Next.js) or a real SSR/hydration
 * rewrite — both far larger than this problem requires — this script
 * reuses the Playwright dependency already installed for E2E tests to
 * snapshot every indexable public route's fully-rendered `<head>` +
 * `<body>` at BUILD TIME, after `useSeo`'s effects and every page's data
 * fetch have resolved, and writes it to `dist/<route>/index.html`. This
 * is the industry-standard `react-snap`/`prerender-spa-plugin` pattern
 * for CSR apps that need crawlable HTML without adopting a server
 * runtime. The client bundle then boots normally on top of that markup
 * via `createRoot` (this app never calls `hydrateRoot` — a plain
 * client-side mount over prerendered markup is simpler and correct here
 * since there's no interactive state to preserve across the swap).
 *
 * USAGE
 *   npm run prerender
 *     — builds the app (`vite build`), then prerenders every route the
 *       real running API currently serves as published/public. The
 *       origin baked into canonical/OG/hreflang tags comes from
 *       `VITE_PUBLIC_SITE_URL` in `apps/web/.env` (the SAME variable
 *       `vite build` itself reads — Phase 20 §2's hard rule: never
 *       invent a production domain; an unset value falls back to the
 *       local dev origin, exactly like `seoConfig.js`'s runtime
 *       fallback).
 *   API_BASE_URL=... npm run prerender
 *     — override the API the manifest is built from.
 *   SKIP_BUILD=1 npm run prerender
 *     — reuse an already-built `dist/` (faster local iteration).
 *
 * REQUIRES: `apps/api` running and reachable at `API_BASE_URL`
 * (default `http://localhost:4000/api/v1`) — the manifest is built from
 * real inventory, never a hand-typed fixture list (Phase 20 §35's "use
 * actual data" rule applies here too). The static server binds to a
 * FIXED port (`PRERENDER_PORT`, default 5175 — the same local dev
 * preview origin `seoConfig.js`'s runtime fallback already uses) rather
 * than a random one, because the API's CORS allowlist
 * (`CORS_ALLOWED_ORIGINS`) must include it — the browser pages this
 * script drives make real cross-origin fetches to the API, same as any
 * other client. A local `.env` needs
 * `CORS_ALLOWED_ORIGINS=http://localhost:5173,http://localhost:5175`
 * (or whatever `PRERENDER_PORT` is set to) for this to succeed.
 *
 * PRODUCTION HOSTING NOTE (this repo doesn't control deployment): the
 * static host in front of `dist/` MUST implement the same resolution
 * order `staticServer.mjs` implements locally — serve an exact file
 * match first (including a prerendered route's own `index.html`), THEN
 * fall back to the root `index.html` for everything else. Netlify/
 * Vercel/S3+CloudFront/nginx `try_files` all support this natively; it
 * is a hosting configuration step, not something this repo can enforce.
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { chromium } from '@playwright/test';
import { fetchRouteManifest } from './lib/fetchRouteManifest.mjs';
import { startStaticServer } from './lib/staticServer.mjs';
import { generateSeoFiles } from './generateSeoFiles.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');

// Loads the SAME `.env` Vite itself reads for `vite build` (single source
// of truth — no separate, easy-to-desync env var name for this script vs.
// the app). Never overrides an already-exported shell env var.
dotenv.config({ path: path.join(ROOT, '.env') });

const API_BASE_URL = process.env.API_BASE_URL ?? 'http://localhost:4000/api/v1';
const PUBLIC_SITE_URL = process.env.VITE_PUBLIC_SITE_URL ?? '';
const PRERENDER_PORT = Number(process.env.PRERENDER_PORT ?? 5175);
// Matches the API's own PRERENDER_INTERNAL_TOKEN (rateLimiter.js's
// isTrustedInternalBuildRequest) — moves both this script's manifest
// fetches and the crawl's own in-page API calls onto the internal-build
// rate-limit tier instead of the public tier a real crawl (228 routes x
// several data fetches each, sequential by design) would otherwise
// exhaust in minutes. Unset by default: no header is sent, and the crawl
// falls back to the ordinary public tier exactly as before this existed.
const INTERNAL_BUILD_TOKEN = process.env.PRERENDER_INTERNAL_TOKEN ?? '';
const LOCALES = ['hy', 'ru', 'en'];
const NAV_TIMEOUT_MS = 20_000;
const READY_TIMEOUT_MS = 15_000;

function log(message) {
  // eslint-disable-next-line no-console -- this is a CLI build script, console output is the entire UI
  console.log(`[prerender] ${message}`);
}

function buildApp() {
  if (process.env.SKIP_BUILD === '1') {
    log('SKIP_BUILD=1 — reusing existing dist/');
    return;
  }
  log('Building app (vite build)...');
  execSync('npx vite build', {
    cwd: ROOT,
    stdio: 'inherit',
    env: {
      ...process.env,
      // Phase 20 §2: sourced from `.env` (or an already-exported shell
      // var) — never fabricated here. An empty value lets seoConfig.js's
      // own runtime fallback (and its loud console.warn) do the right
      // thing.
      VITE_PUBLIC_SITE_URL: PUBLIC_SITE_URL,
    },
  });
}

function writeSnapshot(localePath, html) {
  const dir = path.join(DIST, localePath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), html, 'utf8');
}

// staticServer.mjs deliberately prefers an existing `dist/<path>/index.html`
// over the root SPA shell (that's what lets a FINISHED prerendered site
// serve real content to crawlers). That resolution order is wrong for THIS
// script's own crawl: if a route already has a snapshot on disk from an
// earlier run — which happens whenever `SKIP_BUILD=1` skips the `vite
// build` step that would otherwise wipe `dist/` clean — the static server
// keeps re-serving that old snapshot to Playwright instead of the SPA
// shell, so the app never gets a fresh boot and the route can never
// self-heal. Deleting every manifest-targeted route directory before the
// crawl starts guarantees each route gets the real SPA shell on its first
// (and only) visit this run.
function cleanStaleSnapshots(manifest) {
  let removed = 0;
  manifest.forEach((entry) => {
    const dir = path.join(DIST, entry.path);
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
      removed += 1;
    }
  });
  if (removed > 0) {
    log(`Cleared ${removed} stale snapshot(s) from a previous run.`);
  }
}

async function prerenderRoute(page, baseUrl, entry) {
  const url = `${baseUrl}/${entry.path}`;

  await page.goto(url, {
    waitUntil: 'domcontentloaded',
    timeout: NAV_TIMEOUT_MS,
  });

  // useSeo() only sets <link rel="canonical"> once a page's own data
  // (category/destination/listing/company) has resolved — for the
  // handful of pages with no async dependency (Home, CMS) it's set on
  // first render. Either way, its presence is this app's own real
  // signal that the page's SEO-critical content is ready to snapshot,
  // not an arbitrary fixed delay.
  const ready = await page
    .waitForFunction(
      () => Boolean(document.querySelector('link[rel="canonical"]')),
      { timeout: READY_TIMEOUT_MS },
    )
    .then(() => true)
    .catch(() => false);

  if (!ready) {
    throw new Error(
      `no <link rel="canonical"> appeared within ${READY_TIMEOUT_MS}ms`,
    );
  }

  await page
    .waitForLoadState('networkidle', { timeout: READY_TIMEOUT_MS })
    .catch(() => {});

  const html = await page.content();
  writeSnapshot(entry.path, html);
}

async function main() {
  buildApp();

  if (!fs.existsSync(path.join(DIST, 'index.html'))) {
    throw new Error(
      `prerender: ${DIST}/index.html not found — run "vite build" first (or unset SKIP_BUILD).`,
    );
  }

  log(`Fetching route manifest from ${API_BASE_URL}...`);
  const manifest = await fetchRouteManifest({
    apiBaseUrl: API_BASE_URL,
    locales: LOCALES,
    internalToken: INTERNAL_BUILD_TOKEN,
  });
  log(`${manifest.length} routes to prerender (${LOCALES.length} locales).`);

  cleanStaleSnapshots(manifest);

  const { port, close } = await startStaticServer(DIST, {
    port: PRERENDER_PORT,
  });
  const baseUrl = `http://localhost:${port}`;
  log(`Serving dist/ at ${baseUrl}`);

  const browser = await chromium.launch();

  let succeeded = 0;
  const failures = [];
  // eslint-disable-next-line no-restricted-syntax -- routes must be visited sequentially, one page at a time
  for (const entry of manifest) {
    // 2026 SEO audit: a fresh page (not one shared across all 228 routes)
    // per crawl — a page that ever runs client code with a real side
    // effect (e.g. a component that injects its own `<script>` tag into
    // `document.head`, as `getStripe()` legitimately does once a real
    // payment flow renders) must never let that leak into an unrelated
    // later route's own snapshot. `page.goto()` reloads the document, but
    // only a fresh page/context guarantees no residual head/DOM state
    // survives across crawls.
    // eslint-disable-next-line no-await-in-loop -- sequential by design, see above
    const page = await browser.newPage();

    page.on('requestfailed', (request) => {
      console.error(
        `[prerender][requestfailed] ${entry.path} ${request.method()} ${request.url()} :: ${request.failure()?.errorText ?? 'unknown error'}`,
      );
    });

    page.on('response', (response) => {
      if (response.status() >= 400) {
        console.error(
          `[prerender][http ${response.status()}] ${entry.path} ${response.request().method()} ${response.url()}`,
        );
      }
    });

    page.on('pageerror', (error) => {
      console.error(`[prerender][pageerror] ${entry.path} :: ${error.message}`);
    });

    page.on('console', (message) => {
      if (message.type() === 'error') {
        console.error(
          `[prerender][console.error] ${entry.path} :: ${message.text()}`,
        );
      }
    });
    if (INTERNAL_BUILD_TOKEN) {
      // Applies to every request the page issues, including the app's own
      // cross-origin fetches to API_BASE_URL — same rate-limit-tier
      // reasoning as the manifest fetch above, just for the requests React
      // itself makes while rendering each crawled route.
      // eslint-disable-next-line no-await-in-loop -- sequential by design, see above
      await page.setExtraHTTPHeaders({
        'X-Internal-Build-Token': INTERNAL_BUILD_TOKEN,
      });
    }
    try {
      // eslint-disable-next-line no-await-in-loop -- sequential by design, see above
      await prerenderRoute(page, baseUrl, entry);
      succeeded += 1;
    } catch (err) {
      failures.push({ path: entry.path, message: err.message });
    } finally {
      // eslint-disable-next-line no-await-in-loop -- sequential by design, see above
      await page.close();
    }
  }

  await browser.close();
  await close();

  await generateSeoFiles({ manifest });

  log(`Prerendered ${succeeded}/${manifest.length} routes.`);
  if (failures.length > 0) {
    log(`${failures.length} route(s) FAILED:`);
    failures.forEach((failure) => log(`  ${failure.path}: ${failure.message}`));
    process.exitCode = 1;
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console -- CLI script fatal-error path
  console.error('[prerender] Fatal error:', err);
  process.exitCode = 1;
});
