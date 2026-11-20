/**
 * ListingPrice — a listing's price exactly as every Desavii surface words
 * it (docs/LISTING_CARDS.md): "From AMD 42,000 / night", a restaurant's
 * "Avg. AMD 9,000 / person", or "Price not listed". Takes the resolved
 * price from `resolveCardPrice` (`utils/listingCardModel.js`) — never a
 * DTO — so the card and the Listing Detail header can never disagree.
 *
 * AMD amounts are converted to the visitor's currency (`Money`); any other
 * stored currency is shown as stored.
 */

import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { PriceTag } from '@desavii/ui/components/data-display';
import Money from '../Money/Money.jsx';
import styles from './ListingPrice.module.scss';

export const listingPriceShape = PropTypes.shape({
  amount: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
  currencyCode: PropTypes.string,
  lead: PropTypes.oneOf(['from', 'average']).isRequired,
  basisLabel: PropTypes.string,
});

export default function ListingPrice({
  price = null,
  locale = undefined,
  size = 'md',
  className = undefined,
}) {
  const { t } = useTranslation();
  const classes = [styles.price, styles[`price--${size}`], className]
    .filter(Boolean)
    .join(' ');
  if (!price) {
    return (
      <p className={classes}>
        <span className={styles.muted}>{t('listingCard.price.unlisted')}</span>
      </p>
    );
  }
  return (
    <p className={classes}>
      <span className={styles.muted}>
        {t(`listingCard.price.${price.lead}`)}
      </span>
      {price.currencyCode === 'AMD' ? (
        <Money amountAmd={price.amount} locale={locale} size={size} />
      ) : (
        <PriceTag
          amount={price.amount}
          currencyCode={price.currencyCode}
          locale={locale}
          size={size}
        />
      )}
      {price.basisLabel && (
        <span className={styles.muted}>{price.basisLabel}</span>
      )}
    </p>
  );
}

ListingPrice.propTypes = {
  price: listingPriceShape,
  locale: PropTypes.string,
  /** The amount's size (`Money` / `PriceTag` sizes). */
  size: PropTypes.oneOf(['md', 'lg']),
  className: PropTypes.string,
};
