/**
 * HomeCarousel — the Home page's card row: a heading, a toolbar with the
 * section's link, a page counter and paired previous/next controls, the
 * row (swipe on touch, drag with a mouse, sideways trackpad scrolling, and
 * the arrow keys), and a progress track under it.
 *
 * Home rebuild (docs/HOME_REBUILD.md): replaces the shared `Showcase` on
 * Home only (category pages keep it). Nothing moves on its own — no
 * autoplay, no loop — and every card keeps its size; the next card peeks
 * in so the row reads as scrollable. Embla groups as many cards as fit
 * into one step (`slidesToScroll: 'auto'`) and trims the empty space at
 * the ends (`containScroll: 'trimSnaps'`), so the last step never leaves
 * a half-empty row. When everything already fits, the controls, counter
 * and track go away.
 *
 * Final design pass: the controls are one designed group (a counter and
 * two 44px buttons joined by a hairline), the "view all" link sits beside
 * them (`action`), and a progress track shows where the row is — on a
 * phone it is the swipe feedback. `layout="spotlight"` puts the heading in
 * a column beside the row (the featured placements); `tone="dark"` is for
 * the ink band.
 *
 * `size` sets the card width per breakpoint so the next card always peeks
 * in: `listing`, `tall` (portrait destination photos) or `spotlight`
 * (cards beside the heading column). While `isLoading`, placeholder cards
 * of the same size hold the row's space, so nothing jumps.
 *
 * Autoplay (owner requirement): a row with two or more real cards
 * advances on its own every 6 s through the library's own
 * `embla-carousel-autoplay` plugin — calm enough to read a card. It pauses
 * while the pointer or keyboard focus is in the row and during a drag
 * (resuming with a full countdown after), a Previous / Next press restarts
 * the countdown, and a pause button beside the track stops it until the
 * visitor presses play (WCAG 2.2.2). It is never added for a single card,
 * while loading, or under `prefers-reduced-motion`. Rows stay finite (no
 * `loop`): their order means something (promotion priority, listing
 * count, newest first), so after the last page autoplay rewinds to the
 * first instead of cloning cards.
 *
 * Accessibility: a labelled carousel region of "n of m" slides; the
 * controls are real buttons (disabled at either end), and tabbing to a
 * card scrolls it into view (Embla's default `watchFocus`). Slide changes
 * are not announced (no live region), so autoplay never talks over a
 * screen reader, and it never moves focus.
 */

