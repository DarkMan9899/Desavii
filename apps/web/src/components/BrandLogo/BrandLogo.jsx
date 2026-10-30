/**
 * BrandLogo — the real Desavii mark/wordmark assets (Pass 3 remediation),
 * replacing the plain-text "desavii" previously passed as `Header`'s
 * `logo` node. Art-directed via `<picture>`: the full wordmark at
 * tablet+ widths, the compact mark below that where a full horizontal
 * wordmark would crowd the header bar. Decorative (`alt=""`) — the
 * enclosing `Header` Link supplies the accessible name via its own
 * `logoLabel` prop, so this never needs its own text alternative.
 *
 * Home rebuild (HOME-018): the header loads display-size copies of the
 * logos (`public/brand/header/`, 1x/2x/3x of the 32px height, derived
 * from the unchanged 1024px masters by `npm run generate:favicons`), so a
 * phone downloads a few kilobytes instead of ~0.7 MB.
 */

import styles from './BrandLogo.module.scss';

const HEADER_LOGO_DIR = '/brand/header';
// The height BrandLogo.module.scss renders both logos at; the copies exist
// at 1x/2x/3x of it.
const LOGO_HEIGHT = 32;
const DENSITIES = [1, 2, 3];

const srcSet = (name) =>
  DENSITIES.map(
    (density) =>
      `${HEADER_LOGO_DIR}/${name}-${LOGO_HEIGHT * density}.png ${density}x`,
  ).join(', ');

export default function BrandLogo() {
  return (
    <picture>
      <source media="(max-width: 767px)" srcSet={srcSet('desavii-mark')} />
      <img
        src={`${HEADER_LOGO_DIR}/desavii-wordmark-${LOGO_HEIGHT}.png`}
        srcSet={srcSet('desavii-wordmark')}
        alt=""
        className={styles.image}
      />
    </picture>
  );
}
