/**
 * Raw-HTML SEO verification (Phase 20 §31/§346). Every other E2E spec in
 * this suite drives a real browser against the DEV server and asserts on
 * the post-render DOM — exactly what a human sees, never what a crawler
 * that doesn't execute JavaScript would receive. This spec is the
 * opposite: it fetches the actual bytes `npm run prerender` wrote to
 * `dist/`, with NO browser/JS execution at all (Playwright's `request`
 * fixture, not `page`), so a passing assertion here is real proof the
 * raw HTML itself — not the hydrated DOM — carries the SEO-critical tags.
 *
 * REQUIRES `npm run prerender` to have already produced `dist/` (this
 * spec fails fast with a clear message if it hasn't, rather than silently
 * testing against a stale or missing build). It manages its own static
 * server via `scripts/lib/staticServer.mjs` — the SAME server the
 * prerender pipeline itself uses — instead of the dev server
 * `playwright.config.js`'s global `webServer` starts, since dev-mode HTML
 * is exactly what this spec must NOT be accidentally testing against.
 */

import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test, expect } from './fixtures.js';
import { startStaticServer } from '../../scripts/lib/staticServer.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const DIST = path.join(ROOT, 'dist');

let server;
let baseUrl;

test.beforeAll(async () => {
  if (!fs.existsSync(path.join(DIST, 'index.html'))) {
    throw new Error(
      'seoRawHtml.spec.js: dist/ not found — run "npm run prerender" before this spec.',
    );
  }
  const started = await startStaticServer(DIST, { port: 0 });
  server = started;
  baseUrl = `http://localhost:${started.port}`;
});

test.afterAll(async () => {
  await server?.close();
});

async function fetchRawHtml(request, route) {
  const response = await request.get(`${baseUrl}/${route}`);
  return { response, html: await response.text() };
}

const ROUTES_TO_CHECK = [
  { route: 'hy', label: 'home (hy)' },
  { route: 'en', label: 'home (en)' },
  { route: 'ru', label: 'home (ru)' },
  { route: 'en/categories/hotels', label: 'category (en)' },
  { route: 'ru/categories/hotels', label: 'category (ru)' },
  { route: 'en/about', label: 'static page (en)' },
];

ROUTES_TO_CHECK.forEach(({ route, label }) => {
  test(`raw HTML for ${label} carries real SEO metadata, no JS execution required`, async ({
    request,
  }) => {
    const { response, html } = await fetchRawHtml(request, route);

    expect(response.status()).toBe(200);

    // Real, non-empty <title> — not the bare app-shell default.
    const titleMatch = html.match(/<title>([^<]+)<\/title>/);
    expect(titleMatch).not.toBeNull();
    expect(titleMatch[1].trim().length).toBeGreaterThan(0);

    // Canonical must be absolute and under the real production domain.
    const canonicalMatch = html.match(/<link rel="canonical" href="([^"]+)"/);
    expect(canonicalMatch).not.toBeNull();
    expect(canonicalMatch[1]).toMatch(/^https:\/\/desavii\.com\//);

    // A real meta description, not an empty/missing tag.
    const descriptionMatch = html.match(
      /<meta name="description" content="([^"]*)"/,
    );
    expect(descriptionMatch).not.toBeNull();
    expect(descriptionMatch[1].trim().length).toBeGreaterThan(0);

    // Self-referencing hreflang plus x-default, per Phase 20's hreflang rule.
    expect(html).toContain('hreflang="hy"');
    expect(html).toContain('hreflang="ru"');
    expect(html).toContain('hreflang="en"');
    expect(html).toContain('hreflang="x-default"');

    // Meaningful page content actually landed in the snapshot — not the
    // empty SPA shell (`<div id="root"></div>` with nothing inside it,
    // ~400 bytes total). A prerendered page's full markup runs into the
    // tens of thousands of bytes once header/footer/content render.
    expect(html).not.toContain('<div id="root"></div>');
    expect(html.length).toBeGreaterThan(5000);

    // Never a leaked dev-mode shell (the exact bug this spec guards against).
    expect(html).not.toContain('@vite/client');
    expect(html).not.toContain('/src/main.jsx');
  });
});

