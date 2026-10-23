import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import FeatureGrid from './FeatureGrid.jsx';

const items = (prefix, count) =>
  Array.from({ length: count }, (_, i) => ({ label: `${prefix} ${i + 1}` }));

const LONG_GROUPS = [
  { title: 'Internet', items: items('Net', 6) },
  { title: 'Outdoor', items: items('Out', 6) },
];

describe('FeatureGrid', () => {
  test('a short list shows every group and item, with no toggle', () => {
    render(
      <FeatureGrid
        groups={[{ title: 'Internet', items: items('Net', 3) }]}
        showAllLabel="Show all"
        showLessLabel="Show less"
      />,
    );
    expect(
      screen.getByRole('heading', { name: 'Internet' }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  test('a long list collapses to the first ten items behind a toggle', async () => {
    const user = userEvent.setup();
    render(
      <FeatureGrid
        groups={LONG_GROUPS}
        showAllLabel="Show all"
        showLessLabel="Show less"
      />,
    );
    expect(screen.getAllByRole('listitem')).toHaveLength(10);
    await user.click(screen.getByRole('button', { name: 'Show all' }));
    expect(screen.getAllByRole('listitem')).toHaveLength(12);
    expect(
      screen.getByRole('button', { name: 'Show less' }),
    ).toBeInTheDocument();
  });

  test('collapsible={false} shows everything with no toggle (the full list in a dialog)', () => {
    render(<FeatureGrid groups={LONG_GROUPS} collapsible={false} />);
    expect(screen.getAllByRole('listitem')).toHaveLength(12);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
