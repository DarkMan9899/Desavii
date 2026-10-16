import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ActiveFilters from './ActiveFilters.jsx';
import hy from '../../../../../public/locales/hy/common.json';

// The test harness's i18n instance defaults to Armenian (tests/setup.js).
const T = hy.search.filters;
const CHIPS = [
  { key: 'categoryId', label: 'Hotels', patch: { categoryId: undefined } },
  {
    key: 'attr_star_rating',
    label: 'Stars: 4',
    dynamicKeys: ['attr_star_rating'],
  },
];

describe('ActiveFilters (apps/web/src/modules/search)', () => {
  test('renders nothing while no filter is applied', () => {
    const { container } = render(
      <ActiveFilters chips={[]} onRemoveChip={vi.fn()} onClearAll={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  test('each chip is a labelled remove button for exactly that filter', async () => {
    const onRemoveChip = vi.fn();
    const user = userEvent.setup();
    render(
      <ActiveFilters
        chips={CHIPS}
        onRemoveChip={onRemoveChip}
        onClearAll={vi.fn()}
      />,
    );
    expect(
      screen.getByRole('group', { name: T.activeFilters }),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole('button', {
        name: T.removeFilter.replace('{{label}}', 'Stars: 4'),
      }),
    );
    expect(onRemoveChip).toHaveBeenCalledWith(CHIPS[1]);
  });

  test('"Clear filters" clears them all', async () => {
    const onClearAll = vi.fn();
    const user = userEvent.setup();
    render(
      <ActiveFilters
        chips={CHIPS}
        onRemoveChip={vi.fn()}
        onClearAll={onClearAll}
      />,
    );
    await user.click(screen.getByRole('button', { name: T.clearAll }));
    expect(onClearAll).toHaveBeenCalledTimes(1);
  });
});
