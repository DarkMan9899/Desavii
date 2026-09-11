/**
 * HomePage — the real Customer Website homepage (FRONTEND_ARCHITECTURE.md
 * §3.1's `pages/` contract: thinnest possible layer, composing a layout
 * region and the owning module's content, no `useQuery`/`useMutation` of
 * its own). Phase 3 extends Phase 1's Hero + FeaturedListings with the
 * rest of the marketplace homepage — every section below is real `home`
 * module content, composed here in display order.
 *
 * Redesign phase (2026) — no single page-wide `Container` any more: a
 * cinematic hero and the carousel sections need to bleed to the viewport
 * edge (see each carousel section's own `bleed-start` treatment), which a
 * single wrapping `Container` around the whole page would make
 * impossible. Sections that stay conventional width (PopularExperiences/
 * Categories/WhyDesavii/PartnerCta) each get their own `Container` here
 * instead; `EditorialHighlights` manages its own internal `Container`
 * (same pattern as `FeaturedListings`/`FeaturedDestinations`), so it is
 * composed bare here too.
 *
 * Sprint K: the previous `Testimonials` section (fabricated "Anna K." /
 * "Michael R." / "Sofia L." quotes, only ever disclosed as "illustrative"
 * — never real customer feedback) is removed rather than replaced;
 * `WhyDesavii` already carries the page's honest trust content, and
 * `PartnerCta` is the intentional closing section. `EditorialHighlights`
 * (real published Blog posts) is the one net-new section.
 */

import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { Container } from '@desavii/ui/components/layout';
import {
  Hero,
  FeaturedDestinations,
  FeaturedListings,
  PopularExperiences,
  Categories,
  WhyDesavii,
  EditorialHighlights,
  PartnerCta,
} from '../modules/home/index.js';
import useSeo from '../seo/useSeo.js';

export default function HomePage() {
  const { t } = useTranslation();
  const { locale } = useParams();

  useSeo({
    title: t('seo.home.title'),
    description: t('seo.home.description'),
    locale,
    path: '',
  });

  return (
    <>
      <Hero />
      <FeaturedDestinations />
      <FeaturedListings />
      <Container size="wide">
        <PopularExperiences />
      </Container>
      <Container size="wide">
        <Categories />
      </Container>
      <Container size="wide">
        <WhyDesavii />
      </Container>
      <EditorialHighlights />
      <Container size="wide">
        <PartnerCta />
      </Container>
    </>
  );
}
