import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import FilterControl from './FilterControl.jsx';

// The test harness's i18n instance defaults to Armenian (tests/setup.js),
// so every label below is the real HY vocabulary the API's codes resolve
// to. Option names include their result count, hence the regex matchers.

function renderControl(definition, dynamicFilters = {}) {
  const onChange = vi.fn();
  render(
    <FilterControl
      definition={{ options: [], ...definition }}
      dynamicFilters={dynamicFilters}
      onChange={onChange}
    />,
  );
  return { onChange };
}

describe('FilterControl (apps/web/src/modules/search/components/DynamicFilterPanel)', () => {
  test('STEPPER: renders the catalog name and writes {param}_min', async () => {
    const user = userEvent.setup();
    const { onChange } = renderControl({
      code: 'bedrooms',
      param: 'attr_bedrooms',
      input_type: 'STEPPER',
      value_source: 'ATTRIBUTE',
      unit: 'rooms',
      min: 0,
      max: 20,
    });
    expect(screen.getByText('Ննջասենյակներ')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Ավելացնել/ }));
    expect(onChange).toHaveBeenCalledWith({ attr_bedrooms_min: '1' });
  });

  test('RANGE: shows the applied bound with its localized unit, falling back to the definition bound', () => {
    renderControl(
      {
        code: 'duration_minutes',
        param: 'attr_duration_minutes',
        input_type: 'RANGE',
        value_source: 'ATTRIBUTE',
        unit: 'minutes',
        min: 15,
        max: 720,
      },
      { attr_duration_minutes_min: '30' },
    );
    expect(screen.getByText(/30 րոպե/)).toBeInTheDocument();
    expect(screen.getByText(/720 րոպե/)).toBeInTheDocument();
  });

  test('SINGLE_SELECT: catalog option labels with counts; writes the bare param', async () => {
    const user = userEvent.setup();
    const { onChange } = renderControl({
      code: 'star_rating',
      param: 'attr_star_rating',
      input_type: 'SINGLE_SELECT',
      value_source: 'ATTRIBUTE',
      options: [
        { value: 1, code: '1', count: 2 },
        { value: 5, code: '5', count: 3 },
      ],
    });
    const fiveStars = screen.getByRole('button', { name: /5 աստղ/ });
    expect(fiveStars).toHaveTextContent('3');
    await user.click(fiveStars);
    expect(onChange).toHaveBeenCalledWith({ attr_star_rating: '5' });
  });

  test('an option no listing in scope carries is hidden — unless an old link already selected it', () => {
    renderControl(
      {
        code: 'cuisine',
        param: 'attr_cuisine',
        input_type: 'MULTI_SELECT',
        value_source: 'ATTRIBUTE',
        options: [
          { value: 10, code: 'ARMENIAN', count: 0 },
          { value: 11, code: 'ITALIAN', count: 0 },
          { value: 12, code: 'GEORGIAN', count: 4 },
        ],
      },
      { attr_cuisine: '11' },
    );
    expect(screen.queryByRole('checkbox', { name: /Հայկական/ })).toBeNull();
    expect(screen.getByRole('checkbox', { name: /Իտալական/ })).toBeChecked();
  });

  test('MULTI_SELECT (ATTRIBUTE): writes a comma-joined id list on toggle', async () => {
    const user = userEvent.setup();
    const { onChange } = renderControl(
      {
        code: 'cuisine',
        param: 'attr_cuisine',
        input_type: 'MULTI_SELECT',
        value_source: 'ATTRIBUTE',
        options: [
          { value: 10, code: 'ARMENIAN', count: 3 },
          { value: 11, code: 'ITALIAN', count: 1 },
        ],
      },
      { attr_cuisine: '10' },
    );
    await user.click(screen.getByRole('checkbox', { name: /Իտալական/ }));
    expect(onChange).toHaveBeenCalledWith({ attr_cuisine: '10,11' });
  });

  test('MULTI_SELECT (AMENITY): the API-localized label is shown as-is and writes amenityIds', async () => {
    const user = userEvent.setup();
    const { onChange } = renderControl({
      code: 'amenity_ids',
      param: 'amenityIds',
      input_type: 'MULTI_SELECT',
      value_source: 'AMENITY',
      options: [
        {
          value: 1,
          code: 'wifi',
          label: 'Անվճար Wi-Fi',
          group: 'INTERNET_WORK',
          count: 5,
        },
        {
          value: 2,
          code: 'parking',
          label: 'Կայանատեղի',
          group: 'GENERAL',
          count: 2,
        },
      ],
    });
    expect(screen.getByText('Ինտերնետ և աշխատանք')).toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: /Կայանատեղի/ }));
    expect(onChange).toHaveBeenCalledWith({ amenityIds: '2' });
  });

  test('TOGGLE (POLICY): named from the policy catalog; writes "true", and "" to switch off', async () => {
    const user = userEvent.setup();
    const definition = {
      code: 'pets_allowed',
      param: 'policy_pets_allowed',
      input_type: 'TOGGLE',
      value_source: 'POLICY',
      listing_count: 1,
    };
    const { onChange } = renderControl(definition);
    await user.click(
      screen.getByRole('switch', { name: /Կենդանիներ թույլատրվում են/ }),
    );
    expect(onChange).toHaveBeenCalledWith({ policy_pets_allowed: 'true' });
  });

  test('ROOM: meal plans are named from the catalog meal-plan vocabulary', () => {
    renderControl({
      code: 'meal_plan',
      param: 'room_meal_plan',
      input_type: 'MULTI_SELECT',
      value_source: 'ROOM',
      options: [
        { value: 'BREAKFAST_INCLUDED', code: 'BREAKFAST_INCLUDED', count: 2 },
      ],
    });
    expect(
      screen.getByRole('checkbox', { name: /Նախաճաշը ներառված է/ }),
    ).toBeInTheDocument();
    expect(screen.getByText('Սնունդ')).toBeInTheDocument();
  });

  test('REVIEW: "4.5+" in the visitor\'s number format; writes ratingMin', async () => {
    const user = userEvent.setup();
    const { onChange } = renderControl({
      code: 'guest_rating',
      param: 'ratingMin',
      input_type: 'SINGLE_SELECT',
      value_source: 'REVIEW',
      options: [{ value: '4.5', code: '4.5', count: 1 }],
    });
    expect(screen.getByText('Հյուրերի գնահատական')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /4[.,]5\+/ }));
    expect(onChange).toHaveBeenCalledWith({ ratingMin: '4.5' });
  });
});
