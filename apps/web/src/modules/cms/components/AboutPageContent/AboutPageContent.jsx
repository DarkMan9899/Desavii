/**
 * AboutPageContent — `/:locale/about` (Phase 10 redesign; editorial
 * redesign in the 2026 public-frontend audit's static-page pass — see
 * `EditorialPageHero`'s own file header for why the previous bare
 * `PageHeader` + plain content is now this shared hero shell instead).
 *
 * P1.6 (Master Roadmap): title/lead now come from the real CMS backend
 * (`GET /cms/pages/about`, seeded and admin-editable since Stage 11.6,
 * but never actually fetched by this page until now) — falling back to
 * the original static i18n copy while the query is pending or if the
 * page is ever unpublished/deleted, so this never regresses to a blank
 * page. Every section below the hero stays static i18n content by
 * design: the CMS only stores one title+body per page, nothing
 * structured enough to back multiple distinct sections/cards.
 *
 * Sprint G: expanded from a bare hero + one value grid into the full
 * mission/traveler-value/partner-value/how-it-works/CTA structure the
 * brief calls for — reusing the exact card-grid and CTA-band patterns
 * `BecomePartnerPageContent.jsx` already established (same classes,
 * copied into this module's own stylesheet) rather than inventing a new
 * visual language. Every claim below is either a description of how the
 * product actually works or an honest statement of intent — no invented
 * user/partner counts, awards, years of operation, or testimonials
 * (spec §10).
 */

import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ShieldCheck,
  Compass,
  Headset,
  Users,
  Handshake,
  TrendingUp,
  Search,
  CalendarCheck,
  Sparkles,
  ArrowUpRight,
} from 'lucide-react';
import { Button } from '@desavii/ui/components/primitives';
import EditorialPageHero from '../../../../components/EditorialPageHero/EditorialPageHero.jsx';
import RouterLink from '../../../../components/RouterLink.jsx';
import useSeo from '../../../../seo/useSeo.js';
import { buildBreadcrumbListSchema } from '../../../../seo/structuredData.js';
import { useCmsPageQuery } from '../../queries/useCmsPageQuery.js';
import styles from './AboutPageContent.module.scss';

const TRAVELER_VALUE_KEYS = [
  { key: 'trust', icon: ShieldCheck },
  { key: 'variety', icon: Compass },
  { key: 'support', icon: Headset },
];

const PARTNER_VALUE_KEYS = [
  { key: 'reach', icon: TrendingUp },
  { key: 'onboarding', icon: Users },
  { key: 'fair', icon: Handshake },
];

const HOW_IT_WORKS_KEYS = [
  { key: 'discover', icon: Search },
  { key: 'book', icon: CalendarCheck },
  { key: 'enjoy', icon: Sparkles },
];

export default function AboutPageContent() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { locale } = useParams();
  const { data: cmsPage } = useCmsPageQuery('about', i18n.language);
  const title = cmsPage?.title ?? t('cms.about.title');
  const lead = cmsPage?.content ?? t('cms.about.lead');

  const breadcrumbItems = [
    { label: t('nav.home'), href: `/${locale}` },
    { label: title, href: `/${locale}/about` },
  ];

  useSeo({
    title,
    description: lead,
    locale,
    path: 'about',
    jsonLd: [buildBreadcrumbListSchema(breadcrumbItems)],
  });

  return (
    <div className={styles.page}>
      <EditorialPageHero
        breadcrumbItems={breadcrumbItems}
        heroSeed="about"
        icon={Compass}
        eyebrow={t('cms.about.eyebrow')}
        title={title}
        lead={lead}
      />

      <section className={styles.section}>
        <h2 className={styles.sectionHeading}>
          {t('cms.about.mission.title')}
        </h2>
        <p className={styles.sectionBody}>{t('cms.about.mission.body')}</p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionHeading}>
          {t('cms.about.travelerValueHeading')}
        </h2>
        <div className={styles.grid}>
          {TRAVELER_VALUE_KEYS.map(({ key, icon: ValueIcon }) => (
            <article key={key} className={styles.card}>
              <span className={styles.cardIcon} aria-hidden="true">
                <ValueIcon size={24} />
              </span>
              <h3 className={styles.cardTitle}>
                {t(`cms.about.values.${key}.title`)}
              </h3>
              <p className={styles.cardDescription}>
                {t(`cms.about.values.${key}.description`)}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionHeading}>
          {t('cms.about.partnerValueHeading')}
        </h2>
        <div className={styles.grid}>
          {PARTNER_VALUE_KEYS.map(({ key, icon: ValueIcon }) => (
            <article key={key} className={styles.card}>
              <span className={styles.cardIcon} aria-hidden="true">
                <ValueIcon size={24} />
              </span>
              <h3 className={styles.cardTitle}>
                {t(`cms.about.partnerValues.${key}.title`)}
              </h3>
              <p className={styles.cardDescription}>
                {t(`cms.about.partnerValues.${key}.description`)}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionHeading}>
          {t('cms.about.howItWorksHeading')}
        </h2>
        <div className={styles.grid}>
          {HOW_IT_WORKS_KEYS.map(({ key, icon: StepIcon }, index) => (
            <article key={key} className={styles.card}>
              <span className={styles.stepNumber} aria-hidden="true">
                {index + 1}
              </span>
              <span className={styles.cardIcon} aria-hidden="true">
                <StepIcon size={24} />
              </span>
              <h3 className={styles.cardTitle}>
                {t(`cms.about.howItWorks.${key}.title`)}
              </h3>
              <p className={styles.cardDescription}>
                {t(`cms.about.howItWorks.${key}.description`)}
              </p>
            </article>
          ))}
        </div>
      </section>

      <div className={styles.ctaBand}>
        <h2 className={styles.ctaHeading}>{t('cms.about.cta.heading')}</h2>
        <p className={styles.ctaBody}>{t('cms.about.cta.body')}</p>
        <div className={styles.ctaActions}>
          <Button
            variant="primary"
            size="lg"
            onClick={() => navigate(`/${locale}/search`)}
          >
            {t('cms.about.cta.exploreAction')}
          </Button>
          <RouterLink
            href={`/${locale}/become-a-partner`}
            className={styles.ctaSecondaryLink}
          >
            {t('cms.about.cta.partnerAction')}
            <ArrowUpRight size={16} aria-hidden="true" />
          </RouterLink>
        </div>
      </div>
    </div>
  );
}
