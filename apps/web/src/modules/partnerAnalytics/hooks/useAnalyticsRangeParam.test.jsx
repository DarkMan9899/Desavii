import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { useAnalyticsRangeParam } from './useAnalyticsRangeParam.js';

function Harness() {
  const [range, setRange] = useAnalyticsRangeParam();
  const location = useLocation();
  return (
    <div>
      <p data-testid="range">{range}</p>
      <p data-testid="search">{location.search}</p>
      <button type="button" onClick={() => setRange(7)}>
        {7}
      </button>
      <button type="button" onClick={() => setRange(90)}>
        {90}
      </button>
    </div>
  );
}

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/analytics" element={<Harness />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('useAnalyticsRangeParam (apps/web/src/modules/partnerAnalytics) — brief §10/§46', () => {
  test('defaults to 30 when the URL has no ?range', () => {
    renderAt('/analytics');
    expect(screen.getByTestId('range')).toHaveTextContent('30');
  });

  test('reads a valid ?range from the URL', () => {
    renderAt('/analytics?range=7');
    expect(screen.getByTestId('range')).toHaveTextContent('7');
  });

  test('falls back safely to 30 for an invalid ?range value, without rewriting the URL', () => {
    renderAt('/analytics?range=14');
    expect(screen.getByTestId('range')).toHaveTextContent('30');
    expect(screen.getByTestId('search')).toHaveTextContent('range=14');
  });

  test('setRange writes the new value to the URL so refresh/back navigation stays stable', async () => {
    const user = userEvent.setup();
    renderAt('/analytics?range=30');
    await user.click(screen.getByRole('button', { name: '90' }));

    expect(screen.getByTestId('range')).toHaveTextContent('90');
    expect(screen.getByTestId('search')).toHaveTextContent('range=90');
  });
});
