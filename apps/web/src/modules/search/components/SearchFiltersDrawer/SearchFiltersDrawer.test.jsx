import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SearchFiltersDrawer from './SearchFiltersDrawer.jsx';
import { useSearchFilterDefinitionsQuery } from '../../queries/useSearchFilterDefinitionsQuery.js';
import hy from '../../../../../public/locales/hy/common.json';

vi.mock('../../queries/useSearchFilterDefinitionsQuery.js', () => ({
  useSearchFilterDefinitionsQuery: vi.fn(),
  default: vi.fn(),
}));

// The test harness's i18n instance defaults to Armenian (tests/setup.js).
const T = hy.search.filters;

const CATEGORIES = [{ id: 1, slug: 'hotels', name: 'Hotels' }];
const DESTINATIONS = [{ id: 1, name: 'Yerevan', listing_count: 20 }];
const APPLIED = {
  destination: 'spa',
  categoryId: 1,
  sort: 'newest',
  dynamicFilters: {},
};
const STAR_RATING_GROUP = {
  code: 'RATING',
  definitions: [
    {
      code: 'star_rating',
      input_type: 'SINGLE_SELECT',
      value_source: 'ATTRIBUTE',
      unit: null,
      min: null,
      max: null,
      options: [
        { value: 4, code: '4' },
        { value: 5, code: '5' },
      ],
    },
  ],
};

function renderDrawer(props = {}) {
  const onApply = vi.fn();
  const onClose = vi.fn();
  const utils = render(
    <SearchFiltersDrawer
      isOpen
      onClose={onClose}
      filters={APPLIED}
      categories={CATEGORIES}
      destinations={DESTINATIONS}
      onApply={onApply}
      // eslint-disable-next-line react/jsx-props-no-spreading -- per-test overrides
      {...props}
    />,
  );
  return { ...utils, onApply, onClose, user: userEvent.setup() };
}

describe('SearchFiltersDrawer (apps/web/src/modules/search)', () => {
  beforeEach(() => {
    useSearchFilterDefinitionsQuery.mockReturnValue({
      data: [STAR_RATING_GROUP],
    });
  });

  test('shows price and the drafted category own filters', () => {
    renderDrawer();
    expect(screen.getByLabelText(T.price.minLabel)).toBeInTheDocument();
    expect(
      screen.getByRole('heading', {
        name: hy.search.dynamicFilters.groups.RATING,
      }),
    ).toBeInTheDocument();
    expect(useSearchFilterDefinitionsQuery).toHaveBeenCalledWith(1);
  });

  test('applies the whole draft once, as whole AMD amounts, and closes', async () => {
    const { onApply, onClose, user } = renderDrawer();
    await user.type(screen.getByLabelText(T.price.minLabel), '10 000');
    await user.type(screen.getByLabelText(T.price.maxLabel), '20000');
    await user.click(
      screen.getByRole('button', {
        name: hy.search.dynamicFilters.options['5'],
      }),
    );
    expect(onApply).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: T.apply }));
    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({
        destination: 'spa',
        categoryId: 1,
        priceMin: 10000,
        priceMax: 20000,
        dynamicFilters: { attr_star_rating: '5' },
      }),
    );
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('a minimum above the maximum is explained and not applied', async () => {
    const { onApply, user } = renderDrawer();
    await user.type(screen.getByLabelText(T.price.minLabel), '9000');
    await user.type(screen.getByLabelText(T.price.maxLabel), '1000');
    await user.click(screen.getByRole('button', { name: T.apply }));
    expect(onApply).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(T.price.invalidRange);
    expect(screen.getByLabelText(T.price.minLabel)).toHaveAttribute(
      'aria-invalid',
      'true',
    );
  });

  test('"Clear filters" empties the draft; Show results then applies no filter', async () => {
    const { onApply, user } = renderDrawer({
      filters: { ...APPLIED, priceMax: 5000 },
    });
    await user.click(screen.getByRole('button', { name: T.clearAll }));
    expect(screen.getByLabelText(T.price.maxLabel)).toHaveValue('');
    await user.click(screen.getByRole('button', { name: T.apply }));
    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({
        destination: '',
        categoryId: undefined,
        priceMax: undefined,
        dynamicFilters: {},
      }),
    );
  });

  test('closing without applying discards the draft', async () => {
    const { onApply, onClose, rerender, user } = renderDrawer();
    await user.type(screen.getByLabelText(T.price.minLabel), '7000');
    await user.click(screen.getByRole('button', { name: hy.common.close }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onApply).not.toHaveBeenCalled();

    rerender(
      <SearchFiltersDrawer
        isOpen
        onClose={onClose}
        filters={APPLIED}
        categories={CATEGORIES}
        destinations={DESTINATIONS}
        onApply={onApply}
      />,
    );
    expect(screen.getByLabelText(T.price.minLabel)).toHaveValue('');
  });
});
