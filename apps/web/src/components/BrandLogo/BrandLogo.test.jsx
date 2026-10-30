import { describe, test, expect } from 'vitest';
import { render } from '@testing-library/react';
import BrandLogo from './BrandLogo.jsx';

describe('BrandLogo (apps/web/src/components)', () => {
  // HOME-018: the header loads display-size copies (1x/2x/3x of 32px),
  // never the 1024px masters.
  test('loads the wordmark and the phone mark at the header size, per screen density', () => {
    const { container } = render(<BrandLogo />);
    const image = container.querySelector('img');
    expect(image).toHaveAttribute('alt', '');
    expect(image).toHaveAttribute(
      'src',
      '/brand/header/desavii-wordmark-32.png',
    );
    expect(image.getAttribute('srcset')).toBe(
      '/brand/header/desavii-wordmark-32.png 1x, /brand/header/desavii-wordmark-64.png 2x, /brand/header/desavii-wordmark-96.png 3x',
    );
    expect(container.querySelector('source').getAttribute('srcset')).toMatch(
      /desavii-mark-32\.png 1x, .*desavii-mark-96\.png 3x$/,
    );
  });
});
