/**
 * buildSitemap — Phase 20 (SEO) §19. Pure XML string builders (no I/O),
 * so they're directly unit-testable from Vitest and reusable from
 * `generateSeoFiles.mjs`. Groups the flat, locale-expanded route
 * manifest (`fetchRouteManifest.mjs`) back by `localeFreePath` so every
 * `<url>` entry can carry a full `xhtml:link rel="alternate"` set — the
 * sitemap-level equivalent of `useSeo`'s hreflang tags.
 *
 * A single `sitemap.xml` is correct at this marketplace's real URL count
 * (low hundreds — comment at the call site in `generateSeoFiles.mjs`
 * shows the actual count). A sitemap INDEX + segmented per-type sitemaps
 * only earns its complexity once a site is within reach of the 50,000-
 * URL-per-file hard limit; introducing that split now would be
 * unrequested complexity for a count this low (YAGNI), not a genuine
 * architecture gap — revisit if/when the real count approaches ~10,000.
 */

function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * @param {{path: string, localeFreePath: string, lastmod: string|null}[]} manifest
 * @param {string} origin - absolute origin, no trailing slash.
 * @param {string} defaultLocale - the locale `x-default` should point at.
 */
export function buildSitemapXml(manifest, origin, defaultLocale) {
  const byLocaleFreePath = new Map();
  manifest.forEach((entry) => {
    if (!byLocaleFreePath.has(entry.localeFreePath)) {
      byLocaleFreePath.set(entry.localeFreePath, []);
    }
    byLocaleFreePath.get(entry.localeFreePath).push(entry);
  });

  const urlEntries = manifest.map((entry) => {
    const siblings = byLocaleFreePath.get(entry.localeFreePath);
    const alternates = siblings
      .map(
        (sibling) =>
          `    <xhtml:link rel="alternate" hreflang="${escapeXml(sibling.path.split('/')[0])}" href="${escapeXml(`${origin}/${sibling.path}`)}"/>`,
      )
      .join('\n');
    const defaultSibling =
      siblings.find(
        (sibling) => sibling.path.split('/')[0] === defaultLocale,
      ) ?? siblings[0];
    const xDefault = `    <xhtml:link rel="alternate" hreflang="x-default" href="${escapeXml(`${origin}/${defaultSibling.path}`)}"/>`;
    const lastmod = entry.lastmod
      ? `\n    <lastmod>${escapeXml(new Date(entry.lastmod).toISOString())}</lastmod>`
      : '';

    return (
      `  <url>\n` +
      `    <loc>${escapeXml(`${origin}/${entry.path}`)}</loc>\n` +
      `${alternates}\n${xDefault}${lastmod}\n` +
      `  </url>`
    );
  });

  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n` +
    `${urlEntries.join('\n')}\n` +
    `</urlset>\n`
  );
}

/**
 * Private-area path prefixes (locale-free, matching `routes/index.jsx`'s
 * real `RequireAuth`-gated groups) that are never publicly reachable
 * without authentication — disallowed for crawl-budget reasons, not as
 * the access-control mechanism (Phase 20 §20: real protection is
 * `RequireAuth`/`RequireRole`; robots.txt only discourages a crawler
 * from spending budget on pages it can never legitimately render).
 * Search and the auth pages (login/register) are deliberately NOT
 * listed here — they stay crawlable so Google can execute the client
 * bundle and see their `noindex` meta tag itself (Phase 20 §3's own
 * design already means indexation is decided there, not by blocking the
 * crawl); disallowing them here would instead risk an unindexed URL
 * with no snippet ever showing up, the opposite of the goal.
 */
const DISALLOWED_PATH_SEGMENTS = [
  'account',
  'partner',
  'manager',
  'marketing',
  'admin',
];

/**
 * 2026 SEO audit: `auth/reset-password/:token` is the one route left
 * under the otherwise-deliberately-crawlable `/auth` prefix (see this
 * function's own comment above) whose URL itself carries a real,
 * single-use secret — unlike login/register/forgot-password, there is no
 * "let Google see the noindex tag" upside worth the token being fetched
 * by a crawler at all. Listed by its own full path rather than folded
 * into `DISALLOWED_PATH_SEGMENTS`, since that array disallows an entire
 * prefix and `/auth/login`/`/auth/register` must stay crawlable.
 */
const DISALLOWED_FULL_PATHS = ['booking/checkout', 'auth/reset-password'];

export function buildRobotsTxt(origin) {
  const disallowLines = [
    ...DISALLOWED_PATH_SEGMENTS.map((segment) => `Disallow: /*/${segment}`),
    ...DISALLOWED_FULL_PATHS.map((path) => `Disallow: /*/${path}`),
  ].join('\n');
  return (
    `User-agent: *\n` +
    `Allow: /\n` +
    `${disallowLines}\n\n` +
    `Sitemap: ${origin}/sitemap.xml\n`
  );
}

export default { buildSitemapXml, buildRobotsTxt };
