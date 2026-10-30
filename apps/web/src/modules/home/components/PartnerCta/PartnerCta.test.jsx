import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import PartnerCta from './PartnerCta.jsx';

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
  test('renders a labeled section with its heading', () => {
    renderCta();
    expect(screen.getByRole('region')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2 })).toBeInTheDocument();
  });

  // Home rebuild: navigation is a link (openable in a new tab, announced
  // as a link) — no longer a button that navigates on click.
  test('the invitation is a link to the public partner onboarding page', () => {
    renderCta();
    expect(
      screen.getByRole('link', { name: 'Դառնալ գործընկեր' }),
    ).toHaveAttribute('href', '/en/become-a-partner');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
