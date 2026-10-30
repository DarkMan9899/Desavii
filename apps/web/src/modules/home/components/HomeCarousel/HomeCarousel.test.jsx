import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import useEmblaCarousel from 'embla-carousel-react';
import HomeCarousel, { AUTOPLAY_DELAY } from './HomeCarousel.jsx';
import useReducedMotion from '../../../../hooks/useReducedMotion.js';

vi.mock('embla-carousel-react', () => ({ default: vi.fn() }));
vi.mock('../../../../hooks/useReducedMotion.js', () => ({ default: vi.fn() }));

// A stand-in for Embla's API: jsdom has no layout, so what the row can do
// is set by each test. `rootNode` is the real rendered region, so key
// events reach the carousel's own listener.
function emblaApi({ prev = false, next = false, page = 0, pages = 3 } = {}) {
  const handlers = {};
  const autoplay = { play: vi.fn(), stop: vi.fn(), reset: vi.fn() };
  const api = {
    handlers,
    autoplay,
    plugins: () => ({ autoplay }),
    canScrollPrev: () => prev,
    canScrollNext: () => next,
    selectedScrollSnap: () => page,
    scrollSnapList: () => Array.from({ length: pages }, (_, i) => i / pages),
    scrollProgress: () => page / Math.max(pages - 1, 1),
    rootNode: () =>
      document.querySelector('[role="region"] [class*="viewport"]'),
    scrollPrev: vi.fn(),
    scrollNext: vi.fn(),
    on: (event, handler) => {
      handlers[event] = handler;
      return api;
    },
    off: () => api,
  };
  return api;
}

// The plugins HomeCarousel handed to Embla on its latest render.
const pluginNames = () =>
  useEmblaCarousel.mock.lastCall[1].map((plugin) => plugin.name);

const TITLE = 'New on desavii';
const VIEW_ALL = 'View all';
const CARDS = ['Card one', 'Card two', 'Card three'];

function renderCarousel(props = {}, cards = CARDS) {
  return render(
    <HomeCarousel
      label={TITLE}
      header={<h2>{TITLE}</h2>}
      // eslint-disable-next-line react/jsx-props-no-spreading -- per-test overrides
      {...props}
    >
      {cards.map((card) => (
        <a key={card} href={`#${card}`}>
          {card}
        </a>
      ))}
    </HomeCarousel>,
  );
}

