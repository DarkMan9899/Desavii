/**
 * PartnerLayout — FRONTEND_ARCHITECTURE.md §5.4: same sidebar mechanics
 * as `CustomerAccountLayout`, Wide container. Phase 9 (Partner Dashboard)
 * fills out the nav with the four routes that now actually exist
 * (Overview/Listings/Bookings/Calendar) and adopts
 * `CustomerAccountLayout`'s longest-matching-prefix `activeItemId` logic
 * (this phase adds nested routes like `partner/bookings/:id`, which the
 * previous exact-match check would never highlight).
 *
 * Composed behind `RequireAuth` + `RequirePartner` (`routes/index.jsx`).
 * Phase 5 added the `partners` backend module and `AuthContext`'s
 * `partnerships` field specifically to make `RequirePartner` a real
 * partner-membership check — this layout previously flagged that no such
 * check was possible yet; that limitation is resolved.
 *
 * 2026 Partner Workspace redesign: each nav item now carries a
 * `lucide-react` icon (`Sidebar` already supported `item.icon`, unused
 * here until now) and `PartnerWorkspaceIdentity` sits above the nav —
 * the same structural placement as `CustomerAccountLayout`'s
 * `AccountIdentityCard`, but its own component with its own restrained
 * navy styling rather than that card's soft-elevation "premium" look
 * (see the component's own header for why). `Sidebar` intentionally does
 * NOT get `variant="premium"` here — that variant is the Customer
 * Account visual language; Partner Workspace's brief calls for a calmer,
 * denser, more operational register, which the component's *default*
 * (white surface, thin border, royal-blue active state) already reads
 * as, so no variant override is needed.
 */

import { Outlet, useParams, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  LayoutDashboard,
  ListChecks,
  CalendarCheck,
  CalendarRange,
  Plug,
  Building2,
  Users,
  MessageCircle,
  Bell,
  Sparkles,
  LineChart,
} from 'lucide-react';
import { Sidebar } from '@desavii/ui/components/navigation';
import { Container } from '@desavii/ui/components/layout';
import AppLayout from './AppLayout.jsx';
import Header from '../components/Header/Header.jsx';
import UserMenu from '../components/UserMenu/UserMenu.jsx';
import LanguageSwitcher from '../components/LanguageSwitcher/LanguageSwitcher.jsx';
import RouterLink from '../components/RouterLink.jsx';
import { NotificationBell } from '../modules/notifications/index.js';
import { MessagingBell } from '../modules/messaging/index.js';
import { AiAssistantTrigger } from '../modules/ai/index.js';
import { PartnerWorkspaceIdentity } from '../modules/partner/index.js';
import {
  usePartnerCapability,
  PARTNER_CAPABILITIES,
} from '../modules/availability/index.js';
import { usePartnerContext } from '../contexts/PartnerContext.jsx';
import useNoIndex from '../seo/useNoIndex.js';
import styles from './PartnerLayout.module.scss';

export default function PartnerLayout() {
  const { t } = useTranslation();
  const { locale } = useParams();
  const location = useLocation();
  const { activePartner } = usePartnerContext();
  const canViewAnalytics = usePartnerCapability(
    PARTNER_CAPABILITIES.VIEW_ANALYTICS,
  );
  useNoIndex();

  const navItems = [
    {
      id: 'dashboard',
      label: t('partner.nav.dashboard'),
      href: `/${locale}/partner`,
      icon: <LayoutDashboard aria-hidden="true" focusable="false" />,
    },
    {
      id: 'listings',
      label: t('partner.nav.listings'),
      href: `/${locale}/partner/listings`,
      icon: <ListChecks aria-hidden="true" focusable="false" />,
    },
    {
      id: 'bookings',
      label: t('partner.nav.bookings'),
      href: `/${locale}/partner/bookings`,
      icon: <CalendarCheck aria-hidden="true" focusable="false" />,
    },
    {
      id: 'calendar',
      label: t('partner.nav.calendar'),
      href: `/${locale}/partner/calendar`,
      icon: <CalendarRange aria-hidden="true" focusable="false" />,
    },
    // Step A6 (Partner Analytics Dashboard UI): discoverable only to a
    // membership whose role grants VIEW_ANALYTICS (brief §5) — server
    // remains the real authority (`PartnerAnalyticsService`'s own gate);
    // this only keeps the nav from inviting a role that would 403.
    ...(canViewAnalytics
      ? [
          {
            id: 'analytics',
            label: t('partner.nav.analytics'),
            href: `/${locale}/partner/analytics`,
            icon: <LineChart aria-hidden="true" focusable="false" />,
          },
        ]
      : []),
    {
      id: 'connections',
      label: t('partner.nav.connections'),
      href: `/${locale}/partner/connections`,
      icon: <Plug aria-hidden="true" focusable="false" />,
    },
    {
      id: 'profile',
      label: t('partner.nav.profile'),
      href: `/${locale}/partner/profile`,
      icon: <Building2 aria-hidden="true" focusable="false" />,
    },
    {
      id: 'staff',
      label: t('partner.nav.staff'),
      href: `/${locale}/partner/staff`,
      icon: <Users aria-hidden="true" focusable="false" />,
    },
    {
      id: 'messages',
      label: t('partner.nav.messages'),
      href: `/${locale}/partner/messages`,
      icon: <MessageCircle aria-hidden="true" focusable="false" />,
    },
    {
      id: 'notifications',
      label: t('partner.nav.notifications'),
      href: `/${locale}/partner/notifications`,
      icon: <Bell aria-hidden="true" focusable="false" />,
    },
    {
      id: 'ai-usage',
      label: t('partner.nav.aiUsage'),
      href: `/${locale}/partner/ai/usage`,
      icon: <Sparkles aria-hidden="true" focusable="false" />,
    },
  ];

  // Longest-matching-prefix, not exact match — mirrors
  // `CustomerAccountLayout`'s own logic exactly, for the same reason: a
  // nested route (`partner/bookings/:id`) still highlights its owning
  // nav item, and reverse order + `find` makes the most specific href
  // win over `partner/bookings` matching `partner/bookings/:id`'s prefix
  // (and, at the far end, `dashboard`'s href never wrongly wins since
  // every other href is checked first).
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
              <NotificationBell audience="partner" />
              <AiAssistantTrigger />
              <UserMenu />
            </>
          }
        />
      }
    >
      <Container size="wide" className={styles.body}>
        <div className={styles.sidebarColumn}>
          <PartnerWorkspaceIdentity
            activePartner={activePartner}
            locale={locale}
          />
          <Sidebar
            items={[{ id: 'partner', items: navItems }]}
            activeItemId={activeItemId}
            linkComponent={RouterLink}
            ariaLabel={t('nav.partner')}
            className={styles.sidebar}
          />
        </div>
        <div className={styles.content}>
          <Outlet />
        </div>
      </Container>
    </AppLayout>
  );
}
