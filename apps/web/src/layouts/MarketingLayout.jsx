/**
 * MarketingLayout — Sprint H (Blog + Marketing/SMM Workspace). Structurally
 * mirrors `ManagerLayout.jsx` (same `Sidebar`/`Header`/`Container size="wide"`
 * mechanics, same longest-matching-prefix `activeItemId` logic), with an
 * even shorter nav — spec §18 asks for a small, focused workspace
 * (Dashboard, Blog Posts), not a copy of Admin's sidebar.
 *
 * Unlike `ManagerLayout`, there is no `MarketingProvider`/context layer:
 * Manager's Context exists because a Manager's access is *scoped* to a
 * specific set of assigned companies the UI must let them switch between;
 * Marketing's access is unscoped (every blog post, via the `blog.manage`/
 * `blog.publish` permissions), so there is nothing to switch between.
 *
 * Composed behind `RequireAuth` + `RequireRole roles={['MARKETING']}`
 * (`routes/index.jsx`) — deliberately not shared with Admin's `/admin/blog`
 * route group (spec §16: Marketing must not gain unrestricted Admin access,
 * and Admin already has its own `/admin/blog` entry point).
 */

import { Outlet, useParams, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LayoutDashboard, Newspaper } from 'lucide-react';
import { Sidebar } from '@desavii/ui/components/navigation';
import { Container } from '@desavii/ui/components/layout';
import AppLayout from './AppLayout.jsx';
import Header from '../components/Header/Header.jsx';
import UserMenu from '../components/UserMenu/UserMenu.jsx';
import LanguageSwitcher from '../components/LanguageSwitcher/LanguageSwitcher.jsx';
import RouterLink from '../components/RouterLink.jsx';
import useNoIndex from '../seo/useNoIndex.js';
import styles from './MarketingLayout.module.scss';

export default function MarketingLayout() {
  const { t } = useTranslation();
  const { locale } = useParams();
  const location = useLocation();
  useNoIndex();

  const navItems = [
    {
      id: 'dashboard',
      label: t('marketing.nav.dashboard'),
      href: `/${locale}/marketing`,
      icon: <LayoutDashboard aria-hidden="true" focusable="false" />,
    },
    {
      id: 'posts',
      label: t('marketing.nav.posts'),
      href: `/${locale}/marketing/posts`,
      icon: <Newspaper aria-hidden="true" focusable="false" />,
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
              <UserMenu />
            </>
          }
        />
      }
    >
      <Container size="wide" className={styles.body}>
        <Sidebar
          items={[{ id: 'marketing', items: navItems }]}
          activeItemId={activeItemId}
          linkComponent={RouterLink}
          ariaLabel={t('nav.marketing')}
          className={styles.sidebar}
        />
        <div className={styles.content}>
          <Outlet />
        </div>
      </Container>
    </AppLayout>
  );
}
