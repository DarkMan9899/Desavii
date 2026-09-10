/**
 * MySQL implementation of the UserRepository port.
 *
 * Owns the `users` table (Module Catalog #3) — this is the only
 * Repository any module may use to read/write `users`; other modules
 * (Auth included) go through `UserService`'s public interface instead
 * (BACKEND_ARCHITECTURE.md §4's cross-module rule). Also owns the
 * narrow avatar-media persistence for `POST /users/:id/avatar` (Sprint 6
 * §5 "storage abstraction only") — a full Media module doesn't exist
 * yet, so this stays scoped to exactly what avatars need rather than
 * standing up a general-purpose media Repository ahead of that module.
 */

import { getMysqlPool } from '../../../infrastructure/database/mysqlPool.js';
import { mapMysqlError } from '../../../infrastructure/database/errorMapping.js';
import { scopeActive } from '../../../infrastructure/database/softDelete.js';
import { UserRepository as UserRepositoryPort } from '../../../core/interfaces/UserRepository.js';
import {
  decodeCursor,
  buildPageMeta,
} from '../../../infrastructure/database/pagination.js';

const SELECT_COLUMNS = `
  u.id, u.email, u.normalized_email, u.phone, u.password_hash, u.first_name, u.last_name,
  u.avatar_media_id, m.url AS avatar_url, u.preferred_language_id, u.preferred_currency_id, u.status_id, us.code AS status_code,
  u.is_email_verified, u.is_phone_verified, u.last_login_at, u.created_at, u.updated_at, u.deleted_at
`;
const FROM_USERS_JOINED = `
  FROM users u
  JOIN user_statuses us ON us.id = u.status_id
  LEFT JOIN media m ON m.id = u.avatar_media_id AND m.deleted_at IS NULL
`;

const PROFILE_FIELD_TO_COLUMN = Object.freeze({
  firstName: 'first_name',
  lastName: 'last_name',
  phone: 'phone',
  preferredLanguageId: 'preferred_language_id',
  preferredCurrencyId: 'preferred_currency_id',
});

