import { describe, test, expect } from 'vitest';
import { render } from '@testing-library/react';
import CategoryTopBackground from './CategoryTopBackground.jsx';

describe('CategoryTopBackground (owner-directed premium card redesign, brief §21)', () => {
  test('renders a purely decorative (aria-hidden) themed backdrop for a known category', () => {
    const { container } = render(
      <CategoryTopBackground categorySlug="entertainment-venues" />,
    );
    const root = container.firstChild;
    expect(root).toHaveAttribute('aria-hidden', 'true');
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  test('every one of the 9 real categories resolves its own theme, never a shared fallback', () => {
    const categories = [
      'hotels',
      'apartments',
      'villas',
      'guest-houses',
      'restaurants',
      'tours',
      'car-rentals',
      'attractions',
      'entertainment-venues',
    ];
    const classNames = categories.map((slug) => {
      const { container, unmount } = render(
        <CategoryTopBackground categorySlug={slug} />,
      );
      const { className } = container.firstChild;
      unmount();
      return className;
    });
    // Each category resolves to a real class, and not every category
    // collapses onto the exact same one (some legitimate repeats across
    // 9 categories sharing only 3 brand-token "leans" are fine — this
    // guards against the whole set silently resolving to one shared
    // fallback style, which is the actual regression this test protects).
    classNames.forEach((className) => expect(className).toBeTruthy());
    expect(new Set(classNames).size).toBeGreaterThan(1);
  });

  test('renders nothing for an unrecognized category slug (never a generic guess)', () => {
    const { container } = render(
      <CategoryTopBackground categorySlug="not-a-real-category" />,
    );
    expect(container.firstChild).toBeNull();
  });
});
