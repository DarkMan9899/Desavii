/**
 * Step L6.2B — `resolveBookableUnitProfile` for a loaded listing: resolves
 * the listing's primary category slug through the (cached) categories
 * query, since the listing itself only carries `category_ids`.
 *
 * @param {object|undefined} listing - `GET /listings/:id` data
 * @returns {object|null} the unit profile, or `null` until the listing is known
 */

import { useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useListingCategoriesQuery } from '../queries/useListingCategoriesQuery.js';
import { resolveBookableUnitProfile } from '../utils/resolveBookableUnitProfile.js';

export function useBookableUnitProfile(listing) {
  const { locale } = useParams();
  const { data: categories } = useListingCategoriesQuery(locale);
  const categoryId = listing?.category_ids?.[0];
  const categorySlug =
    categories?.find((category) => category.id === categoryId)?.slug ?? null;
  const listingType = listing?.listing_type;
  const pricingModel = listing?.pricing?.pricing_model ?? null;

  return useMemo(
    () =>
      listingType
        ? resolveBookableUnitProfile({
            listingType,
            categorySlug,
            pricingModel,
          })
        : null,
    [listingType, categorySlug, pricingModel],
  );
}

export default useBookableUnitProfile;
