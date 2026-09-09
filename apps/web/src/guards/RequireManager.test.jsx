import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import RequireManager from './RequireManager.jsx';
import { useAuth } from '../contexts/AuthContext.jsx';

vi.mock('../contexts/AuthContext.jsx', () => ({
  useAuth: vi.fn(),
}));

function renderGuarded() {
  return render(
    <MemoryRouter initialEntries={['/hy/manager']}>
      <Routes>
        <Route
          path="/:locale/manager"
          element={
            <RequireManager>
              <div>Manager content</div>
            </RequireManager>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe('RequireManager (apps/web/src/guards)', () => {
  test('renders children when the user holds the MANAGER role', () => {
    useAuth.mockReturnValue({ roles: ['MANAGER'] });
    renderGuarded();
    expect(screen.getByText('Manager content')).toBeInTheDocument();
  });

  test('renders ForbiddenPage when the user does not hold the MANAGER role', () => {
    useAuth.mockReturnValue({ roles: ['CUSTOMER'] });
    renderGuarded();
    expect(screen.queryByText('Manager content')).not.toBeInTheDocument();
  });

  test('renders ForbiddenPage for a partner/vendor who is not also a Manager', () => {
    useAuth.mockReturnValue({ roles: [] });
    renderGuarded();
    expect(screen.queryByText('Manager content')).not.toBeInTheDocument();
  });
});
