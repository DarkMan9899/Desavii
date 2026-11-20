import { describe, test, expect, afterEach, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ListingGallery from './ListingGallery.jsx';

const photo = (id, extra = {}) => ({
  id,
  media_type: 'IMAGE',
  url: `/uploads/listings/9/photo-${id}.webp`,
  thumbnail_url: `/uploads/listings/9/thumb-${id}.webp`,
  position: id,
  ...extra,
});

const MEDIA = [
  photo(1, { alt_text: 'Lobby at dusk' }),
  photo(2),
  photo(3),
  { id: 4, media_type: 'DOCUMENT', url: '/uploads/brochure.pdf', position: 4 },
];

const originalMatchMedia = window.matchMedia;

/** Tablet and up: the mosaic. */
function asWideScreen() {
  window.matchMedia = vi.fn().mockImplementation((query) => ({
    matches: query === '(min-width: 768px)',
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
  }));
}

afterEach(() => {
  window.matchMedia = originalMatchMedia;
});

// The test harness's i18n is Armenian (tests/setup.js).
describe('ListingGallery — hero mosaic (tablet and up)', () => {
  test('lays out the photos by count and offers "Show all"', () => {
    asWideScreen();
    const { container } = render(
      <ListingGallery media={MEDIA} title="Villa" variant="hero" />,
    );
    // The DOCUMENT is never a gallery item.
    expect(container.querySelector('[data-count]')).toHaveAttribute(
      'data-count',
      '3',
    );
    expect(
      screen.getByRole('button', { name: 'Դիտել բոլոր 3 լուսանկարները' }),
    ).toBeInTheDocument();
  });

  test('shows at most five tiles; the rest open from "Show all"', () => {
    asWideScreen();
    const many = Array.from({ length: 8 }, (_, index) => photo(index + 1));
    const { container } = render(
      <ListingGallery media={many} title="Villa" variant="hero" />,
    );
    expect(container.querySelector('[data-count]')).toHaveAttribute(
      'data-count',
      '5',
    );
    expect(container.querySelectorAll('img')).toHaveLength(5);
  });

  test('only the lead photo loads eagerly with high priority (the LCP)', () => {
    asWideScreen();
    const { container } = render(
      <ListingGallery media={MEDIA} title="Villa" variant="hero" />,
    );
    const [lead, ...rest] = container.querySelectorAll('img');
    expect(lead).toHaveAttribute('loading', 'eager');
    expect(lead).toHaveAttribute('fetchpriority', 'high');
    rest.forEach((img) => expect(img).toHaveAttribute('loading', 'lazy'));
  });

  test('one photo has no "Show all" control', () => {
    asWideScreen();
    render(<ListingGallery media={[photo(1)]} title="Villa" variant="hero" />);
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });
});

describe('ListingGallery — phone strip', () => {
  test('the lead photo shows at once, in its final frame, while the strip loads', () => {
    const { container } = render(
      <ListingGallery media={MEDIA} title="Villa" variant="hero" />,
    );
    const lead = container.querySelector('img');
    expect(lead).toHaveAttribute('alt', 'Lobby at dusk');
    expect(lead).toHaveAttribute('loading', 'eager');
  });

  test('a swipeable carousel with a photo counter', async () => {
    render(<ListingGallery media={MEDIA} title="Villa" variant="hero" />);
    const carousel = await screen.findByRole('region');
    expect(carousel).toHaveAttribute('aria-roledescription', 'carousel');
    expect(within(carousel).getAllByRole('img')).toHaveLength(3);
    expect(carousel.textContent).toContain('1');
  });
});

describe('ListingGallery — truthful media', () => {
  test('no photos: an honest panel on the hero, nothing in a room grid', () => {
    const { container, rerender } = render(
      <ListingGallery media={[]} title="Villa" variant="hero" />,
    );
    expect(container.textContent).toContain('Լուսանկարներ դեռ չկան');
    rerender(<ListingGallery media={[]} title="Villa" variant="grid" />);
    expect(container).toBeEmptyDOMElement();
  });

  test('an unsafe media URL is never rendered', () => {
    const { container } = render(
      <ListingGallery
        media={[
          // eslint-disable-next-line no-script-url -- the hostile input under test
          photo(1, { url: 'javascript:alert(1)' }),
          photo(2, { url: '//evil.example/x.jpg' }),
          photo(3),
        ]}
        title="Villa"
        variant="grid"
      />,
    );
    const sources = [...container.querySelectorAll('img')].map((img) =>
      img.getAttribute('src'),
    );
    expect(sources).toEqual(['/uploads/listings/9/thumb-3.webp']);
  });

  test('every photo has meaningful alt text — the partner’s, else a fallback', () => {
    const { container } = render(
      <ListingGallery media={MEDIA} title="Villa" variant="grid" />,
    );
    const alts = [...container.querySelectorAll('img')].map((img) =>
      img.getAttribute('alt'),
    );
    expect(alts[0]).toBe('Lobby at dusk');
    alts.slice(1).forEach((alt) => expect(alt).toContain('Villa'));
  });
});

describe('ListingGallery — lightbox', () => {
  test('opens on the tapped photo, counts, and stops at the ends', async () => {
    const user = userEvent.setup();
    render(<ListingGallery media={MEDIA} title="Villa" variant="grid" />);
    await user.click(screen.getAllByRole('button')[0]);

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveAccessibleName(/Villa/);
    const [previous, next] = within(dialog)
      .getAllByRole('button')
      .filter((button) => button.querySelector('svg.lucide'));
    expect(previous).toBeDisabled();
    expect(next).toBeEnabled();
    expect(
      within(dialog).getByText(/1/, { selector: 'p' }),
    ).toBeInTheDocument();
  });

  test('Escape closes it and returns focus to the photo that opened it', async () => {
    const user = userEvent.setup();
    render(<ListingGallery media={MEDIA} title="Villa" variant="grid" />);
    const opener = screen.getAllByRole('button')[1];
    await user.click(opener);
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });
});
