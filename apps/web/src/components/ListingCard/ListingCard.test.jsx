import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import ListingCard from './ListingCard.jsx';
import CurrencyProvider from '../../providers/CurrencyProvider.jsx';

// AMD prices render through `<Money>` (CurrencyContext); the rates request
// is a fixture.
vi.mock('../../api/fx.js', () => ({
  getRates: vi.fn().mockResolvedValue({
    success: true,
    data: {
      baseCurrency: 'AMD',
      rates: { AMD: '1.00000000', USD: '400.00000000', RUB: '4.50000000' },
      effectiveAt: '2026-01-01',
      source: 'fixture',
    },
    meta: null,
    error: null,
  }),
}));

const BASE = {
  href: '/hy/listings/ararat-view',
  title: 'Ararat View',
  typeLabel: 'Հյուրանոց',
  cityName: 'Երևան',
  imageUrl: '/uploads/listings/9/cover.webp',
  mediaCount: 5,
  facts: [{ key: 'stars', label: '4 աստղ' }],
  rating: { average: '4.7', count: 7 },
  price: {
    amount: '42000.00',
    currencyCode: 'AMD',
    lead: 'from',
    basisLabel: '/ գիշեր',
  },
  locale: 'hy',
};

function renderCard(props = {}) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <CurrencyProvider locale="hy">
        <MemoryRouter>
          {/* eslint-disable-next-line react/jsx-props-no-spreading -- test harness */}
          <ListingCard {...BASE} {...props} />
        </MemoryRouter>
      </CurrencyProvider>
    </QueryClientProvider>,
  );
}

// The harness's i18n defaults to Armenian (tests/setup.js).
describe('ListingCard (apps/web/src/components)', () => {
  test('reads in decision order: title, category · city, rating, facts, price', () => {
    renderCard();
    const card = screen.getByRole('article', { name: 'Ararat View' });
    const text = card.textContent;
    const order = [
      'Ararat View',
      'Հյուրանոց',
      'Երևան',
      '4.7',
      '7 կարծիք',
      '4 աստղ',
      'Սկսած',
      '/ գիշեր',
    ];
    const positions = order.map((part) => text.indexOf(part));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  test('the title link is the card link — named by the title only', () => {
    renderCard();
    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAccessibleName('Ararat View');
    expect(links[0]).toHaveAttribute('href', '/hy/listings/ararat-view');
  });

  test('the favourite sits beside the link, never inside it', () => {
    renderCard({
      // eslint-disable-next-line react/jsx-no-literals -- test stub
      favoriteButton: <button type="button">favourite</button>,
    });
    const link = screen.getByRole('link');
    expect(link).not.toContainElement(
      screen.getByRole('button', { name: 'favourite' }),
    );
  });

  test('the photo is decorative (the title names the card) and lazy by default', () => {
    const { container } = renderCard();
    const img = container.querySelector('img');
    expect(img).toHaveAttribute('alt', '');
    expect(img).toHaveAttribute('loading', 'lazy');
    expect(img).toHaveAttribute('decoding', 'async');
  });

  test('only the first, likely-LCP card loads eagerly', () => {
    const { container } = renderCard({ priorityImage: true });
    expect(container.querySelector('img')).toHaveAttribute('loading', 'eager');
  });

  test('a broken photo is replaced by generated art, never a blank box', () => {
    const { container } = renderCard();
    fireEvent.error(container.querySelector('img'));
    expect(container.querySelector('img')).toBeNull();
    expect(
      container.querySelector('[class*="media"]').childElementCount,
    ).toBeGreaterThan(0);
  });

  test('says how many photos there are, to assistive technology too', () => {
    renderCard();
    expect(screen.getByText('5 լուսանկար')).toBeInTheDocument();
  });

  test('a badge carries its spoken description', () => {
    renderCard({
      badge: { tone: 'top', label: 'ԹՈՓ', description: ' (գովազդվող)' },
    });
    const card = screen.getByRole('article');
    expect(card).toHaveAttribute('data-badge', 'top');
    expect(within(card).getByText('ԹՈՓ')).toHaveTextContent('ԹՈՓ (գովազդվող)');
  });

  test('the rating shows its approved-review count and is spoken as one sentence', () => {
    renderCard();
    expect(
      screen.getByText('Գնահատականը՝ 4.7 5-ից, 7 կարծիք'),
    ).toBeInTheDocument();
  });

  test('without approved reviews the card says so — never 0.0 or empty stars', () => {
    renderCard({ rating: null });
    expect(screen.getByText('Կարծիքներ դեռ չկան')).toBeInTheDocument();
    expect(screen.queryByText(/0\.0/)).not.toBeInTheDocument();
  });

  test('shows up to three facts with their icons', () => {
    renderCard({
      facts: [
        { key: 'a', label: 'Ա' },
        { key: 'b', label: 'Բ' },
        { key: 'c', label: 'Գ' },
      ],
    });
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
  });

  test('missing optional data never leaves a broken card', () => {
    renderCard({
      cityName: null,
      facts: [],
      rating: null,
      price: null,
      imageUrl: null,
      mediaCount: 0,
    });
    expect(
      screen.getByRole('heading', { name: 'Ararat View' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
    expect(screen.getByText('Գինը նշված չէ')).toBeInTheDocument();
  });

  test('a restaurant average reads "Միջինը", not "Սկսած"', () => {
    renderCard({
      price: { ...BASE.price, lead: 'average', basisLabel: '/ անձի համար' },
    });
    expect(screen.getByText('Միջինը')).toBeInTheDocument();
    expect(screen.queryByText('Սկսած')).not.toBeInTheDocument();
  });

  describe('compact with an explicit action (the map preview)', () => {
    test('the action is the one link; the title is plain and focusable by id', () => {
      renderCard({
        layout: 'compact',
        ctaLabel: 'Ավելին',
        titleId: 'preview-title',
        facts: [
          { key: 'a', label: 'Ա' },
          { key: 'b', label: 'Բ' },
          { key: 'c', label: 'Գ' },
        ],
      });
      // The narrow preview keeps the two most decisive facts.
      expect(screen.getAllByRole('listitem')).toHaveLength(2);
      const links = screen.getAllByRole('link');
      expect(links).toHaveLength(1);
      expect(links[0]).toHaveAccessibleName('Ավելին');
      const heading = screen.getByRole('heading', { name: 'Ararat View' });
      expect(heading).toHaveAttribute('id', 'preview-title');
      expect(heading).toHaveAttribute('tabindex', '-1');
      expect(screen.getByRole('article')).toHaveAccessibleName('Ararat View');
    });
  });
});
