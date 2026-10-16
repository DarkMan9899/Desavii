import { describe, test, expect, vi, onTestFinished } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Sidebar from './Sidebar.jsx';

const ITEMS = [
  {
    id: 'main',
    label: 'Main',
    items: [
      { id: 'dashboard', label: 'Dashboard', href: '/dashboard' },
      {
        id: 'listings',
        label: 'Listings',
        href: '/dashboard/listings',
        badgeCount: 3,
      },
    ],
  },
];

describe('Sidebar (COMPONENT_LIBRARY.md Part II §3 "Sidebar Navigation")', () => {
  test('renders an aside region containing a labeled nav landmark', () => {
    render(<Sidebar items={ITEMS} ariaLabel="Partner navigation" />);
    expect(
      screen.getByRole('navigation', { name: 'Partner navigation' }),
    ).toBeInTheDocument();
  });

  test('renders each item as a link with its label as the accessible name', () => {
    render(<Sidebar items={ITEMS} />);
    expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute(
      'href',
      '/dashboard',
    );
  });

  test('marks the active item with aria-current="page"', () => {
    render(<Sidebar items={ITEMS} activeItemId="listings" />);
    expect(screen.getByRole('link', { name: /Listings/ })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('link', { name: 'Dashboard' })).not.toHaveAttribute(
      'aria-current',
    );
  });

  test('renders a badge for items with a positive badgeCount', () => {
    render(<Sidebar items={ITEMS} />);
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  test('collapsed mode still exposes each item label via aria-label even though visible text is hidden', () => {
    render(<Sidebar items={ITEMS} collapsed />);
    expect(screen.getByRole('link', { name: 'Dashboard' })).toBeInTheDocument();
    expect(screen.queryByText('Dashboard')).not.toBeInTheDocument();
  });

  test('the group label is hidden while collapsed', () => {
    const { rerender } = render(<Sidebar items={ITEMS} />);
    expect(screen.getByText('Main')).toBeInTheDocument();

    rerender(<Sidebar items={ITEMS} collapsed />);
    expect(screen.queryByText('Main')).not.toBeInTheDocument();
  });

  test('the collapse toggle button fires onToggleCollapse', async () => {
    const onToggleCollapse = vi.fn();
    const user = userEvent.setup();
    render(<Sidebar items={ITEMS} onToggleCollapse={onToggleCollapse} />);

    await user.click(screen.getByRole('button', { name: 'Collapse sidebar' }));
    expect(onToggleCollapse).toHaveBeenCalledTimes(1);
  });

  test('renders no toggle button when onToggleCollapse is omitted', () => {
    render(<Sidebar items={ITEMS} />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});

// jsdom has no layout: give the bar and its links the geometry of the
// phone bottom bar (390px wide, scrolling sideways) by hand.
function mockBarGeometry({ scrollWidth, activeLeft }) {
  const restore = [
    vi
      .spyOn(HTMLElement.prototype, 'scrollWidth', 'get')
      .mockImplementation(function width() {
        return this.tagName === 'ASIDE' ? scrollWidth : 0;
      }),
    vi
      .spyOn(HTMLElement.prototype, 'clientWidth', 'get')
      .mockImplementation(function width() {
        return this.tagName === 'ASIDE' ? 390 : 0;
      }),
    vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(function rect() {
        if (this.tagName === 'ASIDE')
          return { left: 0, right: 390, width: 390 };
        return { left: activeLeft, right: activeLeft + 100, width: 100 };
      }),
  ];
  onTestFinished(() => restore.forEach((spy) => spy.mockRestore()));
}

describe('Sidebar — active item in the phone bottom bar', () => {
  test('an off-screen active item is scrolled into the middle of the bar', () => {
    mockBarGeometry({ scrollWidth: 2000, activeLeft: 1500 });
    render(<Sidebar items={ITEMS} activeItemId="listings" />);

    // Item centre 1550 moved to the bar centre 195.
    expect(screen.getByRole('complementary').scrollLeft).toBe(1355);
  });

  test('an active item already in view, or a side column that never scrolls sideways, is left alone', () => {
    mockBarGeometry({ scrollWidth: 2000, activeLeft: 100 });
    const { unmount } = render(
      <Sidebar items={ITEMS} activeItemId="listings" />,
    );
    expect(screen.getByRole('complementary').scrollLeft).toBe(0);
    unmount();

    mockBarGeometry({ scrollWidth: 390, activeLeft: 1500 });
    render(<Sidebar items={ITEMS} activeItemId="listings" />);
    expect(screen.getByRole('complementary').scrollLeft).toBe(0);
  });
});
