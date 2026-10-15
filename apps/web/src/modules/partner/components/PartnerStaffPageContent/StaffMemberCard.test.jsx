import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import StaffMemberCard from './StaffMemberCard.jsx';

const ASSIGNABLE_ROLES = [
  'MANAGER',
  'BOOKING_MANAGER',
  'EDITOR',
  'ANALYTICS_VIEWER',
];

function staff(overrides) {
  return {
    id: 2,
    first_name: 'Ed',
    last_name: 'Itor',
    email: 'editor@example.com',
    role: 'EDITOR',
    role_name: 'Editor',
    ...overrides,
  };
}

describe('StaffMemberCard (apps/web/src/modules/partner)', () => {
  test('a manageable, non-owner member shows a role Select and a remove action', async () => {
    const onRoleChange = vi.fn();
    const onRemove = vi.fn();
    const user = userEvent.setup();
    render(
      <StaffMemberCard
        staff={staff()}
        assignableRoles={ASSIGNABLE_ROLES}
        canManage
        onRoleChange={onRoleChange}
        onRemove={onRemove}
      />,
    );

    expect(screen.getByText('editor@example.com')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Դեր' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Հեռացնել' }));
    expect(onRemove).toHaveBeenCalledWith(staff());
  });

  test('the OWNER row never exposes a role Select or a remove action, regardless of canManage', () => {
    render(
      <StaffMemberCard
        staff={staff({ role: 'OWNER', role_name: 'Owner' })}
        assignableRoles={ASSIGNABLE_ROLES}
        canManage
        onRoleChange={vi.fn()}
        onRemove={vi.fn()}
      />,
    );

    expect(
      screen.queryByRole('combobox', { name: 'Դեր' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Հեռացնել' }),
    ).not.toBeInTheDocument();
  });

  test('a read-only viewer (canManage=false) sees a translated role badge, never the raw role_name', () => {
    render(
      <StaffMemberCard
        staff={staff()}
        assignableRoles={ASSIGNABLE_ROLES}
        canManage={false}
        onRoleChange={vi.fn()}
        onRemove={vi.fn()}
      />,
    );

    expect(
      screen.queryByRole('combobox', { name: 'Դեր' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Editor')).not.toBeInTheDocument();
    expect(screen.getByText('Խմբագիր')).toBeInTheDocument();
  });

  test('an unmapped role code falls back to the raw role_name rather than rendering nothing', () => {
    render(
      <StaffMemberCard
        staff={staff({ role: 'FUTURE_ROLE', role_name: 'Future Role' })}
        assignableRoles={ASSIGNABLE_ROLES}
        canManage={false}
        onRoleChange={vi.fn()}
        onRemove={vi.fn()}
      />,
    );

    expect(screen.getByText('Future Role')).toBeInTheDocument();
  });
});
