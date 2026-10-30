/**
 * Home photography — every image the Home page shows, by key, with its
 * responsive sources and its licence credit (docs/HOME_IMAGE_SOURCES.md).
 *
 * The files live in `assets/images/home/` as `<key>-<width>.<avif|webp>`
 * (generated from the verified originals, see the sources doc). Sources
 * are discovered from those files, so replacing a placeholder with final
 * photography only means dropping in new files under the same key — no
 * component changes. `ratio` (width / height) reserves the image's space
 * before it loads, so nothing shifts.
 *
 * Every photo is a free-licence, Armenia-specific Wikimedia Commons file.
 * CC BY / CC BY-SA require visible attribution, which `PhotoCredits`
 * renders on the page from `credit` (the place it shows is translated:
 * `home.photoCredits.subjects.<key>`).
 */

const FILES = import.meta.glob('../../../assets/images/home/*.{avif,webp}', {
  eager: true,
  query: '?url',
  import: 'default',
});

const FILE_NAME = /\/([a-z-]+)-(\d+)\.(avif|webp)$/;

const SOURCES_BY_KEY = Object.entries(FILES).reduce((byKey, [path, url]) => {
  const [, key, width, format] = path.match(FILE_NAME);
  const entry = byKey[key] ?? { avif: [], webp: [] };
  entry[format].push({ url, width: Number(width) });
  return { ...byKey, [key]: entry };
}, {});

const toSrcSet = (sources) =>
  [...sources]
    .sort((a, b) => a.width - b.width)
    .map(({ url, width }) => `${url} ${width}w`)
    .join(', ');

const COMMONS = 'https://commons.wikimedia.org/wiki/File:';
const CC_BY_SA_4 = {
  name: 'CC BY-SA 4.0',
  url: 'https://creativecommons.org/licenses/by-sa/4.0/',
};
const CC_BY_SA_3 = {
  name: 'CC BY-SA 3.0',
  url: 'https://creativecommons.org/licenses/by-sa/3.0/',
};
const CC_BY_SA_2 = {
  name: 'CC BY-SA 2.0',
  url: 'https://creativecommons.org/licenses/by-sa/2.0/',
};
const CC_BY_4 = {
  name: 'CC BY 4.0',
  url: 'https://creativecommons.org/licenses/by/4.0/',
};
const CC0 = {
  name: 'CC0 1.0',
  url: 'https://creativecommons.org/publicdomain/zero/1.0/',
};

