/**
 * Local QA environment — the 10 non-accommodation listings (2 each for
 * Restaurants, Tours, Car Rentals, Attractions and Entertainment Venues)
 * owned by the QA Partner company.
 *
 * Same spec shape as `qaCatalogAccommodation.js`. Every listing follows
 * the current booking contract truthfully:
 * - Restaurants: the reservation is free; the PER_PERSON price is the
 *   average spend shown to guests; a RESTAURANT_TABLE unit's capacity counts
 *   concurrent reservations, never diners.
 * - Tours / Attractions / Entertainment: PER_PERSON, one TOUR_DEPARTURE unit
 *   per listing with a fixed daily time slot; its capacity counts the
 *   travelers / visitors / participants a departure takes.
 * - Car Rentals: PER_DAY, one VEHICLE unit whose capacity is the fleet size.
 *
 * `closedWeekdays` (0 = Sunday … 6 = Saturday) lists the days with no
 * departure or service; `seedDemoQaEnvironment.js` marks those calendar
 * dates BLOCKED, the same status-only write a Partner makes from the
 * calendar.
 */

export const QA_EXPERIENCE_LISTINGS = [
  // === RESTAURANTS ======================================================
  {
    partner: 'qa',
    listingType: 'RESTAURANT',
    categorySlug: 'restaurants',
    citySlug: 'yerevan',
    slug: 'qa-lavash-and-vine-wine-restaurant',
    pricingModel: 'PER_PERSON',
    amount: 12000,
    coordinates: [40.186, 44.508],
    closedWeekdays: [1],
    images: ['restaurants-5.svg', 'restaurants-6.svg', 'restaurants-7.svg'],
    translations: {
      en: {
        title: 'Lavash & Vine Wine Restaurant',
        summary:
          'Modern Armenian cooking and a cellar of Armenian wines on Saryan Street, with live jazz on Friday and Saturday evenings.',
        description:
          'Lavash & Vine pairs a short seasonal menu of modern Armenian dishes with more than a hundred Armenian wines, from Areni reds to Vayots Dzor whites. The dining room has an open tonir oven and a summer terrace on Saryan Street, and a trio plays jazz on Friday and Saturday evenings. A reservation is free; the price shown is the average spend per guest, and you pay the restaurant directly for what you order.',
      },
      hy: {
        title: 'Լավաշ և Գինի Գինու Ռեստորան',
        summary:
          'Ժամանակակից հայկական խոհանոց և հայկական գինիների մառան Սարյան փողոցում՝ ուրբաթ և շաբաթ երեկոյան կենդանի ջազով։',
        description:
          'Լավաշ և Գինին համադրում է ժամանակակից հայկական ուտեստների կարճ սեզոնային ճաշացանկը հարյուրից ավելի հայկական գինիների հետ՝ Արենիի կարմիրներից մինչև Վայոց Ձորի սպիտակներ։ Սրահն ունի բաց թոնիր և ամառային տեռաս Սարյան փողոցում, իսկ ուրբաթ և շաբաթ երեկոյան եռյակը ջազ է նվագում։ Ամրագրումն անվճար է. նշված գինը մեկ հյուրի միջին ծախսն է, և պատվիրածի համար վճարում եք անմիջապես ռեստորանին։',
      },
      ru: {
        title: 'Винный ресторан Lavash & Vine',
        summary:
          'Современная армянская кухня и погреб армянских вин на улице Сарьяна, по пятницам и субботам вечером — живой джаз.',
        description:
          'Lavash & Vine сочетает короткое сезонное меню современной армянской кухни с более чем сотней армянских вин — от красных вин Арени до белых Вайоц Дзора. В зале открытый тонир, летом работает терраса на улице Сарьяна, а по пятницам и субботам вечером играет джазовое трио. Бронирование бесплатное: указанная цена — средний чек на гостя, а за заказ вы платите ресторану напрямую.',
      },
    },
    amenities: [
      'WiFi',
      'Air Conditioning',
      'Outdoor Seating',
      'Live Music',
      'Non-Smoking Rooms',
      'Wheelchair Accessible',
    ],
    policies: [
      { code: 'smoking_allowed', value: 'false' },
      { code: 'children_allowed', value: 'true' },
    ],
    attributes: [
      { code: 'cuisine', optionCodes: ['ARMENIAN', 'EUROPEAN'] },
      { code: 'price_tier', optionCodes: ['$$$'] },
    ],
    contactVisible: true,
    openingHours: [
      { dayOfWeek: 0, opensAt: '13:00', closesAt: '23:00' },
      { dayOfWeek: 1, isClosed: true },
      { dayOfWeek: 2, opensAt: '17:00', closesAt: '23:59' },
      { dayOfWeek: 3, opensAt: '17:00', closesAt: '23:59' },
      { dayOfWeek: 4, opensAt: '17:00', closesAt: '23:59' },
      { dayOfWeek: 5, opensAt: '17:00', closesAt: '23:59' },
      { dayOfWeek: 6, opensAt: '13:00', closesAt: '23:59' },
    ],
    menu: {
      name: 'Evening Menu',
      description: 'Seasonal; the kitchen takes last orders at 22:30.',
      sections: [
        {
          title: 'To Start',
          items: [
            {
              title: 'Tonir-baked lavash with matsun butter',
              priceAmount: 1500,
              dietaryMarkers: ['vegetarian'],
            },
            {
              title: 'Eggplant, walnut and pomegranate salad',
              priceAmount: 3200,
              dietaryMarkers: ['vegan', 'gluten-free'],
            },
          ],
        },
        {
          title: 'Mains',
          items: [
            {
              title: 'Slow-cooked lamb with apricots',
              description: 'Served with bulgur pilaf.',
              priceAmount: 7800,
              dietaryMarkers: [],
            },
            {
              title: 'Sevan trout with tarragon',
              priceAmount: 6900,
              dietaryMarkers: ['gluten-free'],
            },
          ],
        },
        {
          title: 'Wine by the Glass',
          items: [
            {
              title: 'Areni Noir, Vayots Dzor',
              priceAmount: 2800,
              dietaryMarkers: ['vegan'],
            },
            {
              title: 'Voskehat, Aragatsotn',
              priceAmount: 2600,
              dietaryMarkers: ['vegan'],
            },
          ],
        },
      ],
    },
    units: [{ type: 'RESTAURANT_TABLE', label: 'Dining Room', capacity: 12 }],
  },
  {
    partner: 'qa',
    listingType: 'RESTAURANT',
    categorySlug: 'restaurants',
    citySlug: 'dilijan',
    slug: 'qa-dilijan-mountain-trout-house',
    pricingModel: 'PER_PERSON',
    amount: 7000,
    coordinates: [40.746, 44.85],
    closedWeekdays: [2],
    images: ['restaurants-8.svg', 'restaurants-1.svg', 'restaurants-3.svg'],
    translations: {
      en: {
        title: 'Dilijan Mountain Trout House',
        summary:
          'A riverside family restaurant outside Dilijan serving trout from its own ponds, grilled over vine wood.',
        description:
          'Mountain Trout House sits beside the Aghstev river a few kilometres outside Dilijan, with tables on wooden decks over the water and a playground for children. Trout comes from the restaurant’s own spring-fed ponds and is grilled over vine wood or baked in lavash with herbs. The reservation is free; the price shown is the average spend per guest.',
      },
      hy: {
        title: 'Դիլիջանի Լեռնային Իշխանի Տուն',
        summary:
          'Գետափնյա ընտանեկան ռեստորան Դիլիջանի մոտ, որտեղ սեփական լճակներից բռնված իշխանը խորովում են որթատունկի փայտի վրա։',
        description:
          'Լեռնային Իշխանի Տունը գտնվում է Աղստև գետի ափին՝ Դիլիջանից մի քանի կիլոմետր հեռավորության վրա, սեղանները դրված են ջրի վրա փայտե հարթակներին, իսկ երեխաների համար կա խաղահրապարակ։ Իշխանը բերվում է ռեստորանի սեփական աղբյուրային լճակներից և խորովվում է որթատունկի փայտի վրա կամ թխվում լավաշի մեջ կանաչիներով։ Ամրագրումն անվճար է. նշված գինը մեկ հյուրի միջին ծախսն է։',
      },
      ru: {
        title: 'Ресторан Dilijan Mountain Trout House',
        summary:
          'Семейный ресторан у реки под Дилижаном: форель из собственных прудов, жаренная на виноградной лозе.',
        description:
          'Mountain Trout House стоит у реки Агстев в нескольких километрах от Дилижана: столики на деревянных настилах над водой и детская площадка. Форель — из собственных прудов ресторана с родниковой водой, её жарят на виноградной лозе или запекают в лаваше с зеленью. Бронирование бесплатное; указанная цена — средний чек на гостя.',
      },
    },
    amenities: ['Parking', 'Outdoor Seating', 'Family Friendly', 'WiFi'],
    policies: [
      { code: 'smoking_allowed', value: 'true' },
      { code: 'children_allowed', value: 'true' },
    ],
    attributes: [
      { code: 'cuisine', optionCodes: ['ARMENIAN'] },
      { code: 'price_tier', optionCodes: ['$$'] },
    ],
    contactVisible: true,
    openingHours: [
      { dayOfWeek: 0, opensAt: '11:00', closesAt: '22:00' },
      { dayOfWeek: 1, opensAt: '12:00', closesAt: '21:00' },
      { dayOfWeek: 2, isClosed: true },
      { dayOfWeek: 3, opensAt: '12:00', closesAt: '21:00' },
      { dayOfWeek: 4, opensAt: '12:00', closesAt: '21:00' },
      { dayOfWeek: 5, opensAt: '12:00', closesAt: '22:00' },
      { dayOfWeek: 6, opensAt: '11:00', closesAt: '22:00' },
    ],
    menu: {
      name: 'Riverside Menu',
      description: 'Trout is weighed and priced per portion of about 400 g.',
      sections: [
        {
          title: 'From the Ponds',
          items: [
            {
              title: 'Trout grilled over vine wood',
              priceAmount: 4500,
              dietaryMarkers: ['gluten-free'],
            },
            {
              title: 'Trout baked in lavash with herbs',
              priceAmount: 4800,
              dietaryMarkers: [],
            },
          ],
        },
        {
          title: 'Sides',
          items: [
            {
              title: 'Grilled vegetables',
              priceAmount: 1800,
              dietaryMarkers: ['vegan', 'gluten-free'],
            },
            {
              title: 'Herb and cheese platter',
              priceAmount: 2200,
              dietaryMarkers: ['vegetarian'],
            },
          ],
        },
      ],
    },
    units: [
      { type: 'RESTAURANT_TABLE', label: 'Riverside Decks', capacity: 8 },
    ],
  },

  // === TOURS ============================================================
  {
    partner: 'qa',
    listingType: 'TOUR',
    categorySlug: 'tours',
    citySlug: 'goris',
    slug: 'qa-tatev-monastery-wings-of-tatev-tour',
    pricingModel: 'PER_PERSON',
    amount: 22000,
    coordinates: [39.507, 46.338],
    closedWeekdays: [1],
    images: ['tours-1.svg', 'tours-3.svg', 'tours-5.svg'],
    translations: {
      en: {
        title: 'Tatev Monastery & Wings of Tatev Tour',
        summary:
          'A five-hour small-group tour from Goris: the Wings of Tatev cable car, Tatev Monastery and the Devil’s Bridge springs.',
        description:
          'The tour leaves central Goris at 09:30 and drives to Halidzor for the Wings of Tatev cable car, which crosses the Vorotan gorge to the 9th-century Tatev Monastery. After a guided visit you walk down to the Devil’s Bridge mineral springs before the drive back. The price is per traveler and includes the cable car ticket; book one place for each person in your group. There are no departures on Mondays, when the cable car is closed for maintenance.',
      },
      hy: {
        title: 'Տաթևի Վանք և «Տաթևի թևեր» Տուր',
        summary:
          'Հնգժամյա տուր փոքր խմբով Գորիսից՝ «Տաթևի թևեր» ճոպանուղի, Տաթևի վանք և Սատանի կամրջի աղբյուրներ։',
        description:
          'Տուրը մեկնում է Գորիսի կենտրոնից ժամը 09:30-ին և ուղևորվում Հալիձոր՝ «Տաթևի թևեր» ճոպանուղու մոտ, որն անցնում է Որոտանի կիրճով դեպի IX դարի Տաթևի վանք։ Էքսկուրսիայից հետո իջնում եք Սատանի կամրջի հանքային աղբյուրներ, ապա վերադառնում։ Գինը նշված է մեկ ճանապարհորդի համար և ներառում է ճոպանուղու տոմսը. ամրագրեք մեկ տեղ ձեր խմբի յուրաքանչյուր անդամի համար։ Երկուշաբթի օրերին մեկնումներ չկան, քանի որ ճոպանուղին փակ է սպասարկման համար։',
      },
      ru: {
        title: 'Тур в Татевский монастырь и на «Крылья Татева»',
        summary:
          'Пятичасовой тур в небольшой группе из Гориса: канатная дорога «Крылья Татева», Татевский монастырь и источники у Чёртова моста.',
        description:
          'Тур отправляется из центра Гориса в 09:30 и едет в Алидзор к канатной дороге «Крылья Татева», которая пересекает ущелье Воротан к Татевскому монастырю IX века. После экскурсии вы спуститесь к минеральным источникам у Чёртова моста и поедете обратно. Цена указана за одного путешественника и включает билет на канатную дорогу; бронируйте по одному месту на каждого участника. По понедельникам выездов нет — канатная дорога закрыта на обслуживание.',
      },
    },
    amenities: ['Family Friendly'],
    policies: [
      { code: 'cancellation_policy', value: 'MODERATE' },
      { code: 'children_allowed', value: 'true' },
    ],
    attributes: [
      { code: 'duration_minutes', value: 300 },
      { code: 'difficulty', optionCodes: ['EASY'] },
      { code: 'max_group_size', value: 16 },
      { code: 'languages_offered', optionCodes: ['EN', 'HY', 'RU'] },
      { code: 'meeting_point_type', optionCodes: ['FIXED_LOCATION'] },
    ],
    bookingRules: { advanceBookingMinHours: 18, advanceBookingMaxDays: 180 },
    contactVisible: true,
    highlights: {
      en: [
        {
          iconCode: 'mountain',
          text: 'Cross the Vorotan gorge on the Wings of Tatev',
        },
        {
          iconCode: 'clock',
          text: 'Five hours, departing 09:30 from central Goris',
        },
        { iconCode: 'group', text: 'Up to 16 travelers per departure' },
      ],
      hy: [
        { iconCode: 'mountain', text: 'Անցեք Որոտանի կիրճը «Տաթևի թևերով»' },
        {
          iconCode: 'clock',
          text: 'Հինգ ժամ, մեկնում 09:30-ին Գորիսի կենտրոնից',
        },
        {
          iconCode: 'group',
          text: 'Մինչև 16 ճանապարհորդ յուրաքանչյուր մեկնման ժամանակ',
        },
      ],
      ru: [
        {
          iconCode: 'mountain',
          text: 'Над ущельем Воротан на «Крыльях Татева»',
        },
        {
          iconCode: 'clock',
          text: 'Пять часов, отправление в 09:30 из центра Гориса',
        },
        { iconCode: 'group', text: 'До 16 путешественников в одном выезде' },
      ],
    },
    itinerary: {
      en: [
        {
          title: 'Meet in central Goris',
          description: 'Board the minibus on Mashtots Street.',
          durationMinutes: 15,
        },
        {
          title: 'Wings of Tatev cable car',
          description: 'A 12-minute ride across the Vorotan gorge.',
          durationMinutes: 60,
        },
        {
          title: 'Tatev Monastery',
          description: 'Guided visit of the church, library and oil mill.',
          durationMinutes: 90,
        },
        {
          title: 'Devil’s Bridge springs',
          description:
            'Short walk down to the natural bridge and warm springs.',
          durationMinutes: 75,
        },
        { title: 'Return to Goris', durationMinutes: 60 },
      ],
      hy: [
        {
          title: 'Հանդիպում Գորիսի կենտրոնում',
          description: 'Միկրոավտոբուսը կանգնած է Մաշտոցի փողոցում։',
          durationMinutes: 15,
        },
        {
          title: '«Տաթևի թևեր» ճոպանուղի',
          description: '12 րոպեանոց ճանապարհ Որոտանի կիրճի վրայով։',
          durationMinutes: 60,
        },
        {
          title: 'Տաթևի վանք',
          description: 'Էքսկուրսիա եկեղեցում, մատենադարանում և ձիթհանում։',
          durationMinutes: 90,
        },
        {
          title: 'Սատանի կամրջի աղբյուրներ',
          description: 'Կարճ վայրէջք դեպի բնական կամուրջ և տաք աղբյուրներ։',
          durationMinutes: 75,
        },
        { title: 'Վերադարձ Գորիս', durationMinutes: 60 },
      ],
      ru: [
        {
          title: 'Встреча в центре Гориса',
          description: 'Посадка в микроавтобус на улице Маштоца.',
          durationMinutes: 15,
        },
        {
          title: 'Канатная дорога «Крылья Татева»',
          description: '12 минут над ущельем Воротан.',
          durationMinutes: 60,
        },
        {
          title: 'Татевский монастырь',
          description: 'Экскурсия по церкви, библиотеке и маслобойне.',
          durationMinutes: 90,
        },
        {
          title: 'Источники у Чёртова моста',
          description: 'Короткий спуск к природному мосту и тёплым источникам.',
          durationMinutes: 75,
        },
        { title: 'Возвращение в Горис', durationMinutes: 60 },
      ],
    },
    included: {
      en: [
        { itemText: 'Wings of Tatev cable car ticket', isIncluded: true },
        { itemText: 'Licensed guide and minibus transport', isIncluded: true },
        { itemText: 'Lunch', isIncluded: false },
      ],
      hy: [
        { itemText: '«Տաթևի թևեր» ճոպանուղու տոմս', isIncluded: true },
        {
          itemText: 'Լիցենզավորված ուղեկցորդ և միկրոավտոբուս',
          isIncluded: true,
        },
        { itemText: 'Ճաշ', isIncluded: false },
      ],
      ru: [
        {
          itemText: 'Билет на канатную дорогу «Крылья Татева»',
          isIncluded: true,
        },
        { itemText: 'Лицензированный гид и микроавтобус', isIncluded: true },
        { itemText: 'Обед', isIncluded: false },
      ],
    },
    units: [
      {
        type: 'TOUR_DEPARTURE',
        label: 'Daily Departure',
        capacity: 16,
        timeSlotStart: '09:30:00',
        timeSlotEnd: '14:30:00',
      },
    ],
  },
  {
    partner: 'qa',
    listingType: 'TOUR',
    categorySlug: 'tours',
    citySlug: 'yerevan',
    slug: 'qa-mount-aragats-southern-summit-hike',
    pricingModel: 'PER_PERSON',
    amount: 18000,
    coordinates: [40.1777, 44.5126],
    closedWeekdays: [1, 2, 3, 4, 5],
    images: ['tours-2.svg', 'tours-4.svg', 'tours-6.svg'],
    translations: {
      en: {
        title: 'Mount Aragats Southern Summit Hike',
        summary:
          'A weekend guided hike from Yerevan to the 3,879 m southern summit of Mount Aragats, Armenia’s highest mountain.',
        description:
          'This is a full mountain day for fit hikers: a 06:00 pickup in Yerevan, a drive to Lake Kari at 3,200 m, then about four hours of ascent over scree to the southern summit with views into the volcano’s crater. Groups are kept to eight travelers with two guides. The price is per traveler and covers transport, guides and a packed lunch. Departures run on Saturdays and Sundays only.',
      },
      hy: {
        title: 'Արագածի Հարավային Գագաթ Արշավ',
        summary:
          'Հանգստյան օրերի արշավ ուղեկցորդով Երևանից դեպի Արագածի 3879 մ բարձրությամբ հարավային գագաթ՝ Հայաստանի ամենաբարձր լեռը։',
        description:
          'Սա լիարժեք լեռնային օր է լավ մարզավիճակ ունեցող արշավականների համար. ժամը 06:00-ին մեկնում Երևանից, ճանապարհ դեպի Քարի լիճ՝ 3200 մ բարձրության վրա, ապա մոտ չորս ժամ վերելք քարաթափով դեպի հարավային գագաթ՝ հրաբխի խառնարանի տեսարանով։ Խմբերը սահմանափակված են ութ ճանապարհորդով և երկու ուղեկցորդով։ Գինը նշված է մեկ ճանապարհորդի համար և ներառում է տրանսպորտը, ուղեկցորդներին և ճանապարհի ճաշը։ Մեկնումները միայն շաբաթ և կիրակի օրերին են։',
      },
      ru: {
        title: 'Поход на южную вершину Арагаца',
        summary:
          'Поход с гидом по выходным из Еревана на южную вершину Арагаца (3879 м) — самой высокой горы Армении.',
        description:
          'Это полноценный горный день для подготовленных: выезд из Еревана в 06:00, дорога к озеру Кари на высоте 3200 м, затем около четырёх часов подъёма по осыпям на южную вершину с видом в кратер вулкана. В группе не больше восьми путешественников и два гида. Цена указана за одного путешественника и включает транспорт, гидов и ланч-бокс. Выезды только по субботам и воскресеньям.',
      },
    },
    amenities: [],
    policies: [
      { code: 'cancellation_policy', value: 'STRICT' },
      { code: 'children_allowed', value: 'false' },
    ],
    attributes: [
      { code: 'duration_minutes', value: 660 },
      { code: 'difficulty', optionCodes: ['CHALLENGING'] },
      { code: 'max_group_size', value: 8 },
      { code: 'languages_offered', optionCodes: ['EN', 'RU'] },
      { code: 'meeting_point_type', optionCodes: ['HOTEL_PICKUP'] },
    ],
    bookingRules: { advanceBookingMinHours: 48, advanceBookingMaxDays: 120 },
    contactVisible: true,
    faqs: {
      en: [
        {
          question: 'How fit do I need to be?',
          answer:
            'You should be comfortable walking uphill for four hours on loose rock at altitude. Hiking boots are required.',
        },
        {
          question: 'What happens if the weather turns?',
          answer:
            'The guides turn back below the summit if conditions are unsafe; the departure is not refunded for weather, but you may move to another weekend.',
        },
      ],
      hy: [
        {
          question: 'Որքա՞ն մարզված պետք է լինեմ։',
          answer:
            'Պետք է կարողանաք չորս ժամ բարձրանալ բարձրադիր գոտում անկայուն քարերի վրայով։ Արշավային կոշիկները պարտադիր են։',
        },
        {
          question: 'Ի՞նչ է լինում, եթե եղանակը վատանա։',
          answer:
            'Եթե պայմանները վտանգավոր են, ուղեկցորդները վերադառնում են գագաթից ներքև. եղանակի պատճառով գումարը չի վերադարձվում, բայց կարող եք տեղափոխվել այլ հանգստյան օր։',
        },
      ],
      ru: [
        {
          question: 'Какая нужна подготовка?',
          answer:
            'Нужно уверенно идти в гору четыре часа по осыпям на высоте. Треккинговые ботинки обязательны.',
        },
        {
          question: 'Что будет, если испортится погода?',
          answer:
            'Если условия опасны, гиды разворачивают группу ниже вершины; из-за погоды деньги не возвращаются, но можно перенести участие на другие выходные.',
        },
      ],
    },
    units: [
      {
        type: 'TOUR_DEPARTURE',
        label: 'Weekend Departure',
        capacity: 8,
        timeSlotStart: '06:00:00',
        timeSlotEnd: '17:00:00',
      },
    ],
  },

  // === CAR RENTALS ======================================================
  {
    partner: 'qa',
    listingType: 'CAR_RENTAL',
    categorySlug: 'car-rentals',
    citySlug: 'yerevan',
    slug: 'qa-electric-city-hatchback',
    pricingModel: 'PER_DAY',
    amount: 19000,
    coordinates: [40.1792, 44.4991],
    images: ['car-rentals-1.svg', 'car-rentals-2.svg', 'car-rentals-5.svg'],
    translations: {
      en: {
        title: 'Electric City Hatchback',
        summary:
          'A fully electric five-door hatchback for Yerevan and day trips, with a home charging cable and unlimited mileage.',
        description:
          'Our fleet of four identical electric hatchbacks is ideal for city driving and day trips to Garni, Sevan or Ejmiatsin: a real-world range of about 380 km, automatic transmission and room for five. Each car comes with a charging cable and a map of fast chargers along the main highways. Rentals are priced per calendar day, including the return day, with unlimited mileage.',
      },
      hy: {
        title: 'Էլեկտրական Քաղաքային Հեչբեք',
        summary:
          'Ամբողջովին էլեկտրական հնգադուռ հեչբեք Երևանի և մեկօրյա ուղևորությունների համար՝ լիցքավորման մալուխով և անսահմանափակ վազքով։',
        description:
          'Մեր չորս նույնատիպ էլեկտրական հեչբեքներից բաղկացած ավտոպարկը իդեալական է քաղաքում վարելու և Գառնի, Սևան կամ Էջմիածին մեկօրյա ուղևորությունների համար՝ մոտ 380 կմ իրական վազք, ավտոմատ փոխանցման տուփ և տեղ հինգ հոգու համար։ Յուրաքանչյուր մեքենայի հետ տրվում է լիցքավորման մալուխ և գլխավոր մայրուղիների արագ լիցքավորման կետերի քարտեզ։ Վարձույթը հաշվարկվում է օրացուցային օրով՝ ներառյալ վերադարձի օրը, անսահմանափակ վազքով։',
      },
      ru: {
        title: 'Электрический городской хэтчбек',
        summary:
          'Полностью электрический пятидверный хэтчбек для Еревана и однодневных поездок, с кабелем для зарядки и без ограничения пробега.',
        description:
          'Наш парк из четырёх одинаковых электрических хэтчбеков идеально подходит для города и поездок в Гарни, Севан или Эчмиадзин: реальный запас хода около 380 км, автоматическая коробка и пять мест. К каждой машине прилагаются зарядный кабель и карта быстрых зарядок вдоль основных трасс. Аренда считается по календарным дням, включая день возврата, без ограничения пробега.',
      },
    },
    amenities: ['EV Charger', 'Air Conditioning'],
    policies: [
      { code: 'smoking_allowed', value: 'false' },
      { code: 'cancellation_policy', value: 'FLEXIBLE' },
    ],
    attributes: [
      { code: 'transmission', optionCodes: ['AUTOMATIC'] },
      { code: 'seats', value: 5 },
      { code: 'fuel_type', optionCodes: ['ELECTRIC'] },
      { code: 'doors', value: 5 },
      { code: 'luggage_capacity', value: 2 },
      { code: 'min_driver_age', value: 21 },
      { code: 'mileage_policy', optionCodes: ['UNLIMITED'] },
    ],
    bookingRules: {
      minimumStayNights: 1,
      maximumStayNights: 30,
      advanceBookingMinHours: 4,
      advanceBookingMaxDays: 180,
    },
    contactVisible: true,
    units: [{ type: 'VEHICLE', label: 'Electric Hatchback', capacity: 4 }],
  },
  {
    partner: 'qa',
    listingType: 'CAR_RENTAL',
    categorySlug: 'car-rentals',
    citySlug: 'yerevan',
    slug: 'qa-premium-business-sedan-airport-delivery',
    pricingModel: 'PER_DAY',
    amount: 35000,
    coordinates: [40.1473, 44.3959],
    images: ['car-rentals-3.svg', 'car-rentals-4.svg', 'car-rentals-6.svg'],
    translations: {
      en: {
        title: 'Premium Business Sedan with Airport Delivery',
        summary:
          'A hybrid executive sedan delivered to Zvartnots Airport, with leather seats and 250 km included per day.',
        description:
          'We keep two identical hybrid executive sedans for travelers who want a comfortable car waiting on arrival. The car is delivered to the Zvartnots arrivals hall and collected there on departure, at no extra charge. It has leather seats, adaptive cruise control and room for three suitcases; 250 km per day are included, and the driver must be at least 25.',
      },
      hy: {
        title: 'Պրեմիում Բիզնես Սեդան՝ Օդանավակայան Առաքմամբ',
        summary:
          'Հիբրիդային էքզեկյուտիվ սեդան՝ առաքմամբ «Զվարթնոց» օդանավակայան, կաշվե նստատեղերով և օրական 250 կմ ներառված վազքով։',
        description:
          'Մենք ունենք երկու նույնատիպ հիբրիդային էքզեկյուտիվ սեդան այն ճանապարհորդների համար, ովքեր ցանկանում են ժամանելիս հարմարավետ մեքենա գտնել։ Մեքենան առաքվում է «Զվարթնոցի» ժամանման սրահ և այնտեղից էլ վերցվում մեկնելիս՝ առանց հավելավճարի։ Այն ունի կաշվե նստատեղեր, ադապտիվ կրուիզ-կոնտրոլ և տեղ երեք ճամպրուկի համար. օրական ներառված է 250 կմ, իսկ վարորդը պետք է լինի առնվազն 25 տարեկան։',
      },
      ru: {
        title: 'Премиальный бизнес-седан с доставкой в аэропорт',
        summary:
          'Гибридный седан бизнес-класса с доставкой в аэропорт «Звартноц», кожаным салоном и 250 км в сутки.',
        description:
          'У нас два одинаковых гибридных седана бизнес-класса для тех, кто хочет, чтобы удобная машина ждала их по прилёте. Машину доставляют в зал прилёта «Звартноца» и забирают там же при отлёте без доплаты. Кожаный салон, адаптивный круиз-контроль и место для трёх чемоданов; в сутки включено 250 км, водителю должно быть не меньше 25 лет.',
      },
    },
    amenities: ['Air Conditioning'],
    policies: [
      { code: 'smoking_allowed', value: 'false' },
      { code: 'cancellation_policy', value: 'MODERATE' },
    ],
    attributes: [
      { code: 'transmission', optionCodes: ['AUTOMATIC'] },
      { code: 'seats', value: 5 },
      { code: 'fuel_type', optionCodes: ['HYBRID'] },
      { code: 'doors', value: 4 },
      { code: 'luggage_capacity', value: 3 },
      { code: 'min_driver_age', value: 25 },
      { code: 'mileage_policy', optionCodes: ['LIMITED'] },
    ],
    bookingRules: {
      minimumStayNights: 2,
      maximumStayNights: 21,
      advanceBookingMinHours: 24,
      advanceBookingMaxDays: 270,
    },
    contactVisible: true,
    units: [{ type: 'VEHICLE', label: 'Hybrid Business Sedan', capacity: 2 }],
  },

  // === ATTRACTIONS ======================================================
  {
    partner: 'qa',
    listingType: 'ATTRACTION',
    categorySlug: 'attractions',
    citySlug: 'yerevan',
    slug: 'qa-matenadaran-manuscript-museum-visit',
    pricingModel: 'PER_PERSON',
    amount: 5000,
    coordinates: [40.1922, 44.5211],
    closedWeekdays: [0, 1],
    images: ['attractions-1.svg', 'attractions-3.svg', 'attractions-5.svg'],
    translations: {
      en: {
        title: 'Matenadaran Manuscript Museum Guided Visit',
        summary:
          'A 90-minute guided visit of the Matenadaran’s ancient manuscripts, from illuminated Gospels to medieval medical texts.',
        description:
          'The Matenadaran holds one of the world’s largest collections of medieval manuscripts. This guided visit starts at 11:00 and covers the main exhibition: illuminated Gospels, the giant Homilies of Mush, early maps and medieval treatises on medicine and astronomy. The price is per visitor and includes the museum ticket; book one place for each visitor. The museum is closed on Sundays and Mondays.',
      },
      hy: {
        title: 'Մատենադարան՝ Էքսկուրսիա Ուղեկցորդով',
        summary:
          '90 րոպեանոց էքսկուրսիա Մատենադարանի հնագույն ձեռագրերով՝ մանրանկարչությամբ զարդարված Ավետարաններից մինչև միջնադարյան բժշկական գրքեր։',
        description:
          'Մատենադարանը պահպանում է աշխարհի միջնադարյան ձեռագրերի ամենամեծ հավաքածուներից մեկը։ Էքսկուրսիան սկսվում է ժամը 11:00-ին և ներառում է գլխավոր ցուցադրությունը՝ մանրանկարներով Ավետարաններ, հսկայական «Մշո ճառընտիրը», վաղ քարտեզներ և միջնադարյան աշխատություններ բժշկության ու աստղագիտության մասին։ Գինը նշված է մեկ այցելուի համար և ներառում է թանգարանի տոմսը. ամրագրեք մեկ տեղ յուրաքանչյուր այցելուի համար։ Թանգարանը փակ է կիրակի և երկուշաբթի օրերին։',
      },
      ru: {
        title: 'Экскурсия в Матенадаран',
        summary:
          '90-минутная экскурсия по древним рукописям Матенадарана — от иллюминированных Евангелий до средневековых трактатов по медицине.',
        description:
          'Матенадаран хранит одну из крупнейших в мире коллекций средневековых рукописей. Экскурсия начинается в 11:00 и охватывает основную экспозицию: иллюминированные Евангелия, огромный Мушский гомилиарий, старинные карты и средневековые трактаты по медицине и астрономии. Цена указана за одного посетителя и включает входной билет; бронируйте по одному месту на каждого посетителя. Музей закрыт по воскресеньям и понедельникам.',
      },
    },
    amenities: ['Wheelchair Accessible', 'Air Conditioning', 'Family Friendly'],
    policies: [{ code: 'children_allowed', value: 'true' }],
    attributes: [
      { code: 'duration_minutes', value: 90 },
      { code: 'languages_offered', optionCodes: ['EN', 'HY', 'RU'] },
      { code: 'max_group_size', value: 20 },
    ],
    bookingRules: { advanceBookingMinHours: 3, advanceBookingMaxDays: 90 },
    contactVisible: true,
    highlights: {
      en: [
        {
          iconCode: 'award',
          text: 'One of the world’s great manuscript collections',
        },
        { iconCode: 'clock', text: '90 minutes, starting at 11:00' },
        { iconCode: 'users', text: 'Up to 20 visitors per guided visit' },
      ],
      hy: [
        {
          iconCode: 'award',
          text: 'Աշխարհի ձեռագրերի մեծագույն հավաքածուներից մեկը',
        },
        { iconCode: 'clock', text: '90 րոպե, սկիզբը՝ 11:00-ին' },
        {
          iconCode: 'users',
          text: 'Մինչև 20 այցելու յուրաքանչյուր էքսկուրսիայում',
        },
      ],
      ru: [
        {
          iconCode: 'award',
          text: 'Одна из крупнейших коллекций рукописей в мире',
        },
        { iconCode: 'clock', text: '90 минут, начало в 11:00' },
        { iconCode: 'users', text: 'До 20 посетителей в одной экскурсии' },
      ],
    },
    units: [
      {
        type: 'TOUR_DEPARTURE',
        label: 'Guided Visit',
        capacity: 20,
        timeSlotStart: '11:00:00',
        timeSlotEnd: '12:30:00',
      },
    ],
  },
  {
    partner: 'qa',
    listingType: 'ATTRACTION',
    categorySlug: 'attractions',
    citySlug: 'sevan',
    slug: 'qa-sevanavank-peninsula-monastery-visit',
    pricingModel: 'PER_PERSON',
    amount: 4000,
    coordinates: [40.5647, 45.0122],
    images: ['attractions-2.svg', 'attractions-4.svg', 'attractions-6.svg'],
    translations: {
      en: {
        title: 'Sevanavank Peninsula Monastery Visit',
        summary:
          'A guided late-afternoon visit to the 9th-century Sevanavank churches above Lake Sevan.',
        description:
          'Sevanavank’s two basalt churches stand on a peninsula that was an island until the lake level was lowered in the 20th century. The guide meets you at the foot of the stairs at 17:00, tells the story of the monastery and its khachkars, and ends at the viewpoint as the light turns golden over the lake. The price is per visitor; book one place for each person.',
      },
      hy: {
        title: 'Սևանավանքի Թերակղզու Վանքի Այց',
        summary:
          'Ուղեկցորդով այց կեսօրից հետո դեպի IX դարի Սևանավանքի եկեղեցիներ՝ Սևանա լճի վերևում։',
        description:
          'Սևանավանքի երկու բազալտե եկեղեցիները կանգնած են թերակղզու վրա, որը կղզի էր մինչև XX դարում լճի մակարդակի իջեցումը։ Ուղեկցորդը ձեզ դիմավորում է աստիճանների ստորոտին ժամը 17:00-ին, պատմում վանքի և նրա խաչքարերի պատմությունը և այցն ավարտում դիտակետում, երբ լույսը ոսկեգույն է դառնում լճի վրա։ Գինը նշված է մեկ այցելուի համար. ամրագրեք մեկ տեղ յուրաքանչյուր անձի համար։',
      },
      ru: {
        title: 'Посещение монастыря Севанаванк',
        summary:
          'Экскурсия с гидом ближе к вечеру к церквям Севанаванка IX века над озером Севан.',
        description:
          'Две базальтовые церкви Севанаванка стоят на полуострове, который был островом до понижения уровня озера в XX веке. Гид встречает вас у подножия лестницы в 17:00, рассказывает историю монастыря и его хачкаров и завершает экскурсию на смотровой площадке, когда свет над озером становится золотым. Цена указана за одного посетителя; бронируйте по одному месту на каждого.',
      },
    },
    amenities: ['Parking', 'Family Friendly'],
    policies: [{ code: 'children_allowed', value: 'true' }],
    attributes: [
      { code: 'duration_minutes', value: 75 },
      { code: 'languages_offered', optionCodes: ['EN', 'RU'] },
      { code: 'max_group_size', value: 12 },
    ],
    bookingRules: { advanceBookingMinHours: 2, advanceBookingMaxDays: 120 },
    contactVisible: true,
    units: [
      {
        type: 'TOUR_DEPARTURE',
        label: 'Sunset Visit',
        capacity: 12,
        timeSlotStart: '17:00:00',
        timeSlotEnd: '18:15:00',
      },
    ],
  },

  // === ENTERTAINMENT VENUES =============================================
  {
    partner: 'qa',
    listingType: 'ATTRACTION',
    categorySlug: 'entertainment-venues',
    citySlug: 'yerevan',
    slug: 'qa-nova-laser-tag-arena',
    pricingModel: 'PER_PERSON',
    amount: 5500,
    coordinates: [40.17, 44.505],
    images: [
      'entertainment-venues-7.svg',
      'entertainment-venues-8.svg',
      'entertainment-venues-1.svg',
    ],
    translations: {
      en: {
        title: 'Nova Laser Tag Arena',
        summary:
          'A two-level indoor laser tag arena in Yerevan for teams of up to twelve players, priced per player.',
        description:
          'Nova is a two-level arena with fog, black-light mazes and sniper towers, playing a 45-minute evening game at 19:00 for up to twelve players split into two teams. A marshal runs the game and a short safety briefing beforehand. The price is per player; book one place for each participant. Players must be at least eight years old.',
      },
      hy: {
        title: 'Նովա Լազերային Թեգ Ասպարեզ',
        summary:
          'Երկհարկանի փակ լազերային թեգի ասպարեզ Երևանում՝ մինչև տասներկու խաղացողից բաղկացած թիմերի համար, գինը՝ մեկ խաղացողի համար։',
        description:
          'Նովան երկհարկանի ասպարեզ է՝ մառախուղով, ուլտրամանուշակագույն լույսով լաբիրինթոսներով և դիպուկահարների աշտարակներով. երեկոյան 19:00-ին անցկացվում է 45 րոպեանոց խաղ մինչև տասներկու խաղացողի համար՝ բաժանված երկու թիմի։ Խաղը վարում է մարշալը, որը նախապես անցկացնում է անվտանգության կարճ հրահանգավորում։ Գինը նշված է մեկ խաղացողի համար. ամրագրեք մեկ տեղ յուրաքանչյուր մասնակցի համար։ Խաղացողները պետք է լինեն առնվազն ութ տարեկան։',
      },
      ru: {
        title: 'Лазертаг-арена Nova',
        summary:
          'Двухуровневая крытая лазертаг-арена в Ереване для команд до двенадцати игроков, цена за одного игрока.',
        description:
          'Nova — двухуровневая арена с дымом, лабиринтами в ультрафиолете и снайперскими вышками: в 19:00 проходит 45-минутная вечерняя игра для двенадцати игроков, разделённых на две команды. Игру ведёт маршал, который перед началом проводит короткий инструктаж по безопасности. Цена указана за одного игрока; бронируйте по одному месту на каждого участника. Игрокам должно быть не меньше восьми лет.',
      },
    },
    amenities: ['Air Conditioning', 'Family Friendly', 'WiFi'],
    policies: [{ code: 'children_allowed', value: 'true' }],
    attributes: [
      { code: 'duration_minutes', value: 45 },
      { code: 'max_group_size', value: 12 },
    ],
    bookingRules: { advanceBookingMinHours: 1, advanceBookingMaxDays: 60 },
    contactVisible: true,
    units: [
      {
        type: 'TOUR_DEPARTURE',
        label: 'Evening Game',
        capacity: 12,
        timeSlotStart: '19:00:00',
        timeSlotEnd: '19:45:00',
      },
    ],
  },
  {
    partner: 'qa',
    listingType: 'ATTRACTION',
    categorySlug: 'entertainment-venues',
    citySlug: 'gyumri',
    slug: 'qa-gyumri-ceramics-workshop',
    pricingModel: 'PER_PERSON',
    amount: 9000,
    coordinates: [40.7894, 43.8475],
    closedWeekdays: [0, 1],
    images: [
      'entertainment-venues-2.svg',
      'entertainment-venues-4.svg',
      'entertainment-venues-6.svg',
    ],
    translations: {
      en: {
        title: 'Gyumri Ceramics Workshop',
        summary:
          'A two-hour hands-on pottery class in a Gyumri ceramic studio, for up to eight participants.',
        description:
          'In this afternoon class a Gyumri ceramicist shows you how to centre clay on the wheel, throw a small bowl or cup and decorate it with traditional Shirak patterns. Everything you make is glazed and fired, ready to collect two days later or posted to a Yerevan address. The price is per participant and includes clay, glazes and firing; book one place for each person. Classes run Tuesday to Saturday at 15:00.',
      },
      hy: {
        title: 'Գյումրիի Կերամիկայի Արհեստանոց',
        summary:
          'Երկժամյա գործնական խեցեգործության դաս Գյումրիի կերամիկայի արհեստանոցում՝ մինչև ութ մասնակցի համար։',
        description:
          'Կեսօրից հետո անցկացվող այս դասին գյումրեցի կերամիկագործը ցույց է տալիս, թե ինչպես կենտրոնացնել կավը բրուտի անիվի վրա, պատրաստել փոքր թաս կամ գավաթ և զարդարել այն ավանդական շիրակյան նախշերով։ Ձեր պատրաստած ամեն ինչ ջնարակվում և թրծվում է, պատրաստ է վերցնելու երկու օր անց կամ ուղարկվում է Երևանի հասցեով։ Գինը նշված է մեկ մասնակցի համար և ներառում է կավը, ջնարակը և թրծումը. ամրագրեք մեկ տեղ յուրաքանչյուր անձի համար։ Դասերը երեքշաբթիից շաբաթ են՝ ժամը 15:00-ին։',
      },
      ru: {
        title: 'Керамическая мастерская в Гюмри',
        summary:
          'Двухчасовой мастер-класс по гончарному делу в керамической студии Гюмри, до восьми участников.',
        description:
          'На этом дневном занятии гюмрийский керамист покажет, как центровать глину на гончарном круге, вытянуть небольшую чашу или кружку и украсить её традиционными ширакскими узорами. Всё, что вы сделаете, покроют глазурью и обожгут — забрать можно через два дня или получить посылкой по адресу в Ереване. Цена указана за одного участника и включает глину, глазури и обжиг; бронируйте по одному месту на каждого. Занятия со вторника по субботу в 15:00.',
      },
    },
    amenities: ['Family Friendly', 'WiFi'],
    policies: [{ code: 'children_allowed', value: 'true' }],
    attributes: [
      { code: 'duration_minutes', value: 120 },
      { code: 'max_group_size', value: 8 },
    ],
    bookingRules: { advanceBookingMinHours: 24, advanceBookingMaxDays: 90 },
    contactVisible: true,
    units: [
      {
        type: 'TOUR_DEPARTURE',
        label: 'Afternoon Class',
        capacity: 8,
        timeSlotStart: '15:00:00',
        timeSlotEnd: '17:00:00',
      },
    ],
  },
];

export default QA_EXPERIENCE_LISTINGS;
