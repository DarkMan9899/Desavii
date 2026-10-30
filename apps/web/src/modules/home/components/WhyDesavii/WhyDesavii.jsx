/**
 * WhyDesavii — four plain reasons to book here, each one true of the
 * product today (no figures, ratings or awards): partners are verified and
 * listings moderated, every booking and its status is kept in the guest's
 * account, listings come from local partners, and the whole site is in
 * Armenian, Russian and English. (Online payment is paused —
 * docs/PAYMENTS_PAUSED.md — so nothing here promises a checkout.)
 *
 * Home rebuild (docs/HOME_REBUILD.md): a quiet navy band — the page's one
 * dark moment between the card rows and the stories — with the four
 * points side by side (two-by-two on a tablet, a list on a phone).
 */

import { useTranslation } from 'react-i18next';
import { Container, Section } from '@desavii/ui/components/layout';
import { ShieldCheck, CalendarCheck, MapPinned, Languages } from 'lucide-react';
import WHY_DESAVII_ITEMS from '../../constants/whyDesavii.js';
import SectionHeader from '../SectionHeader/SectionHeader.jsx';
import ScrollReveal from '../ScrollReveal/ScrollReveal.jsx';
import styles from './WhyDesavii.module.scss';

const ICONS = { ShieldCheck, CalendarCheck, MapPinned, Languages };
const HEADING_ID = 'why-desavii-heading';

export default function WhyDesavii() {
  const { t } = useTranslation();

  return (
    <Section aria-labelledby={HEADING_ID} className={styles.band}>
      <Container size="wide">
        <ScrollReveal>
          <SectionHeader
            id={HEADING_ID}
            tone="dark"
            eyebrow={t('home.whyDesavii.eyebrow')}
            title={t('home.whyDesavii.title')}
            subtitle={t('home.whyDesavii.subtitle')}
          />
        </ScrollReveal>
        <ScrollReveal stagger className={styles.grid}>
          {WHY_DESAVII_ITEMS.map((item) => {
            const Icon = ICONS[item.icon];
            return (
              <div key={item.id} className={styles.item}>
                <Icon className={styles.icon} aria-hidden="true" />
                <div className={styles.text}>
                  <h3 className={styles.itemTitle}>
                    {t(`home.whyDesavii.items.${item.id}.title`)}
                  </h3>
                  <p className={styles.itemDescription}>
                    {t(`home.whyDesavii.items.${item.id}.description`)}
                  </p>
                </div>
              </div>
            );
          })}
        </ScrollReveal>
      </Container>
    </Section>
  );
}
