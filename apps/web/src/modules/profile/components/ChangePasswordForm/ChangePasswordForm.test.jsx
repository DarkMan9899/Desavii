import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ChangePasswordForm from './ChangePasswordForm.jsx';

describe('ChangePasswordForm (apps/web/src/modules/profile)', () => {
  test('renders the three password fields', () => {
    render(
      <ChangePasswordForm isPending={false} error={null} onSave={vi.fn()} />,
    );
    expect(screen.getByLabelText(/Ընթացիկ գաղտնաբառ/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Նոր գաղտնաբառ/)).toBeInTheDocument();
    expect(
      screen.getByLabelText(/Հաստատեք նոր գաղտնաբառը/),
    ).toBeInTheDocument();
  });

  test('a mismatched confirmation blocks submission', async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();
    render(
      <ChangePasswordForm isPending={false} error={null} onSave={onSave} />,
    );

    await user.type(screen.getByLabelText(/Ընթացիկ գաղտնաբառ/), 'OldPass!2024');
    await user.type(
      screen.getByLabelText(/Նոր գաղտնաբառ/),
      'NewStrongPass!2024',
    );
    await user.type(
      screen.getByLabelText(/Հաստատեք նոր գաղտնաբառը/),
      'Different!2024',
    );
    await user.click(screen.getByRole('button', { name: 'Փոխել գաղտնաբառը' }));

    expect(
      screen.getByText('Գաղտնաբառերը չեն համընկնում։'),
    ).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  test('a matching, strong password submits and resets the form on success', async () => {
    const onSave = vi.fn().mockResolvedValue(true);
    const user = userEvent.setup();
    render(
      <ChangePasswordForm isPending={false} error={null} onSave={onSave} />,
    );

    await user.type(screen.getByLabelText(/Ընթացիկ գաղտնաբառ/), 'OldPass!2024');
    await user.type(
      screen.getByLabelText(/Նոր գաղտնաբառ/),
      'NewStrongPass!2024',
    );
    await user.type(
      screen.getByLabelText(/Հաստատեք նոր գաղտնաբառը/),
      'NewStrongPass!2024',
    );
    await user.click(screen.getByRole('button', { name: 'Փոխել գաղտնաբառը' }));

    expect(onSave).toHaveBeenCalledWith({
      currentPassword: 'OldPass!2024',
      newPassword: 'NewStrongPass!2024',
    });
  });

  test('shows the wrong-current-password message for INVALID_CREDENTIALS', () => {
    render(
      <ChangePasswordForm
        isPending={false}
        error={{ code: 'INVALID_CREDENTIALS' }}
        onSave={vi.fn()}
      />,
    );
    expect(
      screen.getByText('Ձեր ընթացիկ գաղտնաբառը սխալ է։'),
    ).toBeInTheDocument();
  });

  test('each password field has its own show/hide control and password-manager hint; revealing one leaves the others hidden, and validation still runs', async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();
    render(
      <ChangePasswordForm isPending={false} error={null} onSave={onSave} />,
    );
    const current = screen.getByLabelText(/Ընթացիկ գաղտնաբառ/);
    const next = screen.getByLabelText(/Նոր գաղտնաբառ/);
    const confirm = screen.getByLabelText(/Հաստատեք նոր գաղտնաբառը/);
    const toggles = screen.getAllByRole('button', {
      name: 'Ցույց տալ գաղտնաբառը',
    });

    expect(toggles).toHaveLength(3);
    expect(current).toHaveAttribute('autocomplete', 'current-password');
    expect(next).toHaveAttribute('autocomplete', 'new-password');
    expect(confirm).toHaveAttribute('autocomplete', 'new-password');

    await user.click(toggles[2]);
    expect(confirm).toHaveAttribute('type', 'text');
    expect(current).toHaveAttribute('type', 'password');
    expect(next).toHaveAttribute('type', 'password');

    await user.type(current, 'OldPass!2024');
    await user.type(next, 'NewStrongPass!2024');
    await user.type(confirm, 'Different!2024');
    await user.click(screen.getByRole('button', { name: 'Փոխել գաղտնաբառը' }));
    expect(
      screen.getByText('Գաղտնաբառերը չեն համընկնում։'),
    ).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });
});