import { Children, useMemo, useRef } from 'react';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import useEmblaCarousel from 'embla-carousel-react';
import { WheelGesturesPlugin } from 'embla-carousel-wheel-gestures';
import Autoplay from 'embla-carousel-autoplay';
import { ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react';
import { Skeleton } from '@desavii/ui/components/feedback-overlays';
import useReducedMotion from '../../../../hooks/useReducedMotion.js';
import useCarouselControls from './useCarouselControls.js';
import styles from './HomeCarousel.module.scss';

const PLACEHOLDER_COUNT = 4;

// `duration` is Embla's scroll physics (20–60, not milliseconds): a little
// slower than the default for an unhurried, editorial glide.
const OPTIONS = {
  align: 'start',
  containScroll: 'trimSnaps',
  slidesToScroll: 'auto',
  duration: 32,
};
// Long enough to read a travel card before the row moves on.
export const AUTOPLAY_DELAY = 6000;

/**
 * Only sideways wheel/trackpad gestures move the row (vertical scrolling
 * stays the page's); autoplay when the row may move on its own. The
 * plugin pauses on hover and during a drag and restarts its countdown
 * after (`stopOnInteraction: false`); focus is handled by
 * `useCarouselControls` so the row's controls count too.
 */
function buildPlugins(withAutoplay) {
  const plugins = [WheelGesturesPlugin()];
  if (withAutoplay) {
    plugins.push(
      Autoplay({
        delay: AUTOPLAY_DELAY,
        stopOnInteraction: false,
        stopOnMouseEnter: true,
        stopOnFocusIn: false,
        rootNode: (emblaRoot) => emblaRoot.closest('[role="region"]'),
      }),
    );
  }
  return plugins;
}

const pad = (value) => String(value).padStart(2, '0');
const COUNTER_SEPARATOR = ' / ';

export default function HomeCarousel({
  label,
  header,
  action = undefined,
  size = 'listing',
  layout = 'row',
  tone = 'light',
  isLoading = false,
  children = undefined,
}) {
  const { t } = useTranslation();
  const prefersReducedMotion = useReducedMotion();
  const slides = isLoading
    ? Array.from({ length: PLACEHOLDER_COUNT }, (_, index) => (
        <Skeleton
          key={`placeholder-${index}`}
          variant="rect"
          className={styles.placeholder}
        />
      ))
    : Children.toArray(children);
  const withAutoplay = !prefersReducedMotion && !isLoading && slides.length > 1;
  const plugins = useMemo(() => buildPlugins(withAutoplay), [withAutoplay]);
  const [viewportRef, embla] = useEmblaCarousel(OPTIONS, plugins);
  const progressRef = useRef(null);
  const controls = useCarouselControls(embla, progressRef);

  return (
    <div
      className={[
        styles.carousel,
        styles[`carousel--${layout}`],
        tone === 'dark' && styles['carousel--dark'],
      ]
        .filter(Boolean)
        .join(' ')}
      role="region"
      aria-roledescription={t('home.carousel.roleDescription')}
      aria-label={label}
      aria-busy={isLoading || undefined}
    >
      <div className={styles.head}>
        <div className={styles.header}>{header}</div>
        {(action || controls.hasControls) && (
          <div className={styles.toolbar}>
            {action}
            {controls.hasControls && (
              <div className={styles.controls}>
                <span className={styles.counter} aria-hidden="true">
                  {pad(controls.page + 1)}
                  <span className={styles.counterTotal}>
                    {COUNTER_SEPARATOR}
                    {pad(controls.pages)}
                  </span>
                </span>
                <div className={styles.buttons}>
                  <button
                    type="button"
                    className={styles.control}
                    onClick={controls.prev}
                    disabled={!controls.canPrev}
                    aria-label={t('home.carousel.previous')}
                  >
                    <ChevronLeft size={20} aria-hidden="true" />
                  </button>
                  <span className={styles.divider} aria-hidden="true" />
                  <button
                    type="button"
                    className={styles.control}
                    onClick={controls.next}
                    disabled={!controls.canNext}
                    aria-label={t('home.carousel.next')}
                  >
                    <ChevronRight size={20} aria-hidden="true" />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      <div className={styles.rail}>
        <div className={styles.viewport} ref={viewportRef}>
          <div className={styles.track}>
            {slides.map((slide, index) => (
              <div
                key={slide.key ?? index}
                className={[styles.slide, styles[`slide--${size}`]].join(' ')}
                role="group"
                aria-roledescription={t('home.carousel.slideDescription')}
                aria-label={t('home.carousel.slidePosition', {
                  current: index + 1,
                  total: slides.length,
                })}
              >
                {slide}
              </div>
            ))}
          </div>
        </div>
        <div className={styles.status} hidden={!controls.hasControls}>
          {/* Always rendered (hidden when nothing scrolls) so the progress
              ref exists before Embla's first paint. */}
          <div className={styles.progress} aria-hidden="true">
            <span
              ref={progressRef}
              className={styles.progressThumb}
              style={{ '--pages': Math.max(controls.pages, 1) }}
            />
          </div>
          {controls.hasAutoplay && (
            <button
              type="button"
              className={styles.autoplayToggle}
              data-autoplay-toggle=""
              onClick={controls.toggleAutoplay}
              aria-label={t(
                controls.isUserPaused
                  ? 'home.carousel.playAutoplay'
                  : 'home.carousel.pauseAutoplay',
              )}
            >
              {controls.isUserPaused ? (
                <Play size={14} aria-hidden="true" />
              ) : (
                <Pause size={14} aria-hidden="true" />
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

HomeCarousel.propTypes = {
  /** The row's accessible name (usually the section title). */
  label: PropTypes.string.isRequired,
  /** The section heading block. */
  header: PropTypes.node.isRequired,
  /** The section's link (an `ActionLink`), shown beside the controls. */
  action: PropTypes.node,
  size: PropTypes.oneOf(['listing', 'tall', 'spotlight']),
  layout: PropTypes.oneOf(['row', 'spotlight']),
  tone: PropTypes.oneOf(['light', 'dark']),
  isLoading: PropTypes.bool,
  children: PropTypes.node,
};
