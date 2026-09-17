/**
 * Email copy templates (Phase 13, localized as of P0.3 — Master Roadmap).
 *
 * Every other user-facing string in this codebase is rendered
 * client-side via i18n (Phase 4.2's "i18n owns all labels" rule), but
 * email has to be rendered server-side (there is no client involved).
 * This app still has no general-purpose server-side i18n renderer —
 * building one is out of scope here — so these templates are a plain,
 * hand-maintained EN/HY/RU dictionary, not routed through the
 * client-side i18next instance. `NotificationDeliveryService` resolves
 * the recipient's locale from `users.preferred_language_id`
 * (`languageRepository.findLanguageCodeById`, defaulting to the
 * server's default language) and passes it through to `renderEmail`.
 *
 * `admin.announcement` is intentionally NOT per-locale — its
 * title/body come directly from whatever an admin actually typed, in
 * whatever language they chose; there's nothing here to translate.
 *
 * P2.2E: `payment.succeeded`/`payment.failed`/`refund.succeeded` had no
 * entries here at all — every real send for these three events fell
 * through to `renderEmail`'s own generic fallback below and put a raw,
 * un-localized `JSON.stringify` of the event payload straight into a
 * real customer's inbox. `bookingUrl` reuses `config.webAppUrl` exactly
 * the way `partnerStaffService.js`'s `inviteUrl` already does — the one
 * existing "safe canonical application URL" pattern in this codebase,
 * not a newly invented one. It always points at the CUSTOMER booking
 * route: `payment.failed`/`refund.succeeded` are only ever sent to the
 * customer (`notificationListener.js`), and `payment.succeeded` also
 * reaches the partner owner — for them this is a real, working link
 * (the same `booking.view_all`-style ownership check `GET /bookings/:id`
 * already grants a partner owner passes regardless of which route
 * fetched it), just without their partner-only action buttons, not a
 * broken/wrong-audience link. These templates only have `bookingId`
 * (a raw FK) on the payload, never `bookingReference` — payment/refund
 * domain events never carry it (see `paymentService.js`'s own event
 * payload) — so the link IS the human-readable identifier here, exactly
 * matching this task's own "prefer a booking link" guidance rather than
 * inventing a fetch this module doesn't otherwise need.
 */

import config from '../../../config/index.js';

const DEFAULT_LOCALE = 'en';

function bookingUrl(locale, bookingId) {
  if (!bookingId) return null;
  return `${config.webAppUrl}/${locale}/account/bookings/${bookingId}`;
}

// Step B6 — there is no per-listing Partner detail/edit route in this
// codebase yet (`PartnerListingsList.jsx` is the one management surface;
// editing happens inline from its own row actions, never a dedicated
// `/partner/listings/:id` page), so this deliberately links to the LIST
// page rather than fabricating a deep link that would 404. The Renew
// action the reminder is about lives directly on that page.
function partnerListingsUrl(locale) {
  return `${config.webAppUrl}/${locale}/partner/listings`;
}

// `expiresAt` arrives here as whatever `JSON.parse` produced from the
// notification row's stored payload — an ISO string, never a `Date`
// instance (the domain event that carried it was JSON-serialized on the
// way into `notifications.payload`). A calendar date, not a date+time —
// this app has no per-recipient timezone to render a precise instant in.
function formatExpiryDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

