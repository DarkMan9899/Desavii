import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SearchFilters from './SearchFilters.jsx';
import { useCategoriesQuery } from '../../queries/useCategoriesQuery.js';

vi.mock('../../queries/useCategoriesQuery.js', () => ({
  useCategoriesQuery: vi.fn(),
  default: vi.fn(),
}));

const CATEGORIES = [
  { id: 1, slug: 'hotels', name: 'Hotels', listing_count: 4 },
  { id: 2, slug: 'tours', name: 'Tours', listing_count: 2 },
  { id: 3, slug: 'car-rentals', name: 'Car Rentals', listing_count: 5 },
];

const DEFAULT_FILTERS = {
  destination: '',
  categoryId: undefined,
  sort: 'newest',
};

function renderFilters(overrides = {}) {
  const onUpdateFilters = vi.fn();
  const onClearFilters = vi.fn();
  const filters = { ...DEFAULT_FILTERS, ...overrides.filters };
  const utils = render(
    <SearchFilters
      filters={filters}
      onUpdateFilters={onUpdateFilters}
      onClearFilters={onClearFilters}
      hasActiveFilters={overrides.hasActiveFilters ?? false}
    />,
  );
  const rerenderWithFilters = (nextFilters) =>
    utils.rerender(
      <SearchFilters
        filters={{ ...filters, ...nextFilters }}
        onUpdateFilters={onUpdateFilters}
        onClearFilters={onClearFilters}
        hasActiveFilters={overrides.hasActiveFilters ?? false}
      />,
    );
  return { onUpdateFilters, onClearFilters, rerenderWithFilters };
}

