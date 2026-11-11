/**
 * DashboardOverviewContent — `/:locale/account` (Customer Dashboard).
 * Reuses `bookings`'s `useMyBookingsQuery`/`BookingCard` entirely rather
 * than standing up a second bookings data path — this is the same "My
 * Trips" first page `BookingsPageContent` shows, just sliced/grouped
 * differently for an overview.
 *
 * KNOWN LIMITATION (unchanged from before the 2026 redesign): quick
 * stats and "upcoming" are derived from the single most-recent page of
 * bookings (`MY_BOOKINGS_LIMIT`, currently 10), not a true lifetime
 * aggregate — there is no `GET /bookings` summary/count endpoint. The
 * favorites teaser below inherits the identical "first page only, no
 * total-count endpoint" limitation from `useFavoritesQuery`.
 *
 * 2026 Customer Account redesign: an editorial, asymmetrical composition
 * (brief: "a user's next trip should be the visual focus") replaces the
 * previous grid-of-three-identical-`StatCard`s + two look-alike panels
 * layout. `NextTripPanel` gives the single soonest upcoming booking a
 * hero treatment; any further upcoming trips + recent activity sit in a
 * calmer secondary list. All of it reads from data this component (or a
 * sibling module already exporting the query) already had — no new
 * backend surface.
 */

import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { useParams, useNavigate } from 'react-router-dom';
import { Section, Stack, Inline } from '@desavii/ui/components/layout';
import { Card } from '@desavii/ui/components/primitives';
import {
  Skeleton,
  EmptyState,
  ErrorState,
} from '@desavii/ui/components/feedback-overlays';
import { Heart, MessageCircle, Bell, Sparkles } from 'lucide-react';
import PageHeader from '../../../../components/PageHeader/PageHeader.jsx';
import RouterLink from '../../../../components/RouterLink.jsx';
import { useAuth } from '../../../../contexts/AuthContext.jsx';
import { useMyBookingsQuery, BookingCard } from '../../../bookings/index.js';
import { toISODate } from '../../../listings/utils/reservationEstimate.js';
import { RecommendationsSection } from '../../../ai/index.js';
import {
  FavoriteListingCard,
  useFavoritesQuery,
} from '../../../favorites/index.js';
import { useUnreadCountQuery } from '../../../notifications/index.js';
import { useUnreadConversationCountQuery } from '../../../messaging/index.js';
import NextTripPanel from '../NextTripPanel/NextTripPanel.jsx';
import styles from './DashboardOverviewContent.module.scss';

const ACTIVE_STATUSES = ['PENDING_VENDOR', 'CONFIRMED'];
const SECTION_LIMIT = 4;
const FAVORITES_TEASER_LIMIT = 3;

function BookingCardListSkeleton({ count }) {
  return (
    <Stack gap="3">
      {Array.from({ length: count }, (_, index) => (
        // eslint-disable-next-line react/no-array-index-key
        <Skeleton key={index} variant="rect" height={104} />
      ))}
    </Stack>
  );
}

BookingCardListSkeleton.propTypes = {
  count: PropTypes.number.isRequired,
};

