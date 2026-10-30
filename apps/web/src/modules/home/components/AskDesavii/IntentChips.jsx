/**
 * IntentChips — what Ask Desavii understood, one chip per resolved part
 * (destination, category, each amenity, the search words), each with its
 * kind, its value and a button to drop it before searching. The values are
 * real catalog names from the server, rendered as text (never as HTML).
 */

import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import styles from './AskDesavii.module.scss';

export default function IntentChips({ parts, onRemove }) {
  const { t } = useTranslation();

  return (
    <ul className={styles.chips}>
      {parts.map((part) => (
        <li key={part.key} className={styles.chip}>
          <span className={styles.chipText}>
            <span className={styles.chipKind}>
              {t(`home.ask.parts.${part.type}`)}
            </span>
            <span className={styles.chipValue}>{part.label}</span>
          </span>
          <button
            type="button"
            className={styles.chipRemove}
            onClick={() => onRemove(part)}
            aria-label={t('home.ask.remove', { label: part.label })}
          >
            <X size={16} aria-hidden="true" />
          </button>
        </li>
      ))}
    </ul>
  );
}

IntentChips.propTypes = {
  parts: PropTypes.arrayOf(
    PropTypes.shape({
      key: PropTypes.string.isRequired,
      type: PropTypes.oneOf(['destination', 'category', 'amenity', 'words'])
        .isRequired,
      label: PropTypes.string.isRequired,
    }),
  ).isRequired,
  onRemove: PropTypes.func.isRequired,
};
