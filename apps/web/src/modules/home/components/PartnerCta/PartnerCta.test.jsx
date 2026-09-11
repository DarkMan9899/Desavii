import { describe, test, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import PartnerCta from './PartnerCta.jsx';

// See SearchWidget.test.jsx for why `useNavigate` is mocked via
// `vi.mock`/`vi.hoisted` rather than `vi.spyOn`.
const { navigateMock } = vi.hoisted(() => ({ navigateMock: vi.fn() }));

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, useNavigate: () => navigateMock };
});

function renderCta() {
  return render(
    <MemoryRouter initialEntries={['/en']}>
      <Routes>
        <Route path="/:locale" element={<PartnerCta />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('PartnerCta (apps/web/src/modules/home)', () => {
  beforeEach(() => {
    navigateMock.mockClear();
  });

  test('renders a labeled section with a call-to-action button', () => {
    renderCta();
    expect(screen.getByRole('region')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2 })).toBeInTheDocument();
    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  test('navigates to the public partner onboarding entry point on click', async () => {
    const user = userEvent.setup();

    renderCta();
    await user.click(screen.getByRole('button'));

    expect(navigateMock).toHaveBeenCalledWith('/en/become-a-partner');
  });
});
