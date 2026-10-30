import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import ActionLink from './ActionLink.jsx';

const LABEL = 'View all';

describe('ActionLink (apps/web/src/modules/home)', () => {
  test('is a real link named by its label alone — the arrow is decoration', () => {
    render(
      <MemoryRouter>
        <ActionLink href="/en/search">{LABEL}</ActionLink>
      </MemoryRouter>,
    );
    const link = screen.getByRole('link', { name: LABEL });
    expect(link).toHaveAttribute('href', '/en/search');
    expect(link.querySelector('svg').closest('[aria-hidden="true"]')).not.toBe(
      null,
    );
    // A designed control, never a text arrow character.
    expect(link.textContent).toBe(LABEL);
  });

  test('passes clicks through (Ask Desavii keeps the request before sign-in)', async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <ActionLink href="/en/auth/login" variant="primary" onClick={onClick}>
          {LABEL}
        </ActionLink>
      </MemoryRouter>,
    );
    await user.click(screen.getByRole('link', { name: LABEL }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
