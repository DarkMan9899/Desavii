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
 *
 * Home rebuild (docs/HOME_REBUILD.md, HOME-017): the row used to overlap
 * itself wherever the nav and actions needed more room than the screen
 * had (every locale at 1024px, Armenian at 1280px). The nav is now
 * "priority+" (`usePriorityNav`): links that do not fit move, in order,
 * into one "More" menu — the header actions are never hidden, and the
 * mobile menu below the laptop breakpoint still lists everything.
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
import usePriorityNav from './usePriorityNav.js';
import styles from './Header.module.scss';

const linkShape = PropTypes.shape({
  label: PropTypes.string.isRequired,
  to: PropTypes.string.isRequired,
});

const navItemShape = PropTypes.shape({
  label: PropTypes.string.isRequired,
  to: PropTypes.string,
  items: PropTypes.arrayOf(linkShape),
});

// A dropdown entry is a link, or — inside "More" only — a whole collapsed
// group, listed under its own label.
const dropdownItemShape = PropTypes.shape({
  label: PropTypes.string.isRequired,
  to: PropTypes.string,
  items: PropTypes.arrayOf(PropTypes.oneOfType([linkShape, navItemShape])),
});

function MenuLink({ link, onSelect }) {
  return (
    <li role="none">
      <Link
        role="menuitem"
        to={link.to}
        className={styles.dropdownLink}
        onClick={onSelect}
      >
        {link.label}
      </Link>
    </li>
  );
}
MenuLink.propTypes = {
  link: linkShape.isRequired,
  onSelect: PropTypes.func.isRequired,
};

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
        {item.items.map((child) =>
          child.items ? (
            <li key={child.label} role="none" className={styles.dropdownGroup}>
              <span className={styles.dropdownGroupLabel} aria-hidden="true">
                {child.label}
              </span>
              <ul role="group" aria-label={child.label}>
                {child.items.map((link) => (
                  <MenuLink
                    key={link.to}
                    link={link}
                    onSelect={() => setIsOpen(false)}
                  />
                ))}
              </ul>
            </li>
          ) : (
            <MenuLink
              key={child.to}
              link={child}
              onSelect={() => setIsOpen(false)}
            />
          ),
        )}
      </Stack>
    </Popover>
  );
}
NavDropdown.propTypes = { item: dropdownItemShape.isRequired };

// The nav item as it looks in the row, for the hidden measuring copy:
// the same classes and icon, but nothing focusable or announced.
function NavItemSample({ label, hasMenu }) {
  return (
    <span className={styles.navLink}>
      {label}
      {hasMenu && <Icon icon={ChevronDown} size="sm" />}
    </span>
  );
}
NavItemSample.propTypes = {
  label: PropTypes.string.isRequired,
  hasMenu: PropTypes.bool.isRequired,
};

export default function Header({
  logo,
  logoLabel = undefined,
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
  const { containerRef, measureRef, visibleCount } = usePriorityNav(
    navItems.length,
  );
  const visibleItems = navItems.slice(0, visibleCount);
  const overflowItems = navItems.slice(visibleCount);

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
            aria-label={
              logoLabel ?? (typeof logo === 'string' ? logo : undefined)
            }
          >
            {logo}
          </Link>

          {navItems.length > 0 && (
            <nav
              ref={containerRef}
              aria-label={t('a11y.primaryNavigation')}
              className={styles.nav}
            >
              <Inline
                as="ul"
                gap="4"
                wrap={false}
                justify="center"
                className={styles.navList}
              >
                {visibleItems.map((item) => (
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
                {overflowItems.length > 0 && (
                  <li>
                    <NavDropdown
                      item={{ label: t('nav.more'), items: overflowItems }}
                    />
                  </li>
                )}
              </Inline>
              <div
                ref={measureRef}
                aria-hidden="true"
                className={styles.navMeasure}
              >
                {navItems.map((item) => (
                  <NavItemSample
                    key={item.label}
                    label={item.label}
                    hasMenu={Boolean(item.items)}
                  />
                ))}
                <NavItemSample label={t('nav.more')} hasMenu />
              </div>
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
  // Required whenever `logo` isn't plain text (e.g. the brand image
  // markup below) — the Link's accessible name otherwise has nothing to
  // fall back to.
  logoLabel: PropTypes.string,
  homeHref: PropTypes.string,
  navItems: PropTypes.arrayOf(navItemShape),
  actions: PropTypes.node,
};
