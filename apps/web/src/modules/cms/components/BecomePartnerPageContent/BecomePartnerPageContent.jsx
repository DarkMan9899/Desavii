/**
 * BecomePartnerPageContent — `/:locale/become-a-partner` (Phase 10
 * redesign; editorial conversion-page redesign in the 2026
 * public-frontend audit's static-page pass — see `EditorialPageHero`'s
 * own file header for the shared hero shell this now uses). Marketing
 * content with a single CTA — the most consequential of the six static
 * pages, so it gets the strongest visual treatment of the family: the
 * shared hero, a benefits grid, then a dedicated dark CTA band (the same
 * `$gradient-navy-royal` treatment `DashboardOverviewContent`'s
 * trip-planner CTA already uses) instead of a bare button sitting under
 * a paragraph.
 *
 * P1.2 (Master Roadmap) added the real self-service application flow at
 * `/partner/apply`, wrapped in `RequireAuth` (not `RequirePartner` — an
 * applicant has no partnership yet).
 *
 * Auth entry cleanup: the "Start" CTA now goes straight into partner
 * onboarding for every visitor (`resolvePartnerStartPath`): someone
 * signed out creates their partner account at `/partner/register` (it
 * used to bounce them to the login page, whose "Sign up" link then
 * dropped the partner intent and made a plain customer account); a
 * signed-in customer applies with their existing account at
 * `/partner/apply`; a signed-in partner member goes to their workspace.
 *
 * P1.6 (Master Roadmap): title/lead now come from the real CMS backend
 * (see `AboutPageContent.jsx`'s identical comment for the fallback
 * reasoning). The benefits grid and CTA stay static/functional as-is —
 * no revenue claims, partner counts, or testimonials invented.
 */

import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { Handshake, TrendingUp, Users, ShieldCheck } from 'lucide-react';
import { Button } from '@desavii/ui/components/primitives';
import EditorialPageHero from '../../../../components/EditorialPageHero/EditorialPageHero.jsx';
import useSeo from '../../../../seo/useSeo.js';
import { buildBreadcrumbListSchema } from '../../../../seo/structuredData.js';
import { useAuth } from '../../../../contexts/AuthContext.jsx';
import { resolvePartnerStartPath } from '../../../../utils/authDestinations.js';
import { useCmsPageQuery } from '../../queries/useCmsPageQuery.js';
import styles from './BecomePartnerPageContent.module.scss';

const BENEFIT_KEYS = [
  { key: 'reach', icon: TrendingUp },
  { key: 'audience', icon: Users },
  { key: 'trust', icon: ShieldCheck },
];

export default function BecomePartnerPageContent() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { locale } = useParams();
  const { isAuthenticated, partnerships } = useAuth();
  const { data: cmsPage } = useCmsPageQuery('become-a-partner', i18n.language);
  const title = cmsPage?.title ?? t('cms.becomePartner.title');
  const lead = cmsPage?.content ?? t('cms.becomePartner.lead');

  const breadcrumbItems = [
    { label: t('nav.home'), href: `/${locale}` },
    {
      label: title,
      href: `/${locale}/become-a-partner`,
    },
  ];

  useSeo({
    title: `${title} | ${t('app.name')}`,
    description: lead,
    locale,
    path: 'become-a-partner',
    jsonLd: [buildBreadcrumbListSchema(breadcrumbItems)],
  });

  return (
    <div className={styles.page}>
      <EditorialPageHero
        breadcrumbItems={breadcrumbItems}
        heroSeed="become-a-partner"
        icon={Handshake}
        title={title}
        lead={lead}
      />
      <div className={styles.benefitsGrid}>
        {BENEFIT_KEYS.map(({ key, icon: BenefitIcon }) => (
          <article key={key} className={styles.benefitCard}>
            <span className={styles.benefitIcon} aria-hidden="true">
              <BenefitIcon size={24} />
            </span>
            <h2 className={styles.benefitTitle}>
              {t(`cms.becomePartner.benefits.${key}.title`)}
            </h2>
            <p className={styles.benefitDescription}>
              {t(`cms.becomePartner.benefits.${key}.description`)}
            </p>
          </article>
        ))}
      </div>
      <div className={styles.ctaBand}>
        <Button
          variant="primary"
          size="lg"
          onClick={() =>
            navigate(
              resolvePartnerStartPath({
                isAuthenticated,
                partnerships,
                locale,
              }),
            )
          }
        >
          {t('cms.becomePartner.cta')}
        </Button>
      </div>
    </div>
  );
}
