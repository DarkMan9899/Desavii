/**
 * ListingMenuSection — Pass 3 remediation (Restaurant vertical). Renders
 * a RESTAURANT listing's real, partner-authored menu (migration 0045):
 * one or more menus, each an ordered list of sections, each an ordered
 * list of priced items. Never fabricates dishes from the listing's
 * description — renders nothing when the partner hasn't authored a menu
 * yet, same "real content or nothing" rule `ListingFaqSection` already
 * follows.
 */

import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { Section, Stack } from '@desavii/ui/components/layout';
import { Badge } from '@desavii/ui/components/primitives';
import Money from '../../../../../components/Money/Money.jsx';
import styles from './ListingMenuSection.module.scss';

export default function ListingMenuSection({
  menus = [],
  locale = undefined,
  sectionId = undefined,
}) {
  const { t } = useTranslation();
  const activeMenus = menus.filter((menu) => menu.is_active);
  if (activeMenus.length === 0) return null;

  return (
    <Section spacing="none" aria-label={t('pages.listingDetail.menu.heading')}>
      <h2 id={sectionId}>{t('pages.listingDetail.menu.heading')}</h2>
      <Stack gap="8">
        {activeMenus.map((menu) => (
          <div key={menu.id} className={styles.menu}>
            <div className={styles.menuHeader}>
              <h3 className={styles.menuName}>{menu.name}</h3>
              {menu.description && (
                <p className={styles.menuDescription}>{menu.description}</p>
              )}
            </div>
            <Stack gap="6">
              {menu.sections.map((section) => {
                const activeItems = section.items.filter(
                  (item) => item.is_active,
                );
                if (activeItems.length === 0) return null;
                return (
                  <div key={section.id} className={styles.section}>
                    <h4 className={styles.sectionTitle}>{section.title}</h4>
                    <ul className={styles.itemList}>
                      {activeItems.map((item) => (
                        <li key={item.id} className={styles.item}>
                          <div className={styles.itemHeader}>
                            <span className={styles.itemTitle}>
                              {item.title}
                            </span>
                            <span className={styles.itemPrice}>
                              <Money
                                amountAmd={item.price_amount}
                                locale={locale}
                                size="sm"
                              />
                            </span>
                          </div>
                          {item.description && (
                            <p className={styles.itemDescription}>
                              {item.description}
                            </p>
                          )}
                          {item.dietary_markers.length > 0 && (
                            <div className={styles.itemMarkers}>
                              {item.dietary_markers.map((marker) => (
                                <Badge
                                  key={marker}
                                  variant="neutral"
                                  size="sm"
                                  label={t(
                                    `pages.listingDetail.menu.dietaryMarkers.${marker}`,
                                    { defaultValue: marker },
                                  )}
                                />
                              ))}
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </Stack>
          </div>
        ))}
      </Stack>
    </Section>
  );
}

ListingMenuSection.propTypes = {
  menus: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.number.isRequired,
      name: PropTypes.string.isRequired,
      description: PropTypes.string,
      is_active: PropTypes.bool.isRequired,
      sections: PropTypes.arrayOf(
        PropTypes.shape({
          id: PropTypes.number.isRequired,
          title: PropTypes.string.isRequired,
          items: PropTypes.arrayOf(
            PropTypes.shape({
              id: PropTypes.number.isRequired,
              title: PropTypes.string.isRequired,
              description: PropTypes.string,
              price_amount: PropTypes.number.isRequired,
              price_currency_code: PropTypes.string.isRequired,
              dietary_markers: PropTypes.arrayOf(PropTypes.string),
              is_active: PropTypes.bool.isRequired,
            }),
          ).isRequired,
        }),
      ).isRequired,
    }),
  ),
  locale: PropTypes.string,
  sectionId: PropTypes.string,
};
