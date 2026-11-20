/**
 * useListingDetailSeo — Listing Detail's document head: title, description,
 * canonical slug URL, the lead photo for social cards, and JSON-LD
 * (the listing, its breadcrumb trail and its FAQ). A listing the visitor
 * only sees as its owner (not PUBLISHED) or one marked non-indexable is
 * `noindex`. Runs on every render, before the page's loading/error states.
 *
 * Structured data is built from the public DTO only, so a private stay's
 * JSON-LD carries the same approximate point the page shows.
 */

import { useTranslation } from 'react-i18next';
import useSeo from '../../../seo/useSeo.js';
import {
  buildBreadcrumbListSchema,
  buildListingSchema,
  buildFaqPageSchema,
} from '../../../seo/structuredData.js';

export function buildListingBreadcrumbs(model, locale, t) {
  if (!model.listing) return [];
  return [
    { label: t('nav.home'), href: `/${locale}` },
    {
      label: model.title,
      href: `/${locale}/listings/${model.listing.slug ?? model.listing.id}`,
    },
  ];
}

export default function useListingDetailSeo(model, locale) {
  const { t } = useTranslation();
  const { listing, translation } = model;
  const breadcrumbs = buildListingBreadcrumbs(model, locale, t);

  let seo = { noindex: true, skipHreflang: true, locale };
  if (listing) {
    const seoTitle = translation?.seo_title || model.title;
    const path = `listings/${listing.slug ?? listing.id}`;
    const cityName = model.location?.city_name;
    const leadImage = (listing.media ?? [])
      .filter((item) => item.media_type === 'IMAGE')
      .slice()
      .sort((a, b) => a.position - b.position)[0]?.url;
    seo = {
      title: cityName
        ? t('seo.listingDetail.titleWithLocation', {
            title: seoTitle,
            location: cityName,
          })
        : t('seo.listingDetail.titleNoLocation', { title: seoTitle }),
      description:
        translation?.seo_description ??
        translation?.summary ??
        translation?.description,
      locale,
      path,
      image: leadImage,
      noindex: !listing.is_indexable || listing.status !== 'PUBLISHED',
      skipHreflang: false,
      jsonLd: [
        translation &&
          buildListingSchema({
            listing: {
              ...listing,
              location: model.location,
              title: translation.title,
              description: translation.summary ?? translation.description,
            },
            categoryCode: model.category?.slug,
            locale,
            path,
          }),
        buildBreadcrumbListSchema(breadcrumbs),
        buildFaqPageSchema(model.content.faqs),
      ].filter(Boolean),
    };
  }
  useSeo(seo);
  return breadcrumbs;
}
