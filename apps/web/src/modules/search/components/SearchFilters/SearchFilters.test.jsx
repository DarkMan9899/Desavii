import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SearchFilters from './SearchFilters.jsx';
import { useSearchFilterDefinitionsQuery } from '../../queries/useSearchFilterDefinitionsQuery.js';
import { useParseSearchQueryMutation } from '../../../ai/mutations/useParseSearchQueryMutation.js';
import hy from '../../../../../public/locales/hy/common.json';

vi.mock('../../queries/useSearchFilterDefinitionsQuery.js', () => ({
  useSearchFilterDefinitionsQuery: vi.fn(),
  default: vi.fn(),
}));
vi.mock('../../../ai/mutations/useParseSearchQueryMutation.js', () => ({
  useParseSearchQueryMutation: vi.fn(),
  default: vi.fn(),
}));

// The test harness's i18n instance defaults to Armenian (tests/setup.js).
const T = hy.search.filters;

const CATEGORIES = [
  { id: 1, slug: 'hotels', name: 'Hotels' },
  { id: 6, slug: 'tours', name: 'Tours' },
];
const DESTINATIONS = [{ id: 1, name: 'Yerevan', listing_count: 20 }];
const NO_FILTERS = { destination: '', sort: 'newest', dynamicFilters: {} };

function renderPanel(filters = NO_FILTERS) {
  const onApply = vi.fn();
  const onAiApply = vi.fn();
  render(
    <SearchFilters
      filters={filters}
      categories={CATEGORIES}
      destinations={DESTINATIONS}
      onApply={onApply}
      onAiApply={onAiApply}
    />,
  );
  return { onApply, onAiApply, user: userEvent.setup() };
}

describe('SearchFilters (apps/web/src/modules/search)', () => {
  beforeEach(() => {
    useSearchFilterDefinitionsQuery.mockReturnValue({ data: [] });
    useParseSearchQueryMutation.mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
      isError: false,
      error: null,
    });
  });

  // jsdom applies the phone-first base styles (no media queries), where
  // the inline form is hidden in favour of the summary — hence `hidden`.
  test('the inline form is a labelled search landmark', () => {
    renderPanel();
    expect(
      screen.getByRole('search', { name: T.sections.search, hidden: true }),
    ).toBeInTheDocument();
  });

  test('the phone summary reads back the applied search and opens the editor', async () => {
    const { user } = renderPanel({
      ...NO_FILTERS,
      categoryId: 6,
      cityId: 1,
      dateFrom: '2026-11-05',
      dateTo: '2026-11-05',
      guests: 3,
    });
    const summary = screen.getByRole('button', {
      name: new RegExp(`^${T.editSearchSummary.replace('{{summary}}', '')}`),
    });
    expect(summary).toHaveTextContent('Yerevan · Tours');
    expect(summary).toHaveTextContent('3 ճանապարհորդ');

    await user.click(summary);
    expect(
      screen.getByRole('dialog', { name: T.drawerTitle }),
    ).toBeInTheDocument();
  });

  test('with nothing applied the summary says it searches everything', () => {
    renderPanel();
    expect(
      screen.getByRole('button', {
        name: new RegExp(`^${T.editSearchSummary.replace('{{summary}}', '')}`),
      }),
    ).toHaveTextContent(T.summaryEverything);
  });

  test('the Filters badge counts only what lives in the drawer (price, category filters)', () => {
    renderPanel({
      ...NO_FILTERS,
      categoryId: 1,
      priceMin: 1000,
      priceMax: 9000,
      dynamicFilters: { attr_star_rating: '4' },
    });
    expect(
      screen.getByRole('button', {
        name: T.filtersButtonActive.replace('{{count}}', '2'),
      }),
    ).toBeInTheDocument();
  });

  test('AI search stays collapsed until asked for, and says whether it is open', async () => {
    const { user } = renderPanel();
    const toggle = screen.getByRole('button', {
      name: hy.search.aiSearch.toggle,
    });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(
      screen.queryByRole('form', { name: hy.search.aiSearch.ariaLabel }),
    ).not.toBeInTheDocument();

    await user.click(toggle);
    expect(
      screen.getByRole('button', { name: hy.search.aiSearch.hide }),
    ).toHaveAttribute('aria-expanded', 'true');
    expect(
      screen.getByRole('form', { name: hy.search.aiSearch.ariaLabel }),
    ).toBeInTheDocument();
  });

  test('a drawer apply goes through the same onApply as the inline form', async () => {
    const { onApply, user } = renderPanel();
    await user.click(screen.getByRole('button', { name: T.filtersButton }));
    const drawer = screen.getByRole('dialog', { name: T.drawerTitle });
    await user.type(within(drawer).getByLabelText(T.price.maxLabel), '15000');
    await user.click(within(drawer).getByRole('button', { name: T.apply }));
    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({ priceMax: 15000 }),
    );
  });
});
