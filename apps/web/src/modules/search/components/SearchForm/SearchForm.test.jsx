import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SearchForm from './SearchForm.jsx';
import { SEARCH_INPUT_DEBOUNCE_MS } from '../../hooks/useDebouncedCommit.js';
import hy from '../../../../../public/locales/hy/common.json';

// The test harness's i18n instance defaults to Armenian (tests/setup.js).
const T = hy.search.filters;

const CATEGORIES = [
  { id: 1, slug: 'hotels', name: 'Hotels' },
  { id: 5, slug: 'restaurants', name: 'Restaurants' },
  { id: 6, slug: 'tours', name: 'Tours' },
  { id: 7, slug: 'car-rentals', name: 'Car Rentals' },
];
const DESTINATIONS = [
  { id: 1, name: 'Yerevan', listing_count: 20 },
  { id: 9, name: 'Ghost Town', listing_count: 0 },
];
const NO_FILTERS = { destination: '', sort: 'newest', dynamicFilters: {} };

function renderForm(filters = NO_FILTERS) {
  const onApply = vi.fn();
  render(
    <SearchForm
      filters={filters}
      categories={CATEGORIES}
      destinations={DESTINATIONS}
      onApply={onApply}
    />,
  );
  return { onApply, user: userEvent.setup() };
}

async function pickDays(user, triggerName, days) {
  await user.click(screen.getByRole('button', { name: triggerName }));
  const calendar = screen.getByRole('grid');
  // Sequential: the second click only completes a range after the first.
  await days.reduce(
    (previous, day) =>
      previous.then(() =>
        user.click(
          within(calendar)
            .getAllByRole('gridcell')
            .find((cell) => cell.textContent === String(day)),
        ),
      ),
    Promise.resolve(),
  );
}

