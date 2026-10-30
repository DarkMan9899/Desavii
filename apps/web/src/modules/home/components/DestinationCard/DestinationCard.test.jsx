import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import DestinationCard from './DestinationCard.jsx';

const DESTINATION = {
  id: 3,
  slug: 'yerevan',
  name: 'Yerevan',
  listing_count: 42,
};

function renderCard(destination = DESTINATION) {
  return render(
    <MemoryRouter initialEntries={['/en']}>
      <Routes>
        <Route
          path="/:locale"
          element={<DestinationCard destination={destination} />}
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe('DestinationCard (apps/web/src/modules/home)', () => {
  test('renders the real destination name as a heading, linked to its real destination page', () => {
    renderCard();
    expect(
      screen.getByRole('heading', { level: 3, name: 'Yerevan' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link')).toHaveAttribute(
      'href',
      '/en/destinations/yerevan',
    );
  });

  test('shows the listing count when it is greater than zero', () => {
    renderCard();
    expect(screen.getByText(/42/)).toBeInTheDocument();
  });

  test('hides the listing count when it is zero', () => {
    renderCard({ ...DESTINATION, listing_count: 0 });
    expect(screen.queryByText(/հայտարարություն/)).not.toBeInTheDocument();
  });

  // Home rebuild: a destination with a photo shows that place, as
  // responsive AVIF/WebP sources, decorative (the name is the text).
  test('a destination with a photo shows it, lazily and decoratively', () => {
    const { container } = renderCard();
    const sources = container.querySelectorAll('picture source');
    expect([...sources].map((source) => source.type)).toEqual([
      'image/avif',
      'image/webp',
    ]);
    const image = container.querySelector('picture img');
    expect(image).toHaveAttribute('alt', '');
    expect(image).toHaveAttribute('loading', 'lazy');
    expect(image.closest('[aria-hidden="true"]')).not.toBeNull();
  });

  test('a destination without a photo keeps its generated art, never a picture of somewhere else', () => {
    const { container } = renderCard({
      ...DESTINATION,
      slug: 'yeghegnadzor',
    });
    expect(container.querySelector('picture')).toBeNull();
    expect(container.querySelector('[aria-hidden="true"]')).not.toBeNull();
  });
});
