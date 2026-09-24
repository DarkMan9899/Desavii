/**
 * AdminListingDetailContent — `/:locale/admin/listings/:id` (P2.1,
 * reorganized under Admin Sprint 3 into explicit operational sections:
 * Identity, Localized content, Media, Details, Commercial/Operational,
 * Moderation). Lets an admin actually inspect a listing before approving/
 * rejecting it.
 *
 * Reuses the exact same metadata-driven, vertical-agnostic rendering the
 * customer-facing Listing Detail page uses (`ListingAttributesSection`/
 * `ListingAmenitiesSection`/`ListingPoliciesSection`/etc., exported from
 * `modules/listings`'s public barrel for this purpose) — there is no
 * separate per-vertical admin view, matching this codebase's one
 * generic listing architecture (`BACKEND_ARCHITECTURE.md` §7A). "Vehicle
 * details"/"accommodation details" are simply whatever attributes the
 * listing's category declares; nothing here names a vertical.
 *
 * Step M3: the moderation action set is derived per listing from
 * `getAllowedModerationActions` (mirrors the backend's own closed
 * decision matrix) rather than always showing Approve/Reject — a DRAFT
 * or PUBLISHED listing gets a different action set than a
 * PENDING_REVIEW one, and none render at all outside those two
 * statuses. Reuses `useUpdateListingModerationStatusMutation` and the
 * identical confirm/reason-dialog flow `AdminListingModerationPageContent
 * .jsx` already uses (same i18n strings, same error-code handling via
 * `utils/listingModerationActions.js`) — no new backend behavior, no
 * duplicated mutation logic.
 *
 * The Localized content section deliberately does NOT use
 * `getLocalizedTranslation`/`getLocalizedItems` (both silently fall back
 * to another locale — correct for a public reader, wrong for a
 * moderator, who must see exactly what's persisted per locale). It uses
 * `AuthoringLocaleTabs` + `LocalizedContentPanel`, the same "no fallback"
 * review pattern the Partner authoring UI already established
 * (`getLocalizedItemsExact`) — an admin reviewing HY must see "not
 * translated" rather than silently-substituted EN content.
 */

import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { Section, Stack, Inline } from '@desavii/ui/components/layout';
import { Card, Badge, Button } from '@desavii/ui/components/primitives';
import { Textarea } from '@desavii/ui/components/form-controls';
import { PriceTag } from '@desavii/ui/components/data-display';
import { Gallery } from '@desavii/ui/components/listing-media';
import {
  Skeleton,
  EmptyState,
  ErrorState,
  Modal,
} from '@desavii/ui/components/feedback-overlays';
import PageHeader from '../../../../components/PageHeader/PageHeader.jsx';
import RouterLink from '../../../../components/RouterLink.jsx';
import { useAuth } from '../../../../contexts/AuthContext.jsx';
import { useConfirm } from '../../../../contexts/ConfirmContext.jsx';
import { useToast } from '../../../../contexts/ToastContext.jsx';
import { SUPPORTED_LOCALES } from '../../../../translations/i18n.js';
import {
  useListingMetadataQuery,
  useListingCategoriesQuery,
  getLocalizedTranslation,
  AuthoringLocaleTabs,
  ListingStatusBadge,
  ListingAttributesSection,
  ListingAmenitiesSection,
  ListingPoliciesSection,
  ListingLocationSection,
  RenewListingModal,
  isRenewEligible,
} from '../../../listings/index.js';
import { useAdminListingDetailQuery } from '../../queries/useAdminListingDetailQuery.js';
import { useAdminPartnerDetailQuery } from '../../queries/useAdminPartnerDetailQuery.js';
import { useUpdateListingModerationStatusMutation } from '../../mutations/useUpdateListingModerationStatusMutation.js';
import {
  getAllowedModerationActions,
  moderationErrorMessageKey,
} from '../../utils/listingModerationActions.js';
import LocalizedContentPanel from './LocalizedContentPanel.jsx';
import BookableUnitsPanel from './BookableUnitsPanel.jsx';
import ModerationHistoryPanel from './ModerationHistoryPanel.jsx';

// Confirm-modal actions (no reason collected) — `kind` -> i18n key suffixes.
// Identical shape to `AdminListingModerationPageContent.jsx`'s own copy
// tables — kept as a sibling constant rather than a third shared module
// since neither page imports the other's presentation config, only the
// pure decision/error-mapping logic (`utils/listingModerationActions.js`).
const CONFIRM_ACTION_COPY = {
  approve: {
    titleKey: 'approveConfirmTitle',
    descriptionKey: 'approveConfirmDescription',
    labelKey: 'approveAction',
    successKey: 'approveSuccess',
    variant: 'primary',
  },
  flag: {
    titleKey: 'flagConfirmTitle',
    descriptionKey: 'flagConfirmDescription',
    labelKey: 'flagAction',
    successKey: 'flagSuccess',
    variant: 'destructive',
  },
};

