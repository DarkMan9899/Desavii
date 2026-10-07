/**
 * Local QA environment — four NON-PUBLIC listings owned by the QA Partner,
 * one per moderation lifecycle state a Partner, Moderator or Admin needs to
 * inspect. They are extra QA fixtures: never PUBLISHED, so they never reach
 * search, category or home results, and never count towards the 5 public
 * listings per category.
 *
 * `lifecycle` names the end state `seedDemoQaEnvironment.js` applies after
 * building the listing with `createFullListing` — the same columns the real
 * lifecycle writes (`listingModerationDecisions.js`):
 * - DRAFT: never submitted (status DRAFT, moderation PENDING).
 * - PENDING_REVIEW: submitted and waiting in the moderation queue.
 * - REJECTED: a rejected submission — status DRAFT, moderation REJECTED and
 *   the Moderator's reason, exactly what `PENDING_REVIEW:REJECTED` writes.
 * - ARCHIVED: a once-published listing the Partner archived.
 */

export const QA_MODERATION_FIXTURES = [
  {
    lifecycle: 'DRAFT',
    partner: 'qa',
    listingType: 'HOTEL',
    categorySlug: 'hotels',
    citySlug: 'yerevan',
    slug: 'qa-fixture-draft-kentron-boutique-rooms',
    pricingModel: 'PER_NIGHT',
    amount: 26000,
    coordinates: [40.1811, 44.5136],
    images: ['hotels-3.svg'],
    translations: {
      en: {
        title: 'Kentron Boutique Rooms (draft)',
        summary:
          'A small boutique hotel in Kentron, still being set up by the partner.',
        description:
          'Six rooms above a café on Tumanyan Street. The partner has added the first room type and is still uploading photos before submitting the listing for review.',
      },
      hy: {
        title: 'Կենտրոն Բուտիկ Սենյակներ (սևագիր)',
        summary:
          'Փոքր բուտիկ հյուրանոց Կենտրոնում, որը գործընկերը դեռ կազմում է։',
        description:
          'Վեց սենյակ Թումանյան փողոցի սրճարանի վերևում։ Գործընկերն ավելացրել է առաջին սենյակի տեսակը և դեռ լուսանկարներ է վերբեռնում՝ նախքան ստուգման ուղարկելը։',
      },
      ru: {
        title: 'Kentron Boutique Rooms (черновик)',
        summary:
          'Небольшой бутик-отель в Кентроне, который партнёр ещё заполняет.',
        description:
          'Шесть номеров над кафе на улице Туманяна. Партнёр добавил первый тип номера и ещё загружает фотографии перед отправкой на проверку.',
      },
    },
    amenities: ['WiFi', 'Air Conditioning'],
    policies: [
      { code: 'cancellation_policy', value: 'MODERATE' },
      { code: 'check_in_time', value: '14:00' },
      { code: 'check_out_time', value: '12:00' },
    ],
    units: [
      {
        type: 'HOTEL_ROOM',
        label: 'Boutique Double',
        capacity: 6,
        maxGuests: 2,
        basePriceAmount: 26000,
        bedConfiguration: [{ type: 'QUEEN', count: 1 }],
        mealPlan: 'BREAKFAST_INCLUDED',
      },
    ],
  },
  {
    lifecycle: 'PENDING_REVIEW',
    partner: 'qa',
    listingType: 'PROPERTY',
    categorySlug: 'apartments',
    citySlug: 'yerevan',
    slug: 'qa-fixture-pending-arabkir-garden-apartment',
    pricingModel: 'PER_NIGHT',
    amount: 21000,
    coordinates: [40.2003, 44.5032],
    images: ['apartments-7.svg', 'apartments-8.svg'],
    translations: {
      en: {
        title: 'Arabkir Garden Apartment',
        summary:
          'A two-bedroom ground-floor apartment with a private garden in Arabkir.',
        description:
          'A quiet two-bedroom apartment on the ground floor of a low-rise building in Arabkir, with a private garden, a full kitchen and parking. Submitted for review and waiting for a moderator.',
      },
      hy: {
        title: 'Արաբկիր Այգի Բնակարան',
        summary:
          'Երկու ննջասենյականոց բնակարան առաջին հարկում՝ սեփական այգիով, Արաբկիրում։',
        description:
          'Հանգիստ երկու ննջասենյականոց բնակարան Արաբկիրի ցածրահարկ շենքի առաջին հարկում՝ սեփական այգիով, լիարժեք խոհանոցով և կայանատեղով։ Ուղարկված է ստուգման և սպասում է մոդերատորին։',
      },
      ru: {
        title: 'Квартира с садом в Арабкире',
        summary:
          'Квартира с двумя спальнями на первом этаже и собственным садом в Арабкире.',
        description:
          'Тихая квартира с двумя спальнями на первом этаже малоэтажного дома в Арабкире, с собственным садом, полноценной кухней и парковкой. Отправлена на проверку и ждёт модератора.',
      },
    },
    amenities: ['WiFi', 'Parking', 'Kitchen', 'Washing Machine'],
    policies: [
      { code: 'cancellation_policy', value: 'MODERATE' },
      { code: 'check_in_time', value: '15:00' },
      { code: 'check_out_time', value: '11:00' },
    ],
    units: [
      {
        type: 'PROPERTY_UNIT',
        label: 'Whole Apartment',
        capacity: 1,
        maxGuests: 5,
        bedConfiguration: [
          { type: 'DOUBLE', count: 1 },
          { type: 'TWIN', count: 2 },
          { type: 'SOFA_BED', count: 1 },
        ],
      },
    ],
  },
  {
    lifecycle: 'REJECTED',
    moderationNotes:
      'The photos show a different venue. Please upload photos of your own dining room and terrace, then submit the listing again.',
    partner: 'qa',
    listingType: 'RESTAURANT',
    categorySlug: 'restaurants',
    citySlug: 'yerevan',
    slug: 'qa-fixture-rejected-riverside-barbecue-terrace',
    pricingModel: 'PER_PERSON',
    amount: 6000,
    coordinates: [40.1702, 44.4877],
    images: ['restaurants-2.svg'],
    translations: {
      en: {
        title: 'Riverside Barbecue Terrace',
        summary: 'An open-air barbecue terrace by the Hrazdan gorge.',
        description:
          'A summer barbecue terrace in the Hrazdan gorge serving khorovats and grilled vegetables. Rejected by moderation: the submitted photos do not show this venue.',
      },
      hy: {
        title: 'Գետափնյա Խորովածի Տեռաս',
        summary: 'Բացօթյա խորովածի տեռաս Հրազդանի կիրճի մոտ։',
        description:
          'Ամառային խորովածի տեռաս Հրազդանի կիրճում, որտեղ մատուցվում են խորոված և խորոված բանջարեղեն։ Մերժվել է մոդերացիայի կողմից. ներկայացված լուսանկարները չեն ցույց տալիս այս վայրը։',
      },
      ru: {
        title: 'Терраса барбекю у реки',
        summary: 'Летняя терраса барбекю у Разданского ущелья.',
        description:
          'Летняя терраса в Разданском ущелье с хоровацем и овощами на гриле. Отклонено модерацией: на присланных фотографиях не это заведение.',
      },
    },
    amenities: ['Outdoor Seating', 'Parking'],
    policies: [{ code: 'children_allowed', value: 'true' }],
    units: [{ type: 'RESTAURANT_TABLE', label: 'Terrace', capacity: 10 }],
  },
  {
    lifecycle: 'ARCHIVED',
    partner: 'qa',
    listingType: 'TOUR',
    categorySlug: 'tours',
    citySlug: 'jermuk',
    slug: 'qa-fixture-archived-jermuk-winter-snowshoe-walk',
    pricingModel: 'PER_PERSON',
    amount: 14000,
    coordinates: [39.8411, 45.6706],
    images: ['tours-7.svg'],
    translations: {
      en: {
        title: 'Jermuk Winter Snowshoe Walk',
        summary:
          'A guided snowshoe walk through the forests above Jermuk, run in winter only.',
        description:
          'A three-hour guided snowshoe walk to the frozen Jermuk waterfall, priced per traveler. Archived by the partner at the end of the winter season.',
      },
      hy: {
        title: 'Ջերմուկի Ձմեռային Արշավ Ձնակոշիկներով',
        summary:
          'Ձնակոշիկներով արշավ ուղեկցորդով Ջերմուկի վերևի անտառներով, միայն ձմռանը։',
        description:
          'Եռաժամյա արշավ ձնակոշիկներով դեպի սառած Ջերմուկի ջրվեժ, գինը՝ մեկ ճանապարհորդի համար։ Արխիվացվել է գործընկերոջ կողմից ձմեռային սեզոնի ավարտին։',
      },
      ru: {
        title: 'Зимняя прогулка на снегоступах в Джермуке',
        summary:
          'Прогулка на снегоступах с гидом по лесам над Джермуком, только зимой.',
        description:
          'Трёхчасовая прогулка на снегоступах к замёрзшему водопаду Джермука, цена за одного путешественника. Партнёр перенёс её в архив в конце зимнего сезона.',
      },
    },
    amenities: [],
    policies: [{ code: 'cancellation_policy', value: 'FLEXIBLE' }],
    units: [
      {
        type: 'TOUR_DEPARTURE',
        label: 'Winter Departure',
        capacity: 10,
        timeSlotStart: '10:00:00',
        timeSlotEnd: '13:00:00',
      },
    ],
  },
];

export default QA_MODERATION_FIXTURES;
