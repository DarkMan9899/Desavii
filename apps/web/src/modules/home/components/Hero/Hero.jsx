/**
 * Hero — the homepage's cinematic first viewport. Redesign phase (2026,
 * composition rebuild #2) — a centered spatial "portal" (concentric
 * depth rings, a core glow, animated route-line arcs, orbiting
 * particles) is the scene's real focal object, not a backdrop behind
 * left-aligned text: it sits center-right, large enough that its glow
 * bleeds left underneath the copy column, so text and scene visually
 * overlap instead of occupying two separate halves. The terrain ridges
 * from the previous pass shrink to a low grounding band at the very
 * bottom instead of filling the whole scene — still no real photography
 * asset pipeline exists (see apps/web/src/assets/images), so depth here
 * comes from layered geometry and light, not a photo.
 *
 * The headline stays ONE untouched translated string (no per-word split
 * across EN/HY/RU) — the "text overlaps the scene" effect comes from
 * the portal's own glow extending behind the copy column via z-index,
 * not from string surgery that would be unsafe to do consistently
 * across languages with different word order/length.
 *
 * The search dock is a sibling of `.copy`, not nested inside it —
 * positioned centered across the whole Hero at laptop+ so it reads as
 * its own floating object near the portal's base, not a continuation of
 * the text column. See `SearchWidget.jsx` for its own compact/expand
 * behavior (unchanged by this pass).
 */

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowRight, ArrowUpRight } from 'lucide-react';
import { Container } from '@desavii/ui/components/layout';
import RouterLink from '../../../../components/RouterLink.jsx';
import useReducedMotion from '../../../../hooks/useReducedMotion.js';
import usePointerParallax from '../../../../hooks/usePointerParallax.js';
import ScrollReveal from '../ScrollReveal/ScrollReveal.jsx';
import SearchWidget from '../SearchWidget/SearchWidget.jsx';
import styles from './Hero.module.scss';