/** key -> width/height ratio of the source and its licence credit. */
const IMAGES = {
  'hero-ararat': {
    ratio: 1.5013,
    credit: {
      author: 'Andrew Behesnilian',
      licence: CC_BY_SA_3,
      source: `${COMMONS}Khor_Virap_Monastery_and_Mount_Ararat,_Armenia.jpg`,
    },
  },
  'category-hotels': {
    ratio: 1.7753,
    credit: {
      author: 'Marcin Konsek',
      licence: CC_BY_SA_4,
      source: `${COMMONS}2014_Erywa%C5%84,_Hotel_Armenia_Marriot_(02).jpg`,
    },
  },
  'category-apartments': {
    ratio: 1.3333,
    credit: {
      author: 'Benoît Prieur',
      licence: CC0,
      source: `${COMMONS}A_view_of_Kentron_from_Opera_Suite_Hotel_Yerevan_(June_2023).JPG`,
    },
  },
  'category-villas': {
    ratio: 1.5,
    credit: {
      author: 'Alexxx1979',
      licence: CC_BY_SA_4,
      source: `${COMMONS}Armenia._Dilijan_P8230683_2350.jpg`,
    },
  },
  'category-guest-houses': {
    ratio: 1.4002,
    credit: {
      author: 'Dor Shabashewitz',
      licence: CC_BY_4,
      source: `${COMMONS}Areni_view.jpg`,
    },
  },
  'category-restaurants': {
    ratio: 1.4302,
    credit: {
      author: 'Vyacheslav Argenberg',
      licence: CC_BY_4,
      source: `${COMMONS}Yerevan,_Lamb_and_mutton_dishes,_Armenian_cuisine,_Armenia.jpg`,
    },
  },
  'category-tours': {
    ratio: 1.8796,
    credit: {
      author: 'Diego Delso',
      licence: CC_BY_SA_4,
      source: `${COMMONS}Monasterio_de_Tatev,_Armenia,_2016-10-01,_DD_86-88_HDR.jpg`,
    },
  },
  'category-car-rentals': {
    ratio: 1.3333,
    credit: {
      author: 'Shaun Dunphy',
      licence: CC_BY_SA_2,
      source: `${COMMONS}Heading_down_from_the_Selim_Pass_(5128503778).jpg`,
    },
  },
  'category-attractions': {
    ratio: 1.5,
    credit: {
      author: 'Matthias Süßen',
      licence: CC_BY_SA_4,
      source: `${COMMONS}Garni_Armenien_msu-2018-3149.jpg`,
    },
  },
  'category-entertainment-venues': {
    ratio: 1.6222,
    credit: {
      author: 'Eupator',
      licence: CC_BY_SA_3,
      source: `${COMMONS}NightOpera.jpg`,
    },
  },
  'destination-yerevan': {
    ratio: 1.5,
    credit: {
      author: 'Marcin Konsek',
      licence: CC_BY_SA_4,
      source: `${COMMONS}2014_Erywa%C5%84,_Kaskady_(03).jpg`,
    },
  },
  'destination-goris': {
    ratio: 1.5,
    credit: {
      author: 'Matheus Hobold Sovernigo',
      licence: CC_BY_SA_4,
      source: `${COMMONS}Goris_inhabited_rocks.jpg`,
    },
  },
  'destination-gyumri': {
    ratio: 1.5196,
    credit: {
      author: 'Hayastan Mkrtchyan',
      licence: CC_BY_SA_4,
      source: `${COMMONS}Church_of_the_Holy_Saviour_and_Vartanants_Square_2023-10-12.jpg`,
    },
  },
  'destination-vanadzor': {
    ratio: 1.4118,
    credit: {
      author: 'Poshotenk',
      licence: CC_BY_SA_4,
      source: `${COMMONS}Vanadzor,_Armenia_in_spring_from_lookout_on_hill.jpg`,
    },
  },
  'destination-sevan': {
    ratio: 1.3333,
    credit: {
      author: 'Անժի92',
      licence: CC_BY_SA_4,
      source: `${COMMONS}Sevanavank_Monastery.jpg`,
    },
  },
  'destination-dilijan': {
    ratio: 1.3333,
    credit: {
      author: 'Shaun Dunphy',
      licence: CC_BY_SA_2,
      source: `${COMMONS}Old_Dilijan_Complex_(5062752571).jpg`,
    },
  },
  'partner-landscape': {
    ratio: 1.3333,
    credit: {
      author: 'Emma YSU',
      licence: CC_BY_SA_4,
      source: `${COMMONS}Vardenis_range_Emma_YSU_(6).jpg`,
    },
  },
};

/**
 * The responsive sources for a Home image, or `null` when no image exists
 * for that key (callers then show their own truthful fallback).
 * @param {string} key
 * @returns {{ key: string, avifSrcSet: string, webpSrcSet: string, src: string, ratio: number } | null}
 */
export function getHomeImage(key) {
  const sources = SOURCES_BY_KEY[key];
  const image = IMAGES[key];
  if (!sources || !image || sources.webp.length === 0) return null;
  const smallestWebp = [...sources.webp].sort((a, b) => a.width - b.width)[0];
  return {
    key,
    avifSrcSet: toSrcSet(sources.avif),
    webpSrcSet: toSrcSet(sources.webp),
    src: smallestWebp.url,
    ratio: image.ratio,
  };
}

/** Every credited photo the Home page can show, in display order. */
export const HOME_IMAGE_CREDITS = Object.entries(IMAGES).map(
  ([key, { credit }]) => ({ key, ...credit }),
);

export const categoryImageKey = (slug) => `category-${slug}`;
export const destinationImageKey = (slug) => `destination-${slug}`;
