import { describe, test, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import PhotoCredits from './PhotoCredits.jsx';
import { HOME_IMAGE_CREDITS } from '../../constants/homeImages.js';

describe('PhotoCredits (apps/web/src/modules/home)', () => {
  test('credits every Home photo with its author, licence and source', () => {
    render(<PhotoCredits />);
    const items = screen.getAllByRole('listitem', { hidden: true });
    expect(items).toHaveLength(HOME_IMAGE_CREDITS.length);

    const [first] = HOME_IMAGE_CREDITS;
    expect(items[0]).toHaveTextContent(first.author);
    const [licence, source] = within(items[0]).getAllByRole('link', {
      hidden: true,
    });
    expect(licence).toHaveAttribute('href', first.licence.url);
    expect(licence).toHaveAttribute('rel', 'noopener noreferrer license');
    expect(source).toHaveAttribute('href', first.source);
  });

  test('stays folded behind a native disclosure', () => {
    const { container } = render(<PhotoCredits />);
    const details = container.querySelector('details');
    expect(details).not.toHaveAttribute('open');
    expect(details.querySelector('summary')).not.toBeEmptyDOMElement();
  });
});
