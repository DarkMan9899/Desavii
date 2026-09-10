/**
 * Phase 20 — schema.org/JSON-LD builders. Every function here is a pure
 * mapper from real API data to a JSON-LD object; none ever invents a
 * property. A field is included only when the corresponding source value
 * is present — see each function's own guards. This is what keeps
 * structured data honest: it can never claim a rating, price, address, or
 * phone number the app doesn't actually have.
 */

import { SITE_BRAND_NAME } from './seoConfig.js';
import { buildLocaleUrl } from './urls.js';

/**
 * Root-category code (apps/api seeds/003_taxonomy_and_products.js) →
 * schema.org @type for a listing's structured data. Deliberately
 * conservative: only well-established, Google-validated types are used.
 * `car-rentals` and any unrecognized code fall back to a generic
 * `Product` + `Offer` shape rather than guessing at an unverified type.
 */
const CATEGORY_SCHEMA_TYPE = {
  hotels: 'Hotel',
  apartments: 'LodgingBusiness',
  villas: 'LodgingBusiness',
  'guest-houses': 'LodgingBusiness',
  restaurants: 'Restaurant',
  tours: 'TouristTrip',
  attractions: 'TouristAttraction',
};

export function buildOrganizationSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: SITE_BRAND_NAME,
    url: buildLocaleUrl('hy', ''),
  };
}

export function buildWebsiteSchema(locale) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITE_BRAND_NAME,
    url: buildLocaleUrl(locale, ''),
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${buildLocaleUrl(locale, 'search')}?destination={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
  };
}

/** `items`: same `{label, href}` shape as the visible Breadcrumbs component. */
export function buildBreadcrumbListSchema(items) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.label,
      item: item.href,
    })),
  };
}

function buildAddress(location) {
  if (!location) return undefined;
  const { city_name: city, country_name: country } = location;
  if (!city && !country) return undefined;
  return {
    '@type': 'PostalAddress',
    ...(city ? { addressLocality: city } : {}),
    ...(country ? { addressCountry: country } : {}),
  };
}

function buildGeo(location) {
  if (!location?.latitude || !location?.longitude) return undefined;
  return {
    '@type': 'GeoCoordinates',
    latitude: location.latitude,
    longitude: location.longitude,
  };
}

function buildAggregateRating(listing) {
  if (!listing.rating_average || !listing.review_count) return undefined;
  return {
    '@type': 'AggregateRating',
    ratingValue: listing.rating_average,
    reviewCount: listing.review_count,
  };
}

function buildOffers(listing) {
  const amount = listing.pricing?.amount;
  const currency = listing.pricing?.currency_code;
  if (!amount || !currency) return undefined;
  return {
    '@type': 'Offer',
    price: amount,
    priceCurrency: currency,
    // P2.2E: this previously hardcoded `https://schema.org/InStock`
    // unconditionally whenever a price existed — a sold-out listing's
    // structured data still told search engines it was in stock. The
    // real per-day/per-unit availability status
    // (`useListingAvailabilitySummaryQuery`'s `AVAILABLE`/`LOW`/
    // `SOLD_OUT`) isn't fetched anywhere in this schema-building path,
    // and fetching it here just for this claim would be a new query
    // dependency, not the smallest fix. `Offer.availability` is optional
    // in schema.org — omitting an unverifiable claim here is strictly
    // more correct than asserting one, per this task's own "prefer
    // omission over a false claim" guidance.
    url: buildLocaleUrl('hy', `listings/${listing.slug ?? listing.id}`),
  };
}

/**
 * Builds the primary listing schema, dispatching on the listing's first
 * category code to the closest valid schema.org type. `locale` and
 * `path` are used to build the canonical `url` property.
 */
export function buildListingSchema({ listing, categoryCode, locale, path }) {
  const schemaType = CATEGORY_SCHEMA_TYPE[categoryCode] ?? 'Product';
  // 2026 SEO audit: `media_type` is the real `media_types` lookup code
  // (`001_lookups.js` seeds it as `'IMAGE'`, and every listing DTO
  // mapper echoes that same casing straight through) — this previously
  // compared against lowercase `'image'`, which never matched real data
  // and silently dropped `image` from every listing's JSON-LD.
  const images = (listing.media ?? [])
    .filter((item) => item.media_type === 'IMAGE')
    .map((item) => item.url)
    .filter(Boolean);
  const address = buildAddress(listing.location);
  const geo = buildGeo(listing.location);
  const aggregateRating = buildAggregateRating(listing);
  const offers = buildOffers(listing);

  const base = {
    '@context': 'https://schema.org',
    '@type': schemaType,
    name: listing.title,
    ...(listing.description ? { description: listing.description } : {}),
    url: buildLocaleUrl(locale, path),
    ...(images.length ? { image: images } : {}),
    ...(address ? { address } : {}),
    ...(geo ? { geo } : {}),
    ...(aggregateRating ? { aggregateRating } : {}),
  };

  if (schemaType === 'Product') {
    return { ...base, ...(offers ? { offers } : {}) };
  }
  // Hotel/LodgingBusiness/Restaurant/TouristTrip/TouristAttraction:
  // `priceRange`/`offers` are valid on these too, but only if we have a
  // real number — reuse the same offers builder where schema.org allows
  // it (Hotel/LodgingBusiness/Restaurant/TouristTrip all accept `offers`
  // via their common Product/Service ancestry; TouristAttraction does not
  // define `offers` in the core vocabulary, so it's deliberately omitted
  // there).
  if (offers && schemaType !== 'TouristAttraction') {
    return { ...base, offers };
  }
  return base;
}

/** `faqs`: `[{question, answer}]` — omit the whole schema when empty (never fabricate Q&A). */
export function buildFaqPageSchema(faqs) {
  if (!faqs?.length) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((faq) => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: faq.answer,
      },
    })),
  };
}

/**
 * Sprint H (Blog) — `post`: the resolved public-post shape
 * `usePublicPostQuery`/`BlogService#getPublicPost` returns (`title`,
 * `excerpt`, `author`, `published_at`, `cover`). `dateModified` is
 * deliberately omitted — the schema has no real "content last edited"
 * timestamp separate from `updated_at` on the raw admin row, which this
 * public shape never exposes, so it's left out rather than guessed.
 */
export function buildArticleSchema({ post, locale, path }) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    ...(post.excerpt ? { description: post.excerpt } : {}),
    url: buildLocaleUrl(locale, path),
    ...(post.published_at ? { datePublished: post.published_at } : {}),
    ...(post.author
      ? { author: { '@type': 'Person', name: post.author } }
      : {}),
    ...(post.cover?.url ? { image: [post.cover.url] } : {}),
    publisher: {
      '@type': 'Organization',
      name: SITE_BRAND_NAME,
    },
  };
}

export default {
  buildOrganizationSchema,
  buildWebsiteSchema,
  buildBreadcrumbListSchema,
  buildListingSchema,
  buildFaqPageSchema,
  buildArticleSchema,
};
