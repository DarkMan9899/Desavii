import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ContactPageContent from './ContactPageContent.jsx';
import { getCmsPage } from '../../../../api/cms.js';
import { submitContactInquiry } from '../../../../api/contact.js';

vi.mock('../../../../api/cms.js', () => ({ getCmsPage: vi.fn() }));
vi.mock('../../../../api/contact.js', () => ({
  submitContactInquiry: vi.fn(),
}));

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/hy/contact']}>
        <Routes>
          <Route path="/:locale/contact" element={<ContactPageContent />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

async function fillValidForm(user) {
  await user.type(screen.getByLabelText(/Ձեր անունը/), 'Անի');
  await user.type(screen.getByLabelText(/Էլ. փոստի հասցե/), 'ani@example.test');
  await user.type(screen.getByLabelText(/Թեմա/), 'Իմ հարցը');
  await user.type(screen.getByLabelText(/Հաղորդագրություն/), 'Բարև ձեզ');
}

describe('ContactPageContent (apps/web/src/modules/cms)', () => {
  beforeEach(() => {
    getCmsPage.mockReset();
    getCmsPage.mockRejectedValue(new Error('Not Found'));
    submitContactInquiry.mockReset();
  });

  test('renders the page heading and support email — no fabricated phone number', () => {
    renderPage();
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    expect(screen.getByText('support@desavii.com')).toBeInTheDocument();
    expect(screen.queryByText('+374 10 000 000')).not.toBeInTheDocument();
    expect(screen.queryByText(/^\+374/)).not.toBeInTheDocument();
  });

  test('renders the CMS-authored title once the page is published', async () => {
    getCmsPage.mockResolvedValue({
      success: true,
      data: { title: 'CMS Contact Title', content: 'CMS Contact Lead' },
    });
    renderPage();
    await waitFor(() =>
      expect(
        screen.getByRole('heading', { level: 1, name: 'CMS Contact Title' }),
      ).toBeInTheDocument(),
    );
    expect(screen.getByText('CMS Contact Lead')).toBeInTheDocument();
  });

  test('renders a contact form with every required field labeled (Sprint G)', () => {
    renderPage();
    expect(screen.getByLabelText(/Ձեր անունը/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Էլ. փոստի հասցե/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Թեմա/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Հաղորդագրություն/)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Ուղարկել' }),
    ).toBeInTheDocument();
  });

  test('shows validation errors and never submits when required fields are empty', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('button', { name: 'Ուղարկել' }));
    expect(
      await screen.findByText('Խնդրում ենք նշել ձեր անունը։'),
    ).toBeInTheDocument();
    expect(submitContactInquiry).not.toHaveBeenCalled();
  });

  test('submits the form and shows a success confirmation with the reply-to email', async () => {
    submitContactInquiry.mockResolvedValue({
      success: true,
      data: { id: 42 },
    });
    const user = userEvent.setup();
    renderPage();

    await fillValidForm(user);
    await user.click(screen.getByRole('button', { name: 'Ուղարկել' }));

    expect(
      await screen.findByText('Հաղորդագրությունն ուղարկված է'),
    ).toBeInTheDocument();
    expect(screen.getByText(/ani@example\.test/)).toBeInTheDocument();
    expect(submitContactInquiry.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        name: 'Անի',
        email: 'ani@example.test',
        subject: 'Իմ հարցը',
        message: 'Բարև ձեզ',
        inquiryType: 'GENERAL',
      }),
    );
  });

  test('on a server error, shows an error alert and keeps the typed values', async () => {
    submitContactInquiry.mockRejectedValue(new Error('Network error'));
    const user = userEvent.setup();
    renderPage();

    await fillValidForm(user);
    await user.click(screen.getByRole('button', { name: 'Ուղարկել' }));

    expect(await screen.findByText('Ինչ-որ բան սխալ գնաց')).toBeInTheDocument();
    expect(screen.getByLabelText(/Ձեր անունը/)).toHaveValue('Անի');
    expect(screen.getByLabelText(/Հաղորդագրություն/)).toHaveValue('Բարև ձեզ');
  });
});
