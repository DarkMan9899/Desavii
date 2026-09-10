/**
 * AdminLayout — Phase 11 Admin Platform. Structurally identical to
 * `PartnerLayout` (same `Sidebar`/`Header`/`Container size="wide"`
 * mechanics, same longest-matching-prefix `activeItemId` logic) — no new
 * layout paradigm invented. Breadcrumbs are per-page via `PageHeader`,
 * same as every other dashboard-style layout in this app.
 *
 * Composed behind `RequireAuth` + `RequireRole` (`routes/index.jsx`) —
 * no `PartnerProvider`-equivalent context is needed here: there is no
 * "which one of several admin orgs" concept to switch between.
 *
 * Nav items whose page is a plain role-only read (Dashboard, Partners,
 * Marketplace Config, CMS, System Health, Settings, Messages,
 * Notifications) are shown unconditionally to every admin-area role — a
 * SUPPORT/MODERATOR user who lacks the permission for that page's
 * *mutations* still sees the nav entry and a real read-only view;
 * per-action gating for those happens inside each page (a disabled/
 * absent "Suspend" button), not by hiding the nav.
 *
 * Phase 14.10 cleanup: several pages' underlying *read* endpoint is
 * itself permission-gated, not just role-gated (`GET /users` needs
 * `user.list`, `GET /bookings?viewAll=true` needs `booking.view_all`,
 * `GET /admin/audit-logs` needs `audit.view`, `GET /listings/admin`
 * needs `listing.moderate`) — MODERATOR lacks the first three, SUPPORT
 * lacks the fourth. Showing those nav entries to a role that can't even
 * load the page is a dead end, not a legitimate read-only view, so those
 * are filtered by `requiredPermission` below instead. Stage 15.6 adds two
 * more of the same shape: `GET /ai/admin/moderation-queue` needs
 * `ai.admin_tools`, `GET /ai/admin/usage` needs `ai.usage_view`.
 *
 * Phase 11 ships in stages (11.0 Dashboard, 11.1 Users, 11.2 Partners,
 * ...) — a nav item is added here only once its route actually exists,
 * never ahead of time as a dead link.
 *
 * 2026 Admin Workspace redesign: the same 17 items now render under
 * labeled sections (`Sidebar`'s `groupId`-driven multi-group support,
 * unused by any layout until now) instead of one flat list — Marketplace/
 * Users/Partners/Listings/Bookings/Reviews/Operations/Content/AI/System,
 * with Dashboard alone staying an unlabeled top entry. `variant="compact"`
 * (new, additive `Sidebar` variant) trades the default's roomier spacing
 * for a denser, operational read — deliberate: Admin is a control system
 * for a small internal team, not a consumer-facing nav that needs the
 * same breathing room as Partner/Customer.
 */

import { Outlet, useParams, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  LayoutDashboard,
  Users as UsersIcon,
  Building2,
  ListChecks,
  CalendarCheck,
  CreditCard,
  Star,
  Package,
  ScrollText,
  Activity,
  SlidersHorizontal,
  FileText,
  Settings as SettingsIcon,
  ShieldAlert,
  Sparkles,
  MessageCircle,
  Bell,
  Megaphone,
  UserCog,
  Mail,
  Newspaper,
} from 'lucide-react';
import { Sidebar } from '@desavii/ui/components/navigation';
import { Container } from '@desavii/ui/components/layout';
import AppLayout from './AppLayout.jsx';
import Header from '../components/Header/Header.jsx';
import UserMenu from '../components/UserMenu/UserMenu.jsx';
import LanguageSwitcher from '../components/LanguageSwitcher/LanguageSwitcher.jsx';
import RouterLink from '../components/RouterLink.jsx';
import { useAuth } from '../contexts/AuthContext.jsx';
import { NotificationBell } from '../modules/notifications/index.js';
import { MessagingBell } from '../modules/messaging/index.js';
import { AiAssistantTrigger } from '../modules/ai/index.js';
import useNoIndex from '../seo/useNoIndex.js';
import styles from './AdminLayout.module.scss';

