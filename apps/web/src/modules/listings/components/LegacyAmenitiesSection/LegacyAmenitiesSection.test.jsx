import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import i18n from 'i18next';
import LegacyAmenitiesSection from './LegacyAmenitiesSection.jsx';

const LEGACY = [{ value: 9, code: 'Jacuzzi' }];

describe('LegacyAmenitiesSection (Step L6.1)', () => {
  test('renders nothing when there are no legacy amenities', () => {
    const { container } = render(
      <LegacyAmenitiesSection
        legacyAmenities={[]}
        selectedIds={new Set()}
        onRemove={vi.fn()}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  test('a kept amenity is checked and unchecking it asks to remove it', async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn();
    render(
      <LegacyAmenitiesSection
        legacyAmenities={LEGACY}
        selectedIds={new Set([9])}
        onRemove={onRemove}
      />,
    );
    const checkbox = screen.getByLabelText('Jacuzzi');
    expect(checkbox).toBeChecked();
    expect(checkbox).toBeEnabled();

    await user.click(checkbox);
    expect(onRemove).toHaveBeenCalledWith(9);
  });

  test('a removed amenity stays listed, unchecked, disabled, and labelled as removed', () => {
    render(
      <LegacyAmenitiesSection
        legacyAmenities={LEGACY}
        selectedIds={new Set()}
        onRemove={vi.fn()}
      />,
    );
    const checkbox = screen.getByLabelText('Jacuzzi — կհեռացվի պահպանելիս');
    expect(checkbox).not.toBeChecked();
    expect(checkbox).toBeDisabled();
  });

  test.each([
    [
      'en',
      'Previously saved',
      /no longer available for this category/,
      'Jacuzzi — will be removed when you save',
    ],
    [
      'ru',
      'Ранее сохранённые',
      /больше недоступны для этой категории/,
      'Jacuzzi — будет удалено при сохранении',
    ],
    [
      'hy',
      'Նախկինում պահպանված',
      /այլևս հասանելի չեն այս կատեգորիայի համար/,
      'Jacuzzi — կհեռացվի պահպանելիս',
    ],
  ])('is fully translated in %s', async (lng, heading, hint, removed) => {
    await i18n.changeLanguage(lng);
    try {
      const { rerender } = render(
        <LegacyAmenitiesSection
          legacyAmenities={LEGACY}
          selectedIds={new Set([9])}
          onRemove={vi.fn()}
        />,
      );
      expect(
        screen.getByRole('group', { name: heading }),
      ).toHaveAccessibleDescription(hint);
      rerender(
        <LegacyAmenitiesSection
          legacyAmenities={LEGACY}
          selectedIds={new Set()}
          onRemove={vi.fn()}
        />,
      );
      expect(screen.getByLabelText(removed)).toBeDisabled();
    } finally {
      await i18n.changeLanguage('hy');
    }
  });
});