describe('SearchForm (apps/web/src/modules/search)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-16T10:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  test('a stay range applies the moment it is complete — never half a range', async () => {
    const { onApply, user } = renderForm({ ...NO_FILTERS, categoryId: 1 });
    await pickDays(user, new RegExp(T.dates.stay.label), [20]);
    expect(onApply).not.toHaveBeenCalled();
    await user.click(
      within(screen.getByRole('grid'))
        .getAllByRole('gridcell')
        .find((cell) => cell.textContent === '23'),
    );
    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply).toHaveBeenCalledWith({
      dateFrom: '2026-10-20',
      dateTo: '2026-10-23',
    });
  });

  test('a check-in without a check-out is not applied; Search says what is missing', async () => {
    const { onApply, user } = renderForm({ ...NO_FILTERS, categoryId: 1 });
    await pickDays(user, new RegExp(T.dates.stay.label), [20]);
    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: T.submit }));
    expect(onApply).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(
      T.dates.stay.endRequired,
    );
  });

  test('choices from a list apply at once, each as its own change', async () => {
    const { onApply, user } = renderForm({ ...NO_FILTERS, categoryId: 1 });
    await user.click(screen.getByRole('combobox', { name: T.party.guests }));
    await user.click(
      screen.getByRole('option', { name: '2 հյուր', exact: true }),
    );
    expect(onApply).toHaveBeenLastCalledWith({ guests: 2 });
    await user.click(screen.getByRole('combobox', { name: T.categoryLabel }));
    await user.click(screen.getByRole('option', { name: 'Car Rentals' }));
    expect(onApply).toHaveBeenLastCalledWith({ categoryId: 7 });
    expect(onApply).toHaveBeenCalledTimes(2);
  });

  test('single-day categories apply their one date at once and name the party their own way', async () => {
    const { onApply, user } = renderForm({ ...NO_FILTERS, categoryId: 6 });
    expect(
      screen.getByRole('combobox', { name: T.party.travelers }),
    ).toBeInTheDocument();
    await pickDays(user, new RegExp(T.dates.day.label), [25]);
    expect(onApply).toHaveBeenCalledWith({
      dateFrom: '2026-10-25',
      dateTo: '2026-10-25',
    });
  });

  test('typing applies once, after the pause — not once per keystroke', async () => {
    const { onApply, user } = renderForm();
    await user.type(
      screen.getByRole('textbox', { name: T.keywordLabel }),
      'spa',
    );
    expect(onApply).not.toHaveBeenCalled();
    await waitFor(() => expect(onApply).toHaveBeenCalledTimes(1));
    expect(onApply).toHaveBeenCalledWith({ destination: 'spa' });
  });

  test('Search applies pending typing at once, and the pause then applies nothing more', async () => {
    const { onApply, user } = renderForm();
    await user.type(
      screen.getByRole('textbox', { name: T.keywordLabel }),
      'spa',
    );
    await user.click(screen.getByRole('button', { name: T.submit }));
    expect(onApply).toHaveBeenCalledWith({ destination: 'spa' });
    await new Promise((resolve) => {
      setTimeout(resolve, SEARCH_INPUT_DEBOUNCE_MS * 2);
    });
    expect(onApply).toHaveBeenCalledTimes(1);
  });

  test('Search with nothing pending sends nothing (no duplicate request)', async () => {
    const { onApply, user } = renderForm({ ...NO_FILTERS, destination: 'spa' });
    await user.click(screen.getByRole('button', { name: T.submit }));
    expect(onApply).not.toHaveBeenCalled();
  });

  test.each([
    ['car-rentals', 7, T.dates.rental.label],
    ['restaurants', 5, T.dates.day.label],
  ])('%s offer no party-size field', (_slug, categoryId, dateLabel) => {
    renderForm({ ...NO_FILTERS, categoryId });
    expect(
      screen.getByRole('button', { name: new RegExp(dateLabel) }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('combobox', { name: T.party.guests }),
    ).not.toBeInTheDocument();
  });

  test('switching category re-shapes the fields to the new category', () => {
    const onApply = vi.fn();
    const { rerender } = render(
      <SearchForm
        filters={{ ...NO_FILTERS, categoryId: 1 }}
        categories={CATEGORIES}
        destinations={DESTINATIONS}
        onApply={onApply}
      />,
    );
    expect(
      screen.getByRole('combobox', { name: T.party.guests }),
    ).toBeInTheDocument();
    rerender(
      <SearchForm
        filters={{ ...NO_FILTERS, categoryId: 7 }}
        categories={CATEGORIES}
        destinations={DESTINATIONS}
        onApply={onApply}
      />,
    );
    expect(
      screen.queryByRole('combobox', { name: T.party.guests }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: new RegExp(T.dates.rental.label) }),
    ).toBeInTheDocument();
  });

  test('destination lists only cities that have listings, by name and count', async () => {
    const { onApply, user } = renderForm();
    await user.click(
      screen.getByRole('combobox', { name: T.destinationLabel }),
    );
    expect(
      screen.getByRole('option', { name: 'Yerevan (20)' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('option', { name: /Ghost Town/ }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole('option', { name: 'Yerevan (20)' }));
    expect(onApply).toHaveBeenCalledWith({ cityId: 1 });
  });

  test('the form starts over from the applied filters when they change elsewhere', () => {
    const onApply = vi.fn();
    const { rerender } = render(
      <SearchForm
        filters={{ ...NO_FILTERS, destination: 'spa' }}
        categories={CATEGORIES}
        destinations={DESTINATIONS}
        onApply={onApply}
      />,
    );
    expect(screen.getByRole('textbox', { name: T.keywordLabel })).toHaveValue(
      'spa',
    );
    rerender(
      <SearchForm
        filters={NO_FILTERS}
        categories={CATEGORIES}
        destinations={DESTINATIONS}
        onApply={onApply}
      />,
    );
    expect(screen.getByRole('textbox', { name: T.keywordLabel })).toHaveValue(
      '',
    );
  });
});
