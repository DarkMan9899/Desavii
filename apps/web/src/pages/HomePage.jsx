/**
 * HomePage — the Customer Website homepage (FRONTEND_ARCHITECTURE.md
 * §3.1's `pages/` contract: thinnest possible layer, composing the owning
 * module's sections in display order, no queries of its own).
 *
 * Home rebuild (docs/HOME_REBUILD.md) — the reading rhythm:
 * the country and search (Hero) → what you can book (Categories) →
 * promoted places (FeaturedListings) → where to go (FeaturedDestinations)
 * → what is new (PopularExperiences, a soft band) → stories
 * (EditorialHighlights, only when published posts exist) → why book here
 * (WhyDesavii, the one navy band) → the partner invitation (PartnerCta) →
 * the photo credits the images' licences require (PhotoCredits) — the
 * brief's rhythm: visual → discovery → listings → editorial → trust → CTA.
 *
 * Every section owns its own `Container`, so bands (hero, surfaces) can
 * run edge to edge while their content keeps the site gutter.
 */

import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { Container } from '@desavii/ui/components/layout';
import {
  Hero,
  Categories,
  FeaturedListings,
  FeaturedDestinations,
  PopularExperiences,
  WhyDesavii,
  EditorialHighlights,
  PartnerCta,
  PhotoCredits,
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
      <Container size="wide">
        <Categories />
      </Container>
      <FeaturedListings />
      <FeaturedDestinations />
      <PopularExperiences />
      <EditorialHighlights />
      <WhyDesavii />
      <PartnerCta />
      <PhotoCredits />
    </>
  );
}
