import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import PartnerListingWizard from './PartnerListingWizard.jsx';
import { useListingQuery } from '../../queries/useListingQuery.js';
import { useListingMetadataQuery } from '../../queries/useListingMetadataQuery.js';
import { useToast } from '../../../../contexts/ToastContext.jsx';

vi.mock('../../queries/useListingQuery.js', () => ({
  useListingQuery: vi.fn(),
}));
vi.mock('../../queries/useListingMetadataQuery.js', () => ({
  useListingMetadataQuery: vi.fn(),
}));
vi.mock('../../../../contexts/ToastContext.jsx', () => ({
  useToast: vi.fn(),
}));

vi.mock('./steps/CategoryStep.jsx', () => ({
  default: () => <div>CategoryStep</div>,
}));
vi.mock('./steps/BasicInfoStep.jsx', () => ({
  default: () => <div>BasicInfoStep</div>,
}));
vi.mock('./steps/LocationStep.jsx', () => ({
  default: () => <div>LocationStep</div>,
}));
vi.mock('./steps/DynamicAttributesStep.jsx', () => ({
  default: () => <div>DynamicAttributesStep</div>,
}));
vi.mock('./steps/AmenitiesStep.jsx', () => ({
  default: () => <div>AmenitiesStep</div>,
}));
vi.mock('./steps/MediaStep.jsx', () => ({
  default: () => <div>MediaStep</div>,
}));
vi.mock('./steps/PricingStep.jsx', () => ({
  default: () => <div>PricingStep</div>,
}));
vi.mock('./steps/AvailabilityStep.jsx', () => ({
  default: () => <div>AvailabilityStep</div>,
}));
vi.mock('./steps/PoliciesStep.jsx', () => ({
  default: () => <div>PoliciesStep</div>,
}));
vi.mock('./steps/ContentStep.jsx', () => ({
  default: () => <div>ContentStep</div>,
}));
vi.mock('./steps/ReviewStep.jsx', () => ({
  default: () => <div>ReviewStep</div>,
}));

const PARTNERSHIPS = [{ partner_id: 1, display_name: 'Yerevan Boutique' }];

