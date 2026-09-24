/**
 * AuditLogRepository port.
 *
 * Domain-layer interface (BACKEND_ARCHITECTURE.md §7's "port") — a
 * concrete implementation lives in
 * src/infrastructure/database/repositories/auditLogRepository.js. This
 * file exists so `src/core/domain/auditLogger.js` can depend on an
 * abstraction rather than a concrete MySQL adapter, per Ch.3's Dependency
 * Rule (`core` may depend only on `core`).
 *
 * @typedef {object} AuditLogEntry
 * @property {number|null} actorId - null for system/scheduled-job actions
 * @property {string} action - e.g. "booking.status_changed"
 * @property {string} targetType - e.g. "booking"
 * @property {number} targetId
 * @property {object|null} [beforeSnapshot] - never include passwords/tokens/secrets
 * @property {object|null} [afterSnapshot] - never include passwords/tokens/secrets
 * @property {string|null} [ipAddress]
 * @property {string|null} [userAgent]
 * @property {string|null} [requestId]
 */

/* eslint-disable class-methods-use-this, no-unused-vars */
export class AuditLogRepository {
  /**
   * @param {AuditLogEntry} entry
   * @param {*} [connection] - optional caller-supplied transaction connection
   * @returns {Promise<void>}
   */
  async record(entry, connection) {
    throw new Error(
      'AuditLogRepository.record must be implemented by a concrete adapter.',
    );
  }

  /**
   * Step M3.1: backs `AuditLogger#listForTarget` — cursor-paginated,
   * newest first. `targetType`/`targetId` here are always the caller's
   * own fixed values (see that method's own doc comment), never raw
   * client input.
   * @param {{targetType?: string, targetId?: number, cursor?: string, limit?: number}} filters
   * @returns {Promise<{rows: object[], meta: object}>}
   */
  async list(filters) {
    throw new Error(
      'AuditLogRepository.list must be implemented by a concrete adapter.',
    );
  }
}
/* eslint-enable class-methods-use-this, no-unused-vars */

export default AuditLogRepository;
