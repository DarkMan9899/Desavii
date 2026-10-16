import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SearchForm from './SearchForm.jsx';
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

  test('a date range completes inside the form and nothing applies until Search', async () => {
    const { onApply, user } = renderForm({ ...NO_FILTERS, categoryId: 1 });
    await pickDays(user, new RegExp(T.dates.stay.label), [20, 23]);
    expect(onApply).not.toHaveBeenCalled();
    expect(
      screen.getByRole('button', { name: new RegExp(T.dates.stay.label) }),
    ).not.toHaveTextContent(T.dates.stay.placeholder);

    await user.click(screen.getByRole('combobox', { name: T.party.guests }));
    await user.click(
      screen.getByRole('option', { name: '2 հյուր', exact: true }),
    );
    await user.click(screen.getByRole('button', { name: T.submit }));

    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply).toHaveBeenCalledWith({
      destination: '',
      cityId: undefined,
      categoryId: 1,
      dateFrom: '2026-10-20',
      dateTo: '2026-10-23',
      guests: 2,
    });
  });

  test('a check-in without a check-out is not applied; the field says what is missing', async () => {
    const { onApply, user } = renderForm({ ...NO_FILTERS, categoryId: 1 });
    await pickDays(user, new RegExp(T.dates.stay.label), [20]);
    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: T.submit }));
    expect(onApply).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(
      T.dates.stay.endRequired,
    );
  });

  test('single-day categories ask for one date and name the party their own way', async () => {
    const { onApply, user } = renderForm({ ...NO_FILTERS, categoryId: 6 });
    expect(
      screen.getByRole('combobox', { name: T.party.travelers }),
    ).toBeInTheDocument();
    await pickDays(user, new RegExp(T.dates.day.label), [25]);
    await user.click(screen.getByRole('button', { name: T.submit }));
    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({ dateFrom: '2026-10-25', dateTo: '2026-10-25' }),
    );
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

  test('switching category in the form re-shapes its fields before anything applies', async () => {
    const { onApply, user } = renderForm({
      ...NO_FILTERS,
      categoryId: 1,
      guests: 2,
    });
    await user.click(screen.getByRole('combobox', { name: T.categoryLabel }));
    await user.click(screen.getByRole('option', { name: 'Car Rentals' }));
    expect(
      screen.queryByRole('combobox', { name: T.party.guests }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: T.submit }));
    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({ categoryId: 7, guests: undefined }),
    );
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
    await user.type(
      screen.getByRole('textbox', { name: T.keywordLabel }),
      ' spa {Enter}',
    );
    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({ cityId: 1, destination: 'spa' }),
    );
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
