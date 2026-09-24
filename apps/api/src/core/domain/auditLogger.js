/**
 * AuditLogger — domain service fronting `audit_logs`.
 *
 * The ONLY sanctioned writer to `audit_logs` (DATABASE_ARCHITECTURE.md
 * §8, BACKEND_ARCHITECTURE.md §21) — every module that needs to record a
 * privileged/state-changing action calls this service instead of writing
 * to `audit_logs` via its own Repository, keeping the shape and required
 * fields consistent platform-wide. Depends only on the
 * `AuditLogRepository` port (`core` may depend only on `core`, Ch.3's
 * Dependency Rule) — the concrete MySQL adapter is wired in by the
 * composition root.
 *
 * Callers are responsible for never placing a password/token/secret in
 * `beforeSnapshot`/`afterSnapshot` — this service has no way to
 * distinguish a legitimate field from a secret one, so it cannot enforce
 * that itself (DATABASE_ARCHITECTURE.md §8).
 *
 * Step M3.1 (brief §5): `listForTarget` is a narrow, single-purpose read
 * — always scoped to one exact `(targetType, targetId)` pair the CALLER
 * supplies, never a caller-influenced free-form filter (that broader,
 * multi-target-type query already exists as `modules/admin/services/
 * auditLogService.js`, gated on the global `audit.view` permission — a
 * deliberately separate, more privileged surface, untouched here). This
 * method itself enforces no authorization at all — since every module
 * that writes audit entries already holds this same shared singleton
 * (`app.js`), the one sanctioned way to read a target's own history
 * back is to let its OWNING module's Service apply whatever narrower
 * permission actually governs that target (e.g. `ListingService
 * #getModerationHistory` requiring `listing.moderate`), never the
 * blanket `audit.view` a generic cross-target browser needs.
 */

export class AuditLogger {
  #repository;

  constructor(repository) {
    this.#repository = repository;
  }

  /**
   * @param {object} entry
   * @param {number|null} [entry.actorId] - null for system/scheduled-job actions
   * @param {string} entry.action - e.g. "booking.status_changed"
   * @param {string} entry.targetType - e.g. "booking"
   * @param {number} entry.targetId
   * @param {object|null} [entry.beforeSnapshot]
   * @param {object|null} [entry.afterSnapshot]
   * @param {string|null} [entry.ipAddress]
   * @param {string|null} [entry.userAgent]
   * @param {string|null} [entry.requestId]
   * @param {*} [connection] - pass the caller's own transaction connection
   *   so this write commits atomically alongside the state change it
   *   describes (Ch.21 "written inside the same DB transaction").
   */
  async record(entry, connection) {
    if (
      !entry ||
      typeof entry.action !== 'string' ||
      entry.action.trim().length === 0
    ) {
      throw new TypeError('AuditLogger.record requires a non-empty "action".');
    }
    if (
      typeof entry.targetType !== 'string' ||
      entry.targetType.trim().length === 0
    ) {
      throw new TypeError(
        'AuditLogger.record requires a non-empty "targetType".',
      );
    }
    if (!Number.isInteger(entry.targetId)) {
      throw new TypeError('AuditLogger.record requires an integer "targetId".');
    }

    const normalized = {
      actorId: entry.actorId ?? null,
      action: entry.action,
      targetType: entry.targetType,
      targetId: entry.targetId,
      beforeSnapshot: entry.beforeSnapshot ?? null,
      afterSnapshot: entry.afterSnapshot ?? null,
      ipAddress: entry.ipAddress ?? null,
      userAgent: entry.userAgent ?? null,
      requestId: entry.requestId ?? null,
    };

    await this.#repository.record(normalized, connection);
  }

  /**
   * @param {string} targetType - e.g. "listing" — always the caller's
   *   own fixed value, never client input passed through unchecked.
   * @param {number} targetId
   * @param {{cursor?: string, limit?: number}} [paginationOpts]
   */
  async listForTarget(targetType, targetId, { cursor, limit } = {}) {
    if (typeof targetType !== 'string' || targetType.trim().length === 0) {
      throw new TypeError(
        'AuditLogger.listForTarget requires a non-empty "targetType".',
      );
    }
    if (!Number.isInteger(targetId)) {
      throw new TypeError(
        'AuditLogger.listForTarget requires an integer "targetId".',
      );
    }

    const { rows, meta } = await this.#repository.list({
      targetType,
      targetId,
      cursor,
      limit,
    });
    return { rows, meta };
  }
}

export default AuditLogger;
