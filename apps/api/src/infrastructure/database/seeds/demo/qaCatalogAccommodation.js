/**
 * Local QA environment — the 8 accommodation listings (2 Hotels, 2
 * Apartments, 2 Villas, 2 Guest Houses) owned by the QA Partner company.
 *
 * Pure data in `seedDemoSprintJCatalog.js`'s `LISTINGS` spec shape (built
 * by its exported `createFullListing`), plus the QA-only extras
 * `seedDemoQaEnvironment.js` layers on top: `coordinates`, `bookingRules`,
 * `highlights`, `faqs`, `contactVisible`.
 *
 * Together the two hotels deliberately cover every bed type, every meal
 * plan, private/shared/en-suite bathrooms, view variety, a smoking room,
 * accessible rooms and different sizes and guest counts — the room detail
 * surface a QA pass needs to see. Every price is nightly (PER_NIGHT).
 */

export const QA_ACCOMMODATION_LISTINGS = [
  // === HOTELS ===========================================================
  {
    partner: 'qa',
    listingType: 'HOTEL',
    categorySlug: 'hotels',
    citySlug: 'yerevan',
    slug: 'qa-ararat-view-grand-hotel',
    pricingModel: 'PER_NIGHT',
    amount: 24000,
    coordinates: [40.1838, 44.5146],
    images: ['hotels-1.svg', 'hotels-4.svg', 'hotels-6.svg'],
    translations: {
      en: {
        title: 'Ararat View Grand Hotel',
        summary:
          'A four-star city hotel above the Cascade with rooms facing Mount Ararat, from single rooms to a family suite.',
        description:
          'Ararat View Grand Hotel stands at the top of Yerevan’s Cascade, so the upper floors look straight across the city to Mount Ararat. The hotel mixes compact single rooms for business travelers with balcony doubles, an accessible twin room on the ground floor and a family suite with a child bed. Breakfast is served on the eighth-floor terrace, and the Opera, Northern Avenue and Republic Square are all within a fifteen-minute walk.',
      },
      hy: {
        title: 'Արարատ Վյու Գրանդ Հյուրանոց',
        summary:
          'Չորսաստղանի քաղաքային հյուրանոց Կասկադի վերևում՝ Արարատին նայող սենյակներով՝ մեկտեղանոց սենյակից մինչև ընտանեկան լյուքս։',
        description:
          'Արարատ Վյու Գրանդ Հյուրանոցը գտնվում է Երևանի Կասկադի վերին հատվածում, և վերին հարկերից բացվում է տեսարան ամբողջ քաղաքի ու Արարատ լեռան վրա։ Հյուրանոցն առաջարկում է կոմպակտ մեկտեղանոց սենյակներ գործուղման եկած հյուրերի համար, պատշգամբով երկտեղանոց սենյակներ, առաջին հարկում հասանելի երկտեղանոց սենյակ և ընտանեկան լյուքս՝ մանկական մահճակալով։ Նախաճաշը մատուցվում է ութերորդ հարկի տեռասում, իսկ Օպերան, Հյուսիսային պողոտան և Հանրապետության հրապարակը տասնհինգ րոպե քայլելու հեռավորության վրա են։',
      },
      ru: {
        title: 'Отель Ararat View Grand',
        summary:
          'Четырёхзвёздочный городской отель над Каскадом с видом на Арарат — от одноместных номеров до семейного люкса.',
        description:
          'Отель Ararat View Grand стоит на вершине ереванского Каскада, и с верхних этажей открывается вид на весь город и гору Арарат. Здесь есть компактные одноместные номера для деловых поездок, двухместные номера с балконом, адаптированный двухместный номер на первом этаже и семейный люкс с детской кроватью. Завтрак подают на террасе восьмого этажа, а до Оперы, Северного проспекта и площади Республики — не больше пятнадцати минут пешком.',
      },
    },
    amenities: [
      'WiFi',
      'Parking',
      'Air Conditioning',
      'Elevator',
      'Gym',
      'Business Center',
      'Non-Smoking Rooms',
      'Wheelchair Accessible',
      'Family Friendly',
      'Airport Shuttle',
    ],
    policies: [
      { code: 'pets_allowed', value: 'false' },
      { code: 'smoking_allowed', value: 'false' },
      { code: 'children_allowed', value: 'true' },
      { code: 'cancellation_policy', value: 'MODERATE' },
      { code: 'check_in_time', value: '14:00' },
      { code: 'check_out_time', value: '12:00' },
    ],
    attributes: [
      { code: 'star_rating', optionCodes: ['4'] },
      { code: 'property_style', optionCodes: ['BUSINESS'] },
      { code: 'total_rooms', value: 15 },
    ],
    bookingRules: {
      minimumStayNights: 1,
      maximumStayNights: 21,
      advanceBookingMinHours: 2,
      advanceBookingMaxDays: 365,
    },
    contactVisible: true,
    highlights: {
      en: [
        { iconCode: 'view', text: 'Mount Ararat views from the upper floors' },
        {
          iconCode: 'location',
          text: 'Top of the Cascade, 15 minutes to Republic Square',
        },
        {
          iconCode: 'breakfast',
          text: 'Breakfast on the eighth-floor terrace',
        },
      ],
      hy: [
        { iconCode: 'view', text: 'Արարատի տեսարան վերին հարկերից' },
        {
          iconCode: 'location',
          text: 'Կասկադի վերևում, 15 րոպե Հանրապետության հրապարակից',
        },
        { iconCode: 'breakfast', text: 'Նախաճաշ ութերորդ հարկի տեռասում' },
      ],
      ru: [
        { iconCode: 'view', text: 'Вид на Арарат с верхних этажей' },
        {
          iconCode: 'location',
          text: 'На вершине Каскада, 15 минут до площади Республики',
        },
        { iconCode: 'breakfast', text: 'Завтрак на террасе восьмого этажа' },
      ],
    },
    faqs: {
      en: [
        {
          question: 'Is breakfast included?',
          answer:
            'It depends on the room: the Superior Double includes breakfast, the Family Suite is half board, the Accessible Twin can add breakfast for an extra charge and the Classic Single is room only.',
        },
        {
          question: 'Is there step-free access?',
          answer:
            'Yes. The entrance, lift and the ground-floor Accessible Twin room are step-free, and that room has an accessible bathroom.',
        },
      ],
      hy: [
        {
          question: 'Նախաճաշը ներառվա՞ծ է։',
          answer:
            'Կախված է սենյակից. Սուպերիոր երկտեղանոցում նախաճաշը ներառված է, ընտանեկան լյուքսը կիսասնունդով է, հասանելի երկտեղանոցում նախաճաշը կարելի է ավելացնել հավելավճարով, իսկ դասական մեկտեղանոցը առանց սննդի է։',
        },
        {
          question: 'Կա՞ առանց աստիճանների մուտք։',
          answer:
            'Այո։ Մուտքը, վերելակը և առաջին հարկի հասանելի երկտեղանոց սենյակն առանց աստիճանների են, իսկ այդ սենյակն ունի հարմարեցված լոգարան։',
        },
      ],
      ru: [
        {
          question: 'Завтрак включён?',
          answer:
            'Зависит от номера: в Superior Double завтрак включён, семейный люкс — полупансион, в адаптированном двухместном номере завтрак можно добавить за доплату, а Classic Single — без питания.',
        },
        {
          question: 'Есть ли доступ без ступеней?',
          answer:
            'Да. Вход, лифт и адаптированный двухместный номер на первом этаже доступны без ступеней, в этом номере есть адаптированная ванная комната.',
        },
      ],
    },
    units: [
      {
        type: 'HOTEL_ROOM',
        label: 'Classic Single Room',
        capacity: 6,
        maxGuests: 1,
        basePriceAmount: 24000,
        bedConfiguration: [{ type: 'SINGLE', count: 1 }],
        mealPlan: 'NO_MEALS',
        roomSizeSqm: 14,
        bathroomType: 'PRIVATE',
        viewType: 'CITY',
        smokingPolicy: 'NON_SMOKING',
        amenities: [
          'WiFi',
          'Air Conditioning',
          'Desk',
          'Kettle',
          'Shower',
          'Hair Dryer',
        ],
        images: ['hotels-2.svg', 'hotels-3.svg'],
        descriptions: {
          en: 'A compact single room with a work desk and a city-facing window — room only, for travelers who eat out.',
          hy: 'Կոմպակտ մեկտեղանոց սենյակ՝ աշխատանքային սեղանով և քաղաքին նայող պատուհանով, առանց սննդի։',
          ru: 'Компактный одноместный номер с рабочим столом и окном на город — без питания.',
        },
      },
      {
        type: 'HOTEL_ROOM',
        label: 'Superior Double with Ararat View',
        capacity: 5,
        maxGuests: 2,
        basePriceAmount: 42000,
        bedConfiguration: [
          { type: 'DOUBLE', count: 1 },
          { type: 'CRIB', count: 1 },
        ],
        mealPlan: 'BREAKFAST_INCLUDED',
        roomSizeSqm: 24,
        bathroomType: 'ENSUITE',
        viewType: 'LANDMARK',
        smokingPolicy: 'NON_SMOKING',
        amenities: [
          'WiFi',
          'Air Conditioning',
          'Balcony',
          'Bathtub',
          'Hair Dryer',
          'Toiletries',
          'Minibar',
          'TV',
          'Safe',
        ],
        images: ['hotels-4.svg', 'hotels-5.svg'],
        descriptions: {
          en: 'A double room with a private balcony facing Mount Ararat, an en-suite bathroom with a bathtub and a baby cot on request. Breakfast is included.',
          hy: 'Երկտեղանոց սենյակ՝ Արարատին նայող սեփական պատշգամբով, լոգարանով և լոգախցիկով, մանկական օրորոց՝ ըստ պահանջի։ Նախաճաշը ներառված է։',
          ru: 'Двухместный номер с собственным балконом с видом на Арарат, ванной комнатой с ванной и детской кроваткой по запросу. Завтрак включён.',
        },
      },
      {
        type: 'HOTEL_ROOM',
        label: 'Family Suite',
        capacity: 2,
        maxGuests: 4,
        basePriceAmount: 68000,
        bedConfiguration: [
          { type: 'KING', count: 1 },
          { type: 'SOFA_BED', count: 1 },
          { type: 'CHILD_BED', count: 1 },
        ],
        mealPlan: 'HALF_BOARD',
        roomSizeSqm: 42,
        bathroomType: 'ENSUITE',
        viewType: 'LANDMARK',
        smokingPolicy: 'NON_SMOKING',
        amenities: [
          'WiFi',
          'Air Conditioning',
          'Balcony',
          'Bathtub',
          'Shower',
          'Coffee Maker',
          'Wardrobe',
          'TV',
          'Safe',
        ],
        images: ['hotels-6.svg', 'hotels-7.svg'],
        descriptions: {
          en: 'Two connected rooms for a family: a king bed, a sofa bed and a child bed, with breakfast and dinner included (half board).',
          hy: 'Երկու միացված սենյակ ընտանիքի համար՝ մեծ մահճակալ, բազմոց-մահճակալ և մանկական մահճակալ, նախաճաշն ու ընթրիքը ներառված են (կիսասնունդ)։',
          ru: 'Две смежные комнаты для семьи: кровать king-size, диван-кровать и детская кровать, завтрак и ужин включены (полупансион).',
        },
      },
      {
        type: 'HOTEL_ROOM',
        label: 'Accessible Twin Room',
        capacity: 2,
        maxGuests: 2,
        basePriceAmount: 36000,
        bedConfiguration: [{ type: 'SINGLE', count: 2 }],
        mealPlan: 'BREAKFAST_AVAILABLE_EXTRA',
        roomSizeSqm: 28,
        bathroomType: 'PRIVATE',
        viewType: 'COURTYARD',
        smokingPolicy: 'NON_SMOKING',
        amenities: [
          'WiFi',
          'Air Conditioning',
          'Step-free Access',
          'Accessible Bathroom',
          'Shower',
          'Hair Dryer',
          'TV',
        ],
        images: ['hotels-8.svg', 'hotels-1.svg'],
        descriptions: {
          en: 'A ground-floor twin room with step-free access, a roll-in shower and grab rails. Breakfast can be added for an extra charge.',
          hy: 'Առաջին հարկի երկու առանձին մահճակալով սենյակ՝ առանց աստիճանների մուտքով, հարմարեցված ցնցուղով և բռնակներով։ Նախաճաշը կարելի է ավելացնել հավելավճարով։',
          ru: 'Номер с двумя кроватями на первом этаже: вход без ступеней, душ без поддона и поручни. Завтрак можно добавить за доплату.',
        },
      },
    ],
  },
  {
    partner: 'qa',
    listingType: 'HOTEL',
    categorySlug: 'hotels',
    citySlug: 'goris',
    slug: 'qa-goris-cliffside-resort',
    pricingModel: 'PER_NIGHT',
    amount: 15000,
    coordinates: [39.5111, 46.3415],
    images: ['hotels-5.svg', 'hotels-8.svg', 'hotels-2.svg'],
    translations: {
      en: {
        title: 'Goris Cliffside Resort',
        summary:
          'A mountain resort on the edge of Goris’ stone-pillar canyon, from budget rooms with a shared bathroom to an all-inclusive panorama suite.',
        description:
          'Goris Cliffside Resort sits on the rim of the canyon above the town’s old cave dwellings and stone pillars, half an hour from the Wings of Tatev cable car. Rooms range from simple economy rooms that share a bathroom on each floor to mountain-view doubles on full board and an all-inclusive panorama suite. Hiking maps, packed lunches and transfers to Tatev and Khndzoresk are arranged at reception.',
      },
      hy: {
        title: 'Գորիս Քլիֆսայդ Հանգստյան Համալիր',
        summary:
          'Լեռնային հանգստյան համալիր Գորիսի քարե սյուներով կիրճի եզրին՝ ընդհանուր լոգարանով խնայողական սենյակներից մինչև «ամեն ինչ ներառված» համայնապատկերային լյուքս։',
        description:
          'Գորիս Քլիֆսայդ Հանգստյան Համալիրը գտնվում է կիրճի եզրին՝ քաղաքի հին քարանձավային բնակավայրերի և քարե սյուների վերևում, «Տաթևի թևեր» ճոպանուղուց կես ժամ հեռավորության վրա։ Սենյակները տատանվում են յուրաքանչյուր հարկում ընդհանուր լոգարանով պարզ խնայողական սենյակներից մինչև լեռնային տեսարանով լրիվ սնունդով երկտեղանոց սենյակներ և «ամեն ինչ ներառված» համայնապատկերային լյուքս։ Ընդունարանում կազմակերպվում են արշավային քարտեզներ, ճանապարհի ճաշ և տրանսֆերներ դեպի Տաթև ու Խնձորեսկ։',
      },
      ru: {
        title: 'Курорт Goris Cliffside',
        summary:
          'Горный курорт на краю каньона с каменными столбами в Горисе — от бюджетных номеров с общей ванной до панорамного люкса «всё включено».',
        description:
          'Курорт Goris Cliffside стоит на краю каньона над старыми пещерными жилищами и каменными столбами города, в получасе езды от канатной дороги «Крылья Татева». Номера — от простых эконом-номеров с общей ванной комнатой на этаже до двухместных номеров с видом на горы на полном пансионе и панорамного люкса «всё включено». На ресепшене выдают карты маршрутов, готовят ланч-боксы и организуют трансферы в Татев и Хндзореск.',
      },
    },
    amenities: [
      'WiFi',
      'Parking',
      'Breakfast Included',
      'Family Friendly',
      'Pet Friendly',
      'Security',
    ],
    policies: [
      { code: 'pets_allowed', value: 'true' },
      { code: 'smoking_allowed', value: 'true' },
      { code: 'children_allowed', value: 'true' },
      { code: 'cancellation_policy', value: 'FLEXIBLE' },
      { code: 'check_in_time', value: '15:00' },
      { code: 'check_out_time', value: '11:00' },
    ],
    attributes: [
      { code: 'star_rating', optionCodes: ['3'] },
      { code: 'property_style', optionCodes: ['RESORT'] },
      { code: 'total_rooms', value: 10 },
    ],
    bookingRules: {
      minimumStayNights: 2,
      maximumStayNights: 14,
      advanceBookingMinHours: 24,
      advanceBookingMaxDays: 240,
    },
    contactVisible: true,
    highlights: {
      en: [
        {
          iconCode: 'mountain',
          text: 'Canyon-rim location above the Goris stone pillars',
        },
        {
          iconCode: 'food',
          text: 'Full board and all-inclusive rooms available',
        },
        {
          iconCode: 'car',
          text: 'Transfers to Tatev and Khndzoresk from reception',
        },
      ],
      hy: [
        {
          iconCode: 'mountain',
          text: 'Կիրճի եզրին՝ Գորիսի քարե սյուների վերևում',
        },
        {
          iconCode: 'food',
          text: 'Լրիվ սնունդով և «ամեն ինչ ներառված» սենյակներ',
        },
        {
          iconCode: 'car',
          text: 'Տրանսֆերներ դեպի Տաթև և Խնձորեսկ ընդունարանից',
        },
      ],
      ru: [
        {
          iconCode: 'mountain',
          text: 'На краю каньона над каменными столбами Гориса',
        },
        {
          iconCode: 'food',
          text: 'Номера с полным пансионом и «всё включено»',
        },
        { iconCode: 'car', text: 'Трансферы в Татев и Хндзореск от ресепшена' },
      ],
    },
    faqs: {
      en: [
        {
          question: 'Which rooms share a bathroom?',
          answer:
            'Only the Economy Twin rooms. Each floor has two shared bathrooms with showers; every other room has its own bathroom.',
        },
        {
          question: 'Can I smoke in my room?',
          answer:
            'Smoking is allowed only in the Mountain Double rooms, which have a balcony. All other rooms are non-smoking.',
        },
      ],
      hy: [
        {
          question: 'Ո՞ր սենյակներն ունեն ընդհանուր լոգարան։',
          answer:
            'Միայն խնայողական երկտեղանոց սենյակները։ Յուրաքանչյուր հարկում կա ցնցուղով երկու ընդհանուր լոգարան, իսկ մյուս բոլոր սենյակներն ունեն սեփական լոգարան։',
        },
        {
          question: 'Կարո՞ղ եմ ծխել սենյակում։',
          answer:
            'Ծխելը թույլատրված է միայն պատշգամբով լեռնային երկտեղանոց սենյակներում։ Մնացած բոլոր սենյակներում ծխելն արգելված է։',
        },
      ],
      ru: [
        {
          question: 'В каких номерах общая ванная?',
          answer:
            'Только в эконом-номерах с двумя кроватями. На каждом этаже две общие ванные комнаты с душем, во всех остальных номерах — собственная ванная.',
        },
        {
          question: 'Можно ли курить в номере?',
          answer:
            'Курить можно только в номерах Mountain Double с балконом. Все остальные номера — для некурящих.',
        },
      ],
    },
    units: [
      {
        type: 'HOTEL_ROOM',
        label: 'Economy Twin, Shared Bathroom',
        capacity: 4,
        maxGuests: 2,
        basePriceAmount: 15000,
        bedConfiguration: [{ type: 'TWIN', count: 2 }],
        mealPlan: 'BREAKFAST_AVAILABLE_EXTRA',
        roomSizeSqm: 12,
        bathroomType: 'SHARED',
        viewType: 'NONE',
        smokingPolicy: 'NON_SMOKING',
        amenities: ['WiFi', 'Heating', 'Wardrobe'],
        images: ['hotels-3.svg', 'hotels-2.svg'],
        descriptions: {
          en: 'A simple room with two twin beds and a shared bathroom down the hall — the budget base for a day of hiking. Breakfast is available for an extra charge.',
          hy: 'Պարզ սենյակ երկու մեկտեղանոց մահճակալով և միջանցքում ընդհանուր լոգարանով՝ խնայողական բազա արշավային օրվա համար։ Նախաճաշը հասանելի է հավելավճարով։',
          ru: 'Простой номер с двумя односпальными кроватями и общей ванной комнатой в коридоре — бюджетная база для дня в походе. Завтрак за доплату.',
        },
      },
      {
        type: 'HOTEL_ROOM',
        label: 'Mountain Double with Extra Bed',
        capacity: 4,
        maxGuests: 3,
        basePriceAmount: 34000,
        bedConfiguration: [
          { type: 'DOUBLE', count: 1 },
          { type: 'EXTRA_BED', count: 1 },
        ],
        mealPlan: 'FULL_BOARD',
        roomSizeSqm: 22,
        bathroomType: 'PRIVATE',
        viewType: 'MOUNTAIN',
        smokingPolicy: 'SMOKING_ALLOWED',
        amenities: ['WiFi', 'Heating', 'Balcony', 'Shower', 'Kettle', 'TV'],
        images: ['hotels-5.svg', 'hotels-6.svg'],
        descriptions: {
          en: 'A double room with a fold-out extra bed for a third guest and a balcony over the canyon. Full board: breakfast, lunch and dinner. Smoking is allowed in this room.',
          hy: 'Երկտեղանոց սենյակ՝ երրորդ հյուրի համար ծալովի լրացուցիչ մահճակալով և կիրճին նայող պատշգամբով։ Լրիվ սնունդ՝ նախաճաշ, ճաշ և ընթրիք։ Այս սենյակում ծխելը թույլատրված է։',
          ru: 'Двухместный номер с раскладной дополнительной кроватью для третьего гостя и балконом над каньоном. Полный пансион: завтрак, обед и ужин. В этом номере можно курить.',
        },
      },
      {
        type: 'HOTEL_ROOM',
        label: 'Panorama Suite, All Inclusive',
        capacity: 2,
        maxGuests: 3,
        basePriceAmount: 58000,
        bedConfiguration: [
          { type: 'QUEEN', count: 1 },
          { type: 'SOFA_BED', count: 1 },
          { type: 'CRIB', count: 1 },
        ],
        mealPlan: 'ALL_INCLUSIVE',
        roomSizeSqm: 36,
        bathroomType: 'ENSUITE',
        viewType: 'MOUNTAIN',
        smokingPolicy: 'NON_SMOKING',
        amenities: [
          'WiFi',
          'Heating',
          'Balcony',
          'Bathtub',
          'Minibar',
          'Coffee Maker',
          'Soundproofing',
          'Toiletries',
        ],
        images: ['hotels-7.svg', 'hotels-8.svg'],
        descriptions: {
          en: 'The top-floor suite with a wraparound window over the canyon, a queen bed, a sofa bed and a baby cot. All meals and soft drinks are included.',
          hy: 'Վերին հարկի լյուքս՝ կիրճին նայող լայն պատուհանով, մեծ մահճակալով, բազմոց-մահճակալով և մանկական օրորոցով։ Բոլոր սննդակարգերն ու զովացուցիչ ըմպելիքները ներառված են։',
          ru: 'Люкс на верхнем этаже с панорамным окном на каньон, кроватью queen-size, диваном-кроватью и детской кроваткой. Всё питание и безалкогольные напитки включены.',
        },
      },
    ],
  },

  // === APARTMENTS =======================================================
  {
    partner: 'qa',
    listingType: 'PROPERTY',
    categorySlug: 'apartments',
    citySlug: 'yerevan',
    slug: 'qa-northern-avenue-designer-loft',
    pricingModel: 'PER_NIGHT',
    amount: 32000,
    coordinates: [40.1835, 44.5155],
    images: ['apartments-1.svg', 'apartments-2.svg', 'apartments-5.svg'],
    translations: {
      en: {
        title: 'Northern Avenue Designer Loft',
        summary:
          'A one-bedroom designer loft on Northern Avenue with a full kitchen, for up to four guests.',
        description:
          'This loft occupies the top floor of a renovated building on Northern Avenue, the pedestrian street linking the Opera to Abovyan Street. It has one bedroom with a double bed, a sofa bed in the living room, a full kitchen and a washing machine, so it suits a longer city stay. The building has a lift, and self check-in with a keypad lets guests arrive at any time after 15:00.',
      },
      hy: {
        title: 'Հյուսիսային պողոտայի Դիզայներական Լոֆթ',
        summary:
          'Մեկ ննջասենյականոց դիզայներական լոֆթ Հյուսիսային պողոտայում՝ լիարժեք խոհանոցով, մինչև չորս հյուրի համար։',
        description:
          'Այս լոֆթը զբաղեցնում է Հյուսիսային պողոտայում վերանորոգված շենքի վերին հարկը. հետիոտնային փողոցը կապում է Օպերան Աբովյան փողոցի հետ։ Այն ունի մեկ ննջասենյակ՝ երկտեղանոց մահճակալով, հյուրասենյակում բազմոց-մահճակալ, լիարժեք խոհանոց և լվացքի մեքենա, ուստի հարմար է քաղաքում երկար մնալու համար։ Շենքն ունի վերելակ, իսկ կոդով ինքնուրույն մուտքը թույլ է տալիս ժամանել 15:00-ից հետո ցանկացած ժամի։',
      },
      ru: {
        title: 'Дизайнерский лофт на Северном проспекте',
        summary:
          'Дизайнерский лофт с одной спальней на Северном проспекте, с полноценной кухней, до четырёх гостей.',
        description:
          'Лофт занимает верхний этаж отремонтированного дома на Северном проспекте — пешеходной улице между Оперой и улицей Абовяна. Здесь одна спальня с двуспальной кроватью, диван-кровать в гостиной, полноценная кухня и стиральная машина, поэтому он подходит для долгого пребывания в городе. В доме есть лифт, а самостоятельное заселение по коду позволяет приехать в любое время после 15:00.',
      },
    },
    amenities: [
      'WiFi',
      'Air Conditioning',
      'Kitchen',
      'Washing Machine',
      'Elevator',
    ],
    policies: [
      { code: 'pets_allowed', value: 'false' },
      { code: 'smoking_allowed', value: 'false' },
      { code: 'children_allowed', value: 'true' },
      { code: 'cancellation_policy', value: 'STRICT' },
      { code: 'check_in_time', value: '15:00' },
      { code: 'check_out_time', value: '11:00' },
    ],
    attributes: [
      { code: 'bedrooms', value: 1 },
      { code: 'bathrooms', value: 1 },
      { code: 'beds', value: 2 },
      { code: 'max_guests', value: 4 },
      { code: 'view_type', optionCodes: ['CITY'] },
      { code: 'floor_area_sqm', value: 68 },
    ],
    bookingRules: {
      minimumStayNights: 2,
      maximumStayNights: 28,
      advanceBookingMinHours: 24,
      advanceBookingMaxDays: 365,
    },
    contactVisible: true,
    units: [
      {
        type: 'PROPERTY_UNIT',
        label: 'Whole Loft',
        capacity: 1,
        maxGuests: 4,
        bedConfiguration: [
          { type: 'DOUBLE', count: 1 },
          { type: 'SOFA_BED', count: 1 },
        ],
      },
    ],
  },
  {
    partner: 'qa',
    listingType: 'PROPERTY',
    categorySlug: 'apartments',
    citySlug: 'yerevan',
    slug: 'qa-komitas-serviced-studios',
    pricingModel: 'PER_NIGHT',
    amount: 17000,
    coordinates: [40.2058, 44.512],
    images: ['apartments-3.svg', 'apartments-4.svg', 'apartments-6.svg'],
    translations: {
      en: {
        title: 'Komitas Serviced Studios',
        summary:
          'Three identical serviced studios in Arabkir with a kitchenette, weekly cleaning and a parking space.',
        description:
          'Komitas Serviced Studios are three identical studio apartments in a quiet residential block on Komitas Avenue in Arabkir, a short taxi ride from the centre. Each studio has a double bed, a kitchenette, a work corner with fast WiFi and a parking space in the courtyard. Stays of a week or longer include a mid-stay clean and fresh linen.',
      },
      hy: {
        title: 'Կոմիտաս Սերվիսային Ստուդիաներ',
        summary:
          'Երեք նույնատիպ սերվիսային ստուդիա Արաբկիրում՝ մինի-խոհանոցով, շաբաթական մաքրությամբ և կայանատեղով։',
        description:
          'Կոմիտաս Սերվիսային Ստուդիաները երեք նույնատիպ ստուդիա-բնակարաններ են Արաբկիրի Կոմիտասի պողոտայի հանգիստ բնակելի շենքում՝ կենտրոնից տաքսիով կարճ ճանապարհի վրա։ Յուրաքանչյուր ստուդիա ունի երկտեղանոց մահճակալ, մինի-խոհանոց, արագ WiFi-ով աշխատանքային անկյուն և բակում կայանատեղ։ Մեկ շաբաթ և ավելի մնալու դեպքում ներառված է միջանկյալ մաքրություն և թարմ սպիտակեղեն։',
      },
      ru: {
        title: 'Сервисные студии Komitas',
        summary:
          'Три одинаковые сервисные студии в Арабкире с мини-кухней, еженедельной уборкой и парковочным местом.',
        description:
          'Сервисные студии Komitas — три одинаковые квартиры-студии в тихом жилом доме на проспекте Комитаса в Арабкире, недалеко от центра на такси. В каждой студии двуспальная кровать, мини-кухня, рабочее место с быстрым WiFi и парковочное место во дворе. При проживании от недели включены промежуточная уборка и смена белья.',
      },
    },
    amenities: [
      'WiFi',
      'Parking',
      'Air Conditioning',
      'Kitchen',
      'Elevator',
      'Pet Friendly',
    ],
    policies: [
      { code: 'pets_allowed', value: 'true' },
      { code: 'smoking_allowed', value: 'false' },
      { code: 'children_allowed', value: 'true' },
      { code: 'cancellation_policy', value: 'FLEXIBLE' },
      { code: 'check_in_time', value: '14:00' },
      { code: 'check_out_time', value: '12:00' },
    ],
    attributes: [
      { code: 'bedrooms', value: 0 },
      { code: 'bathrooms', value: 1 },
      { code: 'beds', value: 1 },
      { code: 'max_guests', value: 2 },
      { code: 'view_type', optionCodes: ['GARDEN'] },
      { code: 'floor_area_sqm', value: 32 },
    ],
    bookingRules: {
      minimumStayNights: 1,
      maximumStayNights: 60,
      advanceBookingMinHours: 6,
      advanceBookingMaxDays: 300,
    },
    contactVisible: true,
    units: [
      {
        type: 'PROPERTY_UNIT',
        label: 'Studio',
        capacity: 3,
        maxGuests: 2,
        bedConfiguration: [{ type: 'DOUBLE', count: 1 }],
      },
    ],
  },

  // === VILLAS ===========================================================
  {
    partner: 'qa',
    listingType: 'PROPERTY',
    categorySlug: 'villas',
    citySlug: 'dilijan',
    slug: 'qa-dilijan-pine-ridge-villa',
    pricingModel: 'PER_NIGHT',
    amount: 72000,
    coordinates: [40.7417, 44.8636],
    images: ['villas-1.svg', 'villas-3.svg', 'villas-5.svg'],
    translations: {
      en: {
        title: 'Dilijan Pine Ridge Villa',
        summary:
          'A four-bedroom timber villa in the Dilijan forest with a sauna, fireplace and barbecue terrace, for up to eight guests.',
        description:
          'Pine Ridge Villa is a timber house on a forested ridge above Dilijan, ten minutes by car from the old town and the Haghartsin road. Four bedrooms sleep eight, including a bunk room for children, and the open living room is built around a wood-burning fireplace. Outside there is a wood-fired sauna, a barbecue terrace and a fenced garden where dogs are welcome.',
      },
      hy: {
        title: 'Դիլիջան Փայն Ռիջ Վիլլա',
        summary:
          'Չորս ննջասենյականոց փայտե վիլլա Դիլիջանի անտառում՝ սաունայով, բուխարիով և խորովածի տեռասով, մինչև ութ հյուրի համար։',
        description:
          'Փայն Ռիջ Վիլլան փայտե տուն է Դիլիջանի վերևում գտնվող անտառապատ լեռնաշղթայի վրա՝ հին քաղաքից և Հաղարծնի ճանապարհից մեքենայով տասը րոպե հեռավորության վրա։ Չորս ննջասենյակներում տեղավորվում է ութ հոգի, այդ թվում՝ երեխաների համար երկհարկանի մահճակալներով սենյակ, իսկ բաց հյուրասենյակը կառուցված է փայտով վառվող բուխարու շուրջ։ Դրսում կա փայտով տաքացվող սաունա, խորովածի տեռաս և ցանկապատված այգի, որտեղ շներն ողջունելի են։',
      },
      ru: {
        title: 'Вилла Dilijan Pine Ridge',
        summary:
          'Деревянная вилла с четырьмя спальнями в дилижанском лесу, с сауной, камином и террасой для барбекю, до восьми гостей.',
        description:
          'Вилла Pine Ridge — деревянный дом на лесистом хребте над Дилижаном, в десяти минутах езды от старого города и дороги на Агарцин. В четырёх спальнях размещаются восемь человек, включая детскую с двухъярусной кроватью, а просторная гостиная построена вокруг дровяного камина. Снаружи — сауна на дровах, терраса для барбекю и огороженный сад, где рады собакам.',
      },
    },
    amenities: [
      'WiFi',
      'Parking',
      'Sauna',
      'Fireplace',
      'BBQ',
      'Garden',
      'Terrace',
      'Kitchen',
      'Pet Friendly',
      'Family Friendly',
    ],
    policies: [
      { code: 'pets_allowed', value: 'true' },
      { code: 'smoking_allowed', value: 'false' },
      { code: 'children_allowed', value: 'true' },
      { code: 'cancellation_policy', value: 'MODERATE' },
      { code: 'check_in_time', value: '16:00' },
      { code: 'check_out_time', value: '11:00' },
    ],
    attributes: [
      { code: 'bedrooms', value: 4 },
      { code: 'bathrooms', value: 2.5 },
      { code: 'beds', value: 5 },
      { code: 'max_guests', value: 8 },
      { code: 'view_type', optionCodes: ['MOUNTAIN'] },
      { code: 'floor_area_sqm', value: 240 },
    ],
    bookingRules: {
      minimumStayNights: 2,
      maximumStayNights: 21,
      advanceBookingMinHours: 48,
      advanceBookingMaxDays: 365,
    },
    contactVisible: true,
    units: [
      {
        type: 'PROPERTY_UNIT',
        label: 'Whole Villa',
        capacity: 1,
        maxGuests: 8,
        bedConfiguration: [
          { type: 'KING', count: 1 },
          { type: 'QUEEN', count: 2 },
          { type: 'BUNK', count: 1 },
        ],
      },
    ],
  },
  {
    partner: 'qa',
    listingType: 'PROPERTY',
    categorySlug: 'villas',
    citySlug: 'sevan',
    slug: 'qa-sevan-peninsula-lake-villa',
    pricingModel: 'PER_NIGHT',
    amount: 95000,
    coordinates: [40.5615, 45.0124],
    images: ['villas-2.svg', 'villas-4.svg', 'villas-6.svg'],
    translations: {
      en: {
        title: 'Sevan Peninsula Lake Villa',
        summary:
          'A five-bedroom lakeside villa near the Sevanavank peninsula with a heated pool and private beach access, for up to ten guests.',
        description:
          'This villa stands in its own garden a few minutes’ walk from the Sevanavank peninsula, with a path down to a quiet stretch of shore. Five bedrooms sleep ten, the heated outdoor pool is open from June to September, and a covered terrace holds a long dining table and a barbecue. It is best suited to two families or a group of friends staying several nights.',
      },
      hy: {
        title: 'Սևանի Թերակղզու Լճափնյա Վիլլա',
        summary:
          'Հինգ ննջասենյականոց լճափնյա վիլլա Սևանավանքի թերակղզու մոտ՝ տաքացվող լողավազանով և դեպի ափ սեփական ելքով, մինչև տասը հյուրի համար։',
        description:
          'Այս վիլլան գտնվում է սեփական այգում՝ Սևանավանքի թերակղզուց մի քանի րոպե քայլքի վրա, և արահետն իջնում է ափի հանգիստ հատված։ Հինգ ննջասենյակներում տեղավորվում է տասը հոգի, տաքացվող բացօթյա լողավազանը բաց է հունիսից սեպտեմբեր, իսկ ծածկված տեռասում կա երկար ճաշասեղան և խորովածի տեղ։ Լավագույնս հարմար է երկու ընտանիքի կամ ընկերների խմբի համար՝ մի քանի գիշեր մնալու դեպքում։',
      },
      ru: {
        title: 'Озёрная вилла Sevan Peninsula',
        summary:
          'Вилла с пятью спальнями на берегу озера у полуострова Севанаванк, с подогреваемым бассейном и собственным выходом к воде, до десяти гостей.',
        description:
          'Вилла стоит в собственном саду в нескольких минутах ходьбы от полуострова Севанаванк, и тропинка ведёт к тихому участку берега. В пяти спальнях размещаются десять человек, подогреваемый открытый бассейн работает с июня по сентябрь, а на крытой террасе стоят длинный обеденный стол и мангал. Лучше всего подходит для двух семей или компании друзей на несколько ночей.',
      },
    },
    amenities: [
      'WiFi',
      'Parking',
      'Pool',
      'Jacuzzi',
      'Garden',
      'BBQ',
      'Terrace',
      'Balcony',
      'Kitchen',
      'Family Friendly',
      'EV Charger',
    ],
    policies: [
      { code: 'pets_allowed', value: 'false' },
      { code: 'smoking_allowed', value: 'false' },
      { code: 'children_allowed', value: 'true' },
      { code: 'cancellation_policy', value: 'STRICT' },
      { code: 'check_in_time', value: '16:00' },
      { code: 'check_out_time', value: '12:00' },
    ],
    attributes: [
      { code: 'bedrooms', value: 5 },
      { code: 'bathrooms', value: 4 },
      { code: 'beds', value: 6 },
      { code: 'max_guests', value: 10 },
      { code: 'view_type', optionCodes: ['GARDEN'] },
      { code: 'floor_area_sqm', value: 320 },
    ],
    bookingRules: {
      minimumStayNights: 3,
      maximumStayNights: 14,
      advanceBookingMinHours: 72,
      advanceBookingMaxDays: 365,
    },
    contactVisible: true,
    units: [
      {
        type: 'PROPERTY_UNIT',
        label: 'Whole Villa',
        capacity: 1,
        maxGuests: 10,
        bedConfiguration: [
          { type: 'KING', count: 2 },
          { type: 'DOUBLE', count: 2 },
          { type: 'TWIN', count: 2 },
          { type: 'SOFA_BED', count: 1 },
        ],
      },
    ],
  },

  // === GUEST HOUSES =====================================================
  {
    partner: 'qa',
    listingType: 'PROPERTY',
    categorySlug: 'guest-houses',
    citySlug: 'goris',
    slug: 'qa-goris-stone-house-guesthouse',
    pricingModel: 'PER_NIGHT',
    amount: 14000,
    coordinates: [39.5075, 46.338],
    images: ['guest-houses-1.svg', 'guest-houses-3.svg', 'guest-houses-5.svg'],
    translations: {
      en: {
        title: 'Goris Stone House Guesthouse',
        summary:
          'A family-run guesthouse in a 19th-century stone house in Goris, with homemade breakfast and a family room.',
        description:
          'The Stone House is a family-run guesthouse in one of Goris’ old basalt houses, with a walnut tree in the courtyard and a view of the town’s cave cliffs. There are double guest rooms and one family room for four, and the hosts serve a homemade breakfast of local cheese, honey and fruit preserves. They are happy to help plan day trips to Tatev and the Old Khndzoresk swinging bridge.',
      },
      hy: {
        title: 'Գորիսի Քարե Տուն Հյուրատուն',
        summary:
          'Ընտանեկան հյուրատուն Գորիսում՝ XIX դարի քարե տանը, տնական նախաճաշով և ընտանեկան սենյակով։',
        description:
          'Քարե Տունը ընտանեկան հյուրատուն է Գորիսի հին բազալտե տներից մեկում՝ բակում ընկուզենի ծառով և քաղաքի քարանձավային ժայռերի տեսարանով։ Կան երկտեղանոց հյուրասենյակներ և մեկ ընտանեկան սենյակ չորս հոգու համար, իսկ տանտերերը մատուցում են տնական նախաճաշ՝ տեղական պանիր, մեղր և մուրաբա։ Նրանք սիրով կօգնեն պլանավորել մեկօրյա ուղևորություններ դեպի Տաթև և Հին Խնձորեսկի ճոճվող կամուրջ։',
      },
      ru: {
        title: 'Гостевой дом Goris Stone House',
        summary:
          'Семейный гостевой дом в каменном доме XIX века в Горисе, с домашним завтраком и семейным номером.',
        description:
          'Stone House — семейный гостевой дом в одном из старых базальтовых домов Гориса, с орешником во дворе и видом на пещерные скалы города. Здесь двухместные комнаты и один семейный номер на четверых, а хозяева подают домашний завтрак — местный сыр, мёд и варенье. Они охотно помогут спланировать поездки в Татев и к подвесному мосту Старого Хндзореска.',
      },
    },
    amenities: [
      'WiFi',
      'Parking',
      'Breakfast Included',
      'Garden',
      'Family Friendly',
    ],
    policies: [
      { code: 'pets_allowed', value: 'false' },
      { code: 'smoking_allowed', value: 'false' },
      { code: 'children_allowed', value: 'true' },
      { code: 'cancellation_policy', value: 'FLEXIBLE' },
      { code: 'check_in_time', value: '13:00' },
      { code: 'check_out_time', value: '11:00' },
    ],
    attributes: [
      { code: 'bedrooms', value: 4 },
      { code: 'bathrooms', value: 3 },
      { code: 'beds', value: 6 },
      { code: 'max_guests', value: 10 },
      { code: 'view_type', optionCodes: ['MOUNTAIN'] },
      { code: 'floor_area_sqm', value: 180 },
    ],
    bookingRules: {
      minimumStayNights: 1,
      maximumStayNights: 10,
      advanceBookingMinHours: 12,
      advanceBookingMaxDays: 240,
    },
    contactVisible: true,
    units: [
      {
        type: 'PROPERTY_UNIT',
        label: 'Double Guest Room',
        capacity: 3,
        maxGuests: 2,
        bedConfiguration: [{ type: 'DOUBLE', count: 1 }],
      },
      {
        type: 'PROPERTY_UNIT',
        label: 'Family Room',
        capacity: 1,
        maxGuests: 4,
        bedConfiguration: [
          { type: 'DOUBLE', count: 1 },
          { type: 'SINGLE', count: 2 },
        ],
      },
    ],
  },
  {
    partner: 'qa',
    listingType: 'PROPERTY',
    categorySlug: 'guest-houses',
    citySlug: 'ejmiatsin',
    slug: 'qa-ejmiatsin-garden-guesthouse',
    pricingModel: 'PER_NIGHT',
    amount: 11000,
    coordinates: [40.1655, 44.2925],
    images: ['guest-houses-2.svg', 'guest-houses-4.svg', 'guest-houses-6.svg'],
    translations: {
      en: {
        title: 'Ejmiatsin Garden Guesthouse',
        summary:
          'A quiet guesthouse with an apricot orchard, a ten-minute walk from Ejmiatsin Cathedral.',
        description:
          'Ejmiatsin Garden Guesthouse is a single-storey family home with guest rooms opening onto an apricot and grape orchard, ten minutes on foot from the Mother Cathedral and the St. Hripsime church. Each garden room has a double bed and room for a fold-out extra bed. Guests share a kitchen and a shaded terrace, and breakfast with fruit from the garden can be ordered the evening before.',
      },
      hy: {
        title: 'Էջմիածնի Այգի Հյուրատուն',
        summary:
          'Հանգիստ հյուրատուն ծիրանենու այգիով՝ Էջմիածնի Մայր Տաճարից տասը րոպե քայլքի վրա։',
        description:
          'Էջմիածնի Այգի Հյուրատունը մեկհարկանի ընտանեկան տուն է, որի հյուրասենյակները բացվում են ծիրանենու և խաղողի այգի՝ Մայր Տաճարից և Սուրբ Հռիփսիմե եկեղեցուց տասը րոպե քայլքի վրա։ Այգու յուրաքանչյուր սենյակ ունի երկտեղանոց մահճակալ և տեղ ծալովի լրացուցիչ մահճակալի համար։ Հյուրերն օգտվում են ընդհանուր խոհանոցից և ստվերոտ տեռասից, իսկ այգու մրգերով նախաճաշը կարելի է պատվիրել նախորդ երեկոյան։',
      },
      ru: {
        title: 'Гостевой дом Ejmiatsin Garden',
        summary:
          'Тихий гостевой дом с абрикосовым садом в десяти минутах ходьбы от Эчмиадзинского собора.',
        description:
          'Ejmiatsin Garden — одноэтажный семейный дом, гостевые комнаты которого выходят в абрикосовый и виноградный сад, в десяти минутах пешком от Кафедрального собора и церкви Святой Рипсиме. В каждой садовой комнате двуспальная кровать и место для раскладной дополнительной кровати. Гостям доступны общая кухня и тенистая терраса, а завтрак с фруктами из сада можно заказать накануне вечером.',
      },
    },
    amenities: [
      'WiFi',
      'Parking',
      'Garden',
      'Kitchen',
      'Air Conditioning',
      'Family Friendly',
    ],
    policies: [
      { code: 'pets_allowed', value: 'false' },
      { code: 'smoking_allowed', value: 'false' },
      { code: 'children_allowed', value: 'true' },
      { code: 'cancellation_policy', value: 'MODERATE' },
      { code: 'check_in_time', value: '14:00' },
      { code: 'check_out_time', value: '11:00' },
    ],
    attributes: [
      { code: 'bedrooms', value: 4 },
      { code: 'bathrooms', value: 4 },
      { code: 'beds', value: 8 },
      { code: 'max_guests', value: 12 },
      { code: 'view_type', optionCodes: ['GARDEN'] },
      { code: 'floor_area_sqm', value: 150 },
    ],
    bookingRules: {
      minimumStayNights: 1,
      maximumStayNights: 14,
      advanceBookingMinHours: 12,
      advanceBookingMaxDays: 180,
    },
    contactVisible: true,
    units: [
      {
        type: 'PROPERTY_UNIT',
        label: 'Garden Room',
        capacity: 4,
        maxGuests: 3,
        bedConfiguration: [
          { type: 'DOUBLE', count: 1 },
          { type: 'EXTRA_BED', count: 1 },
        ],
      },
    ],
  },
];

export default QA_ACCOMMODATION_LISTINGS;