export default function AdminLayout() {
  const { t } = useTranslation();
  const { locale } = useParams();
  const location = useLocation();
  const { permissions } = useAuth();
  useNoIndex();

  // 2026 Admin redesign: the same 17 real nav items as before (same ids/
  // hrefs/permission gates — Phase 14.10's dead-end-avoidance logic is
  // untouched), now carrying an icon and a `groupId` so they render under
  // labeled sections (`Sidebar`'s existing multi-group support — see that
  // component's own header, this is its first real consumer) instead of
  // one flat 17-item list. Grouping mirrors the redesign brief's own
  // section names; Dashboard alone stays ungrouped (no `groupId`) as the
  // sidebar's un-labeled first entry, matching how a landing/overview
  // item conventionally sits above sectioned nav.
  const allNavItems = [
    {
      id: 'dashboard',
      label: t('admin.nav.dashboard'),
      href: `/${locale}/admin`,
      icon: <LayoutDashboard aria-hidden="true" focusable="false" />,
    },
    {
      id: 'users',
      groupId: 'users',
      label: t('admin.nav.users'),
      href: `/${locale}/admin/users`,
      icon: <UsersIcon aria-hidden="true" focusable="false" />,
      requiredPermission: 'user.list',
    },
    {
      id: 'partners',
      groupId: 'partners',
      label: t('admin.nav.partners'),
      href: `/${locale}/admin/partners`,
      icon: <Building2 aria-hidden="true" focusable="false" />,
    },
    {
      id: 'managers',
      groupId: 'partners',
      label: t('admin.nav.managers'),
      href: `/${locale}/admin/managers`,
      icon: <UserCog aria-hidden="true" focusable="false" />,
      // Sprint F: the whole /admin/managers route tree requires the real
      // `manager.assign` permission server-side — same
      // "hides a dead-end 403" reasoning the Promotions nav item's own
      // comment documents (`promotion.mark_paid`, above).
      requiredPermission: 'manager.assign',
    },
    {
      id: 'listings',
      groupId: 'listings',
      label: t('admin.nav.listings'),
      href: `/${locale}/admin/listings`,
      icon: <ListChecks aria-hidden="true" focusable="false" />,
      requiredPermission: 'listing.moderate',
    },
    {
      id: 'reviews',
      groupId: 'reviews',
      label: t('admin.nav.reviews'),
      href: `/${locale}/admin/reviews`,
      icon: <Star aria-hidden="true" focusable="false" />,
      requiredPermission: 'review.moderate',
    },
    {
      id: 'bookings',
      groupId: 'bookings',
      label: t('admin.nav.bookings'),
      href: `/${locale}/admin/bookings`,
      icon: <CalendarCheck aria-hidden="true" focusable="false" />,
      requiredPermission: 'booking.view_all',
    },
    {
      id: 'payments',
      groupId: 'bookings',
      label: t('admin.nav.payments'),
      href: `/${locale}/admin/payments`,
      icon: <CreditCard aria-hidden="true" focusable="false" />,
      requiredPermission: 'payment.view',
    },
    {
      id: 'marketplace-config',
      groupId: 'marketplace',
      label: t('admin.nav.marketplaceConfig'),
      href: `/${locale}/admin/marketplace-config`,
      icon: <SlidersHorizontal aria-hidden="true" focusable="false" />,
    },
    {
      id: 'promotions',
      groupId: 'marketplace',
      label: t('admin.nav.promotions'),
      href: `/${locale}/admin/promotions`,
      icon: <Megaphone aria-hidden="true" focusable="false" />,
      // Sprint E: the page itself is ADMIN/SUPER_ADMIN-only
      // (`requireRole`, no MODERATOR/SUPPORT access at all) — unlike
      // every `requiredPermission` item above, which still loads a
      // real read-only view for a role missing just the mutation
      // permission. `promotion.mark_paid` is held by exactly ADMIN/
      // SUPER_ADMIN (MODERATOR only has `promotion.approve`,
      // `004_roles_and_permissions.js`), so reusing it here hides this
      // link from any role that would otherwise hit a dead-end 403.
      requiredPermission: 'promotion.mark_paid',
    },
    {
      id: 'inventory',
      groupId: 'operations',
      label: t('admin.nav.inventory'),
      href: `/${locale}/admin/inventory`,
      icon: <Package aria-hidden="true" focusable="false" />,
      requiredPermission: 'inventory.view_all',
    },
    {
      id: 'audit-logs',
      groupId: 'operations',
      label: t('admin.nav.auditLogs'),
      href: `/${locale}/admin/audit-logs`,
      icon: <ScrollText aria-hidden="true" focusable="false" />,
      requiredPermission: 'audit.view',
    },
    {
      id: 'system-health',
      groupId: 'operations',
      label: t('admin.nav.systemHealth'),
      href: `/${locale}/admin/system-health`,
      icon: <Activity aria-hidden="true" focusable="false" />,
    },
    {
      id: 'cms',
      groupId: 'content',
      label: t('admin.nav.cms'),
      href: `/${locale}/admin/cms`,
      icon: <FileText aria-hidden="true" focusable="false" />,
    },
    {
      id: 'blog',
      groupId: 'content',
      label: t('admin.nav.blog'),
      href: `/${locale}/admin/blog`,
      icon: <Newspaper aria-hidden="true" focusable="false" />,
      // Sprint H: the /admin/blog route tree requires `blog.manage`
      // server-side — same "hides a dead-end 403" reasoning as the
      // Managers/Promotions/Contact Inquiries nav items above.
      requiredPermission: 'blog.manage',
    },
    {
      id: 'contact-inquiries',
      groupId: 'content',
      label: t('admin.nav.contactInquiries'),
      href: `/${locale}/admin/contact-inquiries`,
      icon: <Mail aria-hidden="true" focusable="false" />,
      // Sprint G: same "hides a dead-end 403" reasoning as the Managers/
      // Promotions nav items above — the route requires `contact.manage`
      // server-side.
      requiredPermission: 'contact.manage',
    },
    {
      id: 'ai-moderation',
      groupId: 'ai',
      label: t('admin.nav.aiModeration'),
      href: `/${locale}/admin/ai/moderation`,
      icon: <ShieldAlert aria-hidden="true" focusable="false" />,
      requiredPermission: 'ai.admin_tools',
    },
    {
      id: 'ai-usage',
      groupId: 'ai',
      label: t('admin.nav.aiUsage'),
      href: `/${locale}/admin/ai/usage`,
      icon: <Sparkles aria-hidden="true" focusable="false" />,
      requiredPermission: 'ai.usage_view',
    },
    {
      id: 'settings',
      groupId: 'system',
      label: t('admin.nav.settings'),
      href: `/${locale}/admin/settings`,
      icon: <SettingsIcon aria-hidden="true" focusable="false" />,
    },
    {
      id: 'messages',
      groupId: 'system',
      label: t('admin.nav.messages'),
      href: `/${locale}/admin/messages`,
      icon: <MessageCircle aria-hidden="true" focusable="false" />,
    },
    {
      id: 'notifications',
      groupId: 'system',
      label: t('admin.nav.notifications'),
      href: `/${locale}/admin/notifications`,
      icon: <Bell aria-hidden="true" focusable="false" />,
    },
  ];

  const navItems = allNavItems.filter(
    (item) =>
      !item.requiredPermission || permissions.includes(item.requiredPermission),
  );

  const GROUP_ORDER = [
    'marketplace',
    'users',
    'partners',
    'listings',
    'bookings',
    'reviews',
    'operations',
    'content',
    'ai',
    'system',
  ];
  const groupedItems = [
    // Dashboard first, unlabeled — matches the sidebar convention every
    // other layout in this app uses for a single top-level landing item.
    { id: 'overview', items: navItems.filter((item) => !item.groupId) },
    ...GROUP_ORDER.map((groupId) => ({
      id: groupId,
      label: t(`admin.nav.groups.${groupId}`),
      items: navItems.filter((item) => item.groupId === groupId),
    })),
    // A role with none of a group's items filtered in must not render an
    // empty labeled section.
  ].filter((group) => group.items.length > 0);

  // Longest-matching-prefix, mirroring `PartnerLayout`/
  // `CustomerAccountLayout` exactly.
  const activeItemId = [...navItems]
    .reverse()
    .find(
      (item) =>
        location.pathname === item.href ||
        location.pathname.startsWith(`${item.href}/`),
    )?.id;

  return (
    <AppLayout
      header={
        <Header
          logo={t('app.name')}
          homeHref={`/${locale}`}
          actions={
            <>
              <LanguageSwitcher />
              <MessagingBell />
              <NotificationBell audience="admin" />
              <AiAssistantTrigger />
              <UserMenu />
            </>
          }
        />
      }
    >
      <Container size="wide" className={styles.body}>
        <Sidebar
          items={groupedItems}
          activeItemId={activeItemId}
          linkComponent={RouterLink}
          ariaLabel={t('nav.admin')}
          className={styles.sidebar}
          variant="compact"
        />
        <div className={styles.content}>
          <Outlet />
        </div>
      </Container>
    </AppLayout>
  );
}
