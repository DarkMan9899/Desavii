/**
 * MySQL implementation of the Restaurant Menu repository (Pass 3
 * remediation — Restaurant vertical). Owns `restaurant_menus`,
 * `restaurant_menu_sections`, `restaurant_menu_items` (migration 0045).
 *
 * Kept as its own file rather than added to `mysqlListingRepository.js`
 * (already 1200+ lines) — a genuine 3-level parent/child/grandchild CRUD
 * surface with its own concerns (per-row create/update/delete/reorder,
 * not `listing_highlights`' full-replace-per-language shape) is a
 * separate enough responsibility to warrant its own Repository, the same
 * way `mysqlListingMetadataRepository.js` already sits beside the main
 * listing repository rather than inside it.
 */

import { getMysqlPool } from '../../../infrastructure/database/mysqlPool.js';

function toMenuDomain(row) {
  return {
    id: row.id,
    listingId: row.listing_id,
    languageId: row.language_id,
    languageCode: row.language_code,
    name: row.name,
    description: row.description,
    isActive: Boolean(row.is_active),
    sortOrder: row.sort_order,
  };
}

function toSectionDomain(row) {
  return {
    id: row.id,
    menuId: row.menu_id,
    title: row.title,
    sortOrder: row.sort_order,
  };
}

function toItemDomain(row) {
  return {
    id: row.id,
    sectionId: row.section_id,
    title: row.title,
    description: row.description,
    priceAmount: row.price_amount === null ? null : Number(row.price_amount),
    priceCurrencyId: row.price_currency_id,
    priceCurrencyCode: row.price_currency_code,
    mediaId: row.media_id,
    dietaryMarkers: row.dietary_markers ?? [],
    isActive: Boolean(row.is_active),
    sortOrder: row.sort_order,
  };
}

export class MySqlRestaurantMenuRepository {
  #pool;

  constructor(pool = getMysqlPool()) {
    this.#pool = pool;
  }

  /** Full menu tree (menus -> sections -> items) for a listing, one language. */
  async listMenuTreeForListing(listingId, languageId, connection = this.#pool) {
    const [menuRows] = await connection.query(
      `SELECT rm.id, rm.listing_id, rm.language_id, lang.code AS language_code,
              rm.name, rm.description, rm.is_active, rm.sort_order
       FROM restaurant_menus rm
       JOIN languages lang ON lang.id = rm.language_id
       WHERE rm.listing_id = ? AND rm.language_id = ?
       ORDER BY rm.sort_order ASC, rm.id ASC`,
      [listingId, languageId],
    );
    const menus = menuRows.map(toMenuDomain);
    if (menus.length === 0) return [];

    const menuIds = menus.map((menu) => menu.id);
    const [sectionRows] = await connection.query(
      `SELECT id, menu_id, title, sort_order FROM restaurant_menu_sections
       WHERE menu_id IN (?) ORDER BY sort_order ASC, id ASC`,
      [menuIds],
    );
    const sections = sectionRows.map(toSectionDomain);
    const sectionIds = sections.map((section) => section.id);

    let items = [];
    if (sectionIds.length > 0) {
      const [itemRows] = await connection.query(
        `SELECT rmi.id, rmi.section_id, rmi.title, rmi.description,
                rmi.price_amount, rmi.price_currency_id, cur.code AS price_currency_code,
                rmi.media_id, rmi.dietary_markers, rmi.is_active, rmi.sort_order
         FROM restaurant_menu_items rmi
         JOIN currencies cur ON cur.id = rmi.price_currency_id
         WHERE rmi.section_id IN (?)
         ORDER BY rmi.sort_order ASC, rmi.id ASC`,
        [sectionIds],
      );
      items = itemRows.map(toItemDomain);
    }

    return menus.map((menu) => ({
      ...menu,
      sections: sections
        .filter((section) => section.menuId === menu.id)
        .map((section) => ({
          ...section,
          items: items.filter((item) => item.sectionId === section.id),
        })),
    }));
  }

  async findMenuById(menuId, connection = this.#pool) {
    const [rows] = await connection.query(
      `SELECT rm.id, rm.listing_id, rm.language_id, lang.code AS language_code,
              rm.name, rm.description, rm.is_active, rm.sort_order
       FROM restaurant_menus rm
       JOIN languages lang ON lang.id = rm.language_id
       WHERE rm.id = ? LIMIT 1`,
      [menuId],
    );
    return rows[0] ? toMenuDomain(rows[0]) : null;
  }

