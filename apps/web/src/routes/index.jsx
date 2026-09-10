/**
 * Root route tree.
 *
 * Implements FRONTEND_ARCHITECTURE.md §4: locale-prefixed paths
 * (/hy/, /ru/, /en/ — §4.1's SEO-driven decision), lazy-loaded route
 * components (§4.3), with a validated locale segment (an unrecognized
 * prefix falls through to the 404 route, never a silent fallback).
 *
 * Application Foundation phase established the complete route SHAPE per
 * §4.2 — Customer Website (Public), Auth, Customer Account, and Partner
 * route groups, with `RequireAuth` (§4.4/§12) wired on the authenticated
 * groups; most pages were `UnderConstructionPage` at the time, filled in
 * by later phases (5: Partner Listing Wizard, 6: Listing Details).
 *
 * Phase 7 (Booking Flow) adds the fourth `RequireAuth`-gated group:
 * `booking/checkout` (converts an active reservation hold into a real
 * booking — deliberately under `PublicLayout`'s minimal chrome, not
 * `CustomerAccountLayout`'s sidebar, matching a typical checkout flow's
 * focused convention) and `account/bookings/:id` (one booking's detail,
 * nested under the existing Customer Account group).
 *
 * Phase 9 (Partner Dashboard) fills out the Partner route group with
 * `partner/listings`, `partner/bookings`, `partner/bookings/:id`, and
 * `partner/calendar` (previously only `partner` and `partner/listings/new`
 * existed) and mounts `PartnerProvider` inside `RequirePartner`.
 *
 * Phase 11 (Admin Platform) adds the fifth `RequireAuth`-gated group:
 * Admin, gated by `RequireRole` (a global-role check, not
 * `RequirePartner`'s membership check — an Admin/Moderator/Support user
 * has no partner org to belong to). Ships in stages; only `admin`
 * (Dashboard) exists so far.
 */

import { lazy, Suspense, useEffect } from 'react';
import { Routes, Route, Navigate, Outlet, useParams } from 'react-router-dom';
import PropTypes from 'prop-types';
import PublicLayout from '../layouts/PublicLayout.jsx';
import AuthLayout from '../layouts/AuthLayout.jsx';
import CustomerAccountLayout from '../layouts/CustomerAccountLayout.jsx';
import PartnerLayout from '../layouts/PartnerLayout.jsx';
import AdminLayout from '../layouts/AdminLayout.jsx';
import ManagerLayout from '../layouts/ManagerLayout.jsx';
import MarketingLayout from '../layouts/MarketingLayout.jsx';
import ErrorLayout from '../layouts/ErrorLayout.jsx';
import RequireAuth from '../guards/RequireAuth.jsx';
import RequirePartner from '../guards/RequirePartner.jsx';
import RequireRole from '../guards/RequireRole.jsx';
import RequireManager from '../guards/RequireManager.jsx';
import PartnerProvider from '../providers/PartnerProvider.jsx';
import ManagerProvider from '../providers/ManagerProvider.jsx';
import PageLoader from '../components/PageLoader/PageLoader.jsx';
import ScrollRestoration from './ScrollRestoration.jsx';
import { SUPPORTED_LOCALES, DEFAULT_LOCALE } from '../translations/i18n.js';

