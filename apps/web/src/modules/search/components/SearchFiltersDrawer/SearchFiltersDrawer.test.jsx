import { describe, test, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SearchFiltersDrawer from './SearchFiltersDrawer.jsx';
import { SEARCH_INPUT_DEBOUNCE_MS } from '../../hooks/useDebouncedCommit.js';
import hy from '../../../../../public/locales/hy/common.json';

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
const RATING_GROUP = {
  code: 'RATING',
  definitions: [
    {
      code: 'star_rating',
      param: 'attr_star_rating',
      input_type: 'SINGLE_SELECT',
      value_source: 'ATTRIBUTE',
      options: [
        { value: 4, code: '4', count: 2 },
        { value: 5, code: '5', count: 1 },
      ],
    },
  ],
};
const BOOKING_GROUP = {
  code: 'BOOKING',
  definitions: [
    {
      code: 'pets_allowed',
      param: 'policy_pets_allowed',
      input_type: 'TOGGLE',
      value_source: 'POLICY',
      listing_count: 1,
      options: [],
    },
  ],
};

const pause = () =>
  new Promise((resolve) => {
    setTimeout(resolve, SEARCH_INPUT_DEBOUNCE_MS * 2);
  });

function drawerProps(overrides) {
  return {
    isOpen: true,
    onClose: vi.fn(),
    filters: APPLIED,
    categories: CATEGORIES,
    destinations: DESTINATIONS,
    filterGroups: [RATING_GROUP, BOOKING_GROUP],
    isCatalogPending: false,
    total: 7,
    onApply: vi.fn(),
    onDynamicChange: vi.fn(),
    onClearAll: vi.fn(),
    ...overrides,
  };
}

function renderDrawer(overrides = {}) {
  const props = drawerProps(overrides);
  // eslint-disable-next-line react/jsx-props-no-spreading -- test harness
  const utils = render(<SearchFiltersDrawer {...props} />);
  return { ...utils, props, user: userEvent.setup() };
}

describe('SearchFiltersDrawer (apps/web/src/modules/search)', () => {
  test('names the category it filters, then price and the category catalog groups', () => {
    renderDrawer();
    expect(screen.getByText('Hotels', { selector: 'p' })).toBeInTheDocument();
    expect(screen.getByLabelText(T.price.minLabel)).toBeInTheDocument();
    expect(
      screen.getByText(hy.search.dynamicFilters.groups.RATING),
    ).toBeInTheDocument();
    expect(
      screen.getByText(hy.search.dynamicFilters.groups.BOOKING),
    ).toBeInTheDocument();
  });

  test('a choice applies at once and the panel stays open on the live count', async () => {
    const { props, user } = renderDrawer();
    await user.click(screen.getByRole('button', { name: /5 աստղ/ }));
    expect(props.onDynamicChange).toHaveBeenCalledWith({
      attr_star_rating: '5',
    });
    await user.click(screen.getByRole('switch', { name: /Կենդանիներ/ }));
    expect(props.onDynamicChange).toHaveBeenLastCalledWith({
      policy_pets_allowed: 'true',
    });
    expect(props.onClose).not.toHaveBeenCalled();
    expect(
      screen.getByRole('button', {
        name: T.showResults_other.replace('{{count}}', '7'),
      }),
    ).toBeInTheDocument();
  });

  test('a typed price applies once typing pauses, as whole AMD amounts', async () => {
    const { props, user } = renderDrawer();
    await user.type(screen.getByLabelText(T.price.minLabel), '10 000');
    expect(props.onApply).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(props.onApply).toHaveBeenCalledWith({
        priceMin: 10000,
        priceMax: undefined,
      }),
    );
    expect(props.onApply).toHaveBeenCalledTimes(1);
  });

  test('"Show N results" applies pending typing at once, then closes', async () => {
    const { props, user } = renderDrawer();
    await user.type(screen.getByLabelText(T.price.maxLabel), '20000');
    await user.click(screen.getByRole('button', { name: /Ցույց տալ 7/ }));
    expect(props.onApply).toHaveBeenCalledTimes(1);
    expect(props.onApply).toHaveBeenCalledWith({
      priceMin: undefined,
      priceMax: 20000,
    });
    expect(props.onClose).toHaveBeenCalledTimes(1);
    await pause();
    expect(props.onApply).toHaveBeenCalledTimes(1);
  });

  test('"Show N results" with nothing pending just closes — no repeat request', async () => {
    const { props, user } = renderDrawer();
    await user.click(screen.getByRole('button', { name: /Ցույց տալ 7/ }));
    expect(props.onApply).not.toHaveBeenCalled();
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  test('a minimum above the maximum is explained and never applied', async () => {
    const { props, user } = renderDrawer();
    await user.type(screen.getByLabelText(T.price.minLabel), '9000');
    await user.type(screen.getByLabelText(T.price.maxLabel), '1000');
    expect(screen.getByRole('alert')).toHaveTextContent(T.price.invalidRange);
    expect(screen.getByLabelText(T.price.minLabel)).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    await pause();
    expect(props.onApply).not.toHaveBeenCalledWith(
      expect.objectContaining({ priceMax: 1000 }),
    );
  });

  test('closing discards unapplied typing — a reopened panel shows what is applied', async () => {
    const { props, rerender, user } = renderDrawer();
    await user.type(screen.getByLabelText(T.price.minLabel), '7000');
    await user.click(screen.getByRole('button', { name: hy.common.close }));
    expect(props.onClose).toHaveBeenCalledTimes(1);
    // eslint-disable-next-line react/jsx-props-no-spreading -- test harness
    rerender(<SearchFiltersDrawer {...props} />);
    expect(screen.getByLabelText(T.price.minLabel)).toHaveValue('');
    await pause();
    expect(props.onApply).not.toHaveBeenCalled();
  });

  test('a section Clear clears only that section, at once', async () => {
    const { props, user } = renderDrawer({
      filters: {
        ...APPLIED,
        priceMin: 5000,
        dynamicFilters: { attr_star_rating: '5', policy_pets_allowed: 'true' },
      },
    });
    const sectionClears = screen.getAllByRole('button', {
      name: T.quick.clear,
      exact: true,
    });
    expect(sectionClears).toHaveLength(3);
    await user.click(sectionClears[0]);
    expect(props.onApply).toHaveBeenCalledWith({
      priceMin: undefined,
      priceMax: undefined,
    });
    await user.click(sectionClears[1]);
    expect(props.onDynamicChange).toHaveBeenCalledWith({
      attr_star_rating: '',
    });
  });

  test('"Clear filters" clears everything in one change', async () => {
    const { props, user } = renderDrawer();
    await user.click(screen.getByRole('button', { name: T.clearAll }));
    expect(props.onClearAll).toHaveBeenCalledTimes(1);
  });

  test('while a new category catalog loads, its groups are not guessed', () => {
    renderDrawer({ filterGroups: [], isCatalogPending: true });
    expect(screen.getByLabelText(T.price.minLabel)).toBeInTheDocument();
    expect(
      screen.queryByText(hy.search.dynamicFilters.groups.RATING),
    ).not.toBeInTheDocument();
  });
});
