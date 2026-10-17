import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import QuickFilters, { PRICE_SECTION } from './QuickFilters.jsx';
import hy from '../../../../../public/locales/hy/common.json';

// The test harness's i18n instance defaults to Armenian (tests/setup.js).
// jsdom applies the phone-first base styles, where the Tablet+ popover
// row is display:none — its controls are queried with `hidden: true`.
const T = hy.search.filters;
const NO_FILTERS = { destination: '', sort: 'newest', dynamicFilters: {} };
const CAR_GROUPS = [
  {
    code: 'VEHICLE',
    definitions: [
      {
        code: 'transmission',
        param: 'attr_transmission',
        input_type: 'SINGLE_SELECT',
        value_source: 'ATTRIBUTE',
        is_advanced: false,
        options: [{ value: 30, code: 'AUTOMATIC', count: 3 }],
      },
      {
        code: 'doors',
        param: 'attr_doors',
        input_type: 'STEPPER',
        value_source: 'ATTRIBUTE',
        is_advanced: true,
        unit: 'doors',
        min: 2,
        max: 5,
        options: [],
      },
    ],
  },
];
const TRANSMISSION = hy.partner.listingWizard.attributes.transmission;

function renderQuick(filters = NO_FILTERS, overrides = {}) {
  const props = {
    filters,
    filterGroups: CAR_GROUPS,
    isCatalogPending: false,
    onApply: vi.fn(),
    onDynamicChange: vi.fn(),
    onOpenPanel: vi.fn(),
    panelFilterCount: 0,
    ...overrides,
  };
  // eslint-disable-next-line react/jsx-props-no-spreading -- test harness
  render(<QuickFilters {...props} />);
  return { ...props, user: userEvent.setup() };
}

const popoverPill = (name) =>
  screen
    .getAllByRole('button', { name, hidden: true })
    .find((button) => button.getAttribute('aria-haspopup') === 'dialog');
const phonePill = (name) =>
  screen
    .getAllByRole('button', { name })
    .find((button) => !button.hasAttribute('aria-haspopup'));

describe('QuickFilters (apps/web/src/modules/search)', () => {
  test('Price first, then only the catalog quick filters — advanced ones stay in the panel', () => {
    renderQuick();
    expect(phonePill(T.quick.price)).toBeInTheDocument();
    expect(phonePill(TRANSMISSION)).toBeInTheDocument();
    expect(
      screen.queryByRole('button', {
        name: hy.partner.listingWizard.attributes.doors,
        hidden: true,
      }),
    ).not.toBeInTheDocument();
  });

  test('a phone pill opens the panel at its own section', async () => {
    const { onOpenPanel, user } = renderQuick();
    await user.click(phonePill(T.quick.price));
    expect(onOpenPanel).toHaveBeenLastCalledWith(PRICE_SECTION);
    await user.click(phonePill(TRANSMISSION));
    expect(onOpenPanel).toHaveBeenLastCalledWith('VEHICLE');
  });

  test('a popover pill Clear clears just that filter, at once', async () => {
    const { onDynamicChange, user } = renderQuick({
      ...NO_FILTERS,
      dynamicFilters: { attr_transmission: '30' },
    });
    await user.click(popoverPill(new RegExp(TRANSMISSION)));
    await user.click(
      screen.getByRole('button', { name: T.quick.clear, hidden: true }),
    );
    expect(onDynamicChange).toHaveBeenCalledWith({ attr_transmission: '' });
  });

  test('the price popover applies typed amounts when it closes, as one change', async () => {
    const { onApply, user } = renderQuick();
    await user.click(popoverPill(T.quick.price));
    await user.type(
      screen.getByLabelText(T.price.minLabel, { selector: 'input' }),
      '5000',
    );
    await user.click(
      screen.getByRole('button', { name: T.quick.done, hidden: true }),
    );
    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply).toHaveBeenCalledWith({
      priceMin: 5000,
      priceMax: undefined,
    });
  });

  test('"All filters" names how many filters the panel holds', () => {
    renderQuick(NO_FILTERS, { panelFilterCount: 3 });
    expect(
      screen.getByRole('button', {
        name: T.quick.allFiltersActive.replace('{{count}}', '3'),
      }),
    ).toBeInTheDocument();
  });

  test('while the category catalog loads, the row is busy and shows no stale pills', () => {
    renderQuick(NO_FILTERS, { filterGroups: [], isCatalogPending: true });
    expect(screen.getByRole('group', { name: T.quick.label })).toHaveAttribute(
      'aria-busy',
      'true',
    );
    expect(
      screen.queryByRole('button', { name: TRANSMISSION, hidden: true }),
    ).not.toBeInTheDocument();
  });
});