const HomePage = lazy(() => import('../pages/HomePage.jsx'));
const SearchPage = lazy(() => import('../pages/SearchPage.jsx'));
const ListingDetailPage = lazy(() => import('../pages/ListingDetailPage.jsx'));
const CompaniesPage = lazy(() => import('../pages/CompaniesPage.jsx'));
const CategoryPage = lazy(() => import('../pages/CategoryPage.jsx'));
const DestinationPage = lazy(() => import('../pages/DestinationPage.jsx'));
const CompanyProfilePage = lazy(
  () => import('../pages/CompanyProfilePage.jsx'),
);
const AboutPage = lazy(() => import('../pages/AboutPage.jsx'));
const ContactPage = lazy(() => import('../pages/ContactPage.jsx'));
const FaqPage = lazy(() => import('../pages/FaqPage.jsx'));
const HelpCenterPage = lazy(() => import('../pages/HelpCenterPage.jsx'));
const BecomePartnerPage = lazy(() => import('../pages/BecomePartnerPage.jsx'));
const BlogPage = lazy(() => import('../pages/BlogPage.jsx'));
const BlogPostPage = lazy(() => import('../pages/BlogPostPage.jsx'));
const LoginPage = lazy(() => import('../pages/auth/LoginPage.jsx'));
const RegisterPage = lazy(() => import('../pages/auth/RegisterPage.jsx'));
const ForgotPasswordPage = lazy(
  () => import('../pages/auth/ForgotPasswordPage.jsx'),
);
const ResetPasswordPage = lazy(
  () => import('../pages/auth/ResetPasswordPage.jsx'),
);
const DashboardPage = lazy(() => import('../pages/account/DashboardPage.jsx'));
const BookingsPage = lazy(() => import('../pages/account/BookingsPage.jsx'));
const BookingDetailPage = lazy(
  () => import('../pages/account/BookingDetailPage.jsx'),
);
const BookingCheckoutPage = lazy(
  () => import('../pages/BookingCheckoutPage.jsx'),
);
const PaymentsPage = lazy(() => import('../pages/account/PaymentsPage.jsx'));
const ProfilePage = lazy(() => import('../pages/account/ProfilePage.jsx'));
const SettingsPage = lazy(() => import('../pages/account/SettingsPage.jsx'));
const FavoritesPage = lazy(() => import('../pages/account/FavoritesPage.jsx'));
const TripPlannerPage = lazy(
  () => import('../pages/account/TripPlannerPage.jsx'),
);
const NotificationsPage = lazy(
  () => import('../pages/account/NotificationsPage.jsx'),
);
const MessagesPage = lazy(() => import('../pages/account/MessagesPage.jsx'));
const PartnerApplicationPage = lazy(
  () => import('../pages/partner/PartnerApplicationPage.jsx'),
);
const PartnerDashboardPage = lazy(
  () => import('../pages/partner/PartnerDashboardPage.jsx'),
);
const PartnerListingWizardPage = lazy(
  () => import('../pages/partner/PartnerListingWizardPage.jsx'),
);
const PartnerListingsPage = lazy(
  () => import('../pages/partner/PartnerListingsPage.jsx'),
);
const PartnerListingRoomsPage = lazy(
  () => import('../pages/partner/PartnerListingRoomsPage.jsx'),
);
const PartnerBookingsPage = lazy(
  () => import('../pages/partner/PartnerBookingsPage.jsx'),
);
const PartnerBookingDetailPage = lazy(
  () => import('../pages/partner/PartnerBookingDetailPage.jsx'),
);
const PartnerCalendarPage = lazy(
  () => import('../pages/partner/PartnerCalendarPage.jsx'),
);
const PartnerConnectionsPage = lazy(
  () => import('../pages/partner/PartnerConnectionsPage.jsx'),
);
const PartnerProfilePage = lazy(
  () => import('../pages/partner/PartnerProfilePage.jsx'),
);
const PartnerStaffPage = lazy(
  () => import('../pages/partner/PartnerStaffPage.jsx'),
);
const AcceptInvitationPage = lazy(
  () => import('../pages/partner/AcceptInvitationPage.jsx'),
);
const PartnerNotificationsPage = lazy(
  () => import('../pages/partner/PartnerNotificationsPage.jsx'),
);
const PartnerMessagesPage = lazy(
  () => import('../pages/partner/PartnerMessagesPage.jsx'),
);
const PartnerAiUsagePage = lazy(
  () => import('../pages/partner/PartnerAiUsagePage.jsx'),
);
const ManagerDashboardPage = lazy(
  () => import('../pages/manager/ManagerDashboardPage.jsx'),
);
const ManagerCompaniesPage = lazy(
  () => import('../pages/manager/ManagerCompaniesPage.jsx'),
);
const ManagerListingsPage = lazy(
  () => import('../pages/manager/ManagerListingsPage.jsx'),
);
const ManagerListingWizardPage = lazy(
  () => import('../pages/manager/ManagerListingWizardPage.jsx'),
);
const ManagerListingRoomsPage = lazy(
  () => import('../pages/manager/ManagerListingRoomsPage.jsx'),
);
const ManagerBookingsPage = lazy(
  () => import('../pages/manager/ManagerBookingsPage.jsx'),
);
const ManagerBookingDetailPage = lazy(
  () => import('../pages/manager/ManagerBookingDetailPage.jsx'),
);
const ManagerAnalyticsPage = lazy(
  () => import('../pages/manager/ManagerAnalyticsPage.jsx'),
);
const AdminDashboardPage = lazy(
  () => import('../pages/admin/AdminDashboardPage.jsx'),
);
const AdminUsersPage = lazy(() => import('../pages/admin/AdminUsersPage.jsx'));
const AdminUserDetailPage = lazy(
  () => import('../pages/admin/AdminUserDetailPage.jsx'),
);
const AdminPartnersPage = lazy(
  () => import('../pages/admin/AdminPartnersPage.jsx'),
);
const AdminPartnerDetailPage = lazy(
  () => import('../pages/admin/AdminPartnerDetailPage.jsx'),
);
const AdminListingModerationPage = lazy(
  () => import('../pages/admin/AdminListingModerationPage.jsx'),
);
const AdminListingDetailPage = lazy(
  () => import('../pages/admin/AdminListingDetailPage.jsx'),
);
const AdminReviewModerationPage = lazy(
  () => import('../pages/admin/AdminReviewModerationPage.jsx'),
);
const AdminReviewDetailPage = lazy(
  () => import('../pages/admin/AdminReviewDetailPage.jsx'),
);
const AdminInventoryPage = lazy(
  () => import('../pages/admin/AdminInventoryPage.jsx'),
);
const AdminPromotionsPage = lazy(
  () => import('../pages/admin/AdminPromotionsPage.jsx'),
);
const AdminManagersPage = lazy(
  () => import('../pages/admin/AdminManagersPage.jsx'),
);
const AdminManagerDetailPage = lazy(
  () => import('../pages/admin/AdminManagerDetailPage.jsx'),
);
const AdminContactInquiriesPage = lazy(
  () => import('../pages/admin/AdminContactInquiriesPage.jsx'),
);
const AdminBookingsPage = lazy(
  () => import('../pages/admin/AdminBookingsPage.jsx'),
);
const AdminBookingDetailPage = lazy(
  () => import('../pages/admin/AdminBookingDetailPage.jsx'),
);
const AdminMarketplaceConfigPage = lazy(
  () => import('../pages/admin/AdminMarketplaceConfigPage.jsx'),
);
const AdminCmsPage = lazy(() => import('../pages/admin/AdminCmsPage.jsx'));
const AdminCmsDetailPage = lazy(
  () => import('../pages/admin/AdminCmsDetailPage.jsx'),
);
const AdminBlogPage = lazy(() => import('../pages/admin/AdminBlogPage.jsx'));
const AdminBlogPostEditPage = lazy(
  () => import('../pages/admin/AdminBlogPostEditPage.jsx'),
);
const AdminBlogPostPreviewPage = lazy(
  () => import('../pages/admin/AdminBlogPostPreviewPage.jsx'),
);
const AdminAuditLogsPage = lazy(
  () => import('../pages/admin/AdminAuditLogsPage.jsx'),
);
const AdminSystemHealthPage = lazy(
  () => import('../pages/admin/AdminSystemHealthPage.jsx'),
);
const AdminSettingsPage = lazy(
  () => import('../pages/admin/AdminSettingsPage.jsx'),
);
const AdminAiModerationPage = lazy(
  () => import('../pages/admin/AdminAiModerationPage.jsx'),
);
const AdminAiUsagePage = lazy(
  () => import('../pages/admin/AdminAiUsagePage.jsx'),
);
const AdminNotificationsPage = lazy(
  () => import('../pages/admin/AdminNotificationsPage.jsx'),
);
const AdminMessagesPage = lazy(
  () => import('../pages/admin/AdminMessagesPage.jsx'),
);
const AdminPaymentsPage = lazy(
  () => import('../pages/admin/AdminPaymentsPage.jsx'),
);
const AdminPaymentDetailPage = lazy(
  () => import('../pages/admin/AdminPaymentDetailPage.jsx'),
);
const MarketingDashboardPage = lazy(
  () => import('../pages/marketing/MarketingDashboardPage.jsx'),
);
const MarketingPostsPage = lazy(
  () => import('../pages/marketing/MarketingPostsPage.jsx'),
);
const MarketingPostEditPage = lazy(
  () => import('../pages/marketing/MarketingPostEditPage.jsx'),
);
const MarketingPostPreviewPage = lazy(
  () => import('../pages/marketing/MarketingPostPreviewPage.jsx'),
);
const NotFoundPage = lazy(() => import('../pages/NotFoundPage.jsx'));

