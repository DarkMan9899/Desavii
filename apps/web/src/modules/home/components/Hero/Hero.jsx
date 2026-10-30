/**
 * Hero — the Home page's first viewport: Armenia itself (Khor Virap under
 * Mount Ararat), the promise in one line, and search right below it.
 *
 * Home rebuild (docs/HOME_REBUILD.md): the photograph replaces the earlier
 * illustrated "portal" scene; a navy scrim keeps the headline readable on
 * any crop, and the photo fades into the page so the hero hands over to
 * the next section instead of ending in an empty band. Search is the one
 * action here — the partner invitation has its own section further down.
 *
 * The heading is the page's largest paint, so it renders visible from the
 * first frame; only the eyebrow and subtitle arrive with a short fade.
 */

import { useTranslation } from 'react-i18next';
import { Container } from '@desavii/ui/components/layout';
import { getHomeImage } from '../../constants/homeImages.js';
import HomePicture from '../HomePicture/HomePicture.jsx';
import HomeSearch from '../HomeSearch/HomeSearch.jsx';
import styles from './Hero.module.scss';

const HERO_IMAGE = getHomeImage('hero-ararat');

export default function Hero() {
  const { t } = useTranslation();

  return (
    <section className={styles.hero} aria-labelledby="home-hero-heading">
      <div className={styles.media} aria-hidden="true">
        <HomePicture
          image={HERO_IMAGE}
          sizes="100vw"
          priority
          className={styles.photo}
        />
        <div className={styles.scrim} />
      </div>

      <Container size="wide" className={styles.inner}>
        <div className={styles.copy}>
          <p className={styles.eyebrow}>{t('home.hero.eyebrow')}</p>
          <h1 id="home-hero-heading" className={styles.title}>
            {t('home.hero.title')}
          </h1>
          <p className={styles.subtitle}>{t('home.hero.subtitle')}</p>
        </div>
        <div className={styles.search}>
          <HomeSearch />
        </div>
      </Container>
    </section>
  );
}
