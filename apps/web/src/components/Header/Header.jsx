/**
 * Header — reusable site header chrome.
 *
 * Lives in `src/components/` per FRONTEND_ARCHITECTURE.md §3.1: "shared
 * across more than one module but too domain-specific for `ui/`" —
 * PublicLayout uses the full header, CustomerAccountLayout/PartnerLayout
 * use a condensed version (§5.3). `navItems`/`actions` are still supplied
 * by the composing layout, keeping this a presentation shell with only
 * interaction-state (mobile-menu open/closed, which nav dropdown is open)
 * of its own — zero auth/business logic.
 *
 * Phase 10 redesign: `navItems` entries may now be either a plain link
 * (`{ label, to }`) or a dropdown group (`{ label, items: [{label, to}] }`)
 * — the latter renders as a `Popover`-backed menu (e.g. PublicLayout's
 * "Explore" group, populated from real search categories). A dropdown
 * group never nests further than one level.
 */

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import PropTypes from 'prop-types';
import { Container, Inline, Stack } from '@desavii/ui/components/layout';
import { Popover } from '@desavii/ui/components/navigation';
import { Icon } from '@desavii/ui/components/primitives';
import { ChevronDown, Menu } from 'lucide-react';
import MobileNav from '../MobileNav/MobileNav.jsx';
import styles from './Header.module.scss';

const navItemShape = PropTypes.shape({
  label: PropTypes.string.isRequired,
  to: PropTypes.string,
  items: PropTypes.arrayOf(
    PropTypes.shape({
      label: PropTypes.string.isRequired,
      to: PropTypes.string.isRequired,
    }),
  ),
});

function NavDropdown({ item }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Popover
      isOpen={isOpen}
      onClose={() => setIsOpen(false)}
      trigger={
        <button
          type="button"
          className={styles.navLink}
          aria-haspopup="menu"
          aria-expanded={isOpen}
          onClick={() => setIsOpen((current) => !current)}
        >
          {item.label}
          <Icon icon={ChevronDown} size="sm" />
        </button>
      }
    >
      <Stack as="ul" gap="0" role="menu" className={styles.dropdownList}>
        {item.items.map((child) => (
          <li key={child.to} role="none">
            <Link
              role="menuitem"
              to={child.to}
              className={styles.dropdownLink}
              onClick={() => setIsOpen(false)}
            >
              {child.label}
            </Link>
          </li>
        ))}
      </Stack>
    </Popover>
  );
}
NavDropdown.propTypes = { item: navItemShape.isRequired };

export default function Header({
  logo,
  navItems = [],
  actions = undefined,
  homeHref = '/',
}) {
  const { t } = useTranslation();
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  // Phase 12 (Product Polish): a flat 1px border reads fine at the very
  // top of the page, but once content scrolls beneath a sticky-feeling
  // header it needs real separation — a subtle elevation shadow, added
  // only past a small threshold so it doesn't flicker on a 1px scroll.
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    function handleScroll() {
      setIsScrolled(window.scrollY > 4);
    }
    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <header
      className={[styles.header, isScrolled && styles['header--scrolled']]
        .filter(Boolean)
        .join(' ')}
    >
      <Container size="wide">
        <Inline
          justify="space-between"
          gap="4"
          wrap={false}
          className={styles.bar}
        >
          <Link
            to={homeHref}
            className={styles.logo}
            aria-label={typeof logo === 'string' ? logo : undefined}
          >
            {logo}
          </Link>

          {navItems.length > 0 && (
            <nav
              aria-label={t('a11y.primaryNavigation')}
              className={styles.nav}
            >
              <Inline as="ul" gap="6" wrap={false} className={styles.navList}>
                {navItems.map((item) => (
                  <li key={item.label}>
                    {item.items ? (
                      <NavDropdown item={item} />
                    ) : (
                      <Link to={item.to} className={styles.navLink}>
                        {item.label}
                      </Link>
                    )}
                  </li>
                ))}
              </Inline>
            </nav>
          )}

          {actions && (
            <Inline gap="3" wrap={false} className={styles.actions}>
              {actions}
            </Inline>
          )}

          <button
            type="button"
            className={styles.mobileToggle}
            aria-label={t('a11y.openMenu')}
            onClick={() => setIsMobileNavOpen(true)}
          >
            <Icon icon={Menu} />
          </button>
        </Inline>
      </Container>

      <MobileNav
        isOpen={isMobileNavOpen}
        onClose={() => setIsMobileNavOpen(false)}
        navItems={navItems}
      >
        {actions}
      </MobileNav>
    </header>
  );
}

Header.propTypes = {
  logo: PropTypes.node.isRequired,
  homeHref: PropTypes.string,
  navItems: PropTypes.arrayOf(navItemShape),
  actions: PropTypes.node,
};