function renderWizard(initialEntry) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <PartnerListingWizard partnerships={PARTNERSHIPS} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('PartnerListingWizard (orchestrator)', () => {
  test('renders CategoryStep by default with no listing yet', () => {
    useListingQuery.mockReturnValue({ data: undefined, isPending: false });
    useListingMetadataQuery.mockReturnValue({ data: undefined });
    useToast.mockReturnValue({ showToast: vi.fn() });

    renderWizard('/hy/partner/listings/new');
    expect(screen.getByText('CategoryStep')).toBeInTheDocument();
  });

  test('renders BasicInfoStep for ?step=basicInfo once a category is already chosen', () => {
    useListingQuery.mockReturnValue({ data: undefined, isPending: false });
    useListingMetadataQuery.mockReturnValue({ data: undefined });
    useToast.mockReturnValue({ showToast: vi.fn() });

    renderWizard('/hy/partner/listings/new?step=basicInfo&categoryId=3');
    expect(screen.getByText('BasicInfoStep')).toBeInTheDocument();
  });

  // Step L1 (brief §7): Basic Information's own creation submit no
  // longer asks for `listingType` — reaching it with no category chosen
  // at all (no `listingId` either) has no fallback, so it redirects back
  // to Category instead of rendering an unusable form.
  test('redirects ?step=basicInfo with no listingId and no categoryId back to Category', () => {
    useListingQuery.mockReturnValue({ data: undefined, isPending: false });
    useListingMetadataQuery.mockReturnValue({ data: undefined });
    useToast.mockReturnValue({ showToast: vi.fn() });

    renderWizard('/hy/partner/listings/new?step=basicInfo');
    expect(screen.getByText('CategoryStep')).toBeInTheDocument();
    expect(screen.queryByText('BasicInfoStep')).not.toBeInTheDocument();
  });

  // Step L1: a later step requested with neither listingId nor
  // categoryId ultimately resolves all the way back to Category (via
  // basicInfo) — the original "no listingId -> basicInfo" redirect and
  // the new "no categoryId -> category" redirect both apply in sequence.
  test('redirects back to Category (via basicInfo) when a later step is requested with no listingId or category', () => {
    useListingQuery.mockReturnValue({ data: undefined, isPending: false });
    useListingMetadataQuery.mockReturnValue({ data: undefined });
    useToast.mockReturnValue({ showToast: vi.fn() });

    renderWizard('/hy/partner/listings/new?step=media');
    expect(screen.getByText('CategoryStep')).toBeInTheDocument();
    expect(screen.queryByText('MediaStep')).not.toBeInTheDocument();
    expect(screen.queryByText('BasicInfoStep')).not.toBeInTheDocument();
  });

  // The pre-existing "no listingId -> basicInfo" redirect still holds on
  // its own once a category IS already chosen — it just doesn't bounce
  // any further, since basicInfo now has what it needs.
  test('redirects a later step with no listingId but a chosen category to basicInfo, not further back to Category', () => {
    useListingQuery.mockReturnValue({ data: undefined, isPending: false });
    useListingMetadataQuery.mockReturnValue({ data: undefined });
    useToast.mockReturnValue({ showToast: vi.fn() });

    renderWizard('/hy/partner/listings/new?step=media&categoryId=3');
    expect(screen.getByText('BasicInfoStep')).toBeInTheDocument();
    expect(screen.queryByText('MediaStep')).not.toBeInTheDocument();
    expect(screen.queryByText('CategoryStep')).not.toBeInTheDocument();
  });

  test('shows a PageLoader while the listing is still loading for a resumed draft', () => {
    useListingQuery.mockReturnValue({ data: undefined, isPending: true });
    useListingMetadataQuery.mockReturnValue({ data: undefined });
    useToast.mockReturnValue({ showToast: vi.fn() });

    renderWizard('/hy/partner/listings/new?listingId=7&step=media');
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.queryByText('MediaStep')).not.toBeInTheDocument();
  });

  test('renders MediaStep once the resumed draft listing has loaded', () => {
    useListingQuery.mockReturnValue({
      data: {
        id: 7,
        category_ids: [3],
        translations: [{ title: 'Villa Ararat' }],
        media: [],
        attribute_values: [],
        policy_values: [],
        amenity_ids: [],
        location: null,
        pricing: null,
        booking_rules: null,
      },
      isPending: false,
    });
    useListingMetadataQuery.mockReturnValue({ data: undefined });
    useToast.mockReturnValue({ showToast: vi.fn() });

    renderWizard('/hy/partner/listings/new?listingId=7&step=media');
    expect(screen.getByText('MediaStep')).toBeInTheDocument();
  });

  test('renders ContentStep once the resumed draft listing has loaded', () => {
    useListingQuery.mockReturnValue({
      data: {
        id: 7,
        category_ids: [3],
        translations: [{ title: 'Villa Ararat' }],
        media: [],
        attribute_values: [],
        policy_values: [],
        amenity_ids: [],
        location: null,
        pricing: null,
        booking_rules: null,
        highlights: [],
        itinerary_steps: [],
        included_items: [],
        faqs: [],
      },
      isPending: false,
    });
    useListingMetadataQuery.mockReturnValue({ data: undefined });
    useToast.mockReturnValue({ showToast: vi.fn() });

    renderWizard('/hy/partner/listings/new?listingId=7&step=content');
    expect(screen.getByText('ContentStep')).toBeInTheDocument();
  });

  // Step L2 (brief §5): a required-field legend explains the `*` marker
  // on every step except Category, which has no required-field markers
  // of its own (it's a single-choice picker, not a labeled-field form).
  describe('required-field legend (Step L2)', () => {
    test('is hidden on the Category step', () => {
      useListingQuery.mockReturnValue({ data: undefined, isPending: false });
      useListingMetadataQuery.mockReturnValue({ data: undefined });
      useToast.mockReturnValue({ showToast: vi.fn() });

      renderWizard('/hy/partner/listings/new');
      expect(
        screen.queryByText(
          '* նշված դաշտերը պարտադիր են։ Մնացած բոլորը կամընտիր են։',
        ),
      ).not.toBeInTheDocument();
    });

    test('is shown on the Basic Info step', () => {
      useListingQuery.mockReturnValue({ data: undefined, isPending: false });
      useListingMetadataQuery.mockReturnValue({ data: undefined });
      useToast.mockReturnValue({ showToast: vi.fn() });

      renderWizard('/hy/partner/listings/new?step=basicInfo&categoryId=3');
      expect(
        screen.getByText(
          '* նշված դաշտերը պարտադիր են։ Մնացած բոլորը կամընտիր են։',
        ),
      ).toBeInTheDocument();
    });
  });

  test('renders the WizardProgress step indicator', () => {
    useListingQuery.mockReturnValue({ data: undefined, isPending: false });
    useListingMetadataQuery.mockReturnValue({ data: undefined });
    useToast.mockReturnValue({ showToast: vi.fn() });

    renderWizard('/hy/partner/listings/new');
    expect(screen.getByText('Քայլ 1 11-ից. Կատեգորիա')).toBeInTheDocument();
  });
});