  async createMenu(
    { listingId, languageId, name, description, sortOrder, userId },
    connection = this.#pool,
  ) {
    const [result] = await connection.query(
      `INSERT INTO restaurant_menus
         (listing_id, language_id, name, description, sort_order, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        listingId,
        languageId,
        name,
        description ?? null,
        sortOrder,
        userId,
        userId,
      ],
    );
    return this.findMenuById(result.insertId, connection);
  }

  async updateMenu(
    menuId,
    { name, description, isActive, sortOrder, userId },
    connection = this.#pool,
  ) {
    await connection.query(
      `UPDATE restaurant_menus
       SET name = ?, description = ?, is_active = ?, sort_order = ?, updated_by = ?
       WHERE id = ?`,
      [name, description ?? null, isActive ? 1 : 0, sortOrder, userId, menuId],
    );
    return this.findMenuById(menuId, connection);
  }

  async deleteMenu(menuId, connection = this.#pool) {
    await connection.query('DELETE FROM restaurant_menus WHERE id = ?', [
      menuId,
    ]);
  }

  async countSectionsForMenu(menuId, connection = this.#pool) {
    const [rows] = await connection.query(
      'SELECT COUNT(*) AS count FROM restaurant_menu_sections WHERE menu_id = ?',
      [menuId],
    );
    return Number(rows[0].count);
  }

  async findSectionById(sectionId, connection = this.#pool) {
    const [rows] = await connection.query(
      'SELECT id, menu_id, title, sort_order FROM restaurant_menu_sections WHERE id = ? LIMIT 1',
      [sectionId],
    );
    return rows[0] ? toSectionDomain(rows[0]) : null;
  }

  async createSection(
    { menuId, title, sortOrder, userId },
    connection = this.#pool,
  ) {
    const [result] = await connection.query(
      `INSERT INTO restaurant_menu_sections (menu_id, title, sort_order, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?)`,
      [menuId, title, sortOrder, userId, userId],
    );
    return this.findSectionById(result.insertId, connection);
  }

  async updateSection(
    sectionId,
    { title, sortOrder, userId },
    connection = this.#pool,
  ) {
    await connection.query(
      'UPDATE restaurant_menu_sections SET title = ?, sort_order = ?, updated_by = ? WHERE id = ?',
      [title, sortOrder, userId, sectionId],
    );
    return this.findSectionById(sectionId, connection);
  }

  async deleteSection(sectionId, connection = this.#pool) {
    await connection.query(
      'DELETE FROM restaurant_menu_sections WHERE id = ?',
      [sectionId],
    );
  }

  async countItemsForSection(sectionId, connection = this.#pool) {
    const [rows] = await connection.query(
      'SELECT COUNT(*) AS count FROM restaurant_menu_items WHERE section_id = ?',
      [sectionId],
    );
    return Number(rows[0].count);
  }

  async findItemById(itemId, connection = this.#pool) {
    const [rows] = await connection.query(
      `SELECT rmi.id, rmi.section_id, rmi.title, rmi.description,
              rmi.price_amount, rmi.price_currency_id, cur.code AS price_currency_code,
              rmi.media_id, rmi.dietary_markers, rmi.is_active, rmi.sort_order
       FROM restaurant_menu_items rmi
       JOIN currencies cur ON cur.id = rmi.price_currency_id
       WHERE rmi.id = ? LIMIT 1`,
      [itemId],
    );
    return rows[0] ? toItemDomain(rows[0]) : null;
  }

  async createItem(
    {
      sectionId,
      title,
      description,
      priceAmount,
      priceCurrencyId,
      mediaId,
      dietaryMarkers,
      sortOrder,
      userId,
    },
    connection = this.#pool,
  ) {
    const [result] = await connection.query(
      `INSERT INTO restaurant_menu_items
         (section_id, title, description, price_amount, price_currency_id, media_id, dietary_markers, sort_order, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        sectionId,
        title,
        description ?? null,
        priceAmount,
        priceCurrencyId,
        mediaId ?? null,
        dietaryMarkers ? JSON.stringify(dietaryMarkers) : null,
        sortOrder,
        userId,
        userId,
      ],
    );
    return this.findItemById(result.insertId, connection);
  }

  async updateItem(
    itemId,
    {
      title,
      description,
      priceAmount,
      priceCurrencyId,
      mediaId,
      dietaryMarkers,
      isActive,
      sortOrder,
      userId,
    },
    connection = this.#pool,
  ) {
    await connection.query(
      `UPDATE restaurant_menu_items
       SET title = ?, description = ?, price_amount = ?, price_currency_id = ?,
           media_id = ?, dietary_markers = ?, is_active = ?, sort_order = ?, updated_by = ?
       WHERE id = ?`,
      [
        title,
        description ?? null,
        priceAmount,
        priceCurrencyId,
        mediaId ?? null,
        dietaryMarkers ? JSON.stringify(dietaryMarkers) : null,
        isActive ? 1 : 0,
        sortOrder,
        userId,
        itemId,
      ],
    );
    return this.findItemById(itemId, connection);
  }

  async deleteItem(itemId, connection = this.#pool) {
    await connection.query('DELETE FROM restaurant_menu_items WHERE id = ?', [
      itemId,
    ]);
  }
}

export default MySqlRestaurantMenuRepository;