function toDomain(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    normalizedEmail: row.normalized_email,
    phone: row.phone,
    passwordHash: row.password_hash,
    firstName: row.first_name,
    lastName: row.last_name,
    avatarMediaId: row.avatar_media_id,
    avatarUrl: row.avatar_url,
    preferredLanguageId: row.preferred_language_id,
    preferredCurrencyId: row.preferred_currency_id,
    statusId: row.status_id,
    statusCode: row.status_code,
    isEmailVerified: Boolean(row.is_email_verified),
    isPhoneVerified: Boolean(row.is_phone_verified),
    lastLoginAt: row.last_login_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

export class MySqlUserRepository extends UserRepositoryPort {
  #pool;

  constructor(pool = getMysqlPool()) {
    super();
    this.#pool = pool;
  }

  /**
   * `statusId` is never a caller-supplied param — every new account
   * starts `ACTIVE` (resolved via subquery; Sprint 6's register flow has
   * no separate "unverified" account *status*, see
   * docs/SPRINT_6_AUTH_FOUNDATION.md's Architecture Decisions — only the
   * pre-existing `is_email_verified` flag distinguishes that).
   */
  async create(data, connection = this.#pool) {
    try {
      const [result] = await connection.query(
        `INSERT INTO users
          (email, normalized_email, password_hash, first_name, last_name, phone, status_id, preferred_language_id, preferred_currency_id)
         VALUES (?, ?, ?, ?, ?, ?, (SELECT id FROM user_statuses WHERE code = 'ACTIVE'), ?, ?)`,
        [
          data.email,
          data.normalizedEmail,
          data.passwordHash,
          data.firstName,
          data.lastName,
          data.phone ?? null,
          data.preferredLanguageId ?? null,
          data.preferredCurrencyId ?? null,
        ],
      );
      return await this.findById(result.insertId, connection);
    } catch (err) {
      throw mapMysqlError(err);
    }
  }

  async findById(id, connection = this.#pool) {
    const [rows] = await connection.query(
      `SELECT ${SELECT_COLUMNS} ${FROM_USERS_JOINED} WHERE u.id = ? AND ${scopeActive('u')} LIMIT 1`,
      [id],
    );
    return toDomain(rows[0]);
  }

  async findByNormalizedEmail(normalizedEmail, connection = this.#pool) {
    const [rows] = await connection.query(
      `SELECT ${SELECT_COLUMNS} ${FROM_USERS_JOINED} WHERE u.normalized_email = ? AND ${scopeActive('u')} LIMIT 1`,
      [normalizedEmail],
    );
    return toDomain(rows[0]);
  }

  /**
   * Phase 11 Admin Platform: `GET /users` — cursor-paginated, newest
   * first. `keyword` matches email/first_name/last_name (LIKE — this
   * table has no FULLTEXT index, and admin user-search volume doesn't
   * warrant one yet, same tradeoff `mysqlSearchRepository`'s non-keyword
   * filters already accept). `roleCodes` is a correlated subquery
   * (GROUP_CONCAT) rather than a JOIN, so a user with N roles still
   * produces exactly one row.
   */
  async listAdmin({ keyword, statusCode, cursor = null, limit = 20 } = {}) {
    const conditions = [scopeActive('u')];
    const params = [];

    if (keyword) {
      conditions.push(
        '(u.email LIKE ? OR u.first_name LIKE ? OR u.last_name LIKE ?)',
      );
      const pattern = `%${keyword}%`;
      params.push(pattern, pattern, pattern);
    }
    if (statusCode) {
      conditions.push('us.code = ?');
      params.push(statusCode);
    }

    const decoded = decodeCursor(cursor);
    if (decoded?.id) {
      conditions.push('u.id < ?');
      params.push(decoded.id);
    }

    const [rows] = await this.#pool.query(
      `SELECT ${SELECT_COLUMNS},
              (SELECT GROUP_CONCAT(r.code) FROM role_user ru
                 JOIN roles r ON r.id = ru.role_id
                 WHERE ru.user_id = u.id) AS role_codes
       ${FROM_USERS_JOINED}
       WHERE ${conditions.join(' AND ')}
       ORDER BY u.id DESC
       LIMIT ?`,
      [...params, limit + 1],
    );

    const { rows: pageRows, meta } = buildPageMeta(rows, limit, (row) => ({
      id: row.id,
    }));
    return {
      rows: pageRows.map((row) => ({
        ...toDomain(row),
        roleCodes: row.role_codes ? row.role_codes.split(',') : [],
      })),
      meta,
    };
  }

  /**
   * Phase 11 Admin Platform: `PATCH /users/:id/status` — suspend/
   * activate/ban. `statusCode` is validated against the `user_statuses`
   * enum by the caller (Zod, `userValidators.js`); this method trusts it
   * and resolves the id via the same subquery pattern `create()` uses.
   */
  async updateStatusByCode(id, statusCode, connection = this.#pool) {
    try {
      await connection.query(
        `UPDATE users SET status_id = (SELECT id FROM user_statuses WHERE code = ?) WHERE id = ?`,
        [statusCode, id],
      );
    } catch (err) {
      throw mapMysqlError(err);
    }
    return this.findById(id, connection);
  }

  async updateProfile(id, fields, connection = this.#pool) {
    const assignments = [];
    const values = [];

    Object.entries(fields).forEach(([key, value]) => {
      const column = PROFILE_FIELD_TO_COLUMN[key];
      if (column && value !== undefined) {
        assignments.push(`${column} = ?`);
        values.push(value);
      }
    });

    if (assignments.length > 0) {
      try {
        await connection.query(
          `UPDATE users SET ${assignments.join(', ')} WHERE id = ?`,
          [...values, id],
        );
      } catch (err) {
        throw mapMysqlError(err);
      }
    }

    return this.findById(id, connection);
  }

  async updatePasswordHash(id, passwordHash, connection = this.#pool) {
    await connection.query('UPDATE users SET password_hash = ? WHERE id = ?', [
      passwordHash,
      id,
    ]);
  }

  async updateAvatarMediaId(id, avatarMediaId, connection = this.#pool) {
    await connection.query(
      'UPDATE users SET avatar_media_id = ? WHERE id = ?',
      [avatarMediaId, id],
    );
  }

  async updateLastLoginAt(id, connection = this.#pool) {
    await connection.query(
      'UPDATE users SET last_login_at = UTC_TIMESTAMP(3) WHERE id = ?',
      [id],
    );
  }

  /** @returns {Promise<string[]>} the user's global role codes, e.g. ['CUSTOMER'] */
  async getRoleCodes(userId, connection = this.#pool) {
    const [rows] = await connection.query(
      `SELECT r.code FROM roles r JOIN role_user ru ON ru.role_id = r.id WHERE ru.user_id = ?`,
      [userId],
    );
    return rows.map((row) => row.code);
  }

  /**
   * Phase 13 (Notifications): bulk recipient resolution for an
   * admin-authored announcement's role-scoped audience — deliberately
   * unpaginated (a "notify everyone with this role" fan-out, not a UI
   * list) and excludes soft-deleted/non-active users the same way
   * `scopeActive('u')` already does for `listAdmin`.
   */
  async listUserIdsByRole(roleCodes, connection = this.#pool) {
    if (roleCodes.length === 0) return [];
    const placeholders = roleCodes.map(() => '?').join(', ');
    const [rows] = await connection.query(
      `SELECT DISTINCT u.id
       FROM users u
       JOIN role_user ru ON ru.user_id = u.id
       JOIN roles r ON r.id = ru.role_id
       WHERE ${scopeActive('u')} AND r.code IN (${placeholders})`,
      roleCodes,
    );
    return rows.map((row) => row.id);
  }

  /** Phase 13 (Notifications): bulk recipient resolution for an announcement's "everyone" audience. */
  async listAllUserIds(connection = this.#pool) {
    const [rows] = await connection.query(
      `SELECT u.id FROM users u WHERE ${scopeActive('u')}`,
    );
    return rows.map((row) => row.id);
  }

  /**
   * Assigns a global role to a user (used by AuthenticationService.register
   * to grant the default CUSTOMER role — see Sprint 6's Architecture
   * Decisions on global vs. partner-scoped roles).
   */
  async assignRole(userId, roleCode, connection = this.#pool) {
    await connection.query(
      `INSERT IGNORE INTO role_user (role_id, user_id)
       SELECT id, ? FROM roles WHERE code = ?`,
      [userId, roleCode],
    );
  }

  /** Sprint H — the first real role revocation in this codebase (MANAGER's own "demote" never needed one; Manager access is controlled by `manager_companies` assignments instead, see that module's own header). */
  async revokeRole(userId, roleCode, connection = this.#pool) {
    await connection.query(
      `DELETE ru FROM role_user ru
       JOIN roles r ON r.id = ru.role_id
       WHERE ru.user_id = ? AND r.code = ?`,
      [userId, roleCode],
    );
  }

  /**
   * Inserts the `media` row backing an avatar upload and returns its id.
   * Avatars are auto-approved (unlike public listing photos, which
   * require moderation) — a personal profile photo is low fraud-risk
   * context; this is a deliberate, documented simplification for the
   * "storage abstraction only" scope of Sprint 6's avatar endpoint.
   */
  async createAvatarMedia(
    { userId, url, mimeType, fileSizeBytes },
    connection = this.#pool,
  ) {
    const [[imageType]] = await connection.query(
      "SELECT id FROM media_types WHERE code = 'IMAGE'",
    );
    const [[completedStatus]] = await connection.query(
      "SELECT id FROM media_upload_statuses WHERE code = 'COMPLETED'",
    );
    const [[approvedStatus]] = await connection.query(
      "SELECT id FROM moderation_statuses WHERE code = 'APPROVED'",
    );

    const [result] = await connection.query(
      `INSERT INTO media
        (mediable_type, mediable_id, media_type_id, url, upload_status_id, moderation_status_id, mime_type, file_size_bytes, owner_user_id, is_cover)
       VALUES ('user', ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      [
        userId,
        imageType.id,
        url,
        completedStatus.id,
        approvedStatus.id,
        mimeType,
        fileSizeBytes,
        userId,
      ],
    );
    return result.insertId;
  }
}

export default MySqlUserRepository;
