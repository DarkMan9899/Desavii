import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DynamicFilterPanel from './DynamicFilterPanel.jsx';
import { useSearchFilterDefinitionsQuery } from '../../queries/useSearchFilterDefinitionsQuery.js';

vi.mock('../../queries/useSearchFilterDefinitionsQuery.js', () => ({
  useSearchFilterDefinitionsQuery: vi.fn(),
  default: vi.fn(),
}));

const ROOMS_GROUP = {
  code: 'ROOMS',
  definitions: [
    {
      code: 'bedrooms',
      param: 'attr_bedrooms',
      input_type: 'STEPPER',
      value_source: 'ATTRIBUTE',
      unit: 'rooms',
      min: 0,
      max: 20,
      options: [],
    },
  ],
};

const AMENITIES_EMPTY_GROUP = {
  code: 'AMENITIES',
  definitions: [
    {
      code: 'amenity_ids',
      param: 'amenityIds',
      input_type: 'MULTI_SELECT',
      value_source: 'AMENITY',
      options: [],
    },
  ],
};

function renderPanel(overrides = {}) {
  const onChange = vi.fn();
  render(
    <DynamicFilterPanel
      categoryId={overrides.categoryId}
      dynamicFilters={overrides.dynamicFilters ?? {}}
      onChange={onChange}
    />,
  );
  return { onChange };
}

describe('DynamicFilterPanel (apps/web/src/modules/search)', () => {
  beforeEach(() => {
    useSearchFilterDefinitionsQuery.mockReset();
  });

  test('renders nothing when the resolved catalog has no renderable filters', () => {
    useSearchFilterDefinitionsQuery.mockReturnValue({
      data: [AMENITIES_EMPTY_GROUP],
    });
    const { container } = render(
      <DynamicFilterPanel
        categoryId={8}
        dynamicFilters={{}}
        onChange={vi.fn()}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  test('opens the drawer and renders a control per definition, grouped', async () => {
    useSearchFilterDefinitionsQuery.mockReturnValue({ data: [ROOMS_GROUP] });
    const user = userEvent.setup();
    renderPanel({ categoryId: 2 });

    await user.click(screen.getByRole('button', { name: 'Զտիչներ' }));
    expect(screen.getByText('Սենյակներ և մահճակալներ')).toBeInTheDocument();
    expect(screen.getByText('Ննջասենյակներ')).toBeInTheDocument();
  });

  test('shows an active-filter chip for a set dynamic filter and clears it on click', async () => {
    useSearchFilterDefinitionsQuery.mockReturnValue({ data: [ROOMS_GROUP] });
    const user = userEvent.setup();
    const { onChange } = renderPanel({
      categoryId: 2,
      dynamicFilters: { attr_bedrooms_min: '2' },
    });

    const chips = screen.getByRole('group', { name: 'Ակտիվ զտիչներ' });
    const chipLabel = 'Ննջասենյակներ: 2+ սենյակ';
    expect(within(chips).getByText(chipLabel)).toBeInTheDocument();

    await user.click(within(chips).getByText(chipLabel).closest('button'));
    expect(onChange).toHaveBeenCalledWith({ attr_bedrooms_min: '' });
  });

  test('"clear all" (footer) clears every active dynamic filter at once', async () => {
    useSearchFilterDefinitionsQuery.mockReturnValue({ data: [ROOMS_GROUP] });
    const user = userEvent.setup();
    const { onChange } = renderPanel({
      categoryId: 2,
      dynamicFilters: { attr_bedrooms_min: '2' },
    });

    await user.click(screen.getByRole('button', { name: 'Զտիչներ' }));
    await user.click(screen.getByRole('button', { name: 'Մաքրել զտիչները' }));
    expect(onChange).toHaveBeenCalledWith({ attr_bedrooms_min: '' });
  });

  test('re-fetches (via a different query key) when categoryId changes — in the visitor language', () => {
    useSearchFilterDefinitionsQuery.mockReturnValue({ data: [ROOMS_GROUP] });
    const { rerender } = render(
      <DynamicFilterPanel
        categoryId={2}
        dynamicFilters={{}}
        onChange={vi.fn()}
      />,
    );
    expect(useSearchFilterDefinitionsQuery).toHaveBeenCalledWith(2, 'hy', {
      enabled: true,
    });

    rerender(
      <DynamicFilterPanel
        categoryId={6}
        dynamicFilters={{}}
        onChange={vi.fn()}
      />,
    );
    expect(useSearchFilterDefinitionsQuery).toHaveBeenCalledWith(6, 'hy', {
      enabled: true,
    });
  });
});
