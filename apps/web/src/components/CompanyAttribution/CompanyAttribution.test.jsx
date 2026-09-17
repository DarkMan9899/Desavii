import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import CompanyAttribution from './CompanyAttribution.jsx';

const COMPANY = {
  slug: 'yerevan-boutique-hospitality',
  display_name: 'Yerevan Boutique Hospitality',
  logo_url: null,
  is_verified: true,
};

function renderWithRouter(ui) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe('CompanyAttribution (apps/web/src/components)', () => {
  test('renders nothing when company is null', () => {
    const { container } = renderWithRouter(
      <CompanyAttribution company={null} locale="en" />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  test('renders nothing when company is undefined', () => {
    const { container } = renderWithRouter(<CompanyAttribution locale="en" />);
    expect(container).toBeEmptyDOMElement();
  });

  test('renders the real company name and a locale-preserving link to its public profile', () => {
    renderWithRouter(<CompanyAttribution company={COMPANY} locale="hy" />);
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute(
      'href',
      '/hy/companies/yerevan-boutique-hospitality',
    );
    expect(link).toHaveTextContent('Yerevan Boutique Hospitality');
  });

  test('never drops the locale (en)', () => {
    renderWithRouter(<CompanyAttribution company={COMPANY} locale="en" />);
    expect(screen.getByRole('link')).toHaveAttribute(
      'href',
      '/en/companies/yerevan-boutique-hospitality',
    );
  });

  test('never drops the locale (ru)', () => {
    renderWithRouter(<CompanyAttribution company={COMPANY} locale="ru" />);
    expect(screen.getByRole('link')).toHaveAttribute(
      'href',
      '/ru/companies/yerevan-boutique-hospitality',
    );
  });

  test('shows a verified indicator only when is_verified is true', () => {
    const { rerender } = renderWithRouter(
      <CompanyAttribution company={COMPANY} locale="en" />,
    );
    expect(document.querySelector('svg')).toBeInTheDocument();

    rerender(
      <MemoryRouter>
        <CompanyAttribution
          company={{ ...COMPANY, is_verified: false }}
          locale="en"
        />
      </MemoryRouter>,
    );
    expect(document.querySelector('svg')).not.toBeInTheDocument();
  });

  test('renders the real logo image when logo_url is present', () => {
    renderWithRouter(
      <CompanyAttribution
        company={{ ...COMPANY, logo_url: 'https://cdn.example.com/logo.png' }}
        locale="en"
      />,
    );
    const img = document.querySelector('img');
    expect(img).toHaveAttribute('src', 'https://cdn.example.com/logo.png');
  });

  test('falls back to initials (never a fake photo) when logo_url is absent', () => {
    renderWithRouter(<CompanyAttribution company={COMPANY} locale="en" />);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByText('YB')).toBeInTheDocument();
  });

  test('the link is keyboard reachable and its accessible name matches its visible text', () => {
    renderWithRouter(<CompanyAttribution company={COMPANY} locale="en" />);
    const link = screen.getByRole('link', {
      name: /Yerevan Boutique Hospitality/,
    });
    expect(link.tagName).toBe('A');
  });

  test('never renders private company fields, even if present on the object', () => {
    renderWithRouter(
      <CompanyAttribution
        company={{
          ...COMPANY,
          owner_user_id: 42,
          legal_name: 'Private Legal Name LLC',
          email: 'private@example.com',
        }}
        locale="en"
      />,
    );
    expect(screen.queryByText(/Private Legal Name/)).not.toBeInTheDocument();
    expect(screen.queryByText(/private@example.com/)).not.toBeInTheDocument();
    expect(screen.queryByText(/42/)).not.toBeInTheDocument();
  });
});
