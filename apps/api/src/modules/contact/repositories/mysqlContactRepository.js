/**
 * MySQL-backed Contact repository (Sprint G).
 *
 * `contact_inquiries` (migration 0043) is append-only from the public
 * side — a submission is never edited or deleted, only resolved. Type/
 * status code-to-id resolution mirrors
 * `mysqlReviewRepository.js#findReasonIdByCode`'s exact convention (a
 * plain `SELECT id ... WHERE code = ?`, `null` when not found — the
 * calling Service decides what an unknown code means).
 */

import { getMysqlPool } from '../../../infrastructure/database/mysqlPool.js';

export class MySqlContactRepository {
  #pool;

  constructor(pool = getMysqlPool()) {
    this.#pool = pool;
  }

  async findTypeIdByCode(code) {
    const [rows] = await this.#pool.query(
      'SELECT id FROM contact_inquiry_types WHERE code = ? LIMIT 1',
      [code],
    );
    return rows[0]?.id ?? null;
  }

  async findStatusIdByCode(code) {
    const [rows] = await this.#pool.query(
      'SELECT id FROM contact_inquiry_statuses WHERE code = ? LIMIT 1',
      [code],
    );
    return rows[0]?.id ?? null;
  }

  async create({ typeId, statusId, name, email, subject, message }) {
    const [result] = await this.#pool.query(
      `INSERT INTO contact_inquiries
         (type_id, status_id, name, email, subject, message)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [typeId, statusId, name, email, subject, message],
    );
    return result.insertId;
  }

  #baseSelect() {
    return `SELECT ci.id, ci.name, ci.email, ci.subject, ci.message,
                    ci.resolved_at, ci.resolved_by, ci.created_at, ci.updated_at,
                    cit.code AS type_code, cis.code AS status_code
             FROM contact_inquiries ci
             JOIN contact_inquiry_types cit ON cit.id = ci.type_id
             JOIN contact_inquiry_statuses cis ON cis.id = ci.status_id`;
  }

  async findById(id) {
    const [rows] = await this.#pool.query(
      `${this.#baseSelect()} WHERE ci.id = ? LIMIT 1`,
      [id],
    );
    return rows[0] ?? null;
  }

  /** Admin inbox listing — same simple bounded-`limit` convention `MySqlManagerRepository#listManagersAdmin` already establishes (no full pagination system for a low-volume inbox, spec §14/§37). */
  async list({ limit = 50, statusCode } = {}) {
    const effectiveLimit = Math.min(Math.max(Number(limit) || 50, 1), 100);
    const conditions = [];
    const params = [];
    if (statusCode) {
      conditions.push('cis.code = ?');
      params.push(statusCode);
    }
    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const [rows] = await this.#pool.query(
      `${this.#baseSelect()} ${whereClause}
       ORDER BY ci.created_at DESC
       LIMIT ?`,
      [...params, effectiveLimit],
    );
    return rows;
  }

  async resolve({ id, statusId, resolvedBy }) {
    const [result] = await this.#pool.query(
      `UPDATE contact_inquiries
       SET status_id = ?, resolved_at = CURRENT_TIMESTAMP(3), resolved_by = ?
       WHERE id = ?`,
      [statusId, resolvedBy, id],
    );
    return result.affectedRows > 0;
  }
}

export default MySqlContactRepository;