test('2026 SEO/performance audit: non-payment pages never load js.stripe.com when PAYMENTS_ENABLED is false', async ({
  request,
}) => {
  // Regression test for a real, root-caused bug: `@stripe/stripe-js`'s
  // default entry point self-injects its <script> tag on mere import
  // ("Execute our own script injection after a tick", its own comment) —
  // since `getStripe.js` is bundled into the shared chunk every public
  // page loads, Home and Listing Detail were silently fetching
  // js.stripe.com even though neither ever renders payment UI. Fixed by
  // importing from `@stripe/stripe-js/pure` instead (same `loadStripe()`
  // API, no auto-injection). This checks the raw prerendered bytes, the
  // same evidence that caught the bug in the first place.
  const homeHtml = (await fetchRawHtml(request, 'en')).html;
  expect(homeHtml).not.toContain('js.stripe.com');

  const enListingDirs = fs
    .readdirSync(path.join(DIST, 'en', 'listings'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory());
  expect(enListingDirs.length).toBeGreaterThan(0);
  const listingHtml = (
    await fetchRawHtml(request, `en/listings/${enListingDirs[0].name}`)
  ).html;
  expect(listingHtml).not.toContain('js.stripe.com');
});

test('a listing page raw HTML includes a JSON-LD structured-data block', async ({
  request,
}) => {
  // Reads the real manifest-driven dist/ output rather than hand-typing a
  // listing slug — picks whichever listing route the prerender actually
  // produced, so this test never silently skips if demo data changes.
  const enListingDirs = fs
    .readdirSync(path.join(DIST, 'en', 'listings'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory());
  expect(enListingDirs.length).toBeGreaterThan(0);

  const { response, html } = await fetchRawHtml(
    request,
    `en/listings/${enListingDirs[0].name}`,
  );

  expect(response.status()).toBe(200);
  // useSeo.js/useSiteJsonLd.js tag every injected block with
  // data-seo-source="site" (Organization/WebSite, present on every page)
  // or "page" (this route's own schema) — the un-attributed regex this
  // assertion used to have never matched either real tag, since both
  // always carry that attribute. Match it explicitly and require the
  // PAGE-scoped block specifically: this test is about a listing page's
  // own structured data, not the site-wide Organization block every
  // route also carries.
  const ldJsonMatch = html.match(
    /<script type="application\/ld\+json" data-seo-source="page">([\s\S]*?)<\/script>/,
  );
  expect(ldJsonMatch).not.toBeNull();
  const parsed = JSON.parse(ldJsonMatch[1]);
  expect(parsed['@context']).toBe('https://schema.org');
  expect(typeof parsed.name).toBe('string');
  expect(parsed.name.length).toBeGreaterThan(0);
});

test('sitemap.xml and robots.txt are served as real static files', async ({
  request,
}) => {
  const sitemapResponse = await request.get(`${baseUrl}/sitemap.xml`);
  expect(sitemapResponse.status()).toBe(200);
  const sitemapXml = await sitemapResponse.text();
  expect(sitemapXml).toContain('<urlset');
  expect(sitemapXml).toContain('https://desavii.com/');

  const robotsResponse = await request.get(`${baseUrl}/robots.txt`);
  expect(robotsResponse.status()).toBe(200);
  const robotsTxt = await robotsResponse.text();
  expect(robotsTxt).toContain('Sitemap: https://desavii.com/sitemap.xml');
});

/**
 * Pass 9 (P1 locale/i18n remediation, brief §30 H/I/J) — the raw
 * prerendered HTML body itself, not just `<title>`/meta/hreflang, must
 * already be in the right language. The "/hy can render in English" bug
 * this pass root-caused only ever affected CLIENT-SIDE navigation (see
 * `App.test.jsx`'s own regression suite) — `npm run prerender` visits
 * every route via a fresh, isolated Playwright page (`prerender.mjs`'s
 * own "one page per route" design), so it was never actually at risk.
 * These assertions exist to make that fact a guarantee, not an
 * assumption: if a future change ever regresses prerender-time locale
 * resolution, this is what would catch a raw HY/RU page silently
 * shipping English body text to a crawler.
 */
test('HY prerendered home body is Armenian, not English', async ({
  request,
}) => {
  const { html } = await fetchRawHtml(request, 'hy');
  expect(html).toContain('Բացահայտեք Հայաստանը');
  expect(html).not.toContain('Discover Armenia');
});

test('RU prerendered home body is Russian, not English', async ({
  request,
}) => {
  const { html } = await fetchRawHtml(request, 'ru');
  expect(html).toContain('Откройте Армению');
  expect(html).not.toContain('Discover Armenia');
});

test('EN prerendered home body is English', async ({ request }) => {
  const { html } = await fetchRawHtml(request, 'en');
  expect(html).toContain('Discover Armenia');
});

test('a representative category page carries its own locale body text (not the SPA shell, not another locale)', async ({
  request,
}) => {
  const hy = (await fetchRawHtml(request, 'hy/categories/hotels')).html;
  const en = (await fetchRawHtml(request, 'en/categories/hotels')).html;
  const ru = (await fetchRawHtml(request, 'ru/categories/hotels')).html;

  expect(hy).toContain('Հյուրանոցներ');
  expect(en).toContain('Hotels');
  expect(ru).toContain('Отели');
});

test('an unknown route falls back to the SPA shell (200, real built assets), not a broken response', async ({
  request,
}) => {
  const { response, html } = await fetchRawHtml(
    request,
    'en/this-route-does-not-exist-anywhere',
  );

  // No route in the manifest matches this path, so the static server's
  // documented fallback (staticServer.mjs) serves the root SPA shell with
  // a 200 — client-side routing then resolves it to NotFoundPage, which
  // sets its own noindex tag once JS runs (that step is out of reach for
  // a raw-HTML fetch and is covered instead by NotFoundPage.test.jsx).
  expect(response.status()).toBe(200);
  expect(html).toMatch(/<script type="module" crossorigin src="\/assets\//);
  expect(html).not.toContain('@vite/client');
});
