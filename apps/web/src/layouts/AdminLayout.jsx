/**
 * AdminLayout — Phase 11 Admin Platform. Structurally identical to
 * `PartnerLayout` (same `Sidebar`/`Header`/`Container size="wide"`
 * mechanics) — no new layout paradigm invented. Breadcrumbs are per-page
 * via `PageHeader`, same as every other dashboard-style layout in this
 * app.
 *
 * Composed behind `RequireAuth` + `RequireRole` (`routes/index.jsx`) —
 * no `PartnerProvider`-equivalent context is needed here: there is no
 * "which one of several admin orgs" concept to switch between.
 *
 * The sections come from `adminNavigation.js`, the one map of admin
 * sections, their routes and the permission each one's page needs (see
 * that file's header for every gate and why). This layout uses it twice
 * so a link and its page always agree:
 *  - the sidebar lists only the sections this role can open (a dead-end
 *    403 is not a read-only view — Phase 14.10);
 *  - a section the role cannot open, reached by a typed or bookmarked
 *    URL, renders `ForbiddenPage` in place of the page instead of a page
 *    whose data request can only fail.
 *
 * 2026 Admin Workspace redesign: the items render under labeled sections
 * (`Sidebar`'s `groupId`-driven multi-group support) instead of one flat
 * list — Marketplace/Users/Partners/Listings/Bookings/Reviews/Operations/
 * Content/AI/System, with Dashboard alone staying an unlabeled top entry.
 * `variant="compact"` trades the default's roomier spacing for a denser,
 * operational read — Admin is a control system for a small internal
 * team, not a consumer-facing nav.
 *
 * The active item is the section owning the current page
 * (`findActiveNavItemId`, longest matching prefix, so a detail page
 * highlights its list). The Dashboard matches only `/admin` itself: as a
 * prefix of every admin path it would otherwise light up for any page
 * whose section is hidden from this role.
 */

import { Outlet, useParams, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Sidebar } from '@desavii/ui/components/navigation';
import { Container } from '@desavii/ui/components/layout';
import AppLayout from './AppLayout.jsx';
import Header from '../components/Header/Header.jsx';
import UserMenu from '../components/UserMenu/UserMenu.jsx';
import LanguageSwitcher from '../components/LanguageSwitcher/LanguageSwitcher.jsx';
import RouterLink from '../components/RouterLink.jsx';
import ForbiddenPage from '../pages/ForbiddenPage.jsx';
import { useAuth } from '../contexts/AuthContext.jsx';
import { NotificationBell } from '../modules/notifications/index.js';
import { MessagingBell } from '../modules/messaging/index.js';
import { AiAssistantTrigger } from '../modules/ai/index.js';
import useNoIndex from '../seo/useNoIndex.js';
import findActiveNavItemId from '../utils/navigationMatch.js';
import {
  ADMIN_NAV_ITEMS,
  ADMIN_NAV_GROUP_ORDER,
  adminSectionHref,
  canOpenAdminSection,
} from './adminNavigation.js';
import styles from './AdminLayout.module.scss';

export default function AdminLayout() {
  const { t } = useTranslation();
  const { locale } = useParams();
  const location = useLocation();
  const { permissions } = useAuth();
  useNoIndex();

  const sections = ADMIN_NAV_ITEMS.map((item) => ({
    ...item,
    href: adminSectionHref(locale, item),
    exact: item.path === '',
  }));
  const currentSection = sections.find(
    (section) =>
      section.id === findActiveNavItemId(sections, location.pathname),
  );
  const canOpenCurrentSection =
    !currentSection || canOpenAdminSection(currentSection, permissions);

  const navItems = sections
    .filter((section) => canOpenAdminSection(section, permissions))
    .map(({ id, groupId, labelKey, href, Icon }) => ({
      id,
      groupId,
      label: t(labelKey),
      href,
      icon: <Icon aria-hidden="true" focusable="false" />,
    }));

  const groupedItems = [
    // Dashboard first, unlabeled — matches the sidebar convention every
    // other layout in this app uses for a single top-level landing item.
    { id: 'overview', items: navItems.filter((item) => !item.groupId) },
    ...ADMIN_NAV_GROUP_ORDER.map((groupId) => ({
      id: groupId,
      label: t(`admin.nav.groups.${groupId}`),
      items: navItems.filter((item) => item.groupId === groupId),
    })),
    // A role with none of a group's items filtered in must not render an
    // empty labeled section.
  ].filter((group) => group.items.length > 0);

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
          activeItemId={canOpenCurrentSection ? currentSection?.id : undefined}
          linkComponent={RouterLink}
          ariaLabel={t('nav.admin')}
          className={styles.sidebar}
          variant="compact"
        />
        <div className={styles.content}>
          {canOpenCurrentSection ? <Outlet /> : <ForbiddenPage />}
        </div>
      </Container>
    </AppLayout>
  );
}
