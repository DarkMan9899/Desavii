/**
 * CompanyAttribution — Step A3 (Listing → Company Linking): a compact
 * "offered by" block on a public listing detail page, linking to the
 * owning company's public profile (`/:locale/companies/:slug`). Reuses
 * `CompanyAvatar` for the logo/initials-fallback (the same convention
 * `CompanyCard`/`CompanyProfilePageContent` already use) rather than
 * inventing a second identity visual, and the shared `ShieldCheck`
 * verified-badge pattern `CompanyCard` already established.
 *
 * Renders nothing when `company` is `null` — a listing whose owning
 * partner isn't currently publicly eligible (see the backend's
 * `getPublicCompanySummary` doc comment) degrades to no attribution
 * block at all, never a fabricated company or a broken link.
 *
 * The link's accessible name comes from its own visible text content
 * (label + company name), not an overriding `aria-label` — the visible
 * and accessible names stay identical on purpose.
 */

import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { ShieldCheck } from 'lucide-react';
import RouterLink from '../RouterLink.jsx';
import CompanyAvatar from '../CompanyAvatar/CompanyAvatar.jsx';
import styles from './CompanyAttribution.module.scss';

export default function CompanyAttribution({ company = null, locale }) {
  const { t } = useTranslation();
  if (!company) return null;

  return (
    <RouterLink
      href={`/${locale}/companies/${company.slug}`}
      className={styles.attribution}
    >
      <CompanyAvatar
        name={company.display_name}
        logoUrl={company.logo_url}
        seed={company.slug}
        size={40}
      />
      <span className={styles.text}>
        <span className={styles.label}>
          {t('pages.listingDetail.companyAttribution.label')}
        </span>
        <span className={styles.name}>
          {company.display_name}
          {company.is_verified && (
            <ShieldCheck
              size={14}
              aria-hidden="true"
              className={styles.verifiedIcon}
            />
          )}
        </span>
      </span>
    </RouterLink>
  );
}

CompanyAttribution.propTypes = {
  company: PropTypes.shape({
    slug: PropTypes.string.isRequired,
    display_name: PropTypes.string.isRequired,
    logo_url: PropTypes.string,
    is_verified: PropTypes.bool,
  }),
  locale: PropTypes.string.isRequired,
};
