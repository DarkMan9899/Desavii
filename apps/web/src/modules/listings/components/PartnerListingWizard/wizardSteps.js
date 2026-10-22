/**
 * The fixed step order `PartnerListingWizard` walks a partner through
 * (Phase 5 spec's suggested structure, extended by Phase 18.10's
 * `content` step for the rich-content editors; the Wizard rebuild merged
 * Pricing and Availability into `booking` — docs/
 * PARTNER_LISTING_WIZARD_FIELD_GAP.md §6). `labelKey` resolves through
 * `partner.listingWizard.steps.*` — the step SEQUENCE is the one thing
 * about this wizard that genuinely is hardcoded (every category walks
 * the same steps in the same order); everything rendered *within* a step
 * (attributes, amenities, pricing models, policies) is fully
 * metadata-driven, never this list.
 */

export const WIZARD_STEPS = [
  { id: 'category', labelKey: 'partner.listingWizard.steps.category' },
  { id: 'basicInfo', labelKey: 'partner.listingWizard.steps.basicInfo' },
  { id: 'location', labelKey: 'partner.listingWizard.steps.location' },
  { id: 'attributes', labelKey: 'partner.listingWizard.steps.attributes' },
  { id: 'amenities', labelKey: 'partner.listingWizard.steps.amenities' },
  { id: 'media', labelKey: 'partner.listingWizard.steps.media' },
  { id: 'booking', labelKey: 'partner.listingWizard.steps.booking' },
  { id: 'policies', labelKey: 'partner.listingWizard.steps.policies' },
  { id: 'content', labelKey: 'partner.listingWizard.steps.content' },
  { id: 'review', labelKey: 'partner.listingWizard.steps.review' },
];

// Partner Listing Wizard rebuild: Pricing and Availability became one
// Booking & pricing step. A bookmarked or shared `?step=pricing|
// availability` link still lands on it.
export const LEGACY_STEP_IDS = Object.freeze({
  pricing: 'booking',
  availability: 'booking',
});

// The wizard creates the real listing on this step's submit (Basic
// Information) — see `useListingWizardState.js`'s file header for why.
export const LISTING_CREATION_STEP_ID = 'basicInfo';

export default WIZARD_STEPS;
