import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ListingPartnerSection from './ListingPartnerSection.jsx';

const COMPANY = {
  slug: 'ararat-stays',
  display_name: 'Ararat Stays',
  logo_url: null,
  is_verified: true,
};

function renderSection(company = COMPANY) {
  return render(
    <MemoryRouter>
      <ListingPartnerSection
        company={company}
        locale="hy"
        sectionId="partner"
      />
    </MemoryRouter>,
  );
}

// The test harness's i18n is Armenian (tests/setup.js).
describe('ListingPartnerSection', () => {
  test('links to the company public profile under its own heading', () => {
    renderSection();
    expect(
      screen.getByRole('heading', { name: 'Ընկերության մասին' }),
    ).toHaveAttribute('id', 'partner');
    expect(screen.getByRole('link')).toHaveAttribute(
      'href',
      '/hy/companies/ararat-stays',
    );
  });

  test('a verified company is announced as verified, not only drawn', () => {
    renderSection();
    expect(screen.getByText('Ստուգված ընկերություն')).toBeInTheDocument();
  });

  test('an unverified company never claims to be verified', () => {
    renderSection({ ...COMPANY, is_verified: false });
    expect(screen.queryByText('Ստուգված ընկերություն')).not.toBeInTheDocument();
  });
});
