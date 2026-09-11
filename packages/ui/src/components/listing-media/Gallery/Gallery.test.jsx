import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Gallery from './Gallery.jsx';

const MEDIA = [
  {
    id: 1,
    url: 'https://example.test/cover.jpg',
    mediaType: 'IMAGE',
    alt: 'Cover',
  },
  {
    id: 2,
    url: 'https://example.test/second.jpg',
    mediaType: 'IMAGE',
    alt: 'Second',
  },
  {
    id: 3,
    url: 'https://example.test/third.jpg',
    mediaType: 'IMAGE',
    alt: 'Third',
  },
];

function renderGallery(media = MEDIA) {
  return render(
    <Gallery
      media={media}
      viewImageLabel="View photo"
      viewAllLabel={(count) => `View all ${count} photos`}
      closeLabel="Close"
      previousLabel="Previous"
      nextLabel="Next"
    />,
  );
}

describe('Gallery (packages/ui/listing-media)', () => {
  test('renders one thumbnail button per media item', () => {
    renderGallery();
    expect(screen.getAllByRole('button')).toHaveLength(3);
  });

  // 2026 SEO/performance audit: real Lighthouse trace evidence identified
  // this component's cover tile (index 0) as the actual LCP element on
  // Listing Detail — this is `ListingHero`'s only current consumer, and
  // the cover tile is always this gallery's most prominent above-the-fold
  // image, so it must never be lazy-loaded like the rest.
  test('the cover tile (index 0) loads eagerly with high fetch priority — every other thumbnail stays lazy', () => {
    renderGallery();
    const images = screen.getAllByRole('img');
    expect(images[0]).toHaveAttribute('loading', 'eager');
    expect(images[0]).toHaveAttribute('fetchpriority', 'high');
    expect(images[1]).toHaveAttribute('loading', 'lazy');
    expect(images[1]).not.toHaveAttribute('fetchpriority');
    expect(images[2]).toHaveAttribute('loading', 'lazy');
  });

  // Sprint L — the lightbox previously closed on Escape but had no real
  // focus trap: no initial focus move, no Tab wrapping, no focus-return
  // to the thumbnail that opened it. Now built on the same `useFocusTrap`
  // hook Modal/Drawer use.
  describe('lightbox focus trap', () => {
    test('opening the lightbox moves focus to its first focusable element (the close button)', async () => {
      const user = userEvent.setup();
      renderGallery();

      await user.click(screen.getAllByRole('button')[0]);

      expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus();
    });

    test('Tab cycles forward and wraps from the last focusable element back to the first', async () => {
      const user = userEvent.setup();
      renderGallery();
      await user.click(screen.getAllByRole('button')[0]);

      const close = screen.getByRole('button', { name: 'Close' });
      const previous = screen.getByRole('button', { name: 'Previous' });
      const next = screen.getByRole('button', { name: 'Next' });

      expect(close).toHaveFocus();
      await user.tab();
      expect(previous).toHaveFocus();
      await user.tab();
      expect(next).toHaveFocus();
      await user.tab();
      expect(close).toHaveFocus();
    });

    test('Escape closes the lightbox and returns focus to the thumbnail that opened it', async () => {
      const user = userEvent.setup();
      renderGallery();
      const triggerThumbnail = screen.getAllByRole('button')[0];

      await user.click(triggerThumbnail);
      expect(screen.getByRole('dialog')).toBeInTheDocument();

      await user.keyboard('{Escape}');

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(triggerThumbnail).toHaveFocus();
    });
  });
});
