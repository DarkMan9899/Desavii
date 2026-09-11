import { describe, test, expect, beforeEach, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import SearchWidget from './SearchWidget.jsx';
import {
  useCategoriesQuery,
  useSuggestionsQuery,
} from '../../../search/index.js';

// `vi.hoisted` so `navigateMock` exists before `vi.mock`'s factory runs
// (vitest hoists `vi.mock` calls above regular imports/consts) —
// `vi.spyOn(reactRouterDom, 'useNavigate')` fails here with "Cannot
// redefine property" since the real module's export isn't configurable
// under this build.
const { navigateMock } = vi.hoisted(() => ({ navigateMock: vi.fn() }));

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, useNavigate: () => navigateMock };
});

vi.mock('../../../search/index.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    useCategoriesQuery: vi.fn(),
    useSuggestionsQuery: vi.fn(),
  };
});

function renderSearchWidget() {
  return render(
    <MemoryRouter initialEntries={['/en']}>
      <Routes>
        <Route path="/:locale" element={<SearchWidget />} />
      </Routes>
    </MemoryRouter>,
  );
}

// Redesign phase (2026) — the widget now renders as a compact "command
// dock" trigger first; every field lives in a panel that only mounts
// once the trigger is activated (see SearchWidget.jsx's `isExpanded`
// state). The trigger's accessible name is the untouched destination
// placeholder copy (its only non-decorative text content), so this is
// the one new step every test below needs before it can reach a field.
async function expandDock(user) {
  await user.click(screen.getByRole('button', { name: 'Ո՞ւր եք գնում' }));
}

describe('SearchWidget (apps/web/src/modules/home)', () => {
  beforeEach(() => {
    navigateMock.mockClear();
    useCategoriesQuery.mockReturnValue({ data: [], isPending: false });
    useSuggestionsQuery.mockReturnValue({ data: [], isPending: false });
  });

  test('renders a compact trigger, collapsed by default', () => {
    renderSearchWidget();
    expect(
      screen.getByRole('button', { name: 'Ո՞ւր եք գնում' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  test('expanding the trigger reveals the destination field and submit control', async () => {
    const user = userEvent.setup();
    renderSearchWidget();
    await expandDock(user);

    expect(
      screen.getByRole('combobox', { name: /Ուղղություն/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Որոնել/ })).toBeInTheDocument();
  });

  test('submits, navigating to the search route with the destination preserved as a URL param', async () => {
    const user = userEvent.setup();

    renderSearchWidget();
    await expandDock(user);
    await user.type(
      screen.getByRole('combobox', { name: /Ուղղություն/ }),
      'Yerevan',
    );
    await user.click(screen.getByRole('button', { name: /Որոնել/ }));

    expect(navigateMock).toHaveBeenCalledWith('/en/search?destination=Yerevan');
  });

  test('submits with no query string when every field is left empty', async () => {
    const user = userEvent.setup();

    renderSearchWidget();
    await expandDock(user);
    await user.click(screen.getByRole('button', { name: /Որոնել/ }));

    expect(navigateMock).toHaveBeenCalledWith('/en/search');
  });

  test('renders real categories from the API as select options', async () => {
    const user = userEvent.setup();
    useCategoriesQuery.mockReturnValue({
      data: [{ id: 1, slug: 'hotels', name: 'Hotels', listing_count: 4 }],
      isPending: false,
    });
    renderSearchWidget();
    await expandDock(user);
    expect(screen.getAllByTestId('select-trigger').length).toBeGreaterThan(0);
  });

  // Same rule as SearchFilters (the /search page's own filter bar): Car
  // Rentals has no "guests" concept, only pickup/return + seats.
  test('hides the Guests field once Car Rentals is selected, and clears an already-picked value', async () => {
    const user = userEvent.setup();
    useCategoriesQuery.mockReturnValue({
      data: [
        { id: 1, slug: 'hotels', name: 'Hotels', listing_count: 4 },
        { id: 2, slug: 'car-rentals', name: 'Car Rentals', listing_count: 5 },
      ],
      isPending: false,
    });
    renderSearchWidget();
    await expandDock(user);

    const selects = screen.getAllByTestId('select-trigger');
    // Field order: Guests, then Category (see SearchWidget.jsx render order).
    await user.click(selects[0]);
    await user.click(screen.getByText('2 հյուր'));
    expect(screen.getAllByTestId('select-trigger')).toHaveLength(2);

    await user.click(selects[1]);
    await user.click(screen.getByText('Car Rentals'));

    expect(screen.getAllByTestId('select-trigger')).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: /Որոնել/ }));
    const [url] = navigateMock.mock.calls[0];
    expect(url).not.toContain('guests');
  });

  // P1.1 (Master Roadmap): these dates used to be plain free-text
  // Input fields under the stale checkIn/checkOut param names that
  // modules/search/schemas/searchParams.js never read — a selected
  // date range silently never reached search results. Now a real
  // DatePicker, emitting the dateFrom/dateTo names search actually
  // reads.
  test('(P1.1) selecting a date range and submitting navigates with real dateFrom/dateTo params', async () => {
    const user = userEvent.setup();
    renderSearchWidget();
    await expandDock(user);

    await user.click(screen.getByLabelText('Ամսաթվեր'));
    const grid = screen.getByRole('grid');
    const enabledCells = within(grid)
      .getAllByRole('gridcell')
      .filter((cell) => !cell.disabled);
    await user.click(enabledCells[0]);
    await user.click(enabledCells[enabledCells.length - 1]);

    await user.click(screen.getByRole('button', { name: /Որոնել/ }));

    expect(navigateMock).toHaveBeenCalledTimes(1);
    const [url] = navigateMock.mock.calls[0];
    expect(url).toMatch(
      /^\/en\/search\?dateFrom=\d{4}-\d{2}-\d{2}&dateTo=\d{4}-\d{2}-\d{2}$/,
    );
  });

  test('the collapse control returns to the compact trigger', async () => {
    const user = userEvent.setup();
    renderSearchWidget();
    await expandDock(user);

    await user.click(screen.getByRole('button', { name: 'Փակել' }));

    expect(
      screen.getByRole('button', { name: 'Ո՞ւր եք գնում' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });
});
