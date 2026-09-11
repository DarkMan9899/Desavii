import { describe, test, expect } from 'vitest';
import { buildSitemapXml, buildRobotsTxt } from './buildSitemap.mjs';

const ORIGIN = 'https://desavii.com';

const MANIFEST = [
  {
    path: 'hy/categories/hotels',
    localeFreePath: 'categories/hotels',
    lastmod: null,
  },
  {
    path: 'ru/categories/hotels',
    localeFreePath: 'categories/hotels',
    lastmod: null,
  },
  {
    path: 'en/categories/hotels',
    localeFreePath: 'categories/hotels',
    lastmod: null,
  },
  {
    path: 'hy/listings/boutique-yerevan-hotel',
    localeFreePath: 'listings/boutique-yerevan-hotel',
    lastmod: '2026-01-15T10:00:00.000Z',
  },
  {
    path: 'ru/listings/boutique-yerevan-hotel',
    localeFreePath: 'listings/boutique-yerevan-hotel',
    lastmod: '2026-01-15T10:00:00.000Z',
  },
  {
    path: 'en/listings/boutique-yerevan-hotel',
    localeFreePath: 'listings/boutique-yerevan-hotel',
    lastmod: '2026-01-15T10:00:00.000Z',
  },
];

describe('buildSitemapXml', () => {
  const xml = buildSitemapXml(MANIFEST, ORIGIN, 'hy');

  test('emits one <url> block per manifest entry', () => {
    expect((xml.match(/<url>/g) ?? []).length).toBe(MANIFEST.length);
  });

  test('every <loc> is an absolute URL under the configured origin', () => {
    expect(xml).toContain(`<loc>${ORIGIN}/hy/categories/hotels</loc>`);
    expect(xml).toContain(
      `<loc>${ORIGIN}/en/listings/boutique-yerevan-hotel</loc>`,
    );
    expect(xml).not.toContain('<loc>localhost');
    expect(xml).not.toContain('<loc>http://');
  });

  test('each url block carries hreflang alternates for every locale sharing its localeFreePath', () => {
    expect(xml).toContain(
      `hreflang="hy" href="${ORIGIN}/hy/categories/hotels"`,
    );
    expect(xml).toContain(
      `hreflang="ru" href="${ORIGIN}/ru/categories/hotels"`,
    );
    expect(xml).toContain(
      `hreflang="en" href="${ORIGIN}/en/categories/hotels"`,
    );
  });

  test('x-default points at the default locale sibling', () => {
    expect(xml).toContain(
      `hreflang="x-default" href="${ORIGIN}/hy/categories/hotels"`,
    );
  });

  test('lastmod is included only when the manifest entry has a real value, as an ISO string', () => {
    expect(xml).toContain('<lastmod>2026-01-15T10:00:00.000Z</lastmod>');
    // categories/hotels entries carry lastmod: null and must not fabricate one
    const categoriesBlock = xml
      .split('categories/hotels</loc>')[1]
      .split('</url>')[0];
    expect(categoriesBlock).not.toContain('<lastmod>');
  });

  test('escapes XML-unsafe characters', () => {
    const withAmpersand = buildSitemapXml(
      [
        {
          path: 'en/search?a=1&b=2',
          localeFreePath: 'search?a=1&b=2',
          lastmod: null,
        },
      ],
      ORIGIN,
      'hy',
    );
    expect(withAmpersand).toContain('&amp;');
    expect(withAmpersand).not.toMatch(/[^&]&[^a]/);
  });

  test('produces well-formed XML with a single urlset root', () => {
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain(
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"',
    );
    expect((xml.match(/<urlset/g) ?? []).length).toBe(1);
    expect((xml.match(/<\/urlset>/g) ?? []).length).toBe(1);
  });
});

describe('buildRobotsTxt', () => {
  const robots = buildRobotsTxt(ORIGIN);

  test('allows crawling by default', () => {
    expect(robots).toContain('User-agent: *');
    expect(robots).toContain('Allow: /');
  });

  test('disallows private/authenticated area prefixes', () => {
    expect(robots).toContain('Disallow: /*/account');
    expect(robots).toContain('Disallow: /*/partner');
    expect(robots).toContain('Disallow: /*/admin');
    expect(robots).toContain('Disallow: /*/booking/checkout');
  });

  // Sprint L — Manager and Marketing are RequireAuth-gated workspaces
  // exactly like Partner/Admin (routes/index.jsx's own RequireManager/
  // RequireRole(['MARKETING']) gates), but were missing from this list —
  // a crawler could spend budget on private routes it can never render.
  test('disallows the Manager and Marketing workspace prefixes, same as Partner/Admin', () => {
    expect(robots).toContain('Disallow: /*/manager');
    expect(robots).toContain('Disallow: /*/marketing');
  });

  test('disallows the one /auth sub-path whose URL itself carries a real secret', () => {
    // auth/reset-password/:token — unlike login/register, there is no
    // "let Google see the noindex tag" upside worth a crawler fetching a
    // single-use password-reset token.
    expect(robots).toContain('Disallow: /*/auth/reset-password');
  });

  test('does NOT disallow /search, or /auth/login and /auth/register — they must stay crawlable so their client-rendered noindex meta tag is the real signal', () => {
    expect(robots).not.toMatch(/Disallow:\s*\/\*\/search/);
    expect(robots).not.toMatch(/Disallow:\s*\/\*\/auth\/login/);
    expect(robots).not.toMatch(/Disallow:\s*\/\*\/auth\/register/);
    expect(robots).not.toMatch(/Disallow:\s*\/\*\/auth\/forgot-password/);
  });

  test('points at the sitemap under the configured origin', () => {
    expect(robots).toContain(`Sitemap: ${ORIGIN}/sitemap.xml`);
  });
});
