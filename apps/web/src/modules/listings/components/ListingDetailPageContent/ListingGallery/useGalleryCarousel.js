/**
 * useGalleryCarousel — the one Embla wiring both gallery tracks share (the
 * phone strip and the lightbox): swipe and drag, the selected slide,
 * previous / next and jump-to. Under reduced motion a slide change is an
 * instant jump, never an animated glide.
 */

import { useCallback, useEffect, useState } from 'react';
import useEmblaCarousel from 'embla-carousel-react';
import useReducedMotion from '../../../../../hooks/useReducedMotion.js';

const OPTIONS = Object.freeze({ align: 'start', containScroll: 'trimSnaps' });

export default function useGalleryCarousel({ startIndex = 0 } = {}) {
  const prefersReducedMotion = useReducedMotion();
  const [viewportRef, embla] = useEmblaCarousel({ ...OPTIONS, startIndex });
  const [selectedIndex, setSelectedIndex] = useState(startIndex);

  useEffect(() => {
    if (!embla) return undefined;
    const handleSelect = () => setSelectedIndex(embla.selectedScrollSnap());
    handleSelect();
    embla.on('select', handleSelect);
    embla.on('reInit', handleSelect);
    return () => {
      embla.off('select', handleSelect);
      embla.off('reInit', handleSelect);
    };
  }, [embla]);

  const scrollTo = useCallback(
    (index) => embla?.scrollTo(index, prefersReducedMotion),
    [embla, prefersReducedMotion],
  );
  const scrollPrev = useCallback(
    () => embla?.scrollPrev(prefersReducedMotion),
    [embla, prefersReducedMotion],
  );
  const scrollNext = useCallback(
    () => embla?.scrollNext(prefersReducedMotion),
    [embla, prefersReducedMotion],
  );

  return { viewportRef, selectedIndex, scrollTo, scrollPrev, scrollNext };
}
