/**
 * FeatureGrid — icon + grouping + collapse amenities display
 * (`ListingAmenitiesSection.jsx`), replacing an earlier flat, icon-less
 * Badge list. Groups are always fully shown; only the flattened item
 * count is what collapses behind `showAllLabel`/`showLessLabel`, so a
 * short list never shows a pointless toggle. `collapsible={false}` shows
 * everything with no toggle — for a caller that already presents the full
 * list on its own surface (e.g. a "Show all amenities" dialog).
 */

import { useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import styles from './FeatureGrid.module.scss';

const COLLAPSED_ITEM_LIMIT = 10;

export default function FeatureGrid({
  groups,
  showAllLabel = undefined,
  showLessLabel = undefined,
  collapsible = true,
}) {
  const [expanded, setExpanded] = useState(false);

  const totalItems = useMemo(
    () => groups.reduce((sum, group) => sum + group.items.length, 0),
    [groups],
  );
  const needsToggle = collapsible && totalItems > COLLAPSED_ITEM_LIMIT;

  const visibleGroups = useMemo(() => {
    if (expanded || !needsToggle) return groups;
    let remaining = COLLAPSED_ITEM_LIMIT;
    return groups
      .map((group) => {
        if (remaining <= 0) return null;
        const items = group.items.slice(0, remaining);
        remaining -= items.length;
        return { ...group, items };
      })
      .filter(Boolean);
  }, [groups, expanded, needsToggle]);

  return (
    <div className={styles.featureGrid}>
      {visibleGroups.map((group) => (
        <div className={styles.group} key={group.title}>
          <h3 className={styles.groupTitle}>{group.title}</h3>
          <ul className={styles.list}>
            {group.items.map((item) => {
              const Icon = item.icon;
              return (
                <li className={styles.item} key={item.label}>
                  {Icon && (
                    <Icon
                      className={styles.icon}
                      aria-hidden="true"
                      focusable="false"
                    />
                  )}
                  <span>{item.label}</span>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
      {needsToggle && (
        <button
          type="button"
          className={styles.toggle}
          onClick={() => setExpanded((current) => !current)}
        >
          {expanded ? showLessLabel : showAllLabel}
        </button>
      )}
    </div>
  );
}

const featureItemShape = PropTypes.shape({
  label: PropTypes.string.isRequired,
  // A lucide-react icon component reference (not an instantiated element).
  icon: PropTypes.elementType,
});

FeatureGrid.propTypes = {
  groups: PropTypes.arrayOf(
    PropTypes.shape({
      title: PropTypes.string.isRequired,
      items: PropTypes.arrayOf(featureItemShape).isRequired,
    }),
  ).isRequired,
  // Required while `collapsible` (the default) — the toggle's two labels.
  showAllLabel: PropTypes.string,
  showLessLabel: PropTypes.string,
  collapsible: PropTypes.bool,
};
