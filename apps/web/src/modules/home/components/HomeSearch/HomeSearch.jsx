/**
 * HomeSearch — the Home page's search entry, with two ways in that are one
 * product:
 *
 * - Search: the Search page's own fields (`useHomeSearch` explains why);
 * - Ask Desavii: a request in your own words, interpreted into those same
 *   fields (`useAskDesavii`), checked by the traveller, then opened as the
 *   same `/search` URL — or put into the fields to refine.
 *
 * From tablet up both live in one panel with mode tabs. On a phone the
 * panel would make the hero several screens tall, so a field-like button
 * (and a quieter "Ask Desavii" one) open it in a sheet. Returning from
 * sign-in with `?ask=1` opens Ask Desavii with the kept request.
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, useSearchParams } from 'react-router-dom';
import { Search, SlidersHorizontal, Sparkles } from 'lucide-react';
import { Modal } from '@desavii/ui/components/feedback-overlays';
import useMediaQuery from '../../../../hooks/useMediaQuery.js';
import { PrimarySearchFields } from '../../../search/index.js';
import useHomeSearch from '../../hooks/useHomeSearch.js';
import useAskDesavii from '../../hooks/useAskDesavii.js';
import AskDesavii from '../AskDesavii/AskDesavii.jsx';
import SearchModeTabs, { panelId, tabId } from './SearchModeTabs.jsx';
import styles from './HomeSearch.module.scss';

const INLINE_MEDIA_QUERY = '(min-width: 768px)';
const SHEET_FORM_ID = 'home-search-sheet';
const ID_PREFIX = 'home-search';

export default function HomeSearch() {
  const { t } = useTranslation();
  const { locale } = useParams();
  const [searchParams] = useSearchParams();
  const isInline = useMediaQuery(INLINE_MEDIA_QUERY);
  const returningToAsk = searchParams.get('ask') === '1';
  const [mode, setMode] = useState(returningToAsk ? 'ask' : 'search');
  const [isSheetOpen, setIsSheetOpen] = useState(returningToAsk && !isInline);
  const search = useHomeSearch();
  const ask = useAskDesavii();

  const loginHref = `/${locale}/auth/login?redirect=${encodeURIComponent(
    `/${locale}?ask=1`,
  )}`;

  const handleSubmit = (event) => {
    event.preventDefault();
    search.submit();
  };

  const openSheet = (nextMode) => {
    setMode(nextMode);
    setIsSheetOpen(true);
  };

  const backToSearch = (patch) => {
    search.replaceWith(patch);
    setMode('search');
  };

  const submitButton = (
    <button
      type="submit"
      className={styles.submit}
      form={isInline ? undefined : SHEET_FORM_ID}
    >
      <Search size={18} aria-hidden="true" />
      <span>{t('search.filters.submit')}</span>
    </button>
  );

  const panel = (layout) => (
    <>
      <SearchModeTabs mode={mode} onChange={setMode} idPrefix={ID_PREFIX} />
      <div
        role="tabpanel"
        id={panelId(ID_PREFIX)}
        aria-labelledby={tabId(ID_PREFIX, mode)}
      >
        {mode === 'search' ? (
          <form
            id={isInline ? undefined : SHEET_FORM_ID}
            onSubmit={handleSubmit}
            role="search"
            aria-label={t('home.search.label')}
            noValidate
          >
            <PrimarySearchFields
              filters={search.filters}
              draft={search.draft}
              onApply={search.onApply}
              categories={search.categories}
              destinations={search.destinations}
              layout={layout}
              action={isInline ? submitButton : undefined}
            />
          </form>
        ) : (
          <AskDesavii
            ask={ask}
            loginHref={loginHref}
            onShowResults={search.searchWith}
            onRefine={backToSearch}
            onUseSearch={(words) => backToSearch({ destination: words.trim() })}
          />
        )}
      </div>
    </>
  );

  if (isInline) {
    return <div className={styles.panel}>{panel('bar')}</div>;
  }

  const summary =
    search.draft.keyword ||
    search.destinations.find(
      (destination) => destination.id === search.filters.cityId,
    )?.name ||
    search.categories.find(
      (category) => category.id === search.filters.categoryId,
    )?.name;

  return (
    <div className={styles.compact}>
      <button
        type="button"
        className={styles.trigger}
        aria-haspopup="dialog"
        onClick={() => openSheet('search')}
      >
        <Search size={20} aria-hidden="true" className={styles.triggerIcon} />
        <span className={styles.triggerText}>
          <span className={styles.triggerTitle}>
            {summary || t('home.search.triggerTitle')}
          </span>
          <span className={styles.triggerHint}>
            {t('home.search.triggerHint')}
          </span>
        </span>
        <SlidersHorizontal
          size={18}
          aria-hidden="true"
          className={styles.triggerIcon}
        />
      </button>
      <button
        type="button"
        className={styles.askTrigger}
        aria-haspopup="dialog"
        onClick={() => openSheet('ask')}
      >
        <Sparkles size={16} aria-hidden="true" className={styles.askMark} />
        {t('home.search.askTrigger')}
      </button>
      <Modal
        isOpen={isSheetOpen}
        onClose={() => setIsSheetOpen(false)}
        title={t('home.search.label')}
        closeLabel={t('common.close')}
        footer={mode === 'search' ? submitButton : undefined}
      >
        {panel('stacked')}
      </Modal>
    </div>
  );
}
