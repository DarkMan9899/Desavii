import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Star, Waves } from 'lucide-react';
import ListingHeader from './ListingHeader.jsx';

const BASE = {
  title: 'Ararat View',
  typeLabel: 'Հյուրանոց',
  cityName: 'Երևան',
  countryName: 'Հայաստան',
  reviewsAnchorId: 'reviews',
  keyFacts: [{ key: 'star_rating', icon: Star, label: 'Աստղեր', value: '4' }],
  features: [{ key: 'amenity:POOL', icon: Waves, label: 'Լողավազան' }],
};

function renderHeader(props = {}) {
  // eslint-disable-next-line react/jsx-props-no-spreading -- test harness
  return render(<ListingHeader {...BASE} {...props} />);
}

// The test harness's i18n is Armenian (tests/setup.js).
describe('ListingHeader', () => {
  test('reads what, where, the title, then what guests think', () => {
    renderHeader({ rating: { average: 4.7, count: 7 } });
    const text = document.body.textContent;
    const order = ['Հյուրանոց', 'Երևան, Հայաստան', 'Ararat View', '4,7'];
    const positions = order.map((part) => text.indexOf(part));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    expect(
      screen.getByRole('heading', { level: 1, name: 'Ararat View' }),
    ).toBeInTheDocument();
  });

  test('the rating links to the reviews and is spoken as one sentence', () => {
    renderHeader({ rating: { average: 4.7, count: 7 } });
    const link = screen.getByRole('link', {
      name: 'Գնահատականը՝ 4,7 5-ից, 7 կարծիք',
    });
    expect(link).toHaveAttribute('href', '#reviews');
  });

  test('without approved reviews it says so — no link, no 0.0', () => {
    renderHeader({ rating: null });
    expect(screen.getByText('Կարծիքներ դեռ չկան')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.queryByText(/0\.0/)).not.toBeInTheDocument();
  });

  test('a private stay is labelled an approximate area', () => {
    renderHeader({ isApproximate: true });
    expect(screen.getByText('Մոտավոր տարածք')).toBeInTheDocument();
  });

  test('shows the key facts and the top features', () => {
    renderHeader();
    expect(screen.getByText('Աստղեր')).toBeInTheDocument();
    expect(
      screen.getByRole('list', { name: 'Հիմնական առավելություններ' }),
    ).toHaveTextContent('Լողավազան');
  });

  test('never repeats a price — the reservation panel and booking bar own it', () => {
    renderHeader({ rating: { average: 4.7, count: 7 } });
    expect(screen.queryByText(/֏|\$|Սկսած/)).not.toBeInTheDocument();
  });

  test('a script-shaped title stays text', () => {
    const title = '<img src=x onerror="window.headerXssProbe=1">';
    const { container } = renderHeader({ title });
    expect(screen.getByRole('heading', { level: 1, name: title })).toBeTruthy();
    expect(container.querySelector('img[onerror]')).toBeNull();
    expect(window.headerXssProbe).toBeUndefined();
  });
});
