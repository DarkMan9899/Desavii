/**
 * MobileNav — the Header's mobile navigation drawer
 * (FRONTEND_ARCHITECTURE.md §5.1: "header collapses to a hamburger-
 * triggered full-screen drawer" — §30's focus-trap rules apply, inherited
 * for free from `ui/Drawer`'s shared `Overlay` behaviour).
 *
 * Phase 10 redesign: mirrors `Header`'s extended `navItems` shape — a
 * dropdown group (`{ label, items: [...] }`) renders as a labeled
 * sub-list instead of a link, since a drawer has no room for a nested
 * popover; a plain item (`{ label, to }`) renders as before.
 */

import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Drawer } from '@desavii/ui/components/feedback-overlays';
import { Stack, Divider } from '@desavii/ui/components/layout';
import styles from './MobileNav.module.scss';

export default function MobileNav({
  isOpen,
  onClose,
  navItems,
  children = undefined,
}) {
  const { t } = useTranslation();

  return (
    <Drawer
      isOpen={isOpen}
      onClose={onClose}
      title={t('app.name')}
      closeLabel={t('common.close')}
      anchor="right"
    >
      <Stack gap="4" as="nav" aria-label={t('a11y.primaryNavigation')}>
        {navItems.map((item) =>
          item.items ? (
            <Stack key={item.label} gap="1">
              <p className={styles.groupLabel}>{item.label}</p>
              {item.items.map((child) => (
                <Link
                  key={child.to}
                  to={child.to}
                  className={styles.navLink}
                  onClick={onClose}
                >
                  {child.label}
                </Link>
              ))}
            </Stack>
          ) : (
            <Link
              key={item.to}
              to={item.to}
              className={styles.navLink}
              onClick={onClose}
            >
              {item.label}
            </Link>
          ),
        )}
      </Stack>
      {children && (
        <>
          <Divider />
          <div className={styles.extra}>{children}</div>
        </>
      )}
    </Drawer>
  );
}

MobileNav.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  navItems: PropTypes.arrayOf(
    PropTypes.shape({
      label: PropTypes.string.isRequired,
      to: PropTypes.string,
      items: PropTypes.arrayOf(
        PropTypes.shape({
          label: PropTypes.string.isRequired,
          to: PropTypes.string.isRequired,
        }),
      ),
    }),
  ).isRequired,
  children: PropTypes.node,
};
