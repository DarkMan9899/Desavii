import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import MarkdownContent from './MarkdownContent.jsx';

describe('MarkdownContent (Sprint H — XSS boundary, spec §42)', () => {
  test('renders real Markdown formatting (headings, bold, links, lists)', () => {
    render(
      <MarkdownContent>
        {
          '# A Guide\n\nSome **bold** text.\n\n- One\n- Two\n\n[Desavii](https://desavii.com)'
        }
      </MarkdownContent>,
    );
    expect(
      screen.getByRole('heading', { level: 1, name: 'A Guide' }),
    ).toBeInTheDocument();
    expect(screen.getByText('bold').tagName).toBe('STRONG');
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByRole('link', { name: 'Desavii' })).toHaveAttribute(
      'href',
      'https://desavii.com',
    );
  });

  test('never executes a raw <script> tag typed into the body — it renders as inert text, not a DOM script element', () => {
    render(
      <MarkdownContent>
        {
          '# Hello\n\n<script>window.xssTriggered = true;</script>\n\nSafe paragraph.'
        }
      </MarkdownContent>,
    );
    expect(
      document.querySelector('script[data-testid], script:not([src])'),
    ).toBeNull();
    expect(window.xssTriggered).toBeUndefined();
    expect(screen.getByText('Safe paragraph.')).toBeInTheDocument();
  });

  test('strips a javascript: URL from a Markdown link — never rendered as a clickable href', () => {
    render(<MarkdownContent>[Click me](javascript:alert(1))</MarkdownContent>);
    const link = screen.queryByRole('link', { name: 'Click me' });
    if (link) {
      expect(link.getAttribute('href')).not.toMatch(/^javascript:/i);
    }
  });

  test('never renders an inline event-handler attribute typed as raw HTML', () => {
    const { container } = render(
      <MarkdownContent>
        {'<img src="x" onerror="window.xssTriggered = true" alt="test" />'}
      </MarkdownContent>,
    );
    expect(container.querySelector('img[onerror]')).toBeNull();
    expect(window.xssTriggered).toBeUndefined();
  });
});