// A capped 0..1 measure of how far the viewer has scrolled through the
// Hero's own height — drives both the depth-layer parallax and the
// "Hero recedes as you leave it" fade, so the two read as one continuous
// motion instead of two independently-tuned effects. `rAF`-throttled,
// entirely inert under `prefers-reduced-motion` (listener never attached).
function useScrollProgress(sectionRef) {
  const [progress, setProgress] = useState(0);
  const prefersReducedMotion = useReducedMotion();
  const tickingRef = useRef(false);

  useEffect(() => {
    if (prefersReducedMotion) return undefined;
    function handleScroll() {
      if (tickingRef.current) return;
      tickingRef.current = true;
      window.requestAnimationFrame(() => {
        const node = sectionRef.current;
        if (node) {
          const height = node.offsetHeight || 1;
          setProgress(Math.max(0, Math.min(1, window.scrollY / height)));
        }
        tickingRef.current = false;
      });
    }
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [sectionRef, prefersReducedMotion]);

  return progress;
}

export default function Hero() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { locale } = useParams();
  const sectionRef = useRef(null);
  const scrollProgress = useScrollProgress(sectionRef);
  const pointer = usePointerParallax(sectionRef);

  // Four depth planes, each moving a different amount under scroll/pointer
  // — the brief's explicit "far atmospheric / midground terrain / primary
  // focal object / foreground UI" separation. The portal (the focal
  // object) reacts to the pointer the most of the background layers,
  // since it's meant to feel closest/most alive; the search dock gets its
  // own, much smaller foreground drift so it never distracts from being
  // read as a control.
  const terrainOffset = scrollProgress * 30 + pointer.x * 5;
  const portalOffset = {
    x: pointer.x * 22,
    y: pointer.y * 14 - scrollProgress * 30,
  };
  // The portal "recedes" as the viewer scrolls past it — pushed slightly
  // forward (scaled up) and softened, like a camera passing through it
  // rather than the scene simply disappearing — the Hero → first-section
  // transition's own depth cue (`FeaturedDestinations.module.scss`'s
  // `.section::before` top-edge gradient is the other half of that bridge).
  const portalScale = 1 + Math.min(0.22, scrollProgress * 0.3);
  const portalFade = Math.max(0.15, 1 - scrollProgress * 1.1);
  const dockOffset = { x: pointer.x * -6, y: pointer.y * -4 };
  const contentFade = Math.max(0, 1 - scrollProgress * 1.6);
  // A touch of scale + blur alongside the fade — "transitioning out with
  // depth," not just dissolving in place.
  const contentScale = 1 - Math.min(0.06, scrollProgress * 0.09);
  const contentBlur = Math.min(6, scrollProgress * 10);

  return (
    <section
      ref={sectionRef}
      className={styles.hero}
      aria-labelledby="home-hero-heading"
    >
      <div className={styles.scene} aria-hidden="true">
        <div className={styles.sky} />

        {/* The focal object — Ararat's real, recognizable twin-peak
            silhouette (not an abstract shape any tech landing page could
            use) with an alpenglow behind it, flight-route arcs, and a
            starfield, all centered on one point so they read as one
            spatial scene rather than scattered decoration. `.portalStage`
            owns layout positioning (flexbox, not `transform`, so it never
            fights the pointer-parallax offset below); `.portal` owns only
            its own size and that offset. */}
        <div className={styles.portalStage}>
          <div
            className={styles.portal}
            style={{
              transform: `translate3d(${portalOffset.x}px, ${portalOffset.y}px, 0) scale(${portalScale})`,
              // A CSS custom property, not a direct `opacity` inline
              // style — `.portal`'s own per-breakpoint base opacity
              // (dimmer on mobile so a busier scene never fights the
              // headline for legibility) lives in the stylesheet as
              // `calc(<base> * var(--portal-fade))`; an inline `opacity`
              // here would override that responsive value outright
              // instead of multiplying it.
              '--portal-fade': portalFade,
            }}
          >
            <div className={styles.portalGlow} />
            <svg
              className={styles.portalRings}
              viewBox="0 0 600 600"
              focusable="false"
            >
              <defs>
                <linearGradient
                  id="hero-mountain-gradient"
                  x1="0"
                  y1="1"
                  x2="0"
                  y2="0"
                >
                  <stop offset="0%" className={styles.mountainStopBase} />
                  <stop offset="55%" className={styles.mountainStopMid} />
                  <stop offset="100%" className={styles.mountainStopLit} />
                </linearGradient>
              </defs>
              <path
                className={styles.routeArc}
                d="M40,380 C180,220 420,220 560,340"
                fill="none"
              />
              <path
                className={styles.routeArcAlt}
                d="M70,220 C220,360 380,360 540,240"
                fill="none"
              />
              {/* Ararat's real silhouette — Greater Ararat (the tall
                  peak) with Lesser Ararat's smaller shoulder to its
                  right, the exact skyline every Armenian recognizes, not
                  an invented mountain shape. */}
              <path
                className={styles.mountain}
                d="M20,430 L120,300 L165,335 L255,110 L320,290 L360,255 L440,195 L505,305 L580,430 Z"
              />
              <path
                className={styles.snowCap}
                d="M225,175 L255,110 L285,180 L266,168 L255,192 L240,172 Z M410,215 L440,195 L465,245 L448,238 L440,255 L426,236 Z"
              />
            </svg>
            <div className={styles.portalParticles}>
              <span className={styles.portalParticle} />
              <span className={styles.portalParticle} />
              <span className={styles.portalParticle} />
              <span className={styles.portalParticle} />
              <span className={styles.portalParticle} />
            </div>
          </div>
        </div>

        {/* Midground — a low grounding band, not the whole scene. */}
        <svg
          className={styles.terrain}
          viewBox="0 0 1440 800"
          preserveAspectRatio="xMidYMax slice"
          focusable="false"
        >
          <g style={{ transform: `translateY(${terrainOffset}px)` }}>
            <path
              className={styles.ridgeFar}
              d="M0,660 C220,610 420,640 640,615 C860,590 1040,630 1220,608 C1320,596 1400,612 1440,605 L1440,800 L0,800 Z"
            />
          </g>
          <g style={{ transform: `translateY(${terrainOffset * 1.7}px)` }}>
            <path
              className={styles.ridgeNear}
              d="M0,720 C200,675 360,705 560,672 C760,638 920,700 1120,668 C1260,646 1360,688 1440,670 L1440,800 L0,800 Z"
            />
          </g>
        </svg>

        <div className={styles.grain} />
        <div className={styles.horizonFade} />
      </div>

      <Container
        size="wide"
        className={styles.content}
        style={{
          opacity: contentFade,
          transform: `scale(${contentScale})`,
          filter: `blur(${contentBlur}px)`,
        }}
      >
        <div className={styles.copy}>
          {/* A multi-beat entrance — each line arrives on its own instead
              of the whole block fading in as one flat unit — reads
              meaningfully more cinematic (rich visual hierarchy over
              time, not just at rest). */}
          <ScrollReveal delay={0}>
            <p className={styles.eyebrow}>{t('home.hero.eyebrow')}</p>
          </ScrollReveal>
          {/* 2026 SEO/performance audit: this h1 is the page's real LCP
              element (confirmed via Lighthouse's own trace attribution) —
              `skipInitialHide` renders it already visible from first
              paint instead of gating it behind an IntersectionObserver +
              transition before it's even paintable. The eyebrow above and
              subtitle/CTAs below keep their own entrance untouched. */}
          <ScrollReveal delay={0.1} skipInitialHide>
            <h1 id="home-hero-heading" className={styles.title}>
              {t('home.hero.title')}
            </h1>
          </ScrollReveal>
          <ScrollReveal delay={0.2}>
            <p className={styles.subtitle}>{t('home.hero.subtitle')}</p>
          </ScrollReveal>
          <ScrollReveal delay={0.3}>
            <div className={styles.ctas}>
              <button
                type="button"
                className={styles.ctaPrimary}
                onClick={() => navigate(`/${locale}/search`)}
              >
                <span className={styles.ctaPrimaryDial} aria-hidden="true">
                  <ArrowRight size={20} aria-hidden="true" />
                </span>
                {t('home.hero.ctaPrimary')}
              </button>
              <RouterLink
                href={`/${locale}/become-a-partner`}
                className={styles.ctaSecondary}
              >
                {t('home.hero.ctaSecondary')}
                <ArrowUpRight
                  size={16}
                  aria-hidden="true"
                  className={styles.ctaSecondaryIcon}
                />
              </RouterLink>
            </div>
          </ScrollReveal>
        </div>

        {/* Foreground UI — a sibling of `.copy`, not nested inside it, so
            it centers across the whole Hero (near the portal's base)
            instead of inheriting the copy column's left-aligned width. */}
        <ScrollReveal
          delay={0.4}
          className={styles.searchWrapper}
          style={{
            transform: `translate3d(${dockOffset.x}px, ${dockOffset.y}px, 0)`,
          }}
        >
          <SearchWidget />
        </ScrollReveal>
      </Container>
    </section>
  );
}
