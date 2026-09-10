import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import HeaderSearch from './HeaderSearch.jsx';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

function renderHeaderSearch(initialEntry = '/hy') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/:locale" element={<HeaderSearch />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('HeaderSearch (apps/web/src/components, Sprint G)', () => {
  beforeEach(() => {
    mockNavigate.mockReset();
  });

  test('has an accessible, localized trigger button', () => {
    renderHeaderSearch();
    expect(screen.getByRole('button', { name: 'Որոնում' })).toBeInTheDocument();
  });

  test('opens the search popover on click and reveals the destination field', async () => {
    const user = userEvent.setup();
    renderHeaderSearch();
    await user.click(screen.getByRole('button', { name: 'Որոնում' }));
    expect(screen.getByLabelText('Ուղղություն')).toBeInTheDocument();
  });

  test('submitting a keyword navigates to /:locale/search?destination=<keyword>', async () => {
    const user = userEvent.setup();
    renderHeaderSearch();
    await user.click(screen.getByRole('button', { name: 'Որոնում' }));
    await user.type(screen.getByLabelText('Ուղղություն'), 'Yerevan');
    await user.click(screen.getByRole('button', { name: 'Որոնել' }));
    expect(mockNavigate).toHaveBeenCalledWith('/hy/search?destination=Yerevan');
  });

  test('an empty submit navigates to the plain search page (no malformed query)', async () => {
    const user = userEvent.setup();
    renderHeaderSearch();
    await user.click(screen.getByRole('button', { name: 'Որոնում' }));
    await user.click(screen.getByRole('button', { name: 'Որոնել' }));
    expect(mockNavigate).toHaveBeenCalledWith('/hy/search');
  });
});
