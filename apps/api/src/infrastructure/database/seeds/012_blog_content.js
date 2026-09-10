/**
 * Sprint H (Blog) — seeds a small, real editorial category list and a
 * handful of reusable tags. Not demo/example data: the Marketing
 * workspace's category/tag pickers have nothing to offer an author
 * without these rows existing, same "the platform cannot function
 * without these" rationale `001_lookups.js`'s own header gives for
 * fixed-vocabulary lookups — the difference here is these are real,
 * user-facing editorial taxonomy (translated per locale), not an
 * internal status code.
 */

async function upsertCategory(connection, slug) {
  await connection.query(
    `INSERT INTO blog_categories (slug) VALUES (?)
     ON DUPLICATE KEY UPDATE slug = VALUES(slug)`,
    [slug],
  );
  const [rows] = await connection.query(
    'SELECT id FROM blog_categories WHERE slug = ?',
    [slug],
  );
  return rows[0].id;
}

async function upsertCategoryTranslation(
  connection,
  { categoryId, languageId, name },
) {
  await connection.query(
    `INSERT INTO blog_category_translations (blog_category_id, language_id, name)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE name = VALUES(name)`,
    [categoryId, languageId, name],
  );
}

async function upsertTag(connection, slug, name) {
  await connection.query(
    `INSERT INTO tags (slug, name) VALUES (?, ?)
     ON DUPLICATE KEY UPDATE name = VALUES(name)`,
    [slug, name],
  );
  const [rows] = await connection.query('SELECT id FROM tags WHERE slug = ?', [
    slug,
  ]);
  return rows[0].id;
}

async function upsertTagTranslation(connection, { tagId, languageId, name }) {
  await connection.query(
    `INSERT INTO tag_translations (tag_id, language_id, name)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE name = VALUES(name)`,
    [tagId, languageId, name],
  );
}

const CATEGORIES = [
  {
    slug: 'travel-guides',
    names: {
      en: 'Travel Guides',
      hy: 'Ճանապարհորդական ուղեցույցներ',
      ru: 'Путеводители',
    },
  },
  {
    slug: 'armenia',
    names: { en: 'Armenia', hy: 'Հայաստան', ru: 'Армения' },
  },
  {
    slug: 'hotels-and-stays',
    names: {
      en: 'Hotels & Stays',
      hy: 'Հյուրանոցներ և կացարաններ',
      ru: 'Отели и проживание',
    },
  },
  {
    slug: 'food',
    names: { en: 'Food', hy: 'Խոհանոց', ru: 'Еда' },
  },
  {
    slug: 'experiences',
    names: { en: 'Experiences', hy: 'Փորձառություններ', ru: 'Впечатления' },
  },
  {
    slug: 'tips',
    names: { en: 'Tips', hy: 'Խորհուրդներ', ru: 'Советы' },
  },
];

const TAGS = [
  { slug: 'yerevan', names: { en: 'Yerevan', hy: 'Երևան', ru: 'Ереван' } },
  { slug: 'hiking', names: { en: 'Hiking', hy: 'Արշավներ', ru: 'Походы' } },
  {
    slug: 'budget-travel',
    names: {
      en: 'Budget Travel',
      hy: 'Խնայող ճամփորդություն',
      ru: 'Бюджетные путешествия',
    },
  },
  {
    slug: 'family-friendly',
    names: { en: 'Family Friendly', hy: 'Ընտանեկան', ru: 'Для семьи' },
  },
  {
    slug: 'road-trips',
    names: {
      en: 'Road Trips',
      hy: 'Ավտոուղևորություններ',
      ru: 'Путешествия на авто',
    },
  },
];

export default async function seedBlogContent(connection) {
  const [languages] = await connection.query('SELECT id, code FROM languages');
  const languageIdByCode = new Map(languages.map((row) => [row.code, row.id]));

  // eslint-disable-next-line no-restricted-syntax -- seeding must run in a stable, readable order
  for (const category of CATEGORIES) {
    // eslint-disable-next-line no-await-in-loop -- seeding must run in a stable, readable order
    const categoryId = await upsertCategory(connection, category.slug);
    // eslint-disable-next-line no-restricted-syntax -- seeding must run in a stable, readable order
    for (const [code, name] of Object.entries(category.names)) {
      const languageId = languageIdByCode.get(code);
      if (languageId) {
        // eslint-disable-next-line no-await-in-loop -- seeding must run in a stable, readable order
        await upsertCategoryTranslation(connection, {
          categoryId,
          languageId,
          name,
        });
      }
    }
  }

  // eslint-disable-next-line no-restricted-syntax -- seeding must run in a stable, readable order
  for (const tag of TAGS) {
    // eslint-disable-next-line no-await-in-loop -- seeding must run in a stable, readable order
    const tagId = await upsertTag(connection, tag.slug, tag.names.en);
    // eslint-disable-next-line no-restricted-syntax -- seeding must run in a stable, readable order
    for (const [code, name] of Object.entries(tag.names)) {
      const languageId = languageIdByCode.get(code);
      if (languageId) {
        // eslint-disable-next-line no-await-in-loop -- seeding must run in a stable, readable order
        await upsertTagTranslation(connection, { tagId, languageId, name });
      }
    }
  }
}