// Reason-dialog actions (a non-empty reason is required) — same shape.
const REASON_ACTION_COPY = {
  returnForChanges: {
    titleKey: 'returnForChangesDialogTitle',
    descriptionKey: 'returnForChangesDialogDescription',
    labelKey: 'returnForChangesAction',
    successKey: 'returnForChangesSuccess',
  },
  reject: {
    titleKey: 'rejectDialogTitle',
    descriptionKey: 'rejectDialogDescription',
    labelKey: 'rejectAction',
    successKey: 'rejectSuccess',
  },
};

const MODERATION_BADGE_VARIANT = {
  PENDING: 'warning',
  APPROVED: 'success',
  REJECTED: 'danger',
  FLAGGED: 'danger',
};

const SECTION_ATTRIBUTES = 'attributes';
const SECTION_AMENITIES = 'amenities';
const SECTION_POLICIES = 'policies';
const SECTION_LOCATION = 'location';

function toGalleryMedia(media) {
  return (media ?? [])
    .filter(
      (item) => item.media_type === 'IMAGE' || item.media_type === 'VIDEO',
    )
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((item) => ({
      id: item.id,
      url: item.url,
      mediaType: item.media_type,
      alt: item.alt_text ?? '',
    }));
}

export default function AdminListingDetailContent() {
  const { t, i18n } = useTranslation();
  const { locale, id } = useParams();
  const { permissions } = useAuth();
  const confirm = useConfirm();
  const { showToast } = useToast();
  const canModerate = permissions.includes('listing.moderate');
  const canViewHistory = permissions.includes('audit.view');
  // Step B8 — Admin Renew reuses the exact same `listing.publish`
  // permission gate `publishListingSchema`/`ListingService#renewListing`
  // already require server-side (Admin/Super Admin hold it via the
  // seeded role catalog), so no new permission key is introduced here.
  const canRenew = permissions.includes('listing.publish');

  const listingQuery = useAdminListingDetailQuery(id);
  const listing = listingQuery.data;
  const [reviewLocale, setReviewLocale] = useState(locale);
  const [isRenewOpen, setIsRenewOpen] = useState(false);

  const partnerQuery = useAdminPartnerDetailQuery(listing?.partner_id);
  const categoryId = listing?.category_ids?.[0];
  const metadataQuery = useListingMetadataQuery(categoryId, locale);
  const categoriesQuery = useListingCategoriesQuery(locale);
  const category = (categoriesQuery.data ?? []).find(
    (candidate) => candidate.id === categoryId,
  );
  const metadata = metadataQuery.data;

  const updateModerationMutation = useUpdateListingModerationStatusMutation();
  const [reasonDialogDecision, setReasonDialogDecision] = useState(null);
  const [reasonText, setReasonText] = useState('');
  const [reasonTouched, setReasonTouched] = useState(false);

  const closeReasonDialog = useCallback(
    () => setReasonDialogDecision(null),
    [],
  );
  const closeRenewDialog = useCallback(() => setIsRenewOpen(false), []);

  const dateFormatter = useMemo(
    () => new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' }),
    [i18n.language],
  );
  const formatLifecycleDate = (value) =>
    value
      ? dateFormatter.format(new Date(value))
      : t('admin.listingDetail.lifecycle.notSet');

  function handleRenewed() {
    showToast(t('partner.listings.renew.success'), { variant: 'success' });
  }

  if (listingQuery.isError) {
    return (
      <Section spacing="default">
        <ErrorState
          title={t('admin.listingModeration.error.title')}
          retryLabel={t('admin.listingModeration.error.retry')}
          onRetry={listingQuery.refetch}
        />
      </Section>
    );
  }

  // Page title/breadcrumb only — orientation for the admin, not a claim
  // about what's persisted in any one locale, so the fallback-safe
  // helper is correct here (never a blank page title). The Localized
  // content section below reviews each locale independently and does
  // NOT use this fallback.
  const translation = listing
    ? getLocalizedTranslation(listing.translations, locale)
    : null;
  const title = translation?.title ?? listing?.slug ?? '';

  const completionByLocale = Object.fromEntries(
    SUPPORTED_LOCALES.map((code) => [
      code,
      Boolean(
        listing?.translations?.some(
          (row) => row.language_code === code && row.title,
        ),
      ),
    ]),
  );

  async function runModerationMutation(status, notes) {
    try {
      await updateModerationMutation.mutateAsync({
        id: listing.id,
        status,
        notes,
      });
      return true;
    } catch (err) {
      showToast(t(moderationErrorMessageKey(err)), { variant: 'danger' });
      return false;
    }
  }

  async function handleConfirmAction(decision) {
    const copy = CONFIRM_ACTION_COPY[decision.kind];
    const confirmed = await confirm({
      title: t(`admin.listingModeration.${copy.titleKey}`, { title }),
      description: t(`admin.listingModeration.${copy.descriptionKey}`),
      confirmLabel: t(`admin.listingModeration.${copy.labelKey}`),
      cancelLabel: t('common.cancel'),
      variant: copy.variant,
    });
    if (!confirmed) return;

    const ok = await runModerationMutation(decision.status);
    if (ok) {
      showToast(t(`admin.listingModeration.${copy.successKey}`), {
        variant: 'success',
      });
    }
  }

  function openReasonDialog(decision) {
    setReasonText('');
    setReasonTouched(false);
    setReasonDialogDecision(decision);
  }

  const trimmedReason = reasonText.trim();
  const reasonIsInvalid = reasonTouched && trimmedReason.length === 0;

  async function handleConfirmReason() {
    setReasonTouched(true);
    if (!trimmedReason) return;

    const copy = REASON_ACTION_COPY[reasonDialogDecision.kind];
    const ok = await runModerationMutation(
      reasonDialogDecision.status,
      trimmedReason,
    );
    if (ok) {
      showToast(t(`admin.listingModeration.${copy.successKey}`), {
        variant: 'success',
      });
      setReasonDialogDecision(null);
    }
  }

  function handleAction(decision) {
    if (decision.requiresReason) {
      openReasonDialog(decision);
    } else {
      handleConfirmAction(decision);
    }
  }

  const allowedActions = listing ? getAllowedModerationActions(listing) : [];

  const galleryMedia = listing ? toGalleryMedia(listing.media) : [];

  return (
    <Section spacing="default">
      <PageHeader
        title={listing ? title : t('admin.listingDetail.loading')}
        breadcrumbs={[
          { label: t('nav.home'), href: `/${locale}` },
          { label: t('admin.nav.dashboard'), href: `/${locale}/admin` },
          {
            label: t('admin.listingModeration.heading'),
            href: `/${locale}/admin/listings`,
          },
        ]}
      />

      {listingQuery.isPending ? (
        <Skeleton variant="text" width="60%" />
      ) : (
        <Stack gap="6">
          <Card as="div" padding="lg">
            <Stack gap="3">
              <Inline justify="space-between" align="center" wrap>
                <Stack gap="1">
                  <strong>{title}</strong>
                  <span>
                    {t('admin.listingDetail.typeLabel')}:{' '}
                    {t(`listings.type.${listing.listing_type}`, {
                      defaultValue: listing.listing_type,
                    })}
                    {category ? ` · ${category.name}` : ''}
                  </span>
                  <span>
                    {t('admin.listingDetail.slugLabel')}: {listing.slug}
                  </span>
                </Stack>
                <Inline gap="3" align="center" wrap>
                  <ListingStatusBadge status={listing.status} />
                  <Badge
                    variant={
                      MODERATION_BADGE_VARIANT[listing.moderation_status] ??
                      'neutral'
                    }
                    label={t(
                      `admin.listingModeration.moderationStatus.${listing.moderation_status}`,
                      { defaultValue: listing.moderation_status },
                    )}
                  />
                </Inline>
              </Inline>

              {listing.moderation_notes && (
                <Card padding="md">
                  <Stack gap="1">
                    <strong>
                      {t('admin.listingDetail.moderationNotesLabel')}
                    </strong>
                    <span>{listing.moderation_notes}</span>
                  </Stack>
                </Card>
              )}

              {canModerate && allowedActions.length > 0 && (
                <Inline gap="2" wrap>
                  {allowedActions.map((decision) => {
                    const copy =
                      CONFIRM_ACTION_COPY[decision.kind] ??
                      REASON_ACTION_COPY[decision.kind];
                    return (
                      <Button
                        key={decision.status}
                        variant={
                          decision.kind === 'approve'
                            ? 'primary'
                            : 'destructive'
                        }
                        size="sm"
                        onClick={() => handleAction(decision)}
                        disabled={updateModerationMutation.isPending}
                        loading={
                          updateModerationMutation.isPending &&
                          updateModerationMutation.variables?.status ===
                            decision.status
                        }
                      >
                        {t(`admin.listingModeration.${copy.labelKey}`)}
                      </Button>
                    );
                  })}
                </Inline>
              )}

              {canViewHistory && (
                <ModerationHistoryPanel listingId={listing.id} />
              )}
            </Stack>
          </Card>

          {listing.publication_period_days != null && (
            <Card as="div" padding="lg">
              <Stack gap="3">
                <Inline justify="space-between" align="center" wrap>
                  <h2>{t('admin.listingDetail.sections.lifecycle')}</h2>
                  {canRenew && isRenewEligible(listing) && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setIsRenewOpen(true)}
                    >
                      {t('admin.listingDetail.lifecycle.renewAction')}
                    </Button>
                  )}
                </Inline>
                <Stack gap="1">
                  <span>
                    {t('admin.listingDetail.lifecycle.publicationPeriodLabel')}:{' '}
                    {t('partner.listingWizard.publicationPeriod.dayCount', {
                      count: listing.publication_period_days,
                    })}
                  </span>
                  <span>
                    {t('admin.listingDetail.lifecycle.publishedLabel')}:{' '}
                    {formatLifecycleDate(listing.published_at)}
                  </span>
                  <span>
                    {t('admin.listingDetail.lifecycle.expiresLabel')}:{' '}
                    {formatLifecycleDate(listing.expires_at)}
                  </span>
                  <span>
                    {t('admin.listingDetail.lifecycle.renewedLabel')}:{' '}
                    {formatLifecycleDate(listing.renewed_at)}
                  </span>
                  <span>
                    {t('admin.listingDetail.lifecycle.frozenLabel')}:{' '}
                    {formatLifecycleDate(listing.frozen_at)}
                  </span>
                  <span>
                    {t('admin.listingDetail.lifecycle.retainedUntilLabel')}:{' '}
                    {formatLifecycleDate(listing.purge_after)}
                  </span>
                </Stack>
              </Stack>
            </Card>
          )}

          <Card as="div" padding="lg">
            <Stack gap="2">
              <h2>{t('admin.listingDetail.partner.heading')}</h2>
              {partnerQuery.isPending && (
                <Skeleton variant="text" width="70%" />
              )}
              {partnerQuery.isError && (
                <span>{t('admin.listingDetail.partner.error')}</span>
              )}
              {partnerQuery.data && (
                <Stack gap="1">
                  <RouterLink
                    href={`/${locale}/admin/partners/${partnerQuery.data.id}`}
                  >
                    {partnerQuery.data.display_name}
                  </RouterLink>
                  <span>{partnerQuery.data.email ?? '—'}</span>
                </Stack>
              )}
            </Stack>
          </Card>

          {galleryMedia.length > 0 && (
            <Card as="div" padding="lg">
              <Stack gap="2">
                <h2>{t('pages.listingDetail.gallery.heading')}</h2>
                <Gallery
                  media={galleryMedia}
                  viewImageLabel={t('pages.listingDetail.gallery.viewPhoto')}
                  viewAllLabel={(count) =>
                    t('pages.listingDetail.gallery.morePhotos', { count })
                  }
                  closeLabel={t('pages.listingDetail.gallery.closeLightbox')}
                  previousLabel={t('pages.listingDetail.gallery.previousImage')}
                  nextLabel={t('pages.listingDetail.gallery.nextImage')}
                />
              </Stack>
            </Card>
          )}

          <Card as="div" padding="lg">
            <Stack gap="4">
              <h2>{t('admin.listingDetail.sections.localizedContent')}</h2>
              <AuthoringLocaleTabs
                activeLocale={reviewLocale}
                onChange={setReviewLocale}
                completionByLocale={completionByLocale}
                ariaLabel={t(
                  'admin.listingDetail.localizedContent.tabsAriaLabel',
                )}
              >
                <LocalizedContentPanel
                  listing={listing}
                  reviewLocale={reviewLocale}
                />
              </AuthoringLocaleTabs>
            </Stack>
          </Card>

          <Stack gap="4">
            <h2>{t('admin.listingDetail.sections.details')}</h2>
            {metadataQuery.isPending && <Skeleton variant="text" width="80%" />}

            {/* Each section already honestly renders nothing if it has no
                real match against the listing's own data (e.g. amenity
                ids that don't overlap the category's current amenity
                groups) — these presence checks only avoid an empty padded
                card in the common case, not a guarantee. */}
            {metadata && listing.attribute_values?.length > 0 && (
              <Card as="div" padding="lg">
                <ListingAttributesSection
                  attributes={metadata.attributes}
                  listing={listing}
                  sectionId={SECTION_ATTRIBUTES}
                />
              </Card>
            )}
            {metadata && listing.amenity_ids?.length > 0 && (
              <Card as="div" padding="lg">
                <ListingAmenitiesSection
                  amenityGroups={metadata.amenity_groups}
                  amenityIds={listing.amenity_ids}
                  sectionId={SECTION_AMENITIES}
                />
              </Card>
            )}
            {metadata && listing.policy_values?.length > 0 && (
              <Card as="div" padding="lg">
                <ListingPoliciesSection
                  policies={metadata.policies}
                  listing={listing}
                  sectionId={SECTION_POLICIES}
                />
              </Card>
            )}
          </Stack>

          <Card as="div" padding="lg">
            <Stack gap="4">
              <Inline justify="space-between" align="center" wrap>
                <h2>{t('admin.listingDetail.sections.commercial')}</h2>
                <Inline gap="3" wrap>
                  {permissions.includes('inventory.view_all') && (
                    <RouterLink
                      href={`/${locale}/admin/inventory?listingId=${listing.id}`}
                    >
                      {t('admin.listingDetail.viewInventoryAction')}
                    </RouterLink>
                  )}
                  {/* Sprint E (Promotion Engine) — Admin-only surface (route-gated on the promotions page itself), so no extra permission check is needed here beyond the page-level ADMIN/SUPER_ADMIN role guard every other admin route already applies. */}
                  <RouterLink
                    href={`/${locale}/admin/promotions?listingId=${listing.id}`}
                  >
                    {t('admin.listingDetail.managePromotionAction')}
                  </RouterLink>
                </Inline>
              </Inline>
              <Stack gap="2">
                <h3>{t('admin.listingDetail.pricing.heading')}</h3>
                {listing.pricing ? (
                  <PriceTag
                    amount={listing.pricing.amount}
                    currencyCode={listing.pricing.currency}
                    locale={i18n.language}
                    suffix={t(
                      `partner.listingWizard.pricingModels.${listing.pricing.pricing_model}`,
                      { defaultValue: listing.pricing.pricing_model },
                    )}
                  />
                ) : (
                  <EmptyState title={t('admin.listingDetail.pricing.empty')} />
                )}
              </Stack>
              <BookableUnitsPanel listingId={listing.id} />
            </Stack>
          </Card>

          {listing.location && (
            <Card as="div" padding="lg">
              <ListingLocationSection
                location={listing.location}
                title={title}
                sectionId={SECTION_LOCATION}
              />
            </Card>
          )}
        </Stack>
      )}

      {reasonDialogDecision && (
        <Modal
          isOpen
          onClose={closeReasonDialog}
          title={t(
            `admin.listingModeration.${REASON_ACTION_COPY[reasonDialogDecision.kind].titleKey}`,
            { title },
          )}
          size="sm"
          footer={
            <Inline gap="3" justify="flex-end">
              <Button variant="ghost" onClick={closeReasonDialog}>
                {t('common.cancel')}
              </Button>
              <Button
                variant="destructive"
                onClick={() => handleConfirmReason()}
                loading={updateModerationMutation.isPending}
                disabled={reasonTouched && trimmedReason.length === 0}
              >
                {t(
                  `admin.listingModeration.${REASON_ACTION_COPY[reasonDialogDecision.kind].labelKey}`,
                )}
              </Button>
            </Inline>
          }
        >
          <Stack gap="3">
            <span>
              {t(
                `admin.listingModeration.${REASON_ACTION_COPY[reasonDialogDecision.kind].descriptionKey}`,
              )}
            </span>
            <Textarea
              label={t('admin.listingModeration.reasonLabel')}
              placeholder={t('admin.listingModeration.reasonPlaceholder')}
              value={reasonText}
              onChange={(event) => setReasonText(event.target.value)}
              onBlur={() => setReasonTouched(true)}
              rows={4}
              required
              error={
                reasonIsInvalid
                  ? t('admin.listingModeration.reasonRequiredHint')
                  : undefined
              }
            />
          </Stack>
        </Modal>
      )}

      {isRenewOpen && (
        <RenewListingModal
          isOpen
          listing={listing}
          onClose={closeRenewDialog}
          onRenewed={() => handleRenewed()}
        />
      )}
    </Section>
  );
}
