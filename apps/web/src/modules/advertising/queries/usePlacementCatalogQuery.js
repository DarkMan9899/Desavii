import { useQuery } from '@tanstack/react-query';
import { getPlacementCatalog } from '../../../api/advertising.js';
import advertisingKeys from '../constants/queryKeys.js';

/** `GET /advertising/admin/catalog` — Admin's placement + pricing-product picker data. */
export function usePlacementCatalogQuery() {
  return useQuery({
    queryKey: advertisingKeys.catalog(),
    queryFn: () => getPlacementCatalog().then((res) => res.data),
    staleTime: 60_000,
  });
}

export default usePlacementCatalogQuery;
