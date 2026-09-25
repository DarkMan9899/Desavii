/**
 * PartnerDashboardOverviewContent — `/:locale/partner` (Partner
 * Dashboard). Replaces the Phase 5-era `UnderConstructionPage` placeholder
 * `PartnerDashboardContent` rendered — this IS that component's real
 * body, once a real partner-membership context exists to scope data by
 * (`usePartnerContext`, Phase 9).
 *
 * Reuses `bookings`'s `BookingCard` (via its new `hrefBase` prop, pointed
 * at `partner/bookings` instead of the customer `account/bookings`
 * default) and `listings`'s `ListingStatusBadge`/`useMyListingsQuery`
 * rather than standing up parallel display components — same "reuse the
 * existing data/UI layer" approach `profile`'s customer
 * `DashboardOverviewContent` already established.
 *
 * KNOWN LIMITATION (mirrors `DashboardOverviewContent`'s own, same
 * reasoning): quick stats and "recent"/"upcoming" are derived from the
 * single most-recent page of listings/bookings, not a true lifetime
 * aggregate — there is no summary/count endpoint for either resource. A
 * partner with more than one page of listings or bookings may have
 * older active listings or upcoming bookings this view doesn't surface.
 *
 * "Bookings"/"Listings" sections are each wrapped in the shared `Card`
 * primitive (Phase 10 redesign) as a widget panel — visual grouping
 * only, matching the customer `DashboardOverviewContent` treatment.
 */

import { useTranslation } from 'react-i18next';
import { useParams, useNavigate } from 'react-router-dom';
import { CalendarCheck, ListChecks } from 'lucide-react';
import { Section, Stack, Grid, Inline } from '@desavii/ui/components/layout';
import { StatCard, ListingTableRow } from '@desavii/ui/components/dashboard';
import { Badge, Card } from '@desavii/ui/components/primitives';
import {
  Skeleton,
  EmptyState,
  ErrorState,
} from '@desavii/ui/components/feedback-overlays';
import PageHeader from '../../../../components/PageHeader/PageHeader.jsx';
import styles from './PartnerDashboardOverviewContent.module.scss';
import RouterLink from '../../../../components/RouterLink.jsx';
import { usePartnerContext } from '../../../../contexts/PartnerContext.jsx';
import {
  useMyListingsQuery,
  ListingStatusBadge,
} from '../../../listings/index.js';
import {
  usePartnerBookingsQuery,
  BookingCard,
} from '../../../bookings/index.js';
import { toISODate } from '../../../listings/utils/reservationEstimate.js';
import { AskAiButton } from '../../../ai/index.js';
import { PartnerPayableBalanceCard } from '../../../payments/index.js';

const ACTIVE_BOOKING_STATUSES = ['PENDING_VENDOR', 'CONFIRMED'];
const SECTION_LIMIT = 5;

// Card-wrapped (padding="none") to match `BookingCard`'s own frame —
// a bare rect `Skeleton` has no radius/elevation/border and visibly
// "pops" once the real Card-based rows load in.
function BookingRowListSkeleton() {
  return (
    <Stack gap="3">
      {Array.from({ length: 3 }, (_, index) => (
        // eslint-disable-next-line react/no-array-index-key
        <Card key={index} as="div" padding="none">
          <Skeleton variant="rect" height={104} />
        </Card>
      ))}
    </Stack>
  );
}

// `ListingTableRow`'s own `isLoading` state already renders a
// Card-shaped skeleton matching the real row's frame exactly.
function ListingRowListSkeleton() {
  return (
    <Stack gap="3">
      {Array.from({ length: 3 }, (_, index) => (
        // eslint-disable-next-line react/no-array-index-key
        <ListingTableRow key={index} isLoading title="" />
      ))}
    </Stack>
  );
}