describe('HomeCarousel (apps/web/src/modules/home)', () => {
  let api;

  beforeEach(() => {
    api = emblaApi({ next: true });
    useEmblaCarousel.mockImplementation(() => [vi.fn(), api]);
    useReducedMotion.mockReturnValue(false);
  });

  test('is a labelled carousel region of numbered slides', () => {
    renderCarousel();
    expect(
      screen.getByRole('region', { name: 'New on desavii' }),
    ).toBeInTheDocument();
    const slides = screen.getAllByRole('group');
    expect(slides).toHaveLength(3);
    expect(slides[0]).toHaveTextContent('Card one');
    expect(slides[0]).toHaveAccessibleName(/1.*3/);
  });

  test('never loops: previous is disabled at the start, next moves the row', async () => {
    const user = userEvent.setup();
    renderCarousel();
    // The controls show from tablet up (phones swipe); jsdom applies the
    // phone styles, so they are queried including hidden elements.
    const previous = screen.getByRole('button', {
      name: 'Նախորդը',
      hidden: true,
    });
    const next = screen.getByRole('button', {
      name: 'Հաջորդը',
      hidden: true,
    });
    expect(previous).toBeDisabled();
    expect(next).toBeEnabled();
    await user.click(next);
    expect(api.scrollNext).toHaveBeenCalledTimes(1);
  });

  test('shows which page of the row is in view, and a progress track', () => {
    api = emblaApi({ prev: true, next: true, page: 1, pages: 3 });
    const { container } = renderCarousel();
    expect(container.querySelector('[class*="counter"]')).toHaveTextContent(
      '02 / 03',
    );
    const thumb = container.querySelector('[class*="progressThumb"]');
    expect(thumb.style.getPropertyValue('--pages')).toBe('3');
    expect(thumb.style.getPropertyValue('--progress')).toBe('0.5');
  });

  test('the arrow keys move the row while a card has focus', () => {
    renderCarousel();
    const card = screen.getByRole('link', { name: 'Card one' });
    fireEvent.keyDown(card, { key: 'ArrowRight' });
    fireEvent.keyDown(card, { key: 'ArrowLeft' });
    expect(api.scrollNext).toHaveBeenCalledTimes(1);
    expect(api.scrollPrev).toHaveBeenCalledTimes(1);
  });

  test('shows the section link beside the controls', () => {
    renderCarousel({ action: <a href="/en/search">{VIEW_ALL}</a> });
    expect(screen.getByRole('link', { name: VIEW_ALL })).toHaveAttribute(
      'href',
      '/en/search',
    );
  });

  test('has no controls, counter or track when every card already fits', () => {
    api = emblaApi({ pages: 1 });
    const { container } = renderCarousel();
    expect(
      screen.queryByRole('button', { hidden: true }),
    ).not.toBeInTheDocument();
    expect(container.querySelector('[class*="progress"]')).not.toBeVisible();
  });

  test('holds the row’s space with placeholders while loading', () => {
    renderCarousel({ isLoading: true });
    expect(screen.getByRole('region')).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByText('Card one')).not.toBeInTheDocument();
    expect(screen.getAllByRole('group')).toHaveLength(4);
  });

  describe('autoplay', () => {
    test('a row of several real cards plays on its own, calmly, with the library plugin', () => {
      renderCarousel();
      expect(pluginNames()).toEqual(['wheelGestures', 'autoplay']);
      const autoplay = useEmblaCarousel.mock.lastCall[1][1];
      expect(autoplay.options).toMatchObject({
        delay: AUTOPLAY_DELAY,
        stopOnInteraction: false,
        stopOnMouseEnter: true,
      });
      expect(AUTOPLAY_DELAY).toBeGreaterThanOrEqual(5000);
    });

    test('a single card never autoplays and shows no controls', () => {
      api = emblaApi({ pages: 1 });
      renderCarousel({}, ['Only card']);
      expect(pluginNames()).toEqual(['wheelGestures']);
      expect(
        screen.queryByRole('button', { hidden: true }),
      ).not.toBeInTheDocument();
      expect(screen.getAllByRole('group')).toHaveLength(1);
    });

    test('never autoplays under reduced motion, or while loading', () => {
      useReducedMotion.mockReturnValue(true);
      const { unmount } = renderCarousel();
      expect(pluginNames()).toEqual(['wheelGestures']);
      unmount();

      useReducedMotion.mockReturnValue(false);
      renderCarousel({ isLoading: true });
      expect(pluginNames()).toEqual(['wheelGestures']);
    });

    test('keyboard focus anywhere in the row pauses it until focus leaves', () => {
      renderCarousel();
      const card = screen.getByRole('link', { name: 'Card two' });
      fireEvent.focusIn(card);
      expect(api.autoplay.stop).toHaveBeenCalled();

      // A start the plugin attempts while focus is still inside is held.
      api.autoplay.stop.mockClear();
      api.handlers['autoplay:play']();
      expect(api.autoplay.stop).toHaveBeenCalledTimes(1);

      fireEvent.focusOut(card, { relatedTarget: document.body });
      expect(api.autoplay.play).toHaveBeenCalledTimes(1);
    });

    // Regression: the row first renders loading placeholders (no plugin)
    // and Embla adds autoplay to the same instance when real cards arrive;
    // the focus pause must still apply.
    test('focus still pauses autoplay that was added after the first render', () => {
      const { autoplay } = api;
      let plugins = {};
      api.plugins = () => plugins;
      renderCarousel();
      plugins = { autoplay };
      fireEvent.focusIn(screen.getByRole('link', { name: 'Card one' }));
      expect(autoplay.stop).toHaveBeenCalled();
    });

    test('Previous / Next restart the countdown so the row never moves right after the visitor did', async () => {
      const user = userEvent.setup();
      renderCarousel();
      await user.click(
        screen.getByRole('button', { name: 'Հաջորդը', hidden: true }),
      );
      expect(api.scrollNext).toHaveBeenCalledTimes(1);
      expect(api.autoplay.reset).toHaveBeenCalled();
    });

    test('the pause button stops the row until the visitor presses play', async () => {
      const user = userEvent.setup();
      renderCarousel();
      const pause = screen.getByRole('button', {
        name: 'Դադարեցնել ինքնաշարժ թերթումը',
      });
      await user.click(pause);
      expect(api.autoplay.stop).toHaveBeenCalled();

      api.autoplay.stop.mockClear();
      api.handlers['autoplay:play']();
      expect(api.autoplay.stop).toHaveBeenCalledTimes(1);

      await user.click(
        screen.getByRole('button', { name: 'Միացնել ինքնաշարժ թերթումը' }),
      );
      expect(api.autoplay.play).toHaveBeenCalled();
    });
  });
});
