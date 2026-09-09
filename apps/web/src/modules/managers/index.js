/**
 * `managers` module public export surface (FRONTEND_ARCHITECTURE.md §6.2)
 * — the ONLY entry point other modules/pages may import from.
 */

export { default as managersKeys } from './constants/queryKeys.js';
export { default as useMyManagedCompaniesQuery } from './queries/useMyManagedCompaniesQuery.js';
export { default as useMyManagerDashboardQuery } from './queries/useMyManagerDashboardQuery.js';
export { default as useMyManagerAnalyticsQuery } from './queries/useMyManagerAnalyticsQuery.js';
export { default as useManagersQuery } from './queries/useManagersQuery.js';
export { default as useManagerDetailQuery } from './queries/useManagerDetailQuery.js';
export { default as useAdminManagerAnalyticsQuery } from './queries/useAdminManagerAnalyticsQuery.js';
export { default as usePromoteToManagerMutation } from './mutations/usePromoteToManagerMutation.js';
export { default as useAssignCompanyMutation } from './mutations/useAssignCompanyMutation.js';
export { default as useUnassignCompanyMutation } from './mutations/useUnassignCompanyMutation.js';
