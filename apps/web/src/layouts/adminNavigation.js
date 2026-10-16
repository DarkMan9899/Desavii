/**
 * The Admin workspace's sections — one map that both draws the sidebar
 * and decides who may open each section, so a link and the page it opens
 * can never disagree (`AdminLayout`).
 *
 * `path` is the section's route under `/:locale/admin` ('' is the
 * Dashboard); every admin route belongs to the section whose path is its
 * longest prefix (`admin/users/:id` → Users).
 *
 * `requiredPermission` mirrors the permission the section's own read
 * endpoint requires server-side, so a role never gets a link — or, via a
 * typed URL, a page — that can only fail with 403 (Phase 14.10's "a dead
 * end is not a read-only view"). A list means any one of them is enough.
 * Sections without one (Dashboard, Marketplace Config, System Health, CMS,
 * Settings, Messages, Notifications) are role-only reads: every admin-area
 * role sees them, and per-action gating happens inside each page.
 *   - Users `user.list`; Bookings `booking.view_all`; Payments
 *     `payment.view`; Audit Logs `audit.view`; Inventory
 *     `inventory.view_all`; Listings `listing.moderate`; Reviews
 *     `review.moderate`; AI Moderation `ai.admin_tools`; AI Usage
 *     `ai.usage_view` — each the gate on that page's own list endpoint.
 *   - Partners: `GET /partners/admin` accepts `partner.verify` OR
 *     `partner.moderate` (SUPPORT has neither — it used to get a 403).
 *   - Managers `manager.assign`, Blog `blog.manage`, Contact Inquiries
 *     `contact.manage`: their whole route tree requires it server-side.
 *   - Promotions: the page is ADMIN/SUPER_ADMIN-only (`requireRole`);
 *     `promotion.mark_paid` is held by exactly those two roles
 *     (MODERATOR only has `promotion.approve`).
 *
 * `groupId` places the item under a labeled sidebar section
 * (`ADMIN_NAV_GROUP_ORDER`); the Dashboard has none and leads, unlabeled.
 */

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

export const ADMIN_NAV_ITEMS = [
  {
    id: 'dashboard',
    path: '',
    labelKey: 'admin.nav.dashboard',
    Icon: LayoutDashboard,
  },
  {
    id: 'users',
    groupId: 'users',
    path: 'users',
    labelKey: 'admin.nav.users',
    Icon: UsersIcon,
    requiredPermission: 'user.list',
  },
  {
    id: 'partners',
    groupId: 'partners',
    path: 'partners',
    labelKey: 'admin.nav.partners',
    Icon: Building2,
    requiredPermission: ['partner.verify', 'partner.moderate'],
  },
  {
    id: 'managers',
    groupId: 'partners',
    path: 'managers',
    labelKey: 'admin.nav.managers',
    Icon: UserCog,
    requiredPermission: 'manager.assign',
  },
  {
    id: 'listings',
    groupId: 'listings',
    path: 'listings',
    labelKey: 'admin.nav.listings',
    Icon: ListChecks,
    requiredPermission: 'listing.moderate',
  },
  {
    id: 'reviews',
    groupId: 'reviews',
    path: 'reviews',
    labelKey: 'admin.nav.reviews',
    Icon: Star,
    requiredPermission: 'review.moderate',
  },
  {
    id: 'bookings',
    groupId: 'bookings',
    path: 'bookings',
    labelKey: 'admin.nav.bookings',
    Icon: CalendarCheck,
    requiredPermission: 'booking.view_all',
  },
  {
    id: 'payments',
    groupId: 'bookings',
    path: 'payments',
    labelKey: 'admin.nav.payments',
    Icon: CreditCard,
    requiredPermission: 'payment.view',
  },
  {
    id: 'marketplace-config',
    groupId: 'marketplace',
    path: 'marketplace-config',
    labelKey: 'admin.nav.marketplaceConfig',
    Icon: SlidersHorizontal,
  },
  {
    id: 'promotions',
    groupId: 'marketplace',
    path: 'promotions',
    labelKey: 'admin.nav.promotions',
    Icon: Megaphone,
    requiredPermission: 'promotion.mark_paid',
  },
  {
    id: 'inventory',
    groupId: 'operations',
    path: 'inventory',
    labelKey: 'admin.nav.inventory',
    Icon: Package,
    requiredPermission: 'inventory.view_all',
  },
  {
    id: 'audit-logs',
    groupId: 'operations',
    path: 'audit-logs',
    labelKey: 'admin.nav.auditLogs',
    Icon: ScrollText,
    requiredPermission: 'audit.view',
  },
  {
    id: 'system-health',
    groupId: 'operations',
    path: 'system-health',
    labelKey: 'admin.nav.systemHealth',
    Icon: Activity,
  },
  {
    id: 'cms',
    groupId: 'content',
    path: 'cms',
    labelKey: 'admin.nav.cms',
    Icon: FileText,
  },
  {
    id: 'blog',
    groupId: 'content',
    path: 'blog',
    labelKey: 'admin.nav.blog',
    Icon: Newspaper,
    requiredPermission: 'blog.manage',
  },
  {
    id: 'contact-inquiries',
    groupId: 'content',
    path: 'contact-inquiries',
    labelKey: 'admin.nav.contactInquiries',
    Icon: Mail,
    requiredPermission: 'contact.manage',
  },
  {
    id: 'ai-moderation',
    groupId: 'ai',
    path: 'ai/moderation',
    labelKey: 'admin.nav.aiModeration',
    Icon: ShieldAlert,
    requiredPermission: 'ai.admin_tools',
  },
  {
    id: 'ai-usage',
    groupId: 'ai',
    path: 'ai/usage',
    labelKey: 'admin.nav.aiUsage',
    Icon: Sparkles,
    requiredPermission: 'ai.usage_view',
  },
  {
    id: 'settings',
    groupId: 'system',
    path: 'settings',
    labelKey: 'admin.nav.settings',
    Icon: SettingsIcon,
  },
  {
    id: 'messages',
    groupId: 'system',
    path: 'messages',
    labelKey: 'admin.nav.messages',
    Icon: MessageCircle,
  },
  {
    id: 'notifications',
    groupId: 'system',
    path: 'notifications',
    labelKey: 'admin.nav.notifications',
    Icon: Bell,
  },
];

export const ADMIN_NAV_GROUP_ORDER = [
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

export function adminSectionHref(locale, item) {
  return item.path ? `/${locale}/admin/${item.path}` : `/${locale}/admin`;
}

/** May a user holding `permissions` open this section? */
export function canOpenAdminSection(item, permissions) {
  if (!item.requiredPermission) return true;
  return []
    .concat(item.requiredPermission)
    .some((permission) => permissions.includes(permission));
}
