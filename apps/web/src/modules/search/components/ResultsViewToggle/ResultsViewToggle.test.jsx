import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ResultsViewToggle from './ResultsViewToggle.jsx';
import hy from '../../../../../public/locales/hy/common.json';

// The test harness's i18n instance defaults to Armenian (tests/setup.js).
const T = hy.search.view;

describe('ResultsViewToggle (apps/web/src/modules/search)', () => {
  test('a labelled group whose pressed button is the current view', () => {
    render(<ResultsViewToggle view="map" onChange={vi.fn()} />);
    expect(screen.getByRole('group', { name: T.label })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: T.map })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: T.list })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  test('choosing a view reports it, by keyboard too', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ResultsViewToggle view="list" onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: T.map }));
    expect(onChange).toHaveBeenLastCalledWith('map');

    screen.getByRole('button', { name: T.list }).focus();
    await user.keyboard('{Enter}');
    expect(onChange).toHaveBeenLastCalledWith('list');
  });
});
