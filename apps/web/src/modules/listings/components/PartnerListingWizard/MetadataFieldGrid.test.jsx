import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MetadataFieldGrid from './MetadataFieldGrid.jsx';

const DEFINITIONS = [
  { code: 'pets_allowed', data_type: 'BOOLEAN' },
  { code: 'check_in_time', data_type: 'STRING' },
];

describe('MetadataFieldGrid (PartnerListingWizard)', () => {
  test('renders every field and reports changes by code', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <MetadataFieldGrid
        namespace="policies"
        definitions={DEFINITIONS}
        values={{ pets_allowed: false, check_in_time: '' }}
        onChange={onChange}
        errorFor={() => undefined}
      />,
    );

    await user.click(screen.getByRole('switch'));
    expect(onChange).toHaveBeenCalledWith('pets_allowed', true);
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  test('only a multi-choice group takes a whole row', () => {
    const { container } = render(
      <MetadataFieldGrid
        namespace="attributes"
        definitions={[
          { code: 'vehicle_make', data_type: 'STRING' },
          { code: 'languages_spoken', data_type: 'MULTI_ENUM', options: [] },
        ]}
        values={{}}
        onChange={vi.fn()}
        errorFor={() => undefined}
      />,
    );

    const [textCell, choiceCell] = container.firstChild.children;
    expect(textCell.className).toBe('');
    expect(choiceCell.className).not.toBe('');
  });

  test("shows a field's error", () => {
    render(
      <MetadataFieldGrid
        namespace="policies"
        definitions={DEFINITIONS}
        values={{}}
        onChange={vi.fn()}
        errorFor={(code) =>
          code === 'check_in_time' ? 'Check-in time is required' : undefined
        }
      />,
    );

    expect(screen.getByText('Check-in time is required')).toBeInTheDocument();
  });
});
