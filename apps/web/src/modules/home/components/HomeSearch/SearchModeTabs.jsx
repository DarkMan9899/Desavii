/**
 * SearchModeTabs — the Hero search panel's two ways in: Search (the
 * structured fields) and Ask Desavii (a request in your own words). One
 * panel, two modes, so AI reads as part of search rather than a separate
 * chat. A WAI-ARIA tablist: the active tab is the one Tab stop; the arrow
 * keys (and Home/End) move between modes.
 */

import { useRef } from 'react';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { Search, Sparkles } from 'lucide-react';
import styles from './SearchModeTabs.module.scss';

export const SEARCH_MODES = ['search', 'ask'];
const ICONS = { search: Search, ask: Sparkles };
const LABEL_KEYS = {
  search: 'home.search.modes.search',
  ask: 'home.search.modes.ask',
};

export const tabId = (idPrefix, mode) => `${idPrefix}-tab-${mode}`;
export const panelId = (idPrefix) => `${idPrefix}-panel`;

export default function SearchModeTabs({ mode, onChange, idPrefix }) {
  const { t } = useTranslation();
  const tabs = useRef({});

  const select = (next) => {
    onChange(next);
    tabs.current[next]?.focus();
  };

  const onKeyDown = (event) => {
    const index = SEARCH_MODES.indexOf(mode);
    const last = SEARCH_MODES.length - 1;
    const targets = {
      ArrowRight: SEARCH_MODES[index === last ? 0 : index + 1],
      ArrowLeft: SEARCH_MODES[index === 0 ? last : index - 1],
      Home: SEARCH_MODES[0],
      End: SEARCH_MODES[last],
    };
    if (!targets[event.key]) return;
    event.preventDefault();
    select(targets[event.key]);
  };

  return (
    <div
      className={styles.tabs}
      role="tablist"
      aria-label={t('home.search.modes.label')}
    >
      {SEARCH_MODES.map((value) => {
        const Icon = ICONS[value];
        const isActive = value === mode;
        return (
          <button
            key={value}
            ref={(node) => {
              tabs.current[value] = node;
            }}
            type="button"
            role="tab"
            id={tabId(idPrefix, value)}
            aria-selected={isActive}
            aria-controls={panelId(idPrefix)}
            tabIndex={isActive ? 0 : -1}
            className={[styles.tab, styles[`tab--${value}`]].join(' ')}
            onClick={() => onChange(value)}
            onKeyDown={onKeyDown}
          >
            <Icon size={16} aria-hidden="true" className={styles.icon} />
            {t(LABEL_KEYS[value])}
          </button>
        );
      })}
    </div>
  );
}

SearchModeTabs.propTypes = {
  mode: PropTypes.oneOf(SEARCH_MODES).isRequired,
  onChange: PropTypes.func.isRequired,
  idPrefix: PropTypes.string.isRequired,
};