const ADMIN_AREA_ROLES = ['ADMIN', 'SUPER_ADMIN', 'MODERATOR', 'SUPPORT'];

function LocaleValidator({ children }) {
  const { locale } = useParams();

  // Phase 20 (SEO) §25: `index.html`'s static `lang="hy"` never reflects a
  // client-side locale switch/direct-navigation on its own — this is the
  // one place every locale-prefixed route already passes through, so it's
  // the correct single spot to keep `<html lang>` honest for a11y/SEO.
  useEffect(() => {
    if (SUPPORTED_LOCALES.includes(locale)) {
      document.documentElement.lang = locale;
    }
  }, [locale]);

  if (!SUPPORTED_LOCALES.includes(locale)) {
    return (
      <ErrorLayout>
        <NotFoundPage />
      </ErrorLayout>
    );
  }
  return children;
}

LocaleValidator.propTypes = {
  children: PropTypes.node.isRequired,
};

export default function AppRoutes() {
  return (
    <>
      <ScrollRestoration />
      <Suspense fallback={<PageLoader />}>
        <Routes>
          {/* Root — redirect to the default locale.
            A future sprint upgrades this to an Accept-Language-aware
            redirect (FRONTEND_ARCHITECTURE.md §4.1); a fixed default is
            the correct, honest interim behavior. */}
          <Route
            path="/"
            element={<Navigate to={`/${DEFAULT_LOCALE}`} replace />}
          />

          <Route
            path="/:locale"
            element={
              <LocaleValidator>
                <Outlet />
              </LocaleValidator>
            }
          >
            {/* Customer Website (§4.2) */}
            <Route element={<PublicLayout />}>
              <Route index element={<HomePage />} />
              <Route path="search" element={<SearchPage />} />
              <Route path="listings/:id" element={<ListingDetailPage />} />
              {/* Companies/Partners directory (Phase 10 redesign) —
                registered before `listings/:id`'s sibling routes matter
                less here since the segments don't overlap; kept adjacent
                to it since both are public content-browsing routes. */}
              <Route path="companies" element={<CompaniesPage />} />
              <Route path="companies/:slug" element={<CompanyProfilePage />} />
              {/* Category/Destination landing pages (Phase 20, SEO) — real
                indexable entry points into each category's/city's
                inventory, since Search itself is deliberately `noindex`
                (arbitrary filter combinations are a crawl trap). */}
              <Route
                path="categories/:categorySlug"
                element={<CategoryPage />}
              />
              <Route
                path="destinations/:citySlug"
                element={<DestinationPage />}
              />
              {/* Static/info pages (Phase 10 redesign) — previously dead
                footer/nav links, now real routed content. */}
              <Route path="about" element={<AboutPage />} />
              <Route path="contact" element={<ContactPage />} />
              <Route path="faq" element={<FaqPage />} />
              <Route path="help" element={<HelpCenterPage />} />
              <Route path="become-a-partner" element={<BecomePartnerPage />} />
              <Route path="blog" element={<BlogPage />} />
              <Route path="blog/:slug" element={<BlogPostPage />} />
            </Route>

            {/* Booking Flow (Phase 7) — checkout is RequireAuth-gated (a
              hold's `booking-holds` API is authenticated) but deliberately
              stays under the focused `PublicLayout` chrome rather than
              `CustomerAccountLayout`'s sidebar, matching a typical
              checkout flow's minimal-distraction convention. */}
            <Route
              element={
                <RequireAuth>
                  <PublicLayout />
                </RequireAuth>
              }
            >
              <Route
                path="booking/checkout"
                element={<BookingCheckoutPage />}
              />
            </Route>

            {/* Auth (§4.2/§5.2) */}
            <Route element={<AuthLayout />}>
              <Route path="auth/login" element={<LoginPage />} />
              <Route path="auth/register" element={<RegisterPage />} />
              {/* Password reset (P0/P1 launch-audit remediation) — the
                token lives in the path, matching the existing
                `partner/invitations/:token` single-use-link convention;
                the user never sees or types it. */}
              <Route
                path="auth/forgot-password"
                element={<ForgotPasswordPage />}
              />
              <Route
                path="auth/reset-password/:token"
                element={<ResetPasswordPage />}
              />
            </Route>

            {/* Customer Account (§4.2/§5.3) — RequireAuth */}
            <Route
              element={
                <RequireAuth>
                  <CustomerAccountLayout />
                </RequireAuth>
              }
            >
              <Route path="account" element={<DashboardPage />} />
              <Route path="account/bookings" element={<BookingsPage />} />
              <Route
                path="account/bookings/:id"
                element={<BookingDetailPage />}
              />
              <Route path="account/payments" element={<PaymentsPage />} />
              <Route path="account/profile" element={<ProfilePage />} />
              <Route path="account/favorites" element={<FavoritesPage />} />
              <Route
                path="account/trip-planner"
                element={<TripPlannerPage />}
              />
              <Route
                path="account/notifications"
                element={<NotificationsPage />}
              />
              <Route path="account/messages" element={<MessagesPage />} />
              <Route
                path="account/messages/:conversationId"
                element={<MessagesPage />}
              />
              <Route path="account/settings" element={<SettingsPage />} />
            </Route>

            {/* Partner Onboarding (P1.2, Master Roadmap) — RequireAuth only,
              deliberately NOT RequirePartner: an applicant has no
              partnership yet, so gating this behind `RequirePartner`
              would make the application flow unreachable. Kept under the
              focused `PublicLayout` chrome, same precedent as the
              Booking Flow group above — a form-centric flow, not a
              partner-dashboard page. */}
            <Route
              element={
                <RequireAuth>
                  <PublicLayout />
                </RequireAuth>
              }
            >
              <Route
                path="partner/apply"
                element={<PartnerApplicationPage />}
              />
              {/* P1.4 (Master Roadmap) — accepted by the INVITEE, who has
                no partnership yet (that's the whole point), so this is
                RequireAuth only, same grouping reason as `partner/apply`
                above. */}
              <Route
                path="partner/invitations/:token"
                element={<AcceptInvitationPage />}
              />
            </Route>

            {/* Partner (§4.2/§5.4) — RequireAuth + RequirePartner (Phase 5:
              the `partners` backend module now exists, so this is a real
              partner-membership check, not the RequireAuth-only
              placeholder PartnerLayout.jsx previously flagged).
              `PartnerProvider` (Phase 9) is mounted here, inside
              `RequirePartner` — its "which partner org am I acting as"
              state has nothing meaningful to hold before
              `partnerships.length > 0` is already guaranteed. */}
            <Route
              element={
                <RequireAuth>
                  <RequirePartner>
                    <PartnerProvider>
                      <PartnerLayout />
                    </PartnerProvider>
                  </RequirePartner>
                </RequireAuth>
              }
            >
              <Route path="partner" element={<PartnerDashboardPage />} />
              <Route
                path="partner/listings"
                element={<PartnerListingsPage />}
              />
              <Route
                path="partner/listings/new"
                element={<PartnerListingWizardPage />}
              />
              <Route
                path="partner/listings/:id/rooms"
                element={<PartnerListingRoomsPage />}
              />
              <Route
                path="partner/bookings"
                element={<PartnerBookingsPage />}
              />
              <Route
                path="partner/bookings/:id"
                element={<PartnerBookingDetailPage />}
              />
              <Route
                path="partner/calendar"
                element={<PartnerCalendarPage />}
              />
              <Route
                path="partner/connections"
                element={<PartnerConnectionsPage />}
              />
              <Route path="partner/profile" element={<PartnerProfilePage />} />
              <Route path="partner/staff" element={<PartnerStaffPage />} />
              <Route
                path="partner/notifications"
                element={<PartnerNotificationsPage />}
              />
              <Route
                path="partner/messages"
                element={<PartnerMessagesPage />}
              />
              <Route
                path="partner/messages/:conversationId"
                element={<PartnerMessagesPage />}
              />
              <Route path="partner/ai/usage" element={<PartnerAiUsagePage />} />
            </Route>

            {/* Manager Workspace (Sprint F) — RequireAuth + RequireManager
              (a global-role check, not RequirePartner: Manager-company
              assignment is `manager_companies`, not `partner_employees`).
              `ManagerProvider` is mounted here, inside `RequireManager`,
              same placement rule `PartnerProvider` documents above. */}
            <Route
              element={
                <RequireAuth>
                  <RequireManager>
                    <ManagerProvider>
                      <ManagerLayout />
                    </ManagerProvider>
                  </RequireManager>
                </RequireAuth>
              }
            >
              <Route path="manager" element={<ManagerDashboardPage />} />
              <Route
                path="manager/companies"
                element={<ManagerCompaniesPage />}
              />
              <Route
                path="manager/listings"
                element={<ManagerListingsPage />}
              />
              <Route
                path="manager/listings/new"
                element={<ManagerListingWizardPage />}
              />
              <Route
                path="manager/listings/:id/rooms"
                element={<ManagerListingRoomsPage />}
              />
              <Route
                path="manager/bookings"
                element={<ManagerBookingsPage />}
              />
              <Route
                path="manager/bookings/:id"
                element={<ManagerBookingDetailPage />}
              />
              <Route
                path="manager/analytics"
                element={<ManagerAnalyticsPage />}
              />
            </Route>

            {/* Marketing/SMM Workspace (Sprint H) — RequireAuth +
              RequireRole roles={['MARKETING']} (a global-role check, same
              shape as Admin's below, not RequireManager's assignment-table
              check: Marketing's access is unscoped, via `blog.manage`/
              `blog.publish` permissions, not scoped to specific entities).
              Deliberately NOT shared with Admin's `/admin/blog` group —
              spec §16 requires Marketing never gain unrestricted Admin
              access, and Admin already has its own `/admin/blog` entry
              point into the same shared components. No Provider here,
              unlike Manager: see `MarketingLayout.jsx`'s file header for
              why no scoping context is needed. */}
            <Route
              element={
                <RequireAuth>
                  <RequireRole roles={['MARKETING']}>
                    <MarketingLayout />
                  </RequireRole>
                </RequireAuth>
              }
            >
              <Route path="marketing" element={<MarketingDashboardPage />} />
              <Route path="marketing/posts" element={<MarketingPostsPage />} />
              <Route
                path="marketing/posts/:id"
                element={<MarketingPostEditPage />}
              />
              <Route
                path="marketing/posts/:id/preview"
                element={<MarketingPostPreviewPage />}
              />
            </Route>

            {/* Admin (Phase 11) — RequireAuth + RequireRole (not
              RequirePartner: admin access is a global role, not a
              partner-membership relationship). Ships in stages — only
              the Dashboard exists as of 11.0; later stages add
              users/partners/listings/bookings/etc. routes here. */}
            <Route
              element={
                <RequireAuth>
                  <RequireRole roles={ADMIN_AREA_ROLES}>
                    <AdminLayout />
                  </RequireRole>
                </RequireAuth>
              }
            >
              <Route path="admin" element={<AdminDashboardPage />} />
              <Route path="admin/users" element={<AdminUsersPage />} />
              <Route path="admin/users/:id" element={<AdminUserDetailPage />} />
              <Route path="admin/partners" element={<AdminPartnersPage />} />
              <Route
                path="admin/partners/:id"
                element={<AdminPartnerDetailPage />}
              />
              <Route
                path="admin/listings"
                element={<AdminListingModerationPage />}
              />
              <Route
                path="admin/listings/:id"
                element={<AdminListingDetailPage />}
              />
              <Route
                path="admin/reviews"
                element={<AdminReviewModerationPage />}
              />
              <Route
                path="admin/reviews/:id"
                element={<AdminReviewDetailPage />}
              />
              <Route path="admin/inventory" element={<AdminInventoryPage />} />
              <Route
                path="admin/promotions"
                element={<AdminPromotionsPage />}
              />
              <Route path="admin/managers" element={<AdminManagersPage />} />
              <Route
                path="admin/managers/:id"
                element={<AdminManagerDetailPage />}
              />
              <Route
                path="admin/contact-inquiries"
                element={<AdminContactInquiriesPage />}
              />
              <Route path="admin/bookings" element={<AdminBookingsPage />} />
              <Route
                path="admin/bookings/:id"
                element={<AdminBookingDetailPage />}
              />
              <Route path="admin/payments" element={<AdminPaymentsPage />} />
              <Route
                path="admin/payments/:id"
                element={<AdminPaymentDetailPage />}
              />
              <Route
                path="admin/marketplace-config"
                element={<AdminMarketplaceConfigPage />}
              />
              <Route path="admin/cms" element={<AdminCmsPage />} />
              <Route path="admin/cms/:id" element={<AdminCmsDetailPage />} />
              <Route path="admin/blog" element={<AdminBlogPage />} />
              <Route
                path="admin/blog/:id"
                element={<AdminBlogPostEditPage />}
              />
              <Route
                path="admin/blog/:id/preview"
                element={<AdminBlogPostPreviewPage />}
              />
              <Route path="admin/audit-logs" element={<AdminAuditLogsPage />} />
              <Route
                path="admin/system-health"
                element={<AdminSystemHealthPage />}
              />
              <Route path="admin/settings" element={<AdminSettingsPage />} />
              <Route
                path="admin/ai/moderation"
                element={<AdminAiModerationPage />}
              />
              <Route path="admin/ai/usage" element={<AdminAiUsagePage />} />
              <Route
                path="admin/notifications"
                element={<AdminNotificationsPage />}
              />
              <Route path="admin/messages" element={<AdminMessagesPage />} />
              <Route
                path="admin/messages/:conversationId"
                element={<AdminMessagesPage />}
              />
            </Route>
          </Route>

          <Route
            path="*"
            element={
              <ErrorLayout>
                <NotFoundPage />
              </ErrorLayout>
            }
          />
        </Routes>
      </Suspense>
    </>
  );
}
