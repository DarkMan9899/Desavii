/**
 * `manager` module public export surface (FRONTEND_ARCHITECTURE.md §6.2)
 * — the ONLY entry point other modules/pages may import from. Content
 * components for the Manager Workspace, mirroring `modules/partner`'s
 * role for the Partner Workspace. Data-fetching hooks live in the
 * separate `modules/managers` (plural) module.
 */

export { default as ManagerDashboardContent } from './components/ManagerDashboardContent/ManagerDashboardContent.jsx';
export { default as ManagerCompaniesPageContent } from './components/ManagerCompaniesPageContent/ManagerCompaniesPageContent.jsx';
export { default as ManagerListingsPageContent } from './components/ManagerListingsPageContent/ManagerListingsPageContent.jsx';
export { default as ManagerBookingsPageContent } from './components/ManagerBookingsPageContent/ManagerBookingsPageContent.jsx';
export { default as ManagerAnalyticsPageContent } from './components/ManagerAnalyticsPageContent/ManagerAnalyticsPageContent.jsx';
