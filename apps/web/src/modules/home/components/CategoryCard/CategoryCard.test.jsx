import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import CategoryCard from './CategoryCard.jsx';

const CATEGORY = { id: 1, slug: 'hotels', name: 'Hotels', listing_count: 12 };

function renderCard(category = CATEGORY) {
  return render(
    <MemoryRouter initialEntries={['/en']}>
      <Routes>
        <Route path="/:locale" element={<CategoryCard category={category} />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('CategoryCard (apps/web/src/modules/home)', () => {
  test('links to the real, indexable category landing page by slug', () => {
    renderCard();
    expect(screen.getByRole('link')).toHaveAttribute(
      'href',
      '/en/categories/hotels',
    );
  });

  test('renders the category name from the API response', () => {
    renderCard();
    expect(screen.getByText('Hotels')).toBeInTheDocument();
  });

  test('shows the listing count when it is greater than zero', () => {
    renderCard();
    expect(screen.getByText(/12/)).toBeInTheDocument();
  });

  test('hides the listing count when it is zero', () => {
    renderCard({ ...CATEGORY, listing_count: 0 });
    expect(screen.queryByText(/0/)).not.toBeInTheDocument();
  });

  test('falls back to a generic icon for an unmapped slug', () => {
    renderCard({ ...CATEGORY, slug: 'some-future-category' });
    expect(screen.getByRole('link')).toBeInTheDocument();
  });

  // Home rebuild: each category is a photograph of that kind of place,
  // decorative (the name is the text), loaded lazily below the hero.
  test('shows the category’s own photo, responsively and decoratively', () => {
    const { container } = renderCard();
    const image = container.querySelector('picture img');
    expect(image).toHaveAttribute('alt', '');
    expect(image).toHaveAttribute('loading', 'lazy');
    expect(
      container
        .querySelector('source[type="image/avif"]')
        .getAttribute('srcset'),
    ).toMatch(/category-hotels-\d+\.avif \d+w/);
  });

  test('a category without a photo keeps its icon panel, not a stand-in picture', () => {
    const { container } = renderCard({ ...CATEGORY, slug: 'spa-retreats' });
    expect(container.querySelector('picture')).toBeNull();
    expect(container.querySelector('svg')).not.toBeNull();
  });
});
