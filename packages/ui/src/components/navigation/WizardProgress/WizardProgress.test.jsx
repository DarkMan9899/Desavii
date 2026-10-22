import { describe, test, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import WizardProgress from './WizardProgress.jsx';

const STEPS = [
  { id: 'category', label: 'Category' },
  { id: 'basicInfo', label: 'Basics' },
  { id: 'location', label: 'Location' },
  { id: 'review', label: 'Review' },
];

function renderProgress(props = {}) {
  return render(
    <WizardProgress
      steps={STEPS}
      currentStepId="location"
      completedStepIds={['category', 'basicInfo']}
      onStepClick={vi.fn()}
      ariaLabel="Listing creation progress"
      summaryText="Step 3 of 4: Location"
      // eslint-disable-next-line react/jsx-props-no-spreading -- per-test overrides
      {...props}
    />,
  );
}

// jsdom has no layout: give the step row a measurable overflow. The row
// sits `rowLeft` px into the page (beside a sidebar, say) and the current
// step `itemOffset` px into the row.
function mockRowGeometry({
  scrollWidth,
  rowWidth,
  rowLeft,
  itemOffset,
  itemWidth,
}) {
  const spies = [
    vi
      .spyOn(HTMLElement.prototype, 'scrollWidth', 'get')
      .mockReturnValue(scrollWidth),
    vi
      .spyOn(HTMLElement.prototype, 'clientWidth', 'get')
      .mockReturnValue(rowWidth),
    vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(function boxOf() {
        return this.tagName === 'OL'
          ? { left: rowLeft, width: rowWidth }
          : { left: rowLeft + itemOffset, width: itemWidth };
      }),
  ];
  return () => spies.forEach((spy) => spy.mockRestore());
}

describe('WizardProgress', () => {
  let restoreGeometry = () => {};

  afterEach(() => {
    restoreGeometry();
    restoreGeometry = () => {};
  });

  test('marks the current step and lets only reached steps be clicked', async () => {
    const user = userEvent.setup();
    const onStepClick = vi.fn();
    renderProgress({ onStepClick });

    expect(screen.getByRole('navigation')).toHaveAccessibleName(
      'Listing creation progress',
    );
    expect(screen.getByText('Step 3 of 4: Location')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Location' })).toHaveAttribute(
      'aria-current',
      'step',
    );
    expect(screen.getByRole('button', { name: 'Review' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Category' }));
    expect(onStepClick).toHaveBeenCalledWith('category');
  });

  test('scrolls an overflowing row so the current step is centred in view', () => {
    restoreGeometry = mockRowGeometry({
      scrollWidth: 900,
      rowWidth: 300,
      rowLeft: 340,
      itemOffset: 500,
      itemWidth: 100,
    });
    renderProgress();

    // Centred within the row, whatever the row's own place on the page.
    expect(screen.getByRole('list').scrollLeft).toBe(400);
  });

  test('leaves a row that fits untouched', () => {
    restoreGeometry = mockRowGeometry({
      scrollWidth: 300,
      rowWidth: 300,
      rowLeft: 340,
      itemOffset: 200,
      itemWidth: 100,
    });
    renderProgress();

    expect(screen.getByRole('list').scrollLeft).toBe(0);
  });
});
