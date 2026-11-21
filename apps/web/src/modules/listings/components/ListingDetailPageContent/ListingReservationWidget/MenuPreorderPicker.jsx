/**
 * MenuPreorderPicker — choosing dishes from the restaurant's real menu
 * (docs/BOOKING_WIDGET_REBUILD.md §5, W-14).
 *
 * Every dish the partner currently offers, by section and in the
 * partner's order, each with its price and a quantity stepper. The footer
 * keeps the chosen count and the subtotal in view, with the one truthful
 * payment line: the pre-order is paid at the restaurant, nothing is
 * charged now. Rendered inside a dialog on desktop and as an in-place step
 * of the booking sheet on mobile (never a dialog over a sheet).
 */

import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { Button } from '@desavii/ui/components/primitives';
import PriceInCurrency from '../../../../../components/Money/PriceInCurrency.jsx';
import QuantityStepper from './QuantityStepper.jsx';
import {
  MAX_PREORDER_LINES,
  MAX_PREORDER_QUANTITY,
} from '../../../utils/menuPreorder.js';
import styles from './MenuPreorder.module.scss';

export default function MenuPreorderPicker({
  sections,
  quantities,
  preorder,
  locale,
  onChangeQuantity,
  onDone,
  onClear,
  headingLevel = 3,
}) {
  const { t } = useTranslation();
  const SectionHeading = `h${headingLevel}`;
  const selectedCount = preorder.lines.reduce(
    (sum, line) => sum + line.quantity,
    0,
  );
  const isAtLineLimit = preorder.lines.length >= MAX_PREORDER_LINES;

  return (
    <div className={styles.picker}>
      <p className={styles.intro}>
        {t('pages.listingDetail.reservation.preorder.intro', {
          max: MAX_PREORDER_QUANTITY,
        })}
      </p>

      <div className={styles.sections}>
        {sections.map((section) => (
          <section key={section.id} aria-label={section.title}>
            <SectionHeading className={styles.sectionTitle}>
              {section.title}
            </SectionHeading>
            <ul className={styles.dishList}>
              {section.items.map((item) => {
                const quantity = quantities[item.id] ?? 0;
                return (
                  <li key={item.id} className={styles.dish}>
                    <div className={styles.dishText}>
                      <span className={styles.dishTitle}>{item.title}</span>
                      {item.description && (
                        <span className={styles.dishDescription}>
                          {item.description}
                        </span>
                      )}
                      <span className={styles.dishPrice}>
                        <PriceInCurrency
                          amount={item.price_amount}
                          currency={item.price_currency_code ?? 'AMD'}
                          locale={locale}
                          size="sm"
                        />
                      </span>
                    </div>
                    <QuantityStepper
                      compact
                      label={item.title}
                      value={quantity}
                      min={0}
                      max={
                        quantity === 0 && isAtLineLimit
                          ? 0
                          : MAX_PREORDER_QUANTITY
                      }
                      onChange={(next) => onChangeQuantity(item.id, next)}
                    />
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>

      <div className={styles.footer}>
        <div className={styles.footerTotals} aria-live="polite">
          <span className={styles.footerCount}>
            {t('pages.listingDetail.reservation.preorder.dishCount', {
              count: selectedCount,
            })}
          </span>
          {preorder.subtotalAmount && (
            <PriceInCurrency
              amount={preorder.subtotalAmount}
              currency={preorder.currency}
              locale={locale}
              size="md"
            />
          )}
        </div>
        {isAtLineLimit && (
          <p className={styles.limit}>
            {t('pages.listingDetail.reservation.preorder.lineLimit', {
              max: MAX_PREORDER_LINES,
            })}
          </p>
        )}
        <p className={styles.payNote}>
          {t('pages.listingDetail.reservation.preorder.payAtVenue')}
        </p>
        <div className={styles.footerActions}>
          {preorder.lines.length > 0 && (
            <Button variant="ghost" onClick={onClear}>
              {t('pages.listingDetail.reservation.preorder.clear')}
            </Button>
          )}
          <Button variant="primary" onClick={onDone}>
            {t('pages.listingDetail.reservation.preorder.done')}
          </Button>
        </div>
      </div>
    </div>
  );
}

const lineShape = PropTypes.shape({
  menuItemId: PropTypes.number.isRequired,
  quantity: PropTypes.number.isRequired,
});

MenuPreorderPicker.propTypes = {
  sections: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.number.isRequired,
      title: PropTypes.string.isRequired,
      items: PropTypes.arrayOf(
        PropTypes.shape({
          id: PropTypes.number.isRequired,
          title: PropTypes.string.isRequired,
          description: PropTypes.string,
          price_amount: PropTypes.oneOfType([
            PropTypes.string,
            PropTypes.number,
          ]).isRequired,
          price_currency_code: PropTypes.string,
        }),
      ).isRequired,
    }),
  ).isRequired,
  quantities: PropTypes.objectOf(PropTypes.number).isRequired,
  preorder: PropTypes.shape({
    lines: PropTypes.arrayOf(lineShape).isRequired,
    subtotalAmount: PropTypes.string,
    currency: PropTypes.string,
  }).isRequired,
  locale: PropTypes.string.isRequired,
  onChangeQuantity: PropTypes.func.isRequired,
  onDone: PropTypes.func.isRequired,
  onClear: PropTypes.func.isRequired,
  headingLevel: PropTypes.oneOf([3, 4]),
};
