import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ApiError from '../../../../../api/ApiError.js';
import ReviewStep from './ReviewStep.jsx';
import { usePublishListingMutation } from '../../../mutations/usePublishListingMutation.js';
import { PUBLICATION_PERIOD_DAYS_OPTIONS } from '../../../constants/publicationPeriod.js';

vi.mock('../../../mutations/usePublishListingMutation.js', () => ({
  usePublishListingMutation: vi.fn(),
}));

vi.mock('../../../../ai/index.js', () => ({
  PartnerAiToolsPanel: () => null,
  AskAiButton: () => null,
}));

vi.mock('../ListingCompletenessWidget.jsx', () => ({
  default: () => null,
}));

const LISTING = {
  id: 7,
  translations: [{ language_code: 'en', title: 'Boutique Yerevan Hotel' }],
  highlights: [],
  included_items: [],
  faqs: [],
  itinerary_steps: [],
  location: { latitude: 40.18, longitude: 44.5 },
  media: [{ id: 1 }, { id: 2 }],
  amenity_ids: [1, 2, 3],
  pricing: { amount: 150, currency: 'AMD', pricing_model: 'PER_NIGHT' },
};

// Listing Lifetime / Renewal, Step B3: `publicationPeriodDays`/
// `onPublicationPeriodDaysChange` are now required props (lifted state
// owned by `useListingWizardState`, mirroring `categoryId`/
// `setCategoryId` — see that hook's own file). This helper keeps every
// test below focused on what it's actually asserting, matching the
// wizard's own real default (90) unless a test explicitly overrides it.
function renderReviewStep(overrides = {}) {
  const props = {
    listing: LISTING,
    publicationPeriodDays: 90,
    onPublicationPeriodDaysChange: vi.fn(),
    onPublished: vi.fn(),
    onGoToStep: vi.fn(),
    ...overrides,
  };
  const utils = render(
    <ReviewStep
      listing={props.listing}
      publicationPeriodDays={props.publicationPeriodDays}
      onPublicationPeriodDaysChange={props.onPublicationPeriodDaysChange}
      onGoToStep={props.onGoToStep}
      onPublished={props.onPublished}
    />,
  );
  return { ...utils, props };
}

