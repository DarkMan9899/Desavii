import { describe, test, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Header from './Header.jsx';

const NAV_ITEMS = [
  { label: 'Home', to: '/hy' },
  { label: 'Search', to: '/hy/search' },
];

function renderHeader(props) {
  return render(
    <MemoryRouter>
      {/* eslint-disable-next-line react/jsx-props-no-spreading -- test helper forwards arbitrary Header props */}
      <Header logo="desavii" {...props} />
    </MemoryRouter>,
  );
}

describe('Header (apps/web/src/components)', () => {
  test('renders a header landmark with a home link', () => {
    renderHeader();
    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'desavii' })).toHaveAttribute(
      'href',
      '/',
    );
  });

  test('renders navItems inside a labeled primary nav landmark', () => {
    // `{ hidden: true }`: the desktop nav is shown only from the Tablet
    // breakpoint up (Application Foundation phase's mobile-hamburger
    // addition, Header.module.scss) — real, present in the DOM and
    // reachable at that viewport, just not part of jsdom's default-width
    // accessibility tree, which has no real viewport to match the
    // `min-width` media query against. Accessible-name computation for a
    // `hidden`-only match is a `dom-accessibility-api`/jsdom quirk (it
    // resolves to "" rather than the real `aria-label`), so the name is
    // asserted separately rather than passed as a `getByRole` filter.
    //
    // Sprint M — the landmark label used to be hardcoded English
    // ("Primary"), always announced in English regardless of locale; it
    // now reads from a11y.primaryNavigation, so this asserts the real
    // translated value (the shared test i18n instance defaults to `hy`),
    // not the old literal.
    renderHeader({ navItems: NAV_ITEMS });
    const nav = screen.getByRole('navigation', { hidden: true });
    expect(nav).toHaveAttribute('aria-label', 'Հիմնական նավարկություն');
    expect(
      screen.getByRole('link', { name: 'Search', hidden: true }),
    ).toHaveAttribute('href', '/hy/search');
  });

  test('renders no nav landmark when navItems is empty', () => {
    renderHeader();
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  });

  test('renders an actions slot when provided', () => {
    // See the previous test's comment re: `{ hidden: true }` — the
    // desktop actions slot is also Tablet-and-up only.
    renderHeader({ actions: <button type="button">Sign in</button> });
    expect(
      screen.getByRole('button', { name: 'Sign in', hidden: true }),
    ).toBeInTheDocument();
  });

  test('a navItem with "items" renders as a dropdown, opened on click, revealing its children as links', async () => {
    const user = userEvent.setup();
    renderHeader({
      navItems: [
        {
          label: 'Explore',
          items: [
            { label: 'Tours', to: '/hy/search?category=tours' },
            { label: 'Hotels', to: '/hy/search?category=hotels' },
          ],
        },
      ],
    });
    const trigger = screen.getByRole('button', {
      name: 'Explore',
      hidden: true,
    });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(
      screen.queryByRole('menuitem', { name: 'Tours', hidden: true }),
    ).not.toBeInTheDocument();

    await user.click(trigger);

    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(
      screen.getByRole('menuitem', { name: 'Tours', hidden: true }),
    ).toHaveAttribute('href', '/hy/search?category=tours');
  });

  // HOME-017: links that do not fit move, in order, into "More". jsdom has
  // no layout, so the nav's width and each link's measured width are set
  // here: 300px of room, 120px per link, 16px gaps, "More" 120px.
  describe('when the links do not fit', () => {
    afterEach(() => vi.unstubAllGlobals());

    function stubLayout() {
      vi.stubGlobal(
        'ResizeObserver',
        vi.fn(() => ({ observe: vi.fn(), disconnect: vi.fn() })),
      );
      vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(
        function width() {
          return this.tagName === 'NAV' ? 300 : 0;
        },
      );
      vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
        width: 120,
      });
    }

    test('the rest go into "More" — a dropdown group under its own label', async () => {
      stubLayout();
      const user = userEvent.setup();
      renderHeader({
        navItems: [
          { label: 'Home', to: '/hy' },
          { label: 'Companies', to: '/hy/companies' },
          {
            label: 'Company',
            items: [{ label: 'About', to: '/hy/about' }],
          },
          { label: 'Become a partner', to: '/hy/become-a-partner' },
        ],
      });

      // 120 + 16 + 120 ("More") = 256 <= 300: one link stays in the row.
      expect(
        screen.getByRole('link', { name: 'Home', hidden: true }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole('link', { name: 'Companies', hidden: true }),
      ).not.toBeInTheDocument();

      await user.click(
        screen.getByRole('button', { name: 'Ավելին', hidden: true }),
      );
      const items = screen.getAllByRole('menuitem', { hidden: true });
      expect(items.map((item) => item.getAttribute('href'))).toEqual([
        '/hy/companies',
        '/hy/about',
        '/hy/become-a-partner',
      ]);
      expect(
        screen.getByRole('group', { name: 'Company', hidden: true }),
      ).toContainElement(items[1]);
      vi.restoreAllMocks();
    });
  });
});
