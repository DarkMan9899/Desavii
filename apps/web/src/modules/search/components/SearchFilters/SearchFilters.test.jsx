import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SearchFilters from './SearchFilters.jsx';
import { useParseSearchQueryMutation } from '../../../ai/mutations/useParseSearchQueryMutation.js';
import hy from '../../../../../public/locales/hy/common.json';

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
// Hotels' catalog: star rating is a quick filter, bedrooms only in the panel.
const HOTEL_GROUPS = [
  {
    code: 'RATING',
    definitions: [
      {
        code: 'star_rating',
        param: 'attr_star_rating',
        input_type: 'SINGLE_SELECT',
        value_source: 'ATTRIBUTE',
        is_advanced: false,
        options: [{ value: 5, code: '5', count: 2 }],
      },
    ],
  },
  {
    code: 'ROOMS',
    definitions: [
      {
        code: 'bedrooms',
        param: 'attr_bedrooms',
        input_type: 'STEPPER',
        value_source: 'ATTRIBUTE',
        is_advanced: true,
        unit: 'rooms',
        min: 0,
        max: 10,
        options: [],
      },
    ],
  },
];
const STAR_LABEL = hy.partner.listingWizard.attributes.star_rating;

function renderPanel(filters = NO_FILTERS, overrides = {}) {
  const props = {
    filters,
    categories: CATEGORIES,
    destinations: DESTINATIONS,
    filterGroups: [],
    isCatalogPending: false,
    total: 4,
    isSearching: false,
    onApply: vi.fn(),
    onDynamicChange: vi.fn(),
    onClearAll: vi.fn(),
    onAiApply: vi.fn(),
    ...overrides,
  };
  // eslint-disable-next-line react/jsx-props-no-spreading -- test harness
  render(<SearchFilters {...props} />);
  return { ...props, user: userEvent.setup() };
}

describe('SearchFilters (apps/web/src/modules/search)', () => {
  beforeEach(() => {
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

  test('"All filters" counts only what lives in the panel (price, category filters)', () => {
    renderPanel({
      ...NO_FILTERS,
      categoryId: 1,
      priceMin: 1000,
      priceMax: 9000,
      dynamicFilters: { attr_star_rating: '4' },
    });
    // One per layout: the scrolling phone row, and the popover row from
    // Tablet (display:none under jsdom's phone-first styles, hence hidden).
    expect(
      screen.getAllByRole('button', {
        name: T.quick.allFiltersActive.replace('{{count}}', '2'),
        hidden: true,
      }),
    ).toHaveLength(2);
  });

  test('quick filters are the category catalog non-advanced filters, applied live', async () => {
    const { onDynamicChange, user } = renderPanel(
      { ...NO_FILTERS, categoryId: 1 },
      { filterGroups: HOTEL_GROUPS },
    );
    const quick = screen.getByRole('group', { name: T.quick.label });
    const pill = within(quick)
      .getAllByRole('button', { name: STAR_LABEL, hidden: true })
      .find((button) => button.getAttribute('aria-haspopup') === 'dialog');
    expect(
      within(quick).queryByRole('button', {
        name: hy.partner.listingWizard.attributes.bedrooms,
        hidden: true,
      }),
    ).not.toBeInTheDocument();

    await user.click(pill);
    await user.click(
      screen.getByRole('button', { name: /5 աստղ/, hidden: true }),
    );
    expect(onDynamicChange).toHaveBeenCalledWith({ attr_star_rating: '5' });
  });

  test('an applied quick filter shows its value on the pill', () => {
    renderPanel(
      {
        ...NO_FILTERS,
        categoryId: 1,
        dynamicFilters: { attr_star_rating: '5' },
      },
      { filterGroups: HOTEL_GROUPS },
    );
    expect(
      screen.getAllByRole('button', {
        name: `${STAR_LABEL}: 5 աստղ`,
        hidden: true,
      }),
    ).toHaveLength(2);
  });

  test('a phone pill opens the full panel', async () => {
    const { user } = renderPanel(
      { ...NO_FILTERS, categoryId: 1 },
      { filterGroups: HOTEL_GROUPS },
    );
    const phonePill = screen
      .getAllByRole('button', { name: STAR_LABEL })
      .find((button) => !button.hasAttribute('aria-haspopup'));
    await user.click(phonePill);
    expect(
      screen.getByRole('dialog', { name: T.drawerTitle }),
    ).toBeInTheDocument();
  });

  test('while a new category catalog loads, no previous-category pill is shown', () => {
    renderPanel({ ...NO_FILTERS, categoryId: 6 }, { isCatalogPending: true });
    const quick = screen.getByRole('group', { name: T.quick.label });
    expect(quick).toHaveAttribute('aria-busy', 'true');
    expect(
      within(quick).queryByRole('button', { name: STAR_LABEL, hidden: true }),
    ).not.toBeInTheDocument();
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

  test('the panel applies through the same onApply as the search bar', async () => {
    const { onApply, user } = renderPanel();
    await user.click(
      screen.getAllByRole('button', { name: T.quick.allFilters })[0],
    );
    const drawer = screen.getByRole('dialog', { name: T.drawerTitle });
    await user.type(within(drawer).getByLabelText(T.price.maxLabel), '15000');
    await user.click(
      within(drawer).getByRole('button', {
        name: T.showResults_other.replace('{{count}}', '4'),
      }),
    );
    expect(onApply).toHaveBeenCalledWith({
      priceMin: undefined,
      priceMax: 15000,
    });
  });
});
