/**
 * CompanyCard — one `GET /partners` directory row (Phase 10 redesign;
 * restyled in the 2026 public-frontend audit's Companies Directory pass).
 * Built on the shared `Card` primitive's `elevated`/`interactive`
 * treatment — the same premium surface `BookingCard` uses, so a company
 * card reads as the same product rather than a separate, plainer "contact
 * card" system.
 *
 * `rating_average`/`review_count` (Reviews module, aggregated per
 * partner — `apps/api/.../dto/partnerDto.js`'s `toPartnerSummaryResponse`)
 * and `member_since` are real `GET /partners` fields that were always
 * returned but never rendered anywhere; both surface here now. No
 * category/city badge — `GET /partners` has no such column (a company
 * isn't itself categorized or located; its individual listings are), so
 * one isn't fabricated here.
 */

import { useState } from 'react';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { ArrowRight, ShieldCheck } from 'lucide-react';
import { Card } from '@desavii/ui/components/primitives';
import { RatingStars } from '@desavii/ui/components/data-display';
import RouterLink from '../../../../components/RouterLink.jsx';
import DestinationArt from '../../../../components/DestinationArt/DestinationArt.jsx';
import CompanyAvatar from '../../../../components/CompanyAvatar/CompanyAvatar.jsx';
import styles from './CompanyCard.module.scss';
import { ratingLabel } from '../../../../utils/formatRating.js';

export default function CompanyCard({ company }) {
  const { t, i18n } = useTranslation();
  const { locale } = useParams();
  const [imageFailed, setImageFailed] = useState(false);
  const memberSinceYear = company.member_since
    ? new Date(company.member_since).getFullYear()
    : null;

  return (
    <Card
      as={RouterLink}
      href={`/${locale}/companies/${company.slug}`}
      padding="none"
      interactive
      elevated
      className={styles.card}
      aria-label={t('companies.card.viewProfile', {
        name: company.display_name,
      })}
    >
      <div className={styles.media}>
        {company.cover_url && !imageFailed ? (
          <img
            src={company.cover_url}
            alt=""
            className={styles.image}
            loading="lazy"
            onError={() => setImageFailed(true)}
          />
        ) : (
          <DestinationArt seed={company.id} className={styles.imageArt} />
        )}
      </div>
      <div className={styles.body}>
        <span className={styles.logo}>
          <CompanyAvatar
            name={company.display_name}
            logoUrl={company.logo_url}
            seed={company.id}
            size={64}
          />
        </span>
        <div className={styles.nameRow}>
          <h3 className={styles.name}>{company.display_name}</h3>
          {company.is_verified && (
            <span className={styles.verifiedBadge}>
              <ShieldCheck size={14} aria-hidden="true" />
              {t('companies.card.verified')}
            </span>
          )}
        </div>

        {company.review_count > 0 && (
          <RatingStars
            value={company.rating_average}
            reviewCount={company.review_count}
            size="sm"
            locale={i18n.language}
            label={ratingLabel(
              t,
              i18n.language,
              company.rating_average,
              company.review_count,
            )}
          />
        )}

        {company.description && (
          <p className={styles.description}>{company.description}</p>
        )}

        <div className={styles.footer}>
          <span className={styles.listingCount}>
            {t('companies.card.listingCount', {
              count: company.listing_count,
            })}
          </span>
          {memberSinceYear && (
            <span className={styles.memberSince}>
              {t('companies.card.memberSince', { year: memberSinceYear })}
            </span>
          )}
        </div>

        <span className={styles.viewProfile}>
          {t('companies.card.viewProfileCta')}
          <ArrowRight size={14} aria-hidden="true" />
        </span>
      </div>
    </Card>
  );
}

CompanyCard.propTypes = {
  // Real `GET /partners` row shape, not a hand-authored prop contract —
  // same convention `SearchResultCard`'s own file header documents.
  // eslint-disable-next-line react/forbid-prop-types
  company: PropTypes.object.isRequired,
};