export default function DashboardOverviewContent() {
  const { t } = useTranslation();
  const { locale } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data, isPending, isError, refetch } = useMyBookingsQuery();
  const { data: favoritesData } = useFavoritesQuery();
  const { data: unreadNotificationsCount } = useUnreadCountQuery();
  const { data: unreadMessagesCount } = useUnreadConversationCountQuery();

  const recentBookings = data?.pages?.[0]?.results ?? [];
  const hasAnyBookings = recentBookings.length > 0;

  const today = toISODate(new Date());
  const upcomingBookings = recentBookings
    .filter(
      (booking) =>
        ACTIVE_STATUSES.includes(booking.status) &&
        booking.date_from &&
        booking.date_from >= today,
    )
    .sort((a, b) => a.date_from.localeCompare(b.date_from));
  const [nextTrip, ...restUpcoming] = upcomingBookings;

  const favorites = favoritesData?.pages?.[0]?.results ?? [];

  const quickLinks = [
    {
      id: 'favorites',
      icon: Heart,
      label: t('account.nav.favorites'),
      count: favorites.length,
      href: `/${locale}/account/favorites`,
    },
    {
      id: 'messages',
      icon: MessageCircle,
      label: t('account.nav.messages'),
      count: unreadMessagesCount ?? 0,
      href: `/${locale}/account/messages`,
    },
    {
      id: 'notifications',
      icon: Bell,
      label: t('account.nav.notifications'),
      count: unreadNotificationsCount ?? 0,
      href: `/${locale}/account/notifications`,
    },
  ];

  return (
    <Section spacing="default">
      <PageHeader title={t('dashboard.greeting', { name: user.first_name })} />

      {isError ? (
        <ErrorState
          title={t('dashboard.error.title')}
          retryLabel={t('dashboard.error.retry')}
          onRetry={refetch}
        />
      ) : (
        <Stack gap="8">
          <Inline gap="3" wrap className={styles.quickLinks}>
            {quickLinks.map(({ id, icon: LinkIcon, label, count, href }) => (
              <RouterLink key={id} href={href} className={styles.quickLink}>
                <LinkIcon
                  className={styles.quickLinkIcon}
                  aria-hidden="true"
                  focusable="false"
                />
                <span>{label}</span>
                {count > 0 && (
                  <span className={styles.quickLinkCount}>{count}</span>
                )}
              </RouterLink>
            ))}
          </Inline>

          {isPending && <Skeleton variant="rect" height={340} />}

          {!isPending && nextTrip && <NextTripPanel booking={nextTrip} />}

          {!isPending && !nextTrip && (
            <Card as="div" padding="lg" elevated>
              <EmptyState
                title={t('dashboard.upcoming.emptyTitle')}
                description={t('dashboard.upcoming.emptyDescription')}
              />
            </Card>
          )}

          {!isPending && restUpcoming.length > 0 && (
            <Stack gap="3" as="div">
              <h2 className={styles.sectionHeading}>
                {t('dashboard.upcoming.heading')}
              </h2>
              <Stack gap="3">
                {restUpcoming.slice(0, SECTION_LIMIT).map((booking) => (
                  <BookingCard
                    key={booking.id}
                    booking={booking}
                    variant="premium"
                  />
                ))}
              </Stack>
            </Stack>
          )}

          <Card as="div" padding="lg">
            <Stack gap="3">
              <Inline justify="space-between" align="center">
                <h2 className={styles.sectionHeading}>
                  {t('dashboard.recent.heading')}
                </h2>
                {hasAnyBookings && (
                  <RouterLink href={`/${locale}/account/bookings`}>
                    {t('dashboard.recent.viewAll')}
                  </RouterLink>
                )}
              </Inline>
              {isPending && <BookingCardListSkeleton count={3} />}
              {!isPending && !hasAnyBookings && (
                <EmptyState
                  title={t('dashboard.recent.emptyTitle')}
                  description={t('dashboard.recent.emptyDescription')}
                  actionLabel={t('dashboard.recent.emptyAction')}
                  onAction={() => navigate(`/${locale}/search`)}
                />
              )}
              {!isPending && hasAnyBookings && (
                <Stack gap="3">
                  {recentBookings.slice(0, SECTION_LIMIT).map((booking) => (
                    <BookingCard
                      key={booking.id}
                      booking={booking}
                      variant="premium"
                    />
                  ))}
                </Stack>
              )}
            </Stack>
          </Card>

          {favorites.length > 0 && (
            <Stack gap="3" as="div">
              <Inline justify="space-between" align="center">
                <h2 className={styles.sectionHeading}>
                  {t('favorites.page.heading')}
                </h2>
                <RouterLink href={`/${locale}/account/favorites`}>
                  {t('dashboard.favorites.viewAll')}
                </RouterLink>
              </Inline>
              <div className={styles.favoritesTeaser}>
                {favorites.slice(0, FAVORITES_TEASER_LIMIT).map((favorite) => (
                  <FavoriteListingCard
                    key={favorite.favorite_id}
                    favorite={favorite}
                  />
                ))}
              </div>
            </Stack>
          )}

          <Card
            as={RouterLink}
            href={`/${locale}/account/trip-planner`}
            padding="lg"
            interactive
            className={styles.tripPlannerCta}
          >
            <Inline gap="4" align="center" justify="space-between" wrap>
              <Inline gap="3" align="center">
                <span className={styles.tripPlannerIcon} aria-hidden="true">
                  <Sparkles focusable="false" />
                </span>
                <Stack gap="1" as="div">
                  <h2 className={styles.sectionHeading}>
                    {t('account.nav.tripPlanner')}
                  </h2>
                  <p className={styles.tripPlannerDescription}>
                    {t('ai.tripPlanner.description')}
                  </p>
                </Stack>
              </Inline>
              <span className={styles.tripPlannerAction}>
                {t('ai.tripPlanner.form.submit')}
              </span>
            </Inline>
          </Card>

          <RecommendationsSection />
        </Stack>
      )}
    </Section>
  );
}
