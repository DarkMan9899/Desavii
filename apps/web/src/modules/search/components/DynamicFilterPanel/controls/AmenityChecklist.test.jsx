import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AmenityChecklist from './AmenityChecklist.jsx';
import hy from '../../../../../../public/locales/hy/common.json';

// The test harness's i18n instance defaults to Armenian (tests/setup.js).
const T = hy.search.filters;
const GROUPS = hy.partner.listingWizard.amenityGroups;

const option = (value, text, group, count = 1) => ({
  value: String(value),
  text,
  group,
  count,
});
const SHORT_LIST = [
  option(1, 'Անվճար Wi-Fi', 'CONNECTIVITY', 5),
  option(2, 'Կայանատեղի', 'GENERAL', 3),
];
const LONG_LIST = [
  ...SHORT_LIST,
  option(3, 'Լողավազան', 'OUTDOOR'),
  option(4, 'Սաունա', 'WELLNESS'),
  option(5, 'Խոհանոց', 'KITCHEN_LAUNDRY'),
  option(6, 'Լվացքի մեքենա', 'KITCHEN_LAUNDRY'),
  option(7, 'Այգի', 'OUTDOOR'),
  option(8, 'Թեքահարթակ', 'ACCESSIBILITY_SAFETY'),
];

function renderChecklist(options, selectedValues = [], isLabelHidden = false) {
  const onChange = vi.fn();
  render(
    <AmenityChecklist
      label={hy.search.dynamicFilters.definitions.amenity_ids}
      options={options}
      selectedValues={selectedValues}
      onChange={onChange}
      isLabelHidden={isLabelHidden}
    />,
  );
  return { onChange, user: userEvent.setup() };
}

describe('AmenityChecklist (apps/web/src/modules/search)', () => {
  test('groups amenities under their localized catalog group, with counts', () => {
    renderChecklist(SHORT_LIST);
    expect(screen.getByText(GROUPS.CONNECTIVITY)).toBeInTheDocument();
    expect(screen.getByText(GROUPS.GENERAL)).toBeInTheDocument();
    expect(
      screen.getByRole('checkbox', { name: /Անվճար Wi-Fi/ }),
    ).toBeInTheDocument();
  });

  test('a short list is scanned, not searched — no find box', () => {
    renderChecklist(SHORT_LIST);
    expect(
      screen.queryByRole('textbox', { name: T.findAmenity }),
    ).not.toBeInTheDocument();
  });

  test('find-as-you-type narrows the list and says when nothing matches', async () => {
    const { user } = renderChecklist(LONG_LIST);
    const find = screen.getByRole('textbox', { name: T.findAmenity });
    await user.type(find, 'սաունա');
    expect(screen.getAllByRole('checkbox')).toHaveLength(1);
    await user.clear(find);
    await user.type(find, 'zzz');
    expect(screen.getByText(T.noAmenityMatch)).toBeInTheDocument();
  });

  test('under a same-named section the name stays for screen readers only', () => {
    renderChecklist(SHORT_LIST, [], true);
    const name = hy.search.dynamicFilters.definitions.amenity_ids;
    expect(screen.getByRole('group', { name })).toBeInTheDocument();
    expect(screen.getByText(name).className).toMatch(/labelHidden/);
  });

  test('toggling adds or removes the amenity and shows how many are selected', async () => {
    const { onChange, user } = renderChecklist(SHORT_LIST, ['1']);
    expect(
      screen.getByText(T.selectedCount_other.replace('{{count}}', '1')),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: /Կայանատեղի/ }));
    expect(onChange).toHaveBeenCalledWith(['1', '2']);
    await user.click(screen.getByRole('checkbox', { name: /Անվճար Wi-Fi/ }));
    expect(onChange).toHaveBeenLastCalledWith([]);
  });
});
