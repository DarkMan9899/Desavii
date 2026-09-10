/**
 * fetchRouteManifest — Phase 20 (SEO) §31/§40. Builds the full list of
 * indexable, locale-prefixed route paths the prerender pipeline (and,
 * later, the sitemap generator) both need — one shared source of truth
 * instead of two hand-maintained route lists.
 *
 * Every entry here mirrors `routes/index.jsx`'s real `PublicLayout`
 * routes MINUS Search (deliberately `noindex` — Phase 20 §9's crawl-trap
 * decision) and every authenticated route (Auth/CustomerAccount/Partner/
 * Admin/booking-checkout — all `noindex` via `useNoIndex`, never
 * prerendered). Data comes from the real running API (categories,
 * destinations, companies, published listings, published blog posts) —
 * never a hand-typed fixture list, so the manifest always reflects actual
 * inventory.
 */

const STATIC_PATHS = [
  '',
  'companies',
  'about',
  'contact',
  'faq',
  'help',
  'become-a-partner',
  'blog',
];

// Matches rateLimiter.js's `isTrustedInternalBuildRequest` — presenting
// this header (only ever set from PRERENDER_INTERNAL_TOKEN, a local/CI
// build secret) moves this script's own manifest fetches onto the
// internal-build rate-limit tier instead of the public one, the same way
// prerender.mjs's Playwright crawl does for the pages it renders. Empty
// by default, which sends no header and changes nothing.
function internalBuildHeaders(internalToken) {
  return internalToken ? { 'X-Internal-Build-Token': internalToken } : {};
}

async function fetchJson(apiBaseUrl, path, internalToken) {
  const res = await fetch(`${apiBaseUrl}${path}`, {
    headers: internalBuildHeaders(internalToken),
  });
  if (!res.ok) {
    throw new Error(`fetchRouteManifest: ${path} responded ${res.status}`);
  }
  const body = await res.json();
  return body.data;
}

/** Pages through a cursor-paginated `GET` endpoint, collecting every row. */
async function fetchAllPages(
  apiBaseUrl,
  basePath,
  internalToken,
  extraParams = '',
) {
  const rows = [];
  let cursor = null;
  for (;;) {
    const params = new URLSearchParams(extraParams);
    params.set('limit', '100');
    if (cursor) params.set('cursor', cursor);
    // eslint-disable-next-line no-await-in-loop -- pages must be fetched sequentially, each one's cursor depends on the previous response
    const res = await fetch(`${apiBaseUrl}${basePath}?${params.toString()}`, {
      headers: internalBuildHeaders(internalToken),
    });
    if (!res.ok) {
      throw new Error(
        `fetchRouteManifest: ${basePath} responded ${res.status}`,
      );
    }
    // eslint-disable-next-line no-await-in-loop -- see above
    const body = await res.json();
    rows.push(...body.data);
    const nextCursor = body.meta?.next_cursor ?? null;
    if (!nextCursor) break;
    cursor = nextCursor;
  }
  return rows;
}

/**
 * Pages through `GET /blog/posts` — a numeric-offset `cursor` + `meta.total`
 * shape (`BlogController`'s own, not the opaque `meta.next_cursor` shape
 * `fetchAllPages` above expects), so it gets its own small loop rather than
 * forcing a second pagination contract onto that shared helper.
 */
async function fetchAllBlogPosts(apiBaseUrl, internalToken) {
  const rows = [];
  let cursor = 0;
  for (;;) {
    const params = new URLSearchParams({ limit: '50', cursor: String(cursor) });
    // eslint-disable-next-line no-await-in-loop -- each page's next offset depends on the previous response's total
    const res = await fetch(`${apiBaseUrl}/blog/posts?${params.toString()}`, {
      headers: internalBuildHeaders(internalToken),
    });
    if (!res.ok) {
      throw new Error(
        `fetchRouteManifest: /blog/posts responded ${res.status}`,
      );
    }
    // eslint-disable-next-line no-await-in-loop -- see above
    const body = await res.json();
    rows.push(...body.data);
    cursor += body.data.length;
    if (body.data.length === 0 || cursor >= (body.meta?.total ?? cursor)) break;
  }
  return rows;
}

/**
 * @param {object} params
 * @param {string} params.apiBaseUrl - e.g. `http://localhost:4000/api/v1`.
 * @param {string[]} params.locales - e.g. `['hy', 'ru', 'en']`.
 * @param {string} [params.internalToken] - matches PRERENDER_INTERNAL_TOKEN
 *   on the API, moving these requests onto the internal-build rate-limit
 *   tier. Omitted/empty sends no header and behaves exactly as before.
 * @returns {Promise<{path: string, localeFreePath: string, lastmod: string|null}[]>}
 *   every locale-prefixed path to prerender/sitemap, e.g.
 *   `{path: 'en/categories/hotels', localeFreePath: 'categories/hotels',
 *   lastmod: null}`. `lastmod` is a real ISO timestamp only for listings
 *   (the one entity with a genuine `created_at`) — Phase 20 §19's "never
 *   fake changefreq/priority/lastmod for appearance" rule means every
 *   other route type carries `lastmod: null` rather than an invented date.
 */
export async function fetchRouteManifest({
  apiBaseUrl,
  locales,
  internalToken,
}) {
  const [categories, destinations, companies, listings, blogPosts] =
    await Promise.all([
      fetchJson(apiBaseUrl, '/search/categories', internalToken),
      fetchJson(apiBaseUrl, '/search/destinations', internalToken),
      fetchAllPages(apiBaseUrl, '/partners', internalToken),
      fetchAllPages(apiBaseUrl, '/search', internalToken),
      fetchAllBlogPosts(apiBaseUrl, internalToken),
    ]);

  const localeFreeEntries = [
    ...STATIC_PATHS.map((localeFreePath) => ({
      localeFreePath,
      lastmod: null,
    })),
    ...categories.map((category) => ({
      localeFreePath: `categories/${category.slug}`,
      lastmod: null,
    })),
    ...destinations.map((destination) => ({
      localeFreePath: `destinations/${destination.slug}`,
      lastmod: null,
    })),
    ...companies.map((company) => ({
      localeFreePath: `companies/${company.slug}`,
      lastmod: null,
    })),
    ...listings.map((listing) => ({
      localeFreePath: `listings/${listing.slug ?? listing.id}`,
      lastmod: listing.created_at ?? null,
    })),
    // GET /blog/posts already filters to published (or due-scheduled)
    // posts server-side — the same repository clause spec §33 requires
    // ("draft/unpublished/future-scheduled content must NOT appear"), so
    // no extra status filtering is needed here.
    ...blogPosts.map((post) => ({
      localeFreePath: `blog/${post.slug}`,
      lastmod: post.published_at ?? null,
    })),
  ];

  const manifest = [];
  locales.forEach((locale) => {
    localeFreeEntries.forEach(({ localeFreePath, lastmod }) => {
      const path = localeFreePath ? `${locale}/${localeFreePath}` : locale;
      manifest.push({ path, localeFreePath, lastmod });
    });
  });
  return manifest;
}

export default fetchRouteManifest;
