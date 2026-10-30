/**
 * PartnerCta — the Home page's closing invitation to Armenian businesses:
 * list on desavii. A link to the partner page (it navigates, so it is a
 * link — openable in a new tab, announced as one), set on a photo of
 * the country with a navy wash behind the text.
 *
 * Home rebuild (docs/HOME_REBUILD.md): replaces the abstract ring banner
 * and the button that navigated through `onClick`.
 */

import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { Container, Section } from '@desavii/ui/components/layout';
import ActionLink from '../ActionLink/ActionLink.jsx';
import { getHomeImage } from '../../constants/homeImages.js';
import HomePicture from '../HomePicture/HomePicture.jsx';
import ScrollReveal from '../ScrollReveal/ScrollReveal.jsx';
import styles from './PartnerCta.module.scss';

const PARTNER_IMAGE = getHomeImage('partner-landscape');

export default function PartnerCta() {
  const { t } = useTranslation();
  const { locale } = useParams();

  return (
    <Section aria-labelledby="partner-cta-heading">
      <Container size="wide">
        <ScrollReveal className={styles.banner}>
          <div className={styles.media} aria-hidden="true">
            <HomePicture
              image={PARTNER_IMAGE}
              sizes="(min-width: 1440px) 1440px, 100vw"
            />
          </div>
          <div className={styles.text}>
            <h2 id="partner-cta-heading" className={styles.title}>
              {t('home.partnerCta.title')}
            </h2>
            <p className={styles.description}>
              {t('home.partnerCta.description')}
            </p>
          </div>
          <div className={styles.cta}>
            <ActionLink href={`/${locale}/become-a-partner`} variant="onImage">
              {t('home.partnerCta.cta')}
            </ActionLink>
          </div>
        </ScrollReveal>
      </Container>
    </Section>
  );
}