export default function PartnerDashboardOverviewContent() {
  const { t, i18n } = useTranslation();
  const { locale } = useParams();
  const navigate = useNavigate();
  const { activePartnerId, activePartner } = usePartnerContext();

  const listingsQuery = useMyListingsQuery({ partnerId: activePartnerId });
  const bookingsQuery = usePartnerBookingsQuery({ partnerId: activePartnerId });

  const isPending = listingsQuery.isPending || bookingsQuery.isPending;
  const isError = listingsQuery.isError || bookingsQuery.isError;

  const listings = listingsQuery.data?.pages?.[0]?.results ?? [];
  const bookings = bookingsQuery.data?.pages?.[0]?.results ?? [];

  const activeListings = listings.filter(
    (listing) => listing.status === 'PUBLISHED',
  );
  const draftListings = listings.filter(
    (listing) => listing.status === 'DRAFT',
  );
  const displayedListings = [...activeListings, ...draftListings].slice(
    0,
    SECTION_LIMIT,
  );

  const today = toISODate(new Date());
  const upcomingBookings = bookings
    .filter(
      (booking) =>
        ACTIVE_BOOKING_STATUSES.includes(booking.status) &&
        booking.date_from &&
        booking.date_from >= today,
    )
    .sort((a, b) => a.date_from.localeCompare(b.date_from));
  const pendingCount = bookings.filter(
    (booking) => booking.status === 'PENDING_VENDOR',
  ).length;

  return (
    <Section spacing="default">
      <PageHeader
        title={t('partner.dashboard.greeting', {
          name: activePartner?.display_name ?? '',
        })}
        actions={
          <AskAiButton
            label={t('ai.contextButtons.optimizeDashboard')}
            initialMessage={t(
              'ai.contextButtons.optimizeDashboardInitialMessage',
            )}
            variant="ghost"
            size="sm"
          />
        }
      />

      {isError ? (
        <ErrorState
          title={t('partner.dashboard.error.title')}
          retryLabel={t('partner.dashboard.error.retry')}
          onRetry={() => {
            listingsQuery.refetch();
            bookingsQuery.refetch();
          }}
        />
      ) : (
        <Stack gap="8">
          <Grid columns={4} gap="4">
            <StatCard
              label={t('partner.dashboard.stats.activeListings')}
              value={activeListings.length}
              variant="success"
              isLoading={isPending}
            />
            <StatCard
              label={t('partner.dashboard.stats.draftListings')}
              value={draftListings.length}
              variant="neutral"
              isLoading={isPending}
            />
            <StatCard
              label={t('partner.dashboard.stats.upcomingBookings')}
              value={upcomingBookings.length}
              variant="info"
              isLoading={isPending}
            />
            <StatCard
              label={t('partner.dashboard.stats.pendingConfirmations')}
              value={pendingCount}
              variant="warning"
              isLoading={isPending}
            />
          </Grid>

          <PartnerPayableBalanceCard partnerId={activePartnerId} />

          <Card as="div" padding="lg">
            <Stack gap="3">
              <Inline justify="space-between" align="center">
                <h2 className={styles.panelHeading}>
                  <CalendarCheck aria-hidden="true" focusable="false" />
                  {t('partner.dashboard.bookings.heading')}
                </h2>
                {bookings.length > 0 && (
                  <RouterLink href={`/${locale}/partner/bookings`}>
                    {t('partner.dashboard.bookings.viewAll')}
                  </RouterLink>
                )}
              </Inline>
              {isPending && <BookingRowListSkeleton />}
              {!isPending && upcomingBookings.length === 0 && (
                <EmptyState
                  title={t('partner.dashboard.bookings.emptyTitle')}
                  description={t('partner.dashboard.bookings.emptyDescription')}
                />
              )}
              {!isPending && upcomingBookings.length > 0 && (
                <Stack gap="3">
                  {upcomingBookings.slice(0, SECTION_LIMIT).map((booking) => (
                    <BookingCard
                      key={booking.id}
                      booking={booking}
                      hrefBase="partner/bookings"
                      audience="partner"
                    />
                  ))}
                </Stack>
              )}
            </Stack>
          </Card>

          <Card as="div" padding="lg">
            <Stack gap="3">
              <Inline justify="space-between" align="center">
                <h2 className={styles.panelHeading}>
                  <ListChecks aria-hidden="true" focusable="false" />
                  {t('partner.dashboard.listings.heading')}
                </h2>
                {listings.length > 0 && (
                  <RouterLink href={`/${locale}/partner/listings`}>
                    {t('partner.dashboard.listings.viewAll')}
                  </RouterLink>
                )}
              </Inline>
              {isPending && <ListingRowListSkeleton />}
              {!isPending && displayedListings.length === 0 && (
                <EmptyState
                  title={t('partner.dashboard.listings.emptyTitle')}
                  description={t('partner.dashboard.listings.emptyDescription')}
                  actionLabel={t('partner.dashboard.listings.emptyAction')}
                  onAction={() => navigate(`/${locale}/partner/listings/new`)}
                />
              )}
              {!isPending && displayedListings.length > 0 && (
                <Stack gap="3">
                  {displayedListings.map((listing) => (
                    <ListingTableRow
                      key={listing.id}
                      as={RouterLink}
                      // Step L1: kept in sync with `PartnerListingsList
                      // .jsx`'s own `onEdit` URL (explicit
                      // `step=basicInfo`) for consistency, though
                      // `ListingTableRow` doesn't currently accept
                      // `as`/`href`/`interactive` at all (pre-existing,
                      // unrelated to this step — this row isn't actually
                      // rendered as a link today).
                      href={`/${locale}/partner/listings/new?listingId=${listing.id}&step=basicInfo`}
                      interactive
                      title={listing.title ?? listing.slug}
                      thumbnailUrl={listing.cover_image_url}
                      typeBadge={
                        <Badge
                          variant="info"
                          size="sm"
                          label={t(`listings.type.${listing.listing_type}`, {
                            defaultValue: listing.listing_type,
                          })}
                        />
                      }
                      statusBadge={
                        <ListingStatusBadge status={listing.status} />
                      }
                      updatedAtLabel={t('partner.dashboard.listings.listedOn', {
                        date: new Intl.DateTimeFormat(i18n.language, {
                          dateStyle: 'medium',
                        }).format(new Date(listing.created_at)),
                      })}
                    />
                  ))}
                </Stack>
              )}
            </Stack>
          </Card>
        </Stack>
      )}
    </Section>
  );
}