describe('ReviewStep (PartnerListingWizard)', () => {
  let mutateAsync;

  beforeEach(() => {
    mutateAsync = vi.fn().mockResolvedValue({ data: { id: 7 } });
    usePublishListingMutation.mockReturnValue({
      mutateAsync,
      isPending: false,
      error: null,
    });
  });

  test('renders a read-only summary of the listing', () => {
    renderReviewStep();
    expect(screen.getByText('Boutique Yerevan Hotel')).toBeInTheDocument();
    expect(screen.getByText('40.18, 44.5')).toBeInTheDocument();
  });

  test('renders the pricing model as its translated label, not the raw code', () => {
    renderReviewStep();
    expect(screen.getByText('150 AMD (Գիշերվա համար)')).toBeInTheDocument();
    expect(screen.queryByText(/PER_NIGHT/)).not.toBeInTheDocument();
  });

  test('clicking Publish sends the current publicationPeriodDays selection and calls onPublished on success', async () => {
    const user = userEvent.setup();
    const { props } = renderReviewStep();

    await user.click(screen.getByRole('button', { name: 'Հրապարակել' }));

    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith({
        id: 7,
        publicationPeriodDays: 90,
      }),
    );
    expect(props.onPublished).toHaveBeenCalled();
  });

  test('a 422 publish-readiness rejection renders the itemized issues and keeps the user on Review (onPublished never called)', async () => {
    const user = userEvent.setup();
    mutateAsync = vi.fn().mockRejectedValue(
      Object.assign(new Error('One or more fields are invalid.'), {
        details: [{ field: 'media', issue: 'AT_LEAST_ONE_IMAGE_REQUIRED' }],
      }),
    );
    usePublishListingMutation.mockReturnValue({
      mutateAsync,
      isPending: false,
      error: new ApiError({
        code: 'VALIDATION_FAILED',
        status: 422,
        message: 'Listing is not ready to publish.',
        details: [{ field: 'media', issue: 'AT_LEAST_ONE_IMAGE_REQUIRED' }],
      }),
    });
    const { props } = renderReviewStep();

    // Step L5: a translated summary, never the backend's English message.
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Որոշ տվյալներ պետք է ուղղել։');
    expect(alert).not.toHaveTextContent('Listing is not ready to publish.');
    expect(
      screen.getByText('Հրապարակելուց առաջ ավելացրեք առնվազն մեկ լուսանկար։'),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Հրապարակել' }));
    expect(props.onPublished).not.toHaveBeenCalled();
    // Still on Review — the summary/selector are still in the document,
    // never unmounted/replaced by a different step.
    expect(screen.getByText('Boutique Yerevan Hotel')).toBeInTheDocument();
  });

  // A missing-period rejection (a real first-lifecycle-publish scenario)
  // renders through the exact same itemized-issues path as any other
  // readiness failure — no special-cased error UI for this one field.
  test('a PUBLICATION_PERIOD_REQUIRED rejection renders through the same itemized-issues list', async () => {
    usePublishListingMutation.mockReturnValue({
      mutateAsync,
      isPending: false,
      error: {
        message: 'Listing is not ready to publish.',
        details: [
          {
            field: 'publicationPeriodDays',
            issue: 'PUBLICATION_PERIOD_REQUIRED',
          },
        ],
      },
    });
    renderReviewStep();
    expect(
      screen.getByText(
        'Ընտրեք, թե որքան ժամանակով պետք է հրապարակված մնա այս հայտարարությունը։',
      ),
    ).toBeInTheDocument();
  });

  // Step L5 (brief §9): readiness issues belong to earlier steps.
  describe('readiness issues routed to their steps (Step L5)', () => {
    function rejectWith(details) {
      usePublishListingMutation.mockReturnValue({
        mutateAsync,
        isPending: false,
        error: new ApiError({
          code: 'VALIDATION_FAILED',
          status: 422,
          message: 'Listing is not ready to publish.',
          details,
        }),
      });
    }

    test('a missing required attribute shows its label — never the raw attributeValues.<code> path', () => {
      rejectWith([
        {
          field: 'attributeValues.total_rooms',
          issue: 'REQUIRED_ATTRIBUTE_MISSING',
        },
      ]);
      renderReviewStep();

      const item = within(screen.getByRole('alert')).getByRole('listitem');
      expect(item).toHaveTextContent(
        'Սենյակների ընդհանուր թիվ: Պարտադիր մանրամասը բացակայում է։',
      );
      expect(item).not.toHaveTextContent('attributeValues');
      expect(item).not.toHaveTextContent('total_rooms');
    });

    test('each issue offers a jump to the step that fixes it — nothing navigates on its own', async () => {
      const user = userEvent.setup();
      rejectWith([
        { field: 'media', issue: 'AT_LEAST_ONE_IMAGE_REQUIRED' },
        {
          field: 'policyValues.check_in_time',
          issue: 'REQUIRED_POLICY_MISSING',
        },
      ]);
      const { props } = renderReviewStep();
      expect(props.onGoToStep).not.toHaveBeenCalled();

      await user.click(
        screen.getByRole('button', { name: 'Անցնել Պատկերասրահ' }),
      );
      expect(props.onGoToStep).toHaveBeenLastCalledWith('media');

      await user.click(screen.getByRole('button', { name: 'Անցնել Կանոններ' }));
      expect(props.onGoToStep).toHaveBeenLastCalledWith('policies');
    });

    test('an issue with no owning step (publication period) gets no jump button', () => {
      rejectWith([
        {
          field: 'publicationPeriodDays',
          issue: 'PUBLICATION_PERIOD_REQUIRED',
        },
      ]);
      renderReviewStep();
      expect(
        within(screen.getByRole('alert')).queryByRole('button'),
      ).not.toBeInTheDocument();
    });
  });

  test('renders "not set" placeholders when location/pricing are absent', () => {
    renderReviewStep({
      listing: { ...LISTING, location: null, pricing: null },
    });
    expect(screen.getAllByText('Նշված չէ')).toHaveLength(2);
  });

  // Listing Lifetime / Renewal, Step B3.
  describe('publication period selector', () => {
    test('renders exactly once, with exactly the 4 approved options and none other', () => {
      renderReviewStep();
      const group = screen.getByRole('group', { name: 'Հրապարակման ժամկետ' });
      expect(
        screen.getAllByRole('group', { name: 'Հրապարակման ժամկետ' }),
      ).toHaveLength(1);
      const buttons = within(group).getAllByRole('button');
      expect(buttons).toHaveLength(PUBLICATION_PERIOD_DAYS_OPTIONS.length);
      expect(PUBLICATION_PERIOD_DAYS_OPTIONS).toEqual([30, 90, 180, 365]);
    });

    test('90 is the selected option by default (a listing entering its first publication cycle)', () => {
      renderReviewStep({ publicationPeriodDays: 90 });
      const group = screen.getByRole('group', { name: 'Հրապարակման ժամկետ' });
      const selected = within(group).getByRole('button', {
        pressed: true,
      });
      expect(selected).toHaveTextContent('90');
    });

    test('selecting 30 days calls onPublicationPeriodDaysChange(30)', async () => {
      const user = userEvent.setup();
      const onPublicationPeriodDaysChange = vi.fn();
      renderReviewStep({ onPublicationPeriodDaysChange });
      const group = screen.getByRole('group', { name: 'Հրապարակման ժամկետ' });

      await user.click(within(group).getByRole('button', { name: /30/ }));
      expect(onPublicationPeriodDaysChange).toHaveBeenCalledWith(30);
    });

    test('selecting 180 days calls onPublicationPeriodDaysChange(180)', async () => {
      const user = userEvent.setup();
      const onPublicationPeriodDaysChange = vi.fn();
      renderReviewStep({ onPublicationPeriodDaysChange });
      const group = screen.getByRole('group', { name: 'Հրապարակման ժամկետ' });

      await user.click(within(group).getByRole('button', { name: /180/ }));
      expect(onPublicationPeriodDaysChange).toHaveBeenCalledWith(180);
    });

    test('selecting 365 days calls onPublicationPeriodDaysChange(365)', async () => {
      const user = userEvent.setup();
      const onPublicationPeriodDaysChange = vi.fn();
      renderReviewStep({ onPublicationPeriodDaysChange });
      const group = screen.getByRole('group', { name: 'Հրապարակման ժամկետ' });

      await user.click(within(group).getByRole('button', { name: /365/ }));
      expect(onPublicationPeriodDaysChange).toHaveBeenCalledWith(365);
    });

    // No custom/free-text input exists anywhere in this section — only
    // the 4 real toggle buttons.
    test('no numeric/text input exists for a custom period', () => {
      renderReviewStep();
      const group = screen.getByRole('group', { name: 'Հրապարակման ժամկետ' });
      expect(within(group).queryByRole('textbox')).not.toBeInTheDocument();
      expect(within(group).queryByRole('spinbutton')).not.toBeInTheDocument();
    });

    // The already-selected chip's own "click again to deselect" behavior
    // (ChipGroup's normal contract for an optional filter) must NOT apply
    // here — exactly one period is always selected.
    test('clicking the already-selected option does not clear the selection', async () => {
      const user = userEvent.setup();
      const onPublicationPeriodDaysChange = vi.fn();
      renderReviewStep({
        publicationPeriodDays: 90,
        onPublicationPeriodDaysChange,
      });
      const group = screen.getByRole('group', { name: 'Հրապարակման ժամկետ' });

      await user.click(within(group).getByRole('button', { name: /90/ }));
      expect(onPublicationPeriodDaysChange).not.toHaveBeenCalled();
    });

    // Native <button role="group"> semantics: keyboard-focusable,
    // aria-pressed reflects selection — real radio-like semantics without
    // a roving-tabindex custom widget.
    test('each option is a real, keyboard-focusable button with aria-pressed reflecting selection', () => {
      renderReviewStep({ publicationPeriodDays: 180 });
      const group = screen.getByRole('group', { name: 'Հրապարակման ժամկետ' });
      const options = within(group).getAllByRole('button');
      options.forEach((option) => {
        expect(option).toHaveAttribute('aria-pressed');
        expect(option.tagName).toBe('BUTTON');
      });
      const selected = options.find(
        (option) => option.getAttribute('aria-pressed') === 'true',
      );
      expect(selected).toHaveTextContent('180');
    });
  });

  // 2026 Partner Workspace redesign (Sprint 3 closeout).
  describe('translation completeness', () => {
    test('shows a per-locale status distinct from the required-to-publish widget, using real authored data', () => {
      renderReviewStep({
        listing: {
          ...LISTING,
          translations: [
            { language_code: 'en', title: 'Boutique Yerevan Hotel' },
            { language_code: 'hy', title: 'Բուտիկ հյուրանոց' },
          ],
          highlights: [{ language_code: 'en', text: 'Great location' }],
        },
      });
      expect(
        screen.getByText('Թարգմանության ամբողջականություն'),
      ).toBeInTheDocument();
      // en has title + highlights (2/7) => "Մասնակի" (partial); hy has
      // only title (1/7) => also partial; ru has nothing => "Չսկսված".
      expect(screen.getAllByText('Մասնակի')).toHaveLength(2);
      expect(screen.getByText('Չսկսված')).toBeInTheDocument();
    });

    test('a locale missing every translated field never blocks the Publish action', async () => {
      const user = userEvent.setup();
      const { props } = renderReviewStep();
      // Two locales are completely untranslated in the base LISTING
      // fixture — the publish button must still be enabled and callable.
      await user.click(screen.getByRole('button', { name: 'Հրապարակել' }));
      await waitFor(() => expect(props.onPublished).toHaveBeenCalled());
    });
  });
});
