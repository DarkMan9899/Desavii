/**
 * ListingPartnerSection — who offers this listing: the company's public
 * identity (name, logo, verified status) linking to its public profile
 * (`CompanyAttribution`). Only what the API's public company block carries
 * (`toCompanyAttributionResponse`): never an email, a phone, an internal id
 * or anything moderation-related. Absent when the company is not publicly
 * eligible (`company` is null).
 */

import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { Section } from '@desavii/ui/components/layout';
import CompanyAttribution from '../../../../../components/CompanyAttribution/CompanyAttribution.jsx';
import styles from './ListingPartnerSection.module.scss';

export default function ListingPartnerSection({ company, locale, sectionId }) {
  const { t } = useTranslation();
  return (
    <Section
      spacing="none"
      aria-label={t('pages.listingDetail.partner.heading')}
    >
      <h2 id={sectionId}>{t('pages.listingDetail.partner.heading')}</h2>
      <div className={styles.body}>
        <CompanyAttribution company={company} locale={locale} />
        <p className={styles.note}>{t('pages.listingDetail.partner.note')}</p>
      </div>
    </Section>
  );
}

ListingPartnerSection.propTypes = {
  company: CompanyAttribution.propTypes.company.isRequired,
  locale: PropTypes.string.isRequired,
  sectionId: PropTypes.string.isRequired,
};
