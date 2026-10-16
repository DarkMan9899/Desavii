/**
 * CustomerAccountLayout — FRONTEND_ARCHITECTURE.md §5.3: persistent
 * sidebar (Bookings, Profile, Favorites, Trip Planner, Messages,
 * Notifications, Settings, plus an Overview landing item) and a condensed
 * header. Phase 12 (Product Polish) added Favorites; Phase 13 added
 * Notifications; Phase 14 added Messages; Phase 15 added Trip Planner,
 * once each module was real. Wallet stays out — its backend module still
 * doesn't exist. Composed behind `RequireAuth`
 * at the route level (`routes/index.jsx`), not here — this component
 * assumes an authenticated session.
 *
 * 2026 Customer Account redesign: `Sidebar` now renders with
 * `variant="premium"` (an additive, opt-in modifier added to the shared
 * component — see its own module header — so `PartnerLayout`/
 * `AdminLayout`, which don't pass `variant`, are visually unaffected) and
 * each nav item carries a `lucide-react` icon. `AccountIdentityCard`
 * (customer-only, lives in this same module) sits above the nav. Neither
 * change touches `Header`, which stays the exact shared component every
 * layout uses.
 */

import { Outlet, useParams, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  LayoutDashboard,
  CalendarCheck,
  CreditCard,
  User,
  Heart,
  Sparkles,
  MessageCircle,
  Bell,
  Settings as SettingsIcon,
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
import { AccountIdentityCard } from '../modules/profile/index.js';
import { useAuth } from '../contexts/AuthContext.jsx';
import useNoIndex from '../seo/useNoIndex.js';
import findActiveNavItemId from '../utils/navigationMatch.js';
import styles from './CustomerAccountLayout.module.scss';

export default function CustomerAccountLayout() {
  useNoIndex();
  const { t } = useTranslation();
  const { locale } = useParams();
  const location = useLocation();
  const { user } = useAuth();

  const navItems = [
    {
      id: 'dashboard',
      label: t('account.nav.dashboard'),
      href: `/${locale}/account`,
      icon: <LayoutDashboard aria-hidden="true" focusable="false" />,
    },
    {
      id: 'bookings',
      label: t('account.nav.bookings'),
      href: `/${locale}/account/bookings`,
      icon: <CalendarCheck aria-hidden="true" focusable="false" />,
    },
    {
      id: 'payments',
      label: t('account.nav.payments'),
      href: `/${locale}/account/payments`,
      icon: <CreditCard aria-hidden="true" focusable="false" />,
    },
    {
      id: 'profile',
      label: t('account.nav.profile'),
      href: `/${locale}/account/profile`,
      icon: <User aria-hidden="true" focusable="false" />,
    },
    {
      id: 'favorites',
      label: t('account.nav.favorites'),
      href: `/${locale}/account/favorites`,
      icon: <Heart aria-hidden="true" focusable="false" />,
    },
    {
      id: 'trip-planner',
      label: t('account.nav.tripPlanner'),
      href: `/${locale}/account/trip-planner`,
      icon: <Sparkles aria-hidden="true" focusable="false" />,
    },
    {
      id: 'messages',
      label: t('account.nav.messages'),
      href: `/${locale}/account/messages`,
      icon: <MessageCircle aria-hidden="true" focusable="false" />,
    },
    {
      id: 'notifications',
      label: t('account.nav.notifications'),
      href: `/${locale}/account/notifications`,
      icon: <Bell aria-hidden="true" focusable="false" />,
    },
    {
      id: 'settings',
      label: t('account.nav.settings'),
      href: `/${locale}/account/settings`,
      icon: <SettingsIcon aria-hidden="true" focusable="false" />,
    },
  ];

  // The section owning the current page: the longest matching href, so a
  // nested route still highlights its parent item (`findActiveNavItemId`).
  const activeItemId = findActiveNavItemId(navItems, location.pathname);

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
              <NotificationBell />
              <AiAssistantTrigger />
              <UserMenu />
            </>
          }
        />
      }
    >
      <div className={styles.ambient} aria-hidden="true" />
      <Container size="wide" className={styles.body}>
        <div className={styles.sidebarColumn}>
          <AccountIdentityCard user={user} locale={locale} />
          <Sidebar
            items={[{ id: 'account', items: navItems }]}
            activeItemId={activeItemId}
            linkComponent={RouterLink}
            ariaLabel={t('nav.account')}
            variant="premium"
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