describe('SearchFilters (apps/web/src/modules/search)', () => {
  beforeEach(() => {
    useCategoriesQuery.mockReturnValue({ data: CATEGORIES, isPending: false });
  });

  test('debounces keyword typing before updating filters, using replace history', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { onUpdateFilters } = renderFilters();

    await user.type(screen.getByRole('textbox'), 'yerevan');
    expect(onUpdateFilters).not.toHaveBeenCalled();

    vi.advanceTimersByTime(500);
    expect(onUpdateFilters).toHaveBeenCalledWith(
      { destination: 'yerevan' },
      { replace: true },
    );
    vi.useRealTimers();
  });

  test('selecting a category updates filters with push history (not replace)', async () => {
    const user = userEvent.setup();
    const { onUpdateFilters } = renderFilters();

    await user.click(screen.getAllByTestId('select-trigger')[0]);
    await user.click(screen.getByText('Hotels'));

    expect(onUpdateFilters).toHaveBeenCalledWith(
      { categoryId: 1 },
      { replace: false },
    );
  });

  // The test harness's i18n instance defaults to Armenian (tests/setup.js)
  // — these assert against the real translation content, not English.
  // The option text only exists in the DOM once the Select is opened —
  // its closed trigger only shows the *currently selected* value.
  test('excludes "relevance" from sort options when there is no destination', async () => {
    const user = userEvent.setup();
    renderFilters();
    await user.click(screen.getAllByTestId('select-trigger')[1]);
    expect(screen.queryByText('Լավագույն համընկնում')).not.toBeInTheDocument();
  });

  test('includes "relevance" once a destination is present', async () => {
    const user = userEvent.setup();
    renderFilters({ filters: { destination: 'yerevan' } });
    await user.click(screen.getAllByTestId('select-trigger')[1]);
    expect(screen.getByText('Լավագույն համընկնում')).toBeInTheDocument();
  });

  test('renders a chip per active filter and removes just that one on click', async () => {
    const user = userEvent.setup();
    const { onUpdateFilters } = renderFilters({
      filters: { destination: 'yerevan', categoryId: 1 },
      hasActiveFilters: true,
    });

    // Scoped to the chips group — "Hotels" also appears as the category
    // Select's own currently-selected trigger label.
    const chips = screen.getByRole('group', { name: 'Ակտիվ զտիչներ' });
    expect(within(chips).getByText('yerevan')).toBeInTheDocument();
    expect(within(chips).getByText('Hotels')).toBeInTheDocument();

    await user.click(within(chips).getByText('yerevan').closest('button'));
    expect(onUpdateFilters).toHaveBeenCalledWith(
      { destination: '' },
      { replace: false },
    );
  });

  test('renders a "clear all" action that calls onClearFilters', async () => {
    const user = userEvent.setup();
    const { onClearFilters } = renderFilters({
      filters: { destination: 'yerevan' },
      hasActiveFilters: true,
    });
    await user.click(screen.getByRole('button', { name: 'Մաքրել զտիչները' }));
    expect(onClearFilters).toHaveBeenCalledTimes(1);
  });

  test('renders no chips/clear-all when there are no active filters', () => {
    renderFilters({ hasActiveFilters: false });
    expect(
      screen.queryByRole('button', { name: 'Մաքրել զտիչները' }),
    ).not.toBeInTheDocument();
  });

  // P1.1 (Master Roadmap): dateFrom/dateTo/guests used to be silently
  // dropped by this whole module — these prove they now reach
  // onUpdateFilters with the exact param names GET /search expects.
  test('(P1.1) picking a start date calls onUpdateFilters with real dateFrom/dateTo keys, push history', async () => {
    // The DatePicker reports its selection progressively (once per
    // click) — this harness's `filters` prop is a static mock, not a
    // real URL round-trip, so it can't reflect a completed two-click
    // range back down before the second click the way the live app
    // does (DatePicker's own test suite already covers that mechanic
    // directly). What this proves is the wiring itself: a real
    // selection reaches onUpdateFilters under the exact dateFrom/dateTo
    // keys GET /search expects, as real YYYY-MM-DD strings — not
    // silently dropped, and not under the stale checkIn/checkOut names.
    const user = userEvent.setup();
    const { onUpdateFilters } = renderFilters();

    await user.click(screen.getByLabelText('Ամսաթվեր'));
    const grid = screen.getByRole('grid');
    const enabledCells = within(grid)
      .getAllByRole('gridcell')
      .filter((cell) => !cell.disabled);
    await user.click(enabledCells[0]);

    expect(onUpdateFilters).toHaveBeenCalledWith(
      expect.objectContaining({
        dateFrom: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      }),
      { replace: false },
    );
    const [patch] = onUpdateFilters.mock.calls[0];
    expect(Object.keys(patch).sort()).toEqual(['dateFrom', 'dateTo']);
  });

  test('(P1.1) selecting a guest count calls onUpdateFilters with a numeric guests value, push history', async () => {
    const user = userEvent.setup();
    const { onUpdateFilters } = renderFilters();

    await user.click(screen.getAllByTestId('select-trigger')[2]);
    await user.click(screen.getByText('2 հյուր'));

    expect(onUpdateFilters).toHaveBeenCalledWith(
      { guests: 2 },
      { replace: false },
    );
  });

  test('(P1.1) renders a dates chip and a guests chip, each removable independently', async () => {
    const user = userEvent.setup();
    const { onUpdateFilters } = renderFilters({
      filters: { dateFrom: '2026-08-01', dateTo: '2026-08-05', guests: 3 },
      hasActiveFilters: true,
    });

    const chips = screen.getByRole('group', { name: 'Ակտիվ զտիչներ' });
    expect(
      within(chips).getByText('2026-08-01 – 2026-08-05'),
    ).toBeInTheDocument();
    expect(within(chips).getByText('3 հյուր')).toBeInTheDocument();

    await user.click(
      within(chips).getByText('2026-08-01 – 2026-08-05').closest('button'),
    );
    expect(onUpdateFilters).toHaveBeenCalledWith(
      { dateFrom: undefined, dateTo: undefined },
      { replace: false },
    );

    await user.click(within(chips).getByText('3 հյուր').closest('button'));
    expect(onUpdateFilters).toHaveBeenCalledWith(
      { guests: undefined },
      { replace: false },
    );
  });

  // Car Rentals has no "guests" concept (only pickup/return + seats, owned
  // by the listing's own booking widget) — the global Search filter bar
  // previously showed Guests unconditionally regardless of category.
  test('hides the Guests filter when the Car Rentals category is selected', () => {
    renderFilters({ filters: { categoryId: 3 } });
    expect(screen.queryByLabelText('Հյուրեր')).not.toBeInTheDocument();
    // Only category + sort selects remain (no third, guests, trigger).
    expect(screen.getAllByTestId('select-trigger')).toHaveLength(2);
  });

  test('shows the Guests filter for a Hotels/accommodation category', () => {
    renderFilters({ filters: { categoryId: 1 } });
    expect(screen.getByLabelText('Հյուրեր')).toBeInTheDocument();
  });

  test('shows the Guests filter with no category selected (defaults to visible)', () => {
    renderFilters();
    expect(screen.getByLabelText('Հյուրեր')).toBeInTheDocument();
  });

  test('updates Guests visibility immediately when switching category', () => {
    const { rerenderWithFilters } = renderFilters({
      filters: { categoryId: 1 },
    });
    expect(screen.getByLabelText('Հյուրեր')).toBeInTheDocument();

    rerenderWithFilters({ categoryId: 3 });
    expect(screen.queryByLabelText('Հյուրեր')).not.toBeInTheDocument();

    rerenderWithFilters({ categoryId: 1 });
    expect(screen.getByLabelText('Հյուրեր')).toBeInTheDocument();
  });

  test('strips an already-set guests value on switching to Car Rentals, so it cannot keep constraining results', () => {
    const { onUpdateFilters, rerenderWithFilters } = renderFilters({
      filters: { categoryId: 1, guests: 4 },
    });
    expect(onUpdateFilters).not.toHaveBeenCalled();

    rerenderWithFilters({ categoryId: 3, guests: 4 });

    expect(onUpdateFilters).toHaveBeenCalledWith(
      { guests: undefined },
      { replace: true },
    );
  });
});
