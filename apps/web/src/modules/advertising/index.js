/**
 * `advertising` module public export surface (FRONTEND_ARCHITECTURE.md
 * §6.2) — the ONLY entry point other modules/pages may import from.
 */

export { default as advertisingKeys } from './constants/queryKeys.js';
export { default as usePublicHomeFeaturedQuery } from './queries/usePublicHomeFeaturedQuery.js';
export { default as usePublicCategoryTopQuery } from './queries/usePublicCategoryTopQuery.js';
export { default as usePlacementCatalogQuery } from './queries/usePlacementCatalogQuery.js';
export { default as useAdvertisementsQuery } from './queries/useAdvertisementsQuery.js';
export { default as useCreateAdvertisementMutation } from './mutations/useCreateAdvertisementMutation.js';
export {
  useMarkAdvertisementPaidMutation,
  useApproveAdvertisementMutation,
  useRejectAdvertisementMutation,
  useCancelAdvertisementMutation,
  useExtendAdvertisementMutation,
} from './mutations/useAdvertisementActionMutations.js';
export { PLACEMENT_CODES } from './constants/placementCodes.js';
