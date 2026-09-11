import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import MessagingPageContent from './MessagingPageContent.jsx';

vi.mock('../ConversationList/ConversationList.jsx', () => ({
  default: ({ onSelectConversation }) => (
    <button type="button" onClick={() => onSelectConversation(7)}>
      mock-conversation-list
    </button>
  ),
}));
vi.mock('../ChatWindow/ChatWindow.jsx', () => ({
  default: ({ conversationId }) => <div>mock-chat-window-{conversationId}</div>,
}));

function renderPage(initialPath, props = {}) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route
          path="/:locale/account/messages"
          // eslint-disable-next-line react/jsx-props-no-spreading -- test-only prop passthrough
          element={<MessagingPageContent {...props} />}
        />
        <Route
          path="/:locale/account/messages/:conversationId"
          // eslint-disable-next-line react/jsx-props-no-spreading -- test-only prop passthrough
          element={<MessagingPageContent {...props} />}
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe('MessagingPageContent (apps/web/src/modules/messaging)', () => {
  test('shows a select-a-conversation prompt when no conversation is active', () => {
    renderPage('/hy/account/messages');
    expect(
      screen.getByText('Ընտրեք խոսակցություն՝ կարդալը սկսելու համար'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/mock-chat-window/)).not.toBeInTheDocument();
  });

  test('renders ChatWindow with the conversationId from the URL', () => {
    renderPage('/hy/account/messages/42');
    expect(screen.getByText('mock-chat-window-42')).toBeInTheDocument();
  });

  test('navigates to the conversation URL when a conversation is selected', async () => {
    renderPage('/hy/account/messages');
    // Sprint L — the raw DOM `.click()` this used to call fires outside
    // Testing Library's `act()` wrapping, so the resulting MemoryRouter
    // navigation/re-render landed unwrapped and printed "An update to
    // MemoryRouter inside a test was not wrapped in act(...)" even though
    // production code itself has no bug here. `fireEvent.click` wraps it.
    fireEvent.click(screen.getByText('mock-conversation-list'));
    expect(await screen.findByText('mock-chat-window-7')).toBeInTheDocument();
  });

  test('variant="operational" (Partner Workspace) applies its own container class, not the customer premium one', () => {
    renderPage('/hy/account/messages', { variant: 'operational' });
    const layout = screen
      .getByText('mock-conversation-list')
      .closest('[class*="layout"]');
    expect(layout.className).toMatch(/layout--operational/);
    expect(layout.className).not.toMatch(/layout--premium/);
  });

  test('breadcrumbs (Admin Sprint 7): renders the passed trail, and renders none when omitted (Customer/Partner unaffected)', () => {
    renderPage('/hy/account/messages', {
      breadcrumbs: [
        { label: 'Home', href: '/hy' },
        { label: 'Admin', href: '/hy/admin' },
      ],
    });
    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute(
      'href',
      '/hy',
    );
    expect(screen.getByText('Admin')).toHaveAttribute('aria-current', 'page');
  });

  test('breadcrumbs default to none when omitted', () => {
    renderPage('/hy/account/messages');
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  });
});
