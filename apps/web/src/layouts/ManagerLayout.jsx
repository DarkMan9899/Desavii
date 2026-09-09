/**
 * ManagerLayout — Sprint F (Manager Workspace). Structurally mirrors
 * `PartnerLayout.jsx` (same `Sidebar`/`Header`/`Container size="wide"`
 * mechanics, same longest-matching-prefix `activeItemId` logic), with a
 * deliberately SHORTER nav — a Manager's workspace is scoped to assigned
 * companies only, not the full Partner-workspace surface (no Connections/
 * Staff, spec §10: "do not copy the entire Admin sidebar... do not expose
 * irrelevant Admin routes" applies equally to over-copying Partner's).
 *
 * Composed behind `RequireAuth` + `RequireManager` + `ManagerProvider`
 * (`routes/index.jsx`).
 */

import { Outlet, useParams, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  LayoutDashboard,
  Building2,
  ListChecks,
  CalendarCheck,
  BarChart3,
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
import useNoIndex from '../seo/useNoIndex.js';
import styles from './ManagerLayout.module.scss';

export default function ManagerLayout() {
  const { t } = useTranslation();
  const { locale } = useParams();
  const location = useLocation();
  useNoIndex();

  const navItems = [
    {
      id: 'dashboard',
      label: t('manager.nav.dashboard'),
      href: `/${locale}/manager`,
      icon: <LayoutDashboard aria-hidden="true" focusable="false" />,
    },
    {
      id: 'companies',
      label: t('manager.nav.companies'),
      href: `/${locale}/manager/companies`,
      icon: <Building2 aria-hidden="true" focusable="false" />,
    },
    {
      id: 'listings',
      label: t('manager.nav.listings'),
      href: `/${locale}/manager/listings`,
      icon: <ListChecks aria-hidden="true" focusable="false" />,
    },
    {
      id: 'bookings',
      label: t('manager.nav.bookings'),
      href: `/${locale}/manager/bookings`,
      icon: <CalendarCheck aria-hidden="true" focusable="false" />,
    },
    {
      id: 'analytics',
      label: t('manager.nav.analytics'),
      href: `/${locale}/manager/analytics`,
      icon: <BarChart3 aria-hidden="true" focusable="false" />,
    },
  ];

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
              <UserMenu />
            </>
          }
        />
      }
    >
      <Container size="wide" className={styles.body}>
        <Sidebar
          items={[{ id: 'manager', items: navItems }]}
          activeItemId={activeItemId}
          linkComponent={RouterLink}
          ariaLabel={t('nav.manager')}
          className={styles.sidebar}
        />
        <div className={styles.content}>
          <Outlet />
        </div>
      </Container>
    </AppLayout>
  );
}
