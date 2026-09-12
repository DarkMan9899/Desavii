/**
 * ScrollRevealLite — Pass 7B (category motion completion, brief §6).
 *
 * A dependency-free scroll-reveal wrapper (plain IntersectionObserver +
 * CSS transition), NOT `modules/home`'s `ScrollReveal` (Framer Motion).
 * `modules/home/components/ScrollReveal/ScrollReveal.jsx` is the ONLY
 * consumer of `framer-motion` in this codebase — a real, measured build
 * regression (main chunk +115.76 kB / +13.3%) confirmed that importing it
 * from `ListingDetailPageContent.jsx` pulled Framer Motion into the main
 * bundle, not just that page's own lazy chunk (that component is reached
 * through several partner/admin barrels — see this file's own git
 * history for the investigation). Rather than fight Rollup's chunking
 * with a fragile lazy-boundary, this gives the Listing Detail page's
 * category-emphasis feature (§5/§6) the exact same visual language
 * (`fade`/`depth` variants, matching token values) at effectively zero
 * added bundle weight.
 *
 * Not a full ScrollReveal replacement — no `stagger`/`skipInitialHide`
 * (Home's own LCP-sensitive needs that motivated those); this only needs
 * "reveal once when scrolled into view."
 */

import { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import useReducedMotion from '../../hooks/useReducedMotion.js';
import styles from './ScrollRevealLite.module.scss';

const VARIANT_CLASS = {
  fade: styles.fade,
  depth: styles.depth,
};

export default function ScrollRevealLite({
  variant = 'fade',
  className = undefined,
  children,
}) {
  const prefersReducedMotion = useReducedMotion();
  const [inView, setInView] = useState(false);
  const nodeRef = useRef(null);

  useEffect(() => {
    if (prefersReducedMotion) return undefined;
    const node = nodeRef.current;
    if (!node || typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return undefined;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          observer.disconnect();
        }
      },
      { threshold: 0.2 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [prefersReducedMotion]);

  const combinedClassName = [
    styles.reveal,
    VARIANT_CLASS[variant],
    (inView || prefersReducedMotion) && styles.inView,
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div ref={nodeRef} className={combinedClassName}>
      {children}
    </div>
  );
}

ScrollRevealLite.propTypes = {
  variant: PropTypes.oneOf(['fade', 'depth']),
  className: PropTypes.string,
  children: PropTypes.node.isRequired,
};
