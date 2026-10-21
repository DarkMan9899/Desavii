/**
 * ResultsViewToggle — List or Map: two pressed-state buttons in a
 * labelled group. The choice is URL state (`view`), so it survives a
 * reload, Back/Forward and a copied link.
 */

import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { List, Map as MapIcon } from 'lucide-react';
import { RESULT_VIEWS } from '../../schemas/searchParams.js';
import styles from './ResultsViewToggle.module.scss';

const OPTIONS = [
  { value: RESULT_VIEWS.LIST, icon: List },
  { value: RESULT_VIEWS.MAP, icon: MapIcon },
];

export default function ResultsViewToggle({ view, onChange }) {
  const { t } = useTranslation();

  return (
    <div
      className={styles.toggle}
      role="group"
      aria-label={t('search.view.label')}
    >
      {OPTIONS.map(({ value, icon: Icon }) => (
        <button
          key={value}
          type="button"
          className={styles.option}
          aria-pressed={view === value}
          onClick={() => onChange(value)}
        >
          <Icon size={16} aria-hidden="true" />
          {t(`search.view.${value}`)}
        </button>
      ))}
    </div>
  );
}

ResultsViewToggle.propTypes = {
  view: PropTypes.oneOf(Object.values(RESULT_VIEWS)).isRequired,
  onChange: PropTypes.func.isRequired,
};