const TEMPLATES = {
  'booking.created': {
    en: ({ bookingReference }) => ({
      subject: 'Booking received',
      body: `Your booking ${bookingReference ?? ''} has been received and is awaiting vendor confirmation.`,
    }),
    hy: ({ bookingReference }) => ({
      subject: 'Ամրագրումն ստացվել է',
      body: `Ձեր ${bookingReference ?? ''} ամրագրումն ստացվել է և սպասում է կազմակերպչի հաստատմանը:`,
    }),
    ru: ({ bookingReference }) => ({
      subject: 'Бронирование получено',
      body: `Ваше бронирование ${bookingReference ?? ''} получено и ожидает подтверждения от поставщика услуг.`,
    }),
  },
  'booking.confirmed': {
    en: ({ bookingReference }) => ({
      subject: 'Booking confirmed',
      body: `Your booking ${bookingReference ?? ''} has been confirmed.`,
    }),
    hy: ({ bookingReference }) => ({
      subject: 'Ամրագրումը հաստատվել է',
      body: `Ձեր ${bookingReference ?? ''} ամրագրումը հաստատվել է:`,
    }),
    ru: ({ bookingReference }) => ({
      subject: 'Бронирование подтверждено',
      body: `Ваше бронирование ${bookingReference ?? ''} подтверждено.`,
    }),
  },
  'booking.rejected': {
    en: ({ bookingReference }) => ({
      subject: 'Booking rejected',
      body: `Your booking ${bookingReference ?? ''} was rejected by the vendor.`,
    }),
    hy: ({ bookingReference }) => ({
      subject: 'Ամրագրումը մերժվել է',
      body: `Ձեր ${bookingReference ?? ''} ամրագրումը մերժվել է կազմակերպչի կողմից:`,
    }),
    ru: ({ bookingReference }) => ({
      subject: 'Бронирование отклонено',
      body: `Ваше бронирование ${bookingReference ?? ''} было отклонено поставщиком услуг.`,
    }),
  },
  'booking.cancelled': {
    en: ({ bookingReference }) => ({
      subject: 'Booking cancelled',
      body: `Your booking ${bookingReference ?? ''} has been cancelled.`,
    }),
    hy: ({ bookingReference }) => ({
      subject: 'Ամրագրումը չեղարկվել է',
      body: `Ձեր ${bookingReference ?? ''} ամրագրումը չեղարկվել է:`,
    }),
    ru: ({ bookingReference }) => ({
      subject: 'Бронирование отменено',
      body: `Ваше бронирование ${bookingReference ?? ''} отменено.`,
    }),
  },
  'booking.completed': {
    en: ({ bookingReference }) => ({
      subject: 'Trip completed',
      body: `Your booking ${bookingReference ?? ''} is complete. We'd love to hear about your stay.`,
    }),
    hy: ({ bookingReference }) => ({
      subject: 'Ուղևորությունն ավարտվել է',
      body: `Ձեր ${bookingReference ?? ''} ամրագրումն ավարտվել է: Մեզ հետաքրքրում է ձեր կարծիքը:`,
    }),
    ru: ({ bookingReference }) => ({
      subject: 'Поездка завершена',
      body: `Ваше бронирование ${bookingReference ?? ''} завершено. Будем рады узнать ваше мнение о поездке.`,
    }),
  },
  'payment.succeeded': {
    en: ({ bookingId, totalAmount, currency }) => ({
      subject: 'Payment received',
      body: `We received a payment of ${totalAmount ?? ''} ${currency ?? ''} for booking #${bookingId ?? ''}.${bookingUrl('en', bookingId) ? ` View the booking: ${bookingUrl('en', bookingId)}` : ''}`,
    }),
    hy: ({ bookingId, totalAmount, currency }) => ({
      subject: 'Վճարումն ստացվել է',
      body: `Մենք ստացել ենք ${totalAmount ?? ''} ${currency ?? ''} վճարում #${bookingId ?? ''} ամրագրման համար:${bookingUrl('hy', bookingId) ? ` Դիտեք ամրագրումը՝ ${bookingUrl('hy', bookingId)}` : ''}`,
    }),
    ru: ({ bookingId, totalAmount, currency }) => ({
      subject: 'Платёж получен',
      body: `Мы получили платёж на сумму ${totalAmount ?? ''} ${currency ?? ''} за бронирование №${bookingId ?? ''}.${bookingUrl('ru', bookingId) ? ` Посмотреть бронирование: ${bookingUrl('ru', bookingId)}` : ''}`,
    }),
  },
  'payment.failed': {
    en: ({ bookingId }) => ({
      subject: 'Payment failed',
      body: `Your payment for booking #${bookingId ?? ''} could not be completed. Please try again.${bookingUrl('en', bookingId) ? ` View the booking: ${bookingUrl('en', bookingId)}` : ''}`,
    }),
    hy: ({ bookingId }) => ({
      subject: 'Վճարումը ձախողվեց',
      body: `Ձեր վճարումը #${bookingId ?? ''} ամրագրման համար չհաջողվեց ավարտել: Խնդրում ենք կրկին փորձել:${bookingUrl('hy', bookingId) ? ` Դիտեք ամրագրումը՝ ${bookingUrl('hy', bookingId)}` : ''}`,
    }),
    ru: ({ bookingId }) => ({
      subject: 'Платёж не прошёл',
      body: `Не удалось выполнить платёж за бронирование №${bookingId ?? ''}. Пожалуйста, попробуйте снова.${bookingUrl('ru', bookingId) ? ` Посмотреть бронирование: ${bookingUrl('ru', bookingId)}` : ''}`,
    }),
  },
  'refund.succeeded': {
    en: ({ bookingId, amount, currency }) => ({
      subject: 'Refund issued',
      body: `A refund of ${amount ?? ''} ${currency ?? ''} has been issued for booking #${bookingId ?? ''}.${bookingUrl('en', bookingId) ? ` View the booking: ${bookingUrl('en', bookingId)}` : ''}`,
    }),
    hy: ({ bookingId, amount, currency }) => ({
      subject: 'Փոխհատուցումն իրականացվել է',
      body: `${amount ?? ''} ${currency ?? ''} փոխհատուցում է իրականացվել #${bookingId ?? ''} ամրագրման համար:${bookingUrl('hy', bookingId) ? ` Դիտեք ամրագրումը՝ ${bookingUrl('hy', bookingId)}` : ''}`,
    }),
    ru: ({ bookingId, amount, currency }) => ({
      subject: 'Возврат средств выполнен',
      body: `Выполнен возврат ${amount ?? ''} ${currency ?? ''} за бронирование №${bookingId ?? ''}.${bookingUrl('ru', bookingId) ? ` Посмотреть бронирование: ${bookingUrl('ru', bookingId)}` : ''}`,
    }),
  },
  'review.submitted': {
    en: ({ listingTitle, rating }) => ({
      subject: 'New review received',
      body: `Your listing "${listingTitle ?? ''}" received a new ${rating ?? '?'}-star review.`,
    }),
    hy: ({ listingTitle, rating }) => ({
      subject: 'Նոր կարծիք է ստացվել',
      body: `Ձեր «${listingTitle ?? ''}» հայտարարությունը ստացել է նոր ${rating ?? '?'}-աստղանի կարծիք:`,
    }),
    ru: ({ listingTitle, rating }) => ({
      subject: 'Получен новый отзыв',
      body: `Ваше объявление «${listingTitle ?? ''}» получило новый отзыв на ${rating ?? '?'} звёзд.`,
    }),
  },
  'favorite.added': {
    en: ({ listingTitle }) => ({
      subject: 'Someone favorited your listing',
      body: `A traveler favorited your listing "${listingTitle ?? ''}".`,
    }),
    hy: ({ listingTitle }) => ({
      subject: 'Ձեր հայտարարությունն ավելացվել է ընտրյալների մեջ',
      body: `Ճանապարհորդը ձեր «${listingTitle ?? ''}» հայտարարությունն ավելացրել է ընտրյալների մեջ:`,
    }),
    ru: ({ listingTitle }) => ({
      subject: 'Ваше объявление добавлено в избранное',
      body: `Путешественник добавил ваше объявление «${listingTitle ?? ''}» в избранное.`,
    }),
  },
  'partner.approved': {
    en: ({ partnerName }) => ({
      subject: 'Partner application approved',
      body: `Congratulations — "${partnerName ?? 'Your partner account'}" has been approved.`,
    }),
    hy: ({ partnerName }) => ({
      subject: 'Գործընկերոջ հայտն հաստատվել է',
      body: `Շնորհավորում ենք․ «${partnerName ?? 'Ձեր գործընկերոջ հաշիվը'}»-ը հաստատվել է:`,
    }),
    ru: ({ partnerName }) => ({
      subject: 'Заявка партнёра одобрена',
      body: `Поздравляем — «${partnerName ?? 'Ваш партнёрский аккаунт'}» одобрено.`,
    }),
  },
  // P1.2 (Master Roadmap) — the two other real review outcomes.
  'partner.rejected': {
    en: ({ partnerName }) => ({
      subject: 'Partner application not approved',
      body: `Your application for "${partnerName ?? 'your business'}" was not approved.`,
    }),
    hy: ({ partnerName }) => ({
      subject: 'Գործընկերոջ հայտը մերժվել է',
      body: `Ձեր «${partnerName ?? 'ձեր բիզնեսի'}» հայտը չի հաստատվել:`,
    }),
    ru: ({ partnerName }) => ({
      subject: 'Заявка партнёра отклонена',
      body: `Ваша заявка на «${partnerName ?? 'ваш бизнес'}» не была одобрена.`,
    }),
  },
  'partner.needs_changes': {
    en: ({ partnerName, reviewNote }) => ({
      subject: 'Changes requested on your partner application',
      body: `Your application for "${partnerName ?? 'your business'}" needs some changes before it can be approved.${reviewNote ? ` Reviewer note: ${reviewNote}` : ''}`,
    }),
    hy: ({ partnerName, reviewNote }) => ({
      subject: 'Ձեր հայտում փոփոխություններ են պահանջվում',
      body: `Ձեր «${partnerName ?? 'ձեր բիզնեսի'}» հայտը հաստատվելուց առաջ պահանջում է որոշ փոփոխություններ:${reviewNote ? ` Գրախոսի նշում. ${reviewNote}` : ''}`,
    }),
    ru: ({ partnerName, reviewNote }) => ({
      subject: 'По вашей заявке партнёра запрошены изменения',
      body: `Ваша заявка на «${partnerName ?? 'ваш бизнес'}» требует изменений перед одобрением.${reviewNote ? ` Комментарий проверяющего: ${reviewNote}` : ''}`,
    }),
  },
  'listing.approved': {
    en: ({ listingTitle }) => ({
      subject: 'Listing approved',
      body: `Your listing "${listingTitle ?? ''}" has been approved and is now live.`,
    }),
    hy: ({ listingTitle }) => ({
      subject: 'Հայտարարությունը հաստատվել է',
      body: `Ձեր «${listingTitle ?? ''}» հայտարարությունը հաստատվել է և այժմ հասանելի է:`,
    }),
    ru: ({ listingTitle }) => ({
      subject: 'Объявление одобрено',
      body: `Ваше объявление «${listingTitle ?? ''}» одобрено и теперь опубликовано.`,
    }),
  },
  'listing.rejected': {
    en: ({ listingTitle, notes }) => ({
      subject: 'Listing rejected',
      body: `Your listing "${listingTitle ?? ''}" was rejected.${notes ? ` Notes: ${notes}` : ''}`,
    }),
    hy: ({ listingTitle, notes }) => ({
      subject: 'Հայտարարությունը մերժվել է',
      body: `Ձեր «${listingTitle ?? ''}» հայտարարությունը մերժվել է:${notes ? ` Նշում. ${notes}` : ''}`,
    }),
    ru: ({ listingTitle, notes }) => ({
      subject: 'Объявление отклонено',
      body: `Ваше объявление «${listingTitle ?? ''}» отклонено.${notes ? ` Примечание: ${notes}` : ''}`,
    }),
  },
  // Listing Lifetime / Renewal, Step B6 — sent once per publication cycle
  // when a listing enters its T-2-day expiry window
  // (`ListingService#runExpirySweep`'s reminder phase). Concise and
  // operational per brief §8: identifies the listing, states the real
  // expiry date, tells the partner how to keep it visible — no fake
  // urgency ("last chance", "act now").
  'listing.expiring_soon': {
    en: ({ listingTitle, expiresAt }) => ({
      subject: 'Your listing expires soon',
      body: `Your listing "${listingTitle ?? ''}" expires on ${formatExpiryDate(expiresAt)}. Renew it to keep it publicly visible: ${partnerListingsUrl('en')}`,
    }),
    hy: ({ listingTitle, expiresAt }) => ({
      subject: 'Ձեր հայտարարության ժամկետը շուտով կավարտվի',
      body: `Ձեր «${listingTitle ?? ''}» հայտարարության հրապարակման ժամկետը լրանում է ${formatExpiryDate(expiresAt)}-ին: Երկարաձգեք այն՝ հրապարակային տեսանելիությունը պահպանելու համար. ${partnerListingsUrl('hy')}`,
    }),
    ru: ({ listingTitle, expiresAt }) => ({
      subject: 'Срок публикации вашего объявления скоро истекает',
      body: `Срок публикации вашего объявления «${listingTitle ?? ''}» истекает ${formatExpiryDate(expiresAt)}. Продлите его, чтобы оно осталось видимым публично: ${partnerListingsUrl('ru')}`,
    }),
  },
  // Same "sent directly via `emailAdapter`, bypassing the notification
  // pipeline" reason as `partner.staff_invited` below: a password-reset
  // request is never authenticated, so there is no `recipientUserId`
  // context to route through the normal event-driven pipeline even when
  // the email genuinely does exist. `resetUrl` is `null` when the
  // account was not found — see `authenticationService.js#requestPasswordReset`'s
  // own comment on why no email is actually sent in that case at all;
  // this branch exists for completeness/type-symmetry, not because it is
  // ever reached with a null URL.
  'auth.password_reset_requested': {
    en: ({ resetUrl }) => ({
      subject: 'Reset your Desavii password',
      body: `We received a request to reset your password. This link expires in 1 hour and can only be used once: ${resetUrl ?? ''}\n\nIf you didn't request this, you can safely ignore this email.`,
    }),
    hy: ({ resetUrl }) => ({
      subject: 'Վերականգնեք ձեր Desavii գաղտնաբառը',
      body: `Մենք ստացել ենք ձեր գաղտնաբառի վերականգնման հայտ։ Այս հղումն ուժի մեջ է 1 ժամ և կարող է օգտագործվել միայն մեկ անգամ՝ ${resetUrl ?? ''}\n\nԵթե դուք չեք հայցել սա, կարող եք անտեսել այս նամակը։`,
    }),
    ru: ({ resetUrl }) => ({
      subject: 'Сброс пароля Desavii',
      body: `Мы получили запрос на сброс вашего пароля. Эта ссылка действительна 1 час и может быть использована только один раз: ${resetUrl ?? ''}\n\nЕсли вы не запрашивали это, просто проигнорируйте это письмо.`,
    }),
  },
  // P1.4 (Master Roadmap) — sent directly via `emailAdapter` from
  // `partnerStaffService.js`, bypassing the notification pipeline: the
  // invitee may not have a `users` row (and therefore no
  // `recipientUserId`) yet, which every other template here assumes.
  'partner.staff_invited': {
    en: ({ partnerName, roleName, inviteUrl }) => ({
      subject: `You've been invited to join ${partnerName ?? 'a company'} on Desavii`,
      body: `You've been invited to join "${partnerName ?? 'a company'}" as ${roleName ?? 'a team member'}. Accept the invitation: ${inviteUrl ?? ''}`,
    }),
    hy: ({ partnerName, roleName, inviteUrl }) => ({
      subject: `Ձեզ հրավիրել են միանալու «${partnerName ?? 'ընկերությանը'}»-ին Desavii-ում`,
      body: `Ձեզ հրավիրել են միանալու «${partnerName ?? 'ընկերությանը'}»-ին որպես ${roleName ?? 'թիմի անդամ'}: Ընդունեք հրավերը՝ ${inviteUrl ?? ''}`,
    }),
    ru: ({ partnerName, roleName, inviteUrl }) => ({
      subject: `Вас пригласили присоединиться к «${partnerName ?? 'компании'}» на Desavii`,
      body: `Вас пригласили присоединиться к «${partnerName ?? 'компании'}» в качестве ${roleName ?? 'участника команды'}. Примите приглашение: ${inviteUrl ?? ''}`,
    }),
  },
  // Sent via the normal event-driven pipeline once the invitation above
  // is actually accepted (a real `recipientUserId` exists by then).
  'partner.staff_added': {
    en: ({ partnerName, roleName }) => ({
      subject: 'Welcome to the team',
      body: `You are now a ${roleName ?? 'team member'} at "${partnerName ?? 'your new team'}".`,
    }),
    hy: ({ partnerName, roleName }) => ({
      subject: 'Բարի գալուստ թիմ',
      body: `Այժմ դուք «${partnerName ?? 'ձեր նոր թիմի'}» ${roleName ?? 'թիմի անդամն'} եք:`,
    }),
    ru: ({ partnerName, roleName }) => ({
      subject: 'Добро пожаловать в команду',
      body: `Теперь вы ${roleName ?? 'участник команды'} в «${partnerName ?? 'вашей новой команде'}».`,
    }),
  },
  // P1.5 (Master Roadmap) — the review author, notified only when a
  // moderator hides an already-live review (see eventTypes.js's own
  // comment on why there is no APPROVED/FLAGGED equivalent).
  'review.rejected': {
    en: ({ notes }) => ({
      subject: 'Your review was removed',
      body: `A moderator removed your review because it didn't meet our guidelines.${notes ? ` Note: ${notes}` : ''}`,
    }),
    hy: ({ notes }) => ({
      subject: 'Ձեր կարծիքը հեռացվել է',
      body: `Մոդերատորը հեռացրել է ձեր կարծիքը, քանի որ այն չի համապատասխանում մեր կանոններին։${notes ? ` Նշում. ${notes}` : ''}`,
    }),
    ru: ({ notes }) => ({
      subject: 'Ваш отзыв был удалён',
      body: `Модератор удалил ваш отзыв, так как он не соответствует нашим правилам.${notes ? ` Примечание: ${notes}` : ''}`,
    }),
  },
  // Sent to moderators/admins, not the review's author.
  'review.reported': {
    en: ({ reasonName }) => ({
      subject: 'A review was reported',
      body: `A customer reported a review (reason: ${reasonName ?? 'unspecified'}). Please review it in the moderation queue.`,
    }),
    hy: ({ reasonName }) => ({
      subject: 'Կարծիք է հայտնվել',
      body: `Հաճախորդը հայտնվել է կարծիքի մասին (պատճառ՝ ${reasonName ?? 'չնշված'})։ Խնդրում ենք ստուգել այն մոդերացիայի հերթում։`,
    }),
    ru: ({ reasonName }) => ({
      subject: 'На отзыв поступила жалоба',
      body: `Клиент пожаловался на отзыв (причина: ${reasonName ?? 'не указана'}). Пожалуйста, проверьте его в очереди модерации.`,
    }),
  },
  'admin.announcement': {
    en: ({ title, body }) => ({
      subject: title ?? 'Announcement',
      body: body ?? '',
    }),
    hy: ({ title, body }) => ({
      subject: title ?? 'Announcement',
      body: body ?? '',
    }),
    ru: ({ title, body }) => ({
      subject: title ?? 'Announcement',
      body: body ?? '',
    }),
  },
};

/**
 * Falls back to a generic (English, technical) rendering for any event
 * type without a specific template — this is a developer-facing safety
 * net, not a customer-facing message, so it's intentionally never
 * localized.
 */
export function renderEmail(eventType, payload = {}, locale = DEFAULT_LOCALE) {
  const perLocale = TEMPLATES[eventType];
  if (perLocale) {
    const render = perLocale[locale] ?? perLocale[DEFAULT_LOCALE];
    return render(payload);
  }
  return {
    subject: 'Notification',
    body: `Event: ${eventType}\n${JSON.stringify(payload)}`,
  };
}

export default renderEmail;
