/**
 * SearchWidget — the homepage's search entry point. Submitting navigates
 * to the existing `/:locale/search` route with the chosen values
 * preserved as URL search params (FRONTEND_ARCHITECTURE.md's "search
 * filters live in URL search params, must be shareable/bookmarkable"
 * rule) — it does not implement search itself; `SearchPageContent` is
 * still a placeholder this phase, per the brief's explicit scope limit.
 *
 * Redesign phase (2026, fundamental rebuild) — visually a compact
 * "command dock" that expands into the full field set on interaction,
 * not an always-open horizontal bar (the previous "Booking.com-style"
 * long white form). `isExpanded` is pure UI state local to this
 * component; every field's own value/handler below is byte-for-byte the
 * same `useState`/`handleSubmit` this widget already had — only the
 * shell around them changed. The fields stay mounted only while
 * expanded (not permanently, then hidden via CSS) since their values
 * already live in this component's own state, not in the child
 * components themselves, so nothing is lost by unmounting them.
 *
 * Destination and Category are both backed by real data: destination
 * suggestions via `DestinationAutocomplete` (`GET /search/suggestions`),
 * categories via the same `useCategoriesQuery` (`GET /search/categories`)
 * the Categories section uses, so this dropdown never drifts out of sync
 * with what's actually browsable.
 */

import { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { MapPin, Search, Sparkles, X } from 'lucide-react';
import { Select, DatePicker } from '@desavii/ui/components/form-controls';
import { Button } from '@desavii/ui/components/primitives';
import { Inline } from '@desavii/ui/components/layout';
import { useCategoriesQuery } from '../../../search/index.js';
import { shouldShowGuestsFilter } from '../../../search/utils/categoryFilterCapabilities.js';
import DestinationAutocomplete from '../DestinationAutocomplete/DestinationAutocomplete.jsx';
import styles from './SearchWidget.module.scss';

const GUEST_COUNTS = [1, 2, 3, 4, 5, 6, 7, 8];

export default function SearchWidget({ className = undefined }) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { locale } = useParams();
  const { data: categories = [] } = useCategoriesQuery({ locale });

  const [isExpanded, setIsExpanded] = useState(false);
  const [destination, setDestination] = useState('');
  const [dateRange, setDateRange] = useState({ start: null, end: null });
  const [guests, setGuests] = useState('');
  const [categoryId, setCategoryId] = useState('');

  const categoryOptions = [
    { value: '', label: t('home.search.categoryAll') },
    ...categories.map((cat) => ({ value: String(cat.id), label: cat.name })),
  ];
  const selectedCategory = categories.find(
    (cat) => String(cat.id) === categoryId,
  );
  const showGuests = shouldShowGuestsFilter(selectedCategory?.slug);

  // Same rule as SearchFilters (the /search page's own filter bar): a
  // category that doesn't support Guests (Car Rentals today) must not
  // leave a stale value sitting in state once selected, or submitting
  // would silently carry an irrelevant guests param into the URL.
  useEffect(() => {
    if (!showGuests && guests) setGuests('');
  }, [showGuests, guests]);

  const guestOptions = GUEST_COUNTS.map((count) => ({
    value: String(count),
    label: t('home.search.guestsCount', { count }),
  }));
  const today = new Date().toISOString().slice(0, 10);

  function handleSubmit(event) {
    event.preventDefault();
    const params = new URLSearchParams();
    if (destination) params.set('destination', destination);
    if (dateRange.start && dateRange.end) {
      params.set('dateFrom', dateRange.start);
      params.set('dateTo', dateRange.end);
    }
    if (guests) params.set('guests', guests);
    if (categoryId) params.set('categoryId', categoryId);

    const query = params.toString();
    navigate(`/${locale}/search${query ? `?${query}` : ''}`);
  }

  const triggerLabel = destination || t('home.search.destinationPlaceholder');

  return (
    <div className={[styles.dock, className].filter(Boolean).join(' ')}>
      {!isExpanded && (
        <button
          type="button"
          className={styles.trigger}
          aria-haspopup="true"
          aria-expanded={false}
          onClick={() => setIsExpanded(true)}
        >
          <span className={styles.triggerIcon} aria-hidden="true">
            <Search size={18} />
          </span>
          <span className={styles.triggerLabel}>{triggerLabel}</span>
          <span className={styles.triggerSparkle} aria-hidden="true">
            <Sparkles size={16} />
          </span>
          <span className={styles.triggerDial} aria-hidden="true">
            <MapPin size={16} />
          </span>
        </button>
      )}

      {isExpanded && (
        <form className={styles.panel} onSubmit={handleSubmit}>
          <button
            type="button"
            className={styles.collapseButton}
            aria-label={t('common.close')}
            onClick={() => setIsExpanded(false)}
          >
            <X size={16} aria-hidden="true" />
          </button>
          <Inline gap="0" align="stretch" className={styles.fields}>
            <div className={styles.field}>
              <DestinationAutocomplete
                aria-label={t('home.search.destinationLabel')}
                placeholder={t('home.search.destinationPlaceholder')}
                value={destination}
                onChange={(event) => setDestination(event.target.value)}
                iconLeft={<MapPin size={18} aria-hidden="true" />}
              />
            </div>
            <div className={styles.field}>
              <DatePicker
                mode="range"
                ariaLabel={t('home.search.datesLabel')}
                placeholder={t('home.search.datePlaceholder')}
                value={dateRange}
                onChange={setDateRange}
                minDate={today}
                locale={i18n.language}
                previousMonthLabel={t(
                  'partner.listingWizard.datePicker.previousMonth',
                )}
                nextMonthLabel={t('partner.listingWizard.datePicker.nextMonth')}
              />
            </div>
            {showGuests && (
              <div className={styles.field}>
                <Select
                  ariaLabel={t('home.search.guestsLabel')}
                  placeholder={t('home.search.guestsPlaceholder')}
                  options={guestOptions}
                  value={guests}
                  onChange={setGuests}
                />
              </div>
            )}
            <div className={styles.field}>
              <Select
                ariaLabel={t('home.search.categoryLabel')}
                placeholder={t('home.search.categoryAll')}
                options={categoryOptions}
                value={categoryId}
                onChange={setCategoryId}
              />
            </div>
            <div className={styles.submitWrapper}>
              <Button type="submit" variant="primary" size="lg" fullWidth>
                {t('home.search.submit')}
              </Button>
            </div>
          </Inline>
        </form>
      )}
    </div>
  );
}

SearchWidget.propTypes = {
  className: PropTypes.string,
};
