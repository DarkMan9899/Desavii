import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SearchToolbar from './SearchToolbar.jsx';
import hy from '../../../../../public/locales/hy/common.json';

// The test harness's i18n instance defaults to Armenian (tests/setup.js).
const T = hy.search;

function renderToolbar(props = {}) {
  const onSortChange = vi.fn();
  render(
    <SearchToolbar
      total={45}
      isLoading={false}
      isUpdating={false}
      sort="newest"
      hasKeyword={false}
      onSortChange={onSortChange}
      // eslint-disable-next-line react/jsx-props-no-spreading -- per-test overrides
      {...props}
    />,
  );
  return { onSortChange, user: userEvent.setup() };
}

describe('SearchToolbar (apps/web/src/modules/search)', () => {
  test('announces the whole filtered total in a polite status region', () => {
    renderToolbar();
    expect(screen.getByRole('status')).toHaveTextContent('45 արդյունք');
  });

  test.each([
    [{ isLoading: true }, T.results.loading],
    [{ isUpdating: true }, T.results.updating],
  ])('says what is happening while a search runs (%o)', (props, text) => {
    renderToolbar(props);
    expect(screen.getByRole('status')).toHaveTextContent(text);
  });

  test('offers every sort, price and guest rating included, and "Best match" only with a keyword', async () => {
    const { onSortChange, user } = renderToolbar();
    await user.click(
      screen.getByRole('combobox', { name: T.filters.sortLabel }),
    );
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([
      T.filters.sort.newest,
      T.filters.sort.oldest,
      T.filters.sort.alphabetical,
      T.filters.sort.price_asc,
      T.filters.sort.price_desc,
      T.filters.sort.rating_desc,
    ]);
    await user.click(
      screen.getByRole('option', { name: T.filters.sort.price_asc }),
    );
    expect(onSortChange).toHaveBeenCalledWith('price_asc');
  });

  test('"Best match" appears once there is a keyword', async () => {
    const { user } = renderToolbar({ hasKeyword: true });
    await user.click(
      screen.getByRole('combobox', { name: T.filters.sortLabel }),
    );
    expect(
      screen.getByRole('option', { name: T.filters.sort.relevance }),
    ).toBeInTheDocument();
  });
});
