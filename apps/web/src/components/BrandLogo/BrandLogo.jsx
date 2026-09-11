/**
 * BrandLogo — the real Desavii mark/wordmark assets (Pass 3 remediation),
 * replacing the plain-text "desavii" previously passed as `Header`'s
 * `logo` node. Art-directed via `<picture>`: the full wordmark at
 * tablet+ widths, the compact mark below that where a full horizontal
 * wordmark would crowd the header bar. Decorative (`alt=""`) — the
 * enclosing `Header` Link supplies the accessible name via its own
 * `logoLabel` prop, so this never needs its own text alternative.
 */

import styles from './BrandLogo.module.scss';

export default function BrandLogo() {
  return (
    <picture>
      <source media="(max-width: 767px)" srcSet="/brand/desavii-mark.png" />
      <img src="/brand/desavii-wordmark.png" alt="" className={styles.image} />
    </picture>
  );
}
