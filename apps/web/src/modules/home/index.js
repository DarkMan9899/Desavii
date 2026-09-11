/**
 * `home` module public export surface (FRONTEND_ARCHITECTURE.md §6.2) —
 * the ONLY entry point another module/page may import from (§6.3).
 *
 * Only the sections `pages/HomePage.jsx` composes directly are exported
 * here — internal building blocks each section uses (SearchWidget,
 * SectionHeader, ScrollReveal, and every card component) stay
 * module-private, consistent with `listings`' own "promote only once a
 * second consumer needs it" rule.
 */

export { default as Hero } from './components/Hero/Hero.jsx';
export { default as FeaturedDestinations } from './components/FeaturedDestinations/FeaturedDestinations.jsx';
export { default as FeaturedListings } from './components/FeaturedListings/FeaturedListings.jsx';
export { default as PopularExperiences } from './components/PopularExperiences/PopularExperiences.jsx';
export { default as Categories } from './components/Categories/Categories.jsx';
export { default as WhyDesavii } from './components/WhyDesavii/WhyDesavii.jsx';
export { default as EditorialHighlights } from './components/EditorialHighlights/EditorialHighlights.jsx';
export { default as PartnerCta } from './components/PartnerCta/PartnerCta.jsx';
