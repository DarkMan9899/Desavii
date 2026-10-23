/**
 * PolicyList — a compact, scannable list of rules (icon · title · short
 * value), the "Things to know" pattern rather than one large card per
 * value: most policies are a single word ("Not allowed", "14:00").
 *
 * A policy may carry `details` — a longer explanation shown behind a
 * native disclosure (`<details>`), keyboard-operable with no script, so
 * the list stays one line per rule.
 */

import PropTypes from 'prop-types';
import styles from './PolicyList.module.scss';

export default function PolicyList({ policies }) {
  return (
    <ul className={styles.list}>
      {policies.map((policy) => {
        const Icon = policy.icon;
        const icon = Icon && (
          <Icon className={styles.icon} aria-hidden="true" focusable="false" />
        );
        const summary = (
          <>
            {icon}
            <span className={styles.title}>{policy.title}</span>
            <span className={styles.value}>{policy.description}</span>
          </>
        );
        return (
          <li className={styles.item} key={policy.title}>
            {policy.details ? (
              <details className={styles.details}>
                <summary className={styles.row}>{summary}</summary>
                <p className={styles.explanation}>{policy.details}</p>
              </details>
            ) : (
              <div className={styles.row}>{summary}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

PolicyList.propTypes = {
  policies: PropTypes.arrayOf(
    PropTypes.shape({
      icon: PropTypes.elementType,
      title: PropTypes.string.isRequired,
      // The short value ("Not allowed", "14:00", "Moderate").
      description: PropTypes.string.isRequired,
      // Optional longer explanation, behind a disclosure.
      details: PropTypes.string,
    }),
  ).isRequired,
};
