/**
 * useMediaQuery — whether a CSS media query currently matches, updated
 * live. For behaviour that must differ by layout (a bottom sheet on a
 * phone, an inline panel on a desktop); layout itself stays in CSS.
 * Mirrors `useReducedMotion`'s guarded `matchMedia` pattern.
 */

import { useEffect, useState } from 'react';

function matches(query) {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia(query).matches
  );
}

export default function useMediaQuery(query) {
  const [isMatch, setIsMatch] = useState(() => matches(query));

  useEffect(() => {
    if (
      typeof window === 'undefined' ||
      typeof window.matchMedia !== 'function'
    ) {
      return undefined;
    }
    const mediaQueryList = window.matchMedia(query);
    const handleChange = (event) => setIsMatch(event.matches);
    setIsMatch(mediaQueryList.matches);
    mediaQueryList.addEventListener('change', handleChange);
    return () => mediaQueryList.removeEventListener('change', handleChange);
  }, [query]);

  return isMatch;
}
