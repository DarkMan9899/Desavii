import { describe, test, expect, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import ToastProvider from '../../../../providers/ToastProvider.jsx';
import AdminManagersPageContent from './AdminManagersPageContent.jsx';
import {
  useManagersQuery,
  usePromoteToManagerMutation,
} from '../../../managers/index.js';

vi.mock('../../../managers/index.js', () => ({
  useManagersQuery: vi.fn(),
  usePromoteToManagerMutation: vi.fn(),
}));

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/hy/admin/managers']}>
      <ToastProvider>
        <Routes>
          <Route
            path="/:locale/admin/managers"
            element={<AdminManagersPageContent />}
          />
        </Routes>
      </ToastProvider>
    </MemoryRouter>,
  );
}

const MANAGERS = [
  {
    user_id: 5,
    first_name: 'Ana',
    last_name: 'Manager',
    email: 'ana@example.test',
    assigned_company_count: 2,
  },
];

describe('AdminManagersPageContent (Sprint F — Manager Workspace)', () => {
  test('shows the empty state when there are no managers yet', () => {
    useManagersQuery.mockReturnValue({
      data: [],
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    });
    usePromoteToManagerMutation.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    });
    renderPage();
    expect(screen.getByText('Դեռ մենեջերներ չկան')).toBeInTheDocument();
  });

  test('renders each manager row with name, email, and assigned-company count', () => {
    useManagersQuery.mockReturnValue({
      data: MANAGERS,
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    });
    usePromoteToManagerMutation.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    });
    renderPage();
    expect(screen.getByText('Ana Manager')).toBeInTheDocument();
    expect(screen.getByText('ana@example.test')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  test('promoting a user calls the mutation with the entered user id', async () => {
    const mutateAsync = vi.fn().mockResolvedValue({});
    useManagersQuery.mockReturnValue({
      data: [],
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    });
    usePromoteToManagerMutation.mockReturnValue({
      mutateAsync,
      isPending: false,
    });
    renderPage();

    fireEvent.change(screen.getByLabelText('Օգտատիրոջ ID'), {
      target: { value: '42' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Բարձրացնել' }));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith(42));
  });
});
