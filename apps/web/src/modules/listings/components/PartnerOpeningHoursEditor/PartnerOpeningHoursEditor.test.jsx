import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PartnerOpeningHoursEditor from './PartnerOpeningHoursEditor.jsx';
import { useListingOpeningHoursQuery } from '../../queries/useListingOpeningHoursQuery.js';
import { useReplaceListingOpeningHoursMutation } from '../../mutations/useReplaceListingOpeningHoursMutation.js';

vi.mock('../../queries/useListingOpeningHoursQuery.js', () => ({
  useListingOpeningHoursQuery: vi.fn(),
}));
vi.mock('../../mutations/useReplaceListingOpeningHoursMutation.js', () => ({
  useReplaceListingOpeningHoursMutation: vi.fn(),
}));

const toastSpy = vi.fn();
vi.mock('../../../../contexts/ToastContext.jsx', () => ({
  useToast: () => ({ showToast: toastSpy }),
}));

// Real Armenian weekday names (the test i18n instance's `lng` is 'hy' —
// `getWeekdayName` resolves them via `Intl.DateTimeFormat`, never a
// hardcoded table, so the test asserts against the real ICU output.
const MONDAY_FIRST_HY_NAMES = [
  'երկուշաբթի',
  'երեքշաբթի',
  'չորեքշաբթի',
  'հինգշաբթի',
  'ուրբաթ',
  'շաբաթ',
  'կիրակի',
];

const EXISTING_HOURS = [
  { day_of_week: 1, opens_at: '11:00', closes_at: '23:00', is_closed: false },
  { day_of_week: 0, opens_at: null, closes_at: null, is_closed: true },
];

describe('PartnerOpeningHoursEditor (Pass 6, Restaurant vertical)', () => {
  let replaceMutate;

  beforeEach(() => {
    replaceMutate = vi.fn();
    toastSpy.mockReset();
    useReplaceListingOpeningHoursMutation.mockReturnValue({
      mutate: replaceMutate,
      isPending: false,
      error: null,
    });
  });

  test('renders every day Monday-first with real (never hardcoded) weekday names', () => {
    useListingOpeningHoursQuery.mockReturnValue({
      data: EXISTING_HOURS,
      isPending: false,
      isError: false,
    });
    render(<PartnerOpeningHoursEditor listingId={7} />);

    MONDAY_FIRST_HY_NAMES.forEach((name) => {
      expect(screen.getByText(name)).toBeInTheDocument();
    });
    // Monday (day_of_week 1) is authored and Open — its real times show.
    expect(screen.getByDisplayValue('11:00')).toBeInTheDocument();
    expect(screen.getByDisplayValue('23:00')).toBeInTheDocument();
  });

  test('an Open day missing a time disables Save and shows the incomplete hint', async () => {
    const user = userEvent.setup();
    useListingOpeningHoursQuery.mockReturnValue({
      data: [],
      isPending: false,
      isError: false,
    });
    render(<PartnerOpeningHoursEditor listingId={7} />);

    await user.click(screen.getByRole('button', { name: 'երկուշաբթի' }));
    await user.click(screen.getByRole('option', { name: 'Բաց' }));

    expect(
      screen.getByText(
        'Նշեք և՛ բացման, և՛ փակման ժամը, կամ նշեք օրը որպես փակ։',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Պահպանել աշխատանքային ժամերը' }),
    ).toBeDisabled();
  });

  test('saving omits every "Not set" day and sends real values for Open/Closed days', async () => {
    const user = userEvent.setup();
    useListingOpeningHoursQuery.mockReturnValue({
      data: EXISTING_HOURS,
      isPending: false,
      isError: false,
    });
    render(<PartnerOpeningHoursEditor listingId={7} />);

    await user.click(
      screen.getByRole('button', { name: 'Պահպանել աշխատանքային ժամերը' }),
    );

    expect(replaceMutate).toHaveBeenCalledWith(
      {
        id: 7,
        days: [
          {
            dayOfWeek: 1,
            isClosed: false,
            opensAt: '11:00',
            closesAt: '23:00',
          },
          { dayOfWeek: 0, isClosed: true },
        ],
      },
      expect.objectContaining({
        onSuccess: expect.any(Function),
        onError: expect.any(Function),
      }),
    );
  });

  test('a save failure shows the inline error from the mutation', () => {
    useListingOpeningHoursQuery.mockReturnValue({
      data: [],
      isPending: false,
      isError: false,
    });
    useReplaceListingOpeningHoursMutation.mockReturnValue({
      mutate: replaceMutate,
      isPending: false,
      error: { message: 'Something broke' },
    });
    render(<PartnerOpeningHoursEditor listingId={7} />);

    expect(screen.getByText('Something broke')).toBeInTheDocument();
  });
});
