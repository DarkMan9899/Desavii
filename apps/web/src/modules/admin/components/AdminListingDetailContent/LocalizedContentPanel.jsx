/**
 * LocalizedContentPanel — the review body shown inside one
 * `AuthoringLocaleTabs` tab on the Admin Listing Detail page. Unlike the
 * public/customer-facing detail page (`getLocalizedTranslation`/
 * `getLocalizedItems`, which silently fall back to another locale so a
 * shopper never sees a blank section), a moderator reviewing a specific
 * locale must see exactly what was persisted for THAT locale and nothing
 * else — the same "no fallback" requirement `getLocalizedItemsExact`
 * already exists for in the Partner authoring UI (`ContentStep.jsx`),
 * reused here for the identical reason: an authoring fallback must never
 * be mistaken for a genuinely reviewed translation.
 */

import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { Stack } from '@desavii/ui/components/layout';
import { Alert } from '@desavii/ui/components/feedback-overlays';
import { HighlightsList } from '@desavii/ui/components/data-display';
import {
  getLocalizedItemsExact,
  resolveHighlightIcon,
  ListingAboutSection,
  ListingItinerarySection,
  ListingIncludedSection,
  ListingFaqSection,
  ListingGuestNotesSection,
} from '../../../listings/index.js';

export default function LocalizedContentPanel({ listing, reviewLocale }) {
  const { t } = useTranslation();

  const translation = (listing.translations ?? []).find(
    (row) => row.language_code === reviewLocale,
  );
  const highlights = getLocalizedItemsExact(listing.highlights, reviewLocale);
  const itinerarySteps = getLocalizedItemsExact(
    listing.itinerary_steps,
    reviewLocale,
  );
  const includedItems = getLocalizedItemsExact(
    listing.included_items,
    reviewLocale,
  );
  const faqs = getLocalizedItemsExact(listing.faqs, reviewLocale);
  const guestNotes = getLocalizedItemsExact(listing.guest_notes, reviewLocale);

  const hasAnyContent =
    translation ||
    highlights.length > 0 ||
    itinerarySteps.length > 0 ||
    includedItems.length > 0 ||
    guestNotes.length > 0 ||
    faqs.length > 0;

  if (!hasAnyContent) {
    return (
      <Alert
        variant="warning"
        title={t('admin.listingDetail.localizedContent.notTranslatedTitle')}
      >
        {t('admin.listingDetail.localizedContent.notTranslatedBody', {
          locale: t(`partner.listingWizard.contentLocale.${reviewLocale}`),
        })}
      </Alert>
    );
  }

  const iconHighlights = highlights.map((highlight) => ({
    text: highlight.text,
    icon: resolveHighlightIcon(highlight.icon_code),
  }));

  return (
    <Stack gap="4">
      {!translation && (
        <Alert
          variant="warning"
          title={t('admin.listingDetail.localizedContent.notTranslatedTitle')}
        >
          {t('admin.listingDetail.localizedContent.notTranslatedBody', {
            locale: t(`partner.listingWizard.contentLocale.${reviewLocale}`),
          })}
        </Alert>
      )}

      {translation && (
        <Stack gap="2">
          <strong>{translation.title}</strong>
          {translation.summary && <p>{translation.summary}</p>}
          <ListingAboutSection
            description={translation.description}
            sectionId={`about-${reviewLocale}`}
          />
        </Stack>
      )}

      {iconHighlights.length > 0 && (
        <Stack gap="2">
          <h3>{t('admin.listingDetail.localizedContent.highlightsHeading')}</h3>
          <HighlightsList highlights={iconHighlights} />
        </Stack>
      )}

      {itinerarySteps.length > 0 && (
        <ListingItinerarySection
          steps={itinerarySteps}
          sectionId={`itinerary-${reviewLocale}`}
        />
      )}
      {includedItems.length > 0 && (
        <ListingIncludedSection
          items={includedItems}
          sectionId={`included-${reviewLocale}`}
        />
      )}
      {guestNotes.length > 0 && (
        <ListingGuestNotesSection
          notes={guestNotes}
          sectionId={`guest-notes-${reviewLocale}`}
        />
      )}
      {faqs.length > 0 && (
        <ListingFaqSection faqs={faqs} sectionId={`faq-${reviewLocale}`} />
      )}
    </Stack>
  );
}

const localizedRowShape = PropTypes.shape({ language_code: PropTypes.string });

LocalizedContentPanel.propTypes = {
  listing: PropTypes.shape({
    translations: PropTypes.arrayOf(
      PropTypes.shape({
        language_code: PropTypes.string,
        title: PropTypes.string,
        summary: PropTypes.string,
        description: PropTypes.string,
      }),
    ),
    highlights: PropTypes.arrayOf(localizedRowShape),
    itinerary_steps: PropTypes.arrayOf(localizedRowShape),
    included_items: PropTypes.arrayOf(localizedRowShape),
    faqs: PropTypes.arrayOf(localizedRowShape),
    guest_notes: PropTypes.arrayOf(localizedRowShape),
  }).isRequired,
  reviewLocale: PropTypes.string.isRequired,
};
