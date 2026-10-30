/**
 * PhotoCredits — the attribution every Home photo's licence asks for:
 * what it shows, who took it, its licence and its source page. CC BY and
 * CC BY-SA require visible credit, so it lives on the page, folded into a
 * native disclosure at the end of Home (keyboard-operable, no script).
 * The record behind it is docs/HOME_IMAGE_SOURCES.md.
 */

import { useTranslation } from 'react-i18next';
import { Container } from '@desavii/ui/components/layout';
import { HOME_IMAGE_CREDITS } from '../../constants/homeImages.js';
import styles from './PhotoCredits.module.scss';

export default function PhotoCredits() {
  const { t } = useTranslation();

  return (
    <Container size="wide" className={styles.wrapper}>
      <details className={styles.credits}>
        <summary className={styles.summary}>
          {t('home.photoCredits.title')}
        </summary>
        <ul className={styles.list}>
          {HOME_IMAGE_CREDITS.map((credit) => (
            <li key={credit.key} className={styles.item}>
              {t('home.photoCredits.item', {
                subject: t(`home.photoCredits.subjects.${credit.key}`),
                author: credit.author,
              })}{' '}
              <a
                href={credit.licence.url}
                target="_blank"
                rel="noopener noreferrer license"
              >
                {credit.licence.name}
              </a>
              {' · '}
              <a href={credit.source} target="_blank" rel="noopener noreferrer">
                {t('home.photoCredits.source')}
              </a>
            </li>
          ))}
        </ul>
      </details>
    </Container>
  );
}
