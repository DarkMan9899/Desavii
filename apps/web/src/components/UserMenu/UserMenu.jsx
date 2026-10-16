/**
 * UserMenu — the Header's auth-aware account entry point
 * (FRONTEND_ARCHITECTURE.md §5.1's "auth/profile entry point"). Reads
 * exclusively from `AuthContext` (Ch. 11) — logged-out visitors see
 * Log in/Sign up; a logged-in user sees a disclosure button that opens
 * an accessible menu (`role="menu"`).
 *
 * Phase 10 redesign: rebuilt on the new shared `Popover` primitive
 * instead of hand-rolling outside-click/Escape dismissal — this is
 * exactly the "promote to `ui/` once a second consumer needs the same
 * pattern" case the previous version's own doc comment called out
 * (`Header`'s new nav dropdowns were the first consumer). Also adds the
 * workspace-aware entry this phase requires: a user who belongs to at
 * least one partner org (`partnerships.length > 0`) sees a "Workspace"
 * section with Customer Account / Partner Dashboard links, the current
 * one marked `aria-current`; picking one persists the choice via
 * `setLastWorkspace` so `LoginForm`'s next redirect remembers it. A
 * plain customer (no partnerships) sees no such section — nothing to
 * switch between.
 *
 * Role-aware "My account": it opens the signed-in person's primary
 * workspace — `resolveHomePath`, the same decision the login redirect
 * makes (admin-area roles `/admin`, MANAGER `/manager`, MARKETING
 * `/marketing`, a partner member `/partner` unless they last chose the
 * customer workspace, everyone else `/account`). It used to always open
 * the customer `/account`, so an admin who stepped out to the public site
 * via the logo landed in the customer area. "Profile" and "Settings" stay
 * the person's own account pages, which every signed-in user has.
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams, useLocation } from 'react-router-dom';
import { Button, Avatar } from '@desavii/ui/components/primitives';
import { Popover } from '@desavii/ui/components/navigation';
import { Stack, Divider } from '@desavii/ui/components/layout';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { setLastWorkspace } from '../../utils/workspacePreference.js';
import { resolveHomePath } from '../../utils/authDestinations.js';
import styles from './UserMenu.module.scss';

export default function UserMenu() {
  const { t } = useTranslation();
  const { locale } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const {
    isAuthenticated,
    isBootstrapping,
    user,
    roles = [],
    partnerships = [],
    logout,
  } = useAuth();
  const [isOpen, setIsOpen] = useState(false);

  if (isBootstrapping) {
    return null;
  }

  if (!isAuthenticated) {
    return (
      <div className={styles.guestActions}>
        <Link to={`/${locale}/auth/login`} className={styles.loginLink}>
          {t('nav.login')}
        </Link>
        <Button
          variant="primary"
          size="sm"
          onClick={() => navigate(`/${locale}/auth/register`)}
        >
          {t('nav.register')}
        </Button>
      </div>
    );
  }

  const fullName = `${user.first_name} ${user.last_name}`.trim();
  const isInPartnerWorkspace = location.pathname.startsWith(
    `/${locale}/partner`,
  );

  async function handleLogout() {
    setIsOpen(false);
    // Navigate away from the current (possibly RequireAuth-protected)
    // route BEFORE clearing auth state — logging out while still mounted
    // on e.g. /account otherwise races RequireAuth's own redirect-to-
    // login, which wins and strands the user on the login page with a
    // stale `?redirect=` param instead of the intended homepage landing.
    navigate(`/${locale}`);
    await logout();
  }

  function switchWorkspace(workspace) {
    setLastWorkspace(workspace);
    setIsOpen(false);
    navigate(`/${locale}/${workspace === 'partner' ? 'partner' : 'account'}`);
  }

  return (
    <Popover
      isOpen={isOpen}
      onClose={() => setIsOpen(false)}
      placement="bottom-end"
      panelClassName={styles.menu}
      trigger={
        <button
          type="button"
          className={styles.trigger}
          aria-haspopup="menu"
          aria-expanded={isOpen}
          aria-label={t('a11y.userMenu')}
          onClick={() => setIsOpen((current) => !current)}
        >
          <Avatar name={fullName} userId={String(user.id)} size="sm" />
        </button>
      }
    >
      <div role="menu">
        {partnerships.length > 0 && (
          <>
            <p className={styles.sectionLabel}>{t('nav.workspace')}</p>
            <Stack gap="0" role="none">
              <button
                type="button"
                role="menuitem"
                aria-current={!isInPartnerWorkspace || undefined}
                className={styles.menuItem}
                onClick={() => switchWorkspace('customer')}
              >
                {t('nav.customerAccount')}
              </button>
              <button
                type="button"
                role="menuitem"
                aria-current={isInPartnerWorkspace || undefined}
                className={styles.menuItem}
                onClick={() => switchWorkspace('partner')}
              >
                {t('nav.partnerDashboard')}
              </button>
            </Stack>
            <Divider />
          </>
        )}
        <Link
          role="menuitem"
          to={resolveHomePath({ roles, partnerships, locale })}
          className={styles.menuItem}
          onClick={() => setIsOpen(false)}
        >
          {t('nav.account')}
        </Link>
        <Link
          role="menuitem"
          to={`/${locale}/account/profile`}
          className={styles.menuItem}
          onClick={() => setIsOpen(false)}
        >
          {t('account.nav.profile')}
        </Link>
        <Link
          role="menuitem"
          to={`/${locale}/account/settings`}
          className={styles.menuItem}
          onClick={() => setIsOpen(false)}
        >
          {t('account.nav.settings')}
        </Link>
        <button
          type="button"
          role="menuitem"
          className={styles.menuItem}
          onClick={handleLogout}
        >
          {t('nav.logout')}
        </button>
      </div>
    </Popover>
  );
}
