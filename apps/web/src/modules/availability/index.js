/**
 * Public export surface for the "availability" module.
 * Phase 5 (Partner Listing Wizard): `PartnerListingWizard`'s
 * `AvailabilityStep` (in `modules/listings`) is this module's first real
 * consumer — a legitimate dependency per FRONTEND_ARCHITECTURE.md §6.3
 * ("listings may depend on availability"). Scoped to exactly what that
 * step needs — registering the >=1 bookable unit publish-readiness
 * requires, and blackout-date management; `availability_calendar`
 * (day-by-day price/status overrides) remains out of scope, see
 * `api/availability.js`'s file header.
 */
export { default as availabilityKeys } from './constants/queryKeys.js';
export { default as BOOKABLE_UNIT_TYPES } from './constants/bookableUnitTypes.js';
export { default as BED_TYPES } from './constants/bedTypes.js';
export { INT_UNSIGNED_MAX } from './constants/numericBounds.js';
export {
  BATHROOM_TYPES,
  VIEW_TYPES,
  SMOKING_POLICIES,
} from './constants/roomAttributes.js';
export { default as useBookableUnitsQuery } from './queries/useBookableUnitsQuery.js';
export { default as useBlackoutsQuery } from './queries/useBlackoutsQuery.js';
export { default as useRegisterBookableUnitMutation } from './mutations/useRegisterBookableUnitMutation.js';
export { default as useUpdateBookableUnitMutation } from './mutations/useUpdateBookableUnitMutation.js';
// Sprint C-1 (Accommodation room-level product data)
export { default as useUpdateBookableUnitDescriptionMutation } from './mutations/useUpdateBookableUnitDescriptionMutation.js';
export { default as useReplaceBookableUnitAmenitiesMutation } from './mutations/useReplaceBookableUnitAmenitiesMutation.js';
export { default as useAttachBookableUnitMediaMutation } from './mutations/useAttachBookableUnitMediaMutation.js';
export { default as useRemoveBookableUnitMediaMutation } from './mutations/useRemoveBookableUnitMediaMutation.js';
export { default as useCreateBlackoutMutation } from './mutations/useCreateBlackoutMutation.js';
export { default as useRemoveBlackoutMutation } from './mutations/useRemoveBlackoutMutation.js';

// Phase 17
export { default as useInventoryBlocksQuery } from './queries/useInventoryBlocksQuery.js';
export { default as useExternalReservationsQuery } from './queries/useExternalReservationsQuery.js';
export { default as useUnitBreakdownQuery } from './queries/useUnitBreakdownQuery.js';
export { default as useUnitLedgerQuery } from './queries/useUnitLedgerQuery.js';
export { default as useUnitHoldsQuery } from './queries/useUnitHoldsQuery.js';
export { default as useInventoryConnectionsQuery } from './queries/useInventoryConnectionsQuery.js';
export { default as useConnectionSyncRunsQuery } from './queries/useConnectionSyncRunsQuery.js';
export { default as useConnectionConflictsQuery } from './queries/useConnectionConflictsQuery.js';
export { default as useCreateInventoryBlockMutation } from './mutations/useCreateInventoryBlockMutation.js';
export { default as useReleaseInventoryBlockMutation } from './mutations/useReleaseInventoryBlockMutation.js';
export { default as useCreateExternalReservationMutation } from './mutations/useCreateExternalReservationMutation.js';
export { default as useCancelExternalReservationMutation } from './mutations/useCancelExternalReservationMutation.js';
export { default as useBulkImportExternalReservationsMutation } from './mutations/useBulkImportExternalReservationsMutation.js';
export { default as useCreateInventoryConnectionMutation } from './mutations/useCreateInventoryConnectionMutation.js';
export { default as useUpdateInventoryConnectionMutation } from './mutations/useUpdateInventoryConnectionMutation.js';
export { default as useDisconnectInventoryConnectionMutation } from './mutations/useDisconnectInventoryConnectionMutation.js';
export { default as useSetInventoryConnectionMappingMutation } from './mutations/useSetInventoryConnectionMappingMutation.js';
export { default as useTestInventoryConnectionMutation } from './mutations/useTestInventoryConnectionMutation.js';
export { default as useSyncInventoryConnectionMutation } from './mutations/useSyncInventoryConnectionMutation.js';
export { default as useResolveConnectionConflictMutation } from './mutations/useResolveConnectionConflictMutation.js';
// Admin Sprint 5
export { default as useAdminInventoryOverviewQuery } from './queries/useAdminInventoryOverviewQuery.js';
export { default as useAdminInventoryConflictsOverviewQuery } from './queries/useAdminInventoryConflictsOverviewQuery.js';
export {
  BLOCK_REASON_CODES,
  EXTERNAL_RESERVATION_SOURCE_CODES,
  CONNECTOR_TYPES,
  CONNECTION_DIRECTIONS,
} from './constants/inventoryEnums.js';
export {
  roleHasCapability,
  PARTNER_CAPABILITIES,
} from './utils/partnerCapabilities.js';
export { default as usePartnerCapability } from './hooks/usePartnerCapability.js';
