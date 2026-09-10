/**
 * UserService — public Service for the Users module.
 *
 * Implements BACKEND_ARCHITECTURE.md §6/§13: owns all `users`-table
 * business logic. Ownership checks ("Owner or `{permission}`",
 * API_SPECIFICATION.md §5) live here, one layer below the guards, since
 * they require loading the specific resource being acted on — a guard
 * alone cannot know who owns a given `users.id` without a database read.
 *
 * Depends on `mediaConstraints.js` (Sprint 5, `modules/media/validators/`)
 * and the injected `StorageProvider`/`AuditLogger`/`PermissionResolver` —
 * concrete infrastructure is never imported here directly, only received
 * via constructor injection from `module.container.js`.
 */

import {
  AuthorizationError,
  AuthenticationError,
  ConflictError,
  ValidationError,
  NotFoundError,
} from '../../../errors/AppError.js';
import {
  hashPassword,
  verifyPassword,
} from '../../../core/domain/passwordHasher.js';
import {
  isAllowedMimeType,
  isWithinSizeLimit,
  classifyMimeType,
} from '../../media/validators/mediaConstraints.js';

export class UserService {
  #userRepository;

  #storageProvider;

  #auditLogger;

  #permissionResolver;

  constructor({
    userRepository,
    storageProvider,
    auditLogger,
    permissionResolver,
  }) {
    this.#userRepository = userRepository;
    this.#storageProvider = storageProvider;
    this.#auditLogger = auditLogger;
    this.#permissionResolver = permissionResolver;
  }

  /** "Owner or `{permissionKey}`" (API_SPECIFICATION.md §5). */
  async #assertOwnerOrPermission(principal, targetUserId, permissionKey) {
    if (principal.userId === targetUserId) return;
    const granted = await this.#permissionResolver.hasPermission(
      principal.roles,
      permissionKey,
    );
    if (!granted) throw new AuthorizationError();
  }

  /**
   * Phase 11 Admin Platform: no owner fallback — these are inherently
   * "view/manage someone else's account" actions (a user already has
   * `GET /auth/me`/`PATCH /users/:id` for their own profile), so the
   * permission is required outright.
   */
  async #assertPermission(principal, permissionKey) {
    const granted = await this.#permissionResolver.hasPermission(
      principal.roles,
      permissionKey,
    );
    if (!granted) throw new AuthorizationError();
  }

  /**
   * Used by AuthenticationService.register — Auth depends on this public
   * method, never the Users module's Repository directly.
   */
  async createUser({
    email,
    passwordHash,
    firstName,
    lastName,
    phone = null,
    preferredLanguageId = null,
    preferredCurrencyId = null,
  }) {
    const normalizedEmail = email.trim().toLowerCase();
    const existing =
      await this.#userRepository.findByNormalizedEmail(normalizedEmail);
    if (existing) {
      throw new ConflictError(
        'An account with this email already exists.',
        'EMAIL_ALREADY_EXISTS',
      );
    }
    return this.#userRepository.create({
      email,
      normalizedEmail,
      passwordHash,
      firstName,
      lastName,
      phone,
      preferredLanguageId,
      preferredCurrencyId,
    });
  }

  async findById(id) {
    return this.#userRepository.findById(id);
  }

  async findByNormalizedEmail(normalizedEmail) {
    return this.#userRepository.findByNormalizedEmail(normalizedEmail);
  }

  /** Used by AuthenticationService to build the JWT's `roles` claim. */
  async getRoleCodes(userId) {
    return this.#userRepository.getRoleCodes(userId);
  }

  /**
   * Phase 13 (Notifications): bulk recipient resolution for an
   * admin-authored announcement's audience. No internal permission
   * check here — the real gate is the announcement route's own
   * `requireRole(['ADMIN','SUPER_ADMIN'])` guard, the same
   * guard-then-trust pattern already used for `req.principal` itself.
   */
  async listUserIdsByRole(roleCodes) {
    return this.#userRepository.listUserIdsByRole(roleCodes);
  }

  /** Phase 13 (Notifications): bulk recipient resolution for an announcement's "everyone" audience. */
  async listAllUserIds() {
    return this.#userRepository.listAllUserIds();
  }

  /** Used by AuthenticationService.register to grant the default global role. */
  async assignRole(userId, roleCode) {
    return this.#userRepository.assignRole(userId, roleCode);
  }

  /** Sprint H — Marketing/SMM role revocation (`BlogService#demoteFromMarketing`). */
  async revokeRole(userId, roleCode) {
    return this.#userRepository.revokeRole(userId, roleCode);
  }

  /** Used by AuthenticationService.login on a successful attempt. */
  async recordLogin(userId) {
    return this.#userRepository.updateLastLoginAt(userId);
  }

  async updateProfile(principal, targetUserId, fields) {
    await this.#assertOwnerOrPermission(principal, targetUserId, 'user.update');

    const user = await this.#userRepository.findById(targetUserId);
    if (!user) throw new NotFoundError('User not found.');

    const updated = await this.#userRepository.updateProfile(
      targetUserId,
      fields,
    );

    await this.#auditLogger.record({
      actorId: principal.userId,
      action: 'user.profile_updated',
      targetType: 'user',
      targetId: targetUserId,
      afterSnapshot: fields,
    });

    return updated;
  }

  /**
   * Owner-only, no permission fallback — API_SPECIFICATION.md §28 lists
   * this endpoint's permission as exactly "Owner", never "Owner or
   * `{permission}`". Even an admin cannot set another user's password
   * outside a proper reset flow.
   */
  async changePassword(principal, targetUserId, currentPassword, newPassword) {
    if (principal.userId !== targetUserId) {
      throw new AuthorizationError();
    }

    const user = await this.#userRepository.findById(targetUserId);
    if (!user) throw new NotFoundError('User not found.');

    const isCurrentPasswordValid = await verifyPassword(
      user.passwordHash,
      currentPassword,
    );
    if (!isCurrentPasswordValid) {
      throw new AuthenticationError(
        'The current password is incorrect.',
        'INVALID_CREDENTIALS',
      );
    }

    const newPasswordHash = await hashPassword(newPassword);
    await this.#userRepository.updatePasswordHash(
      targetUserId,
      newPasswordHash,
    );

    await this.#auditLogger.record({
      actorId: principal.userId,
      action: 'user.password_changed',
      targetType: 'user',
      targetId: targetUserId,
    });
  }

  /**
   * Sets a user's password with no current-password check and no
   * `principal` — unlike `changePassword` above, this is called by
   * `AuthenticationService#resetPassword` for a signed-out user whose
   * possession of a valid, single-use reset token (already verified by
   * the caller) IS the authorization; there is no session to check
   * ownership against. System-internal only, same naming convention as
   * `bookingService.js`'s `getBookingStatusSystemInternal` — never
   * exposed on any route, and Auth reaches it only through this public
   * Service method, never a second Repository over `users`
   * (BACKEND_ARCHITECTURE.md §4).
   */
  async setPasswordHashSystemInternal(userId, newPasswordHash) {
    await this.#userRepository.updatePasswordHash(userId, newPasswordHash);
    await this.#auditLogger.record({
      actorId: userId,
      action: 'user.password_reset',
      targetType: 'user',
      targetId: userId,
    });
  }

  /**
   * Sprint 6 §5: "Avatar field support (storage abstraction only, no
   * cloud integration)" — stores via the injected StorageProvider
   * (LocalStorageProvider in this sprint), creates the backing `media`
   * row, and points `users.avatar_media_id` at it.
   */
  async setAvatar(principal, targetUserId, buffer, mimeType) {
    await this.#assertOwnerOrPermission(principal, targetUserId, 'user.update');

    const user = await this.#userRepository.findById(targetUserId);
    if (!user) throw new NotFoundError('User not found.');

    if (
      !isAllowedMimeType(mimeType) ||
      classifyMimeType(mimeType) !== 'image'
    ) {
      throw new ValidationError('Avatar must be a JPEG, PNG, or WebP image.');
    }
    if (!isWithinSizeLimit(mimeType, buffer.length)) {
      throw new ValidationError(
        'Avatar exceeds the maximum allowed file size.',
      );
    }

    const extension = mimeType.split('/')[1];
    const key = `avatars/${targetUserId}/${Date.now()}.${extension}`;
    const { url } = await this.#storageProvider.put(key, buffer, {
      contentType: mimeType,
    });

    const mediaId = await this.#userRepository.createAvatarMedia({
      userId: targetUserId,
      url,
      mimeType,
      fileSizeBytes: buffer.length,
    });
    await this.#userRepository.updateAvatarMediaId(targetUserId, mediaId);

    await this.#auditLogger.record({
      actorId: principal.userId,
      action: 'user.avatar_updated',
      targetType: 'user',
      targetId: targetUserId,
      afterSnapshot: { avatarMediaId: mediaId },
    });

    return this.#userRepository.findById(targetUserId);
  }

  /**
   * Phase 11 Admin Platform: `GET /users` (admin list). No owner
   * fallback — `user.list` is required outright.
   */
  async listUsers(principal, filters = {}, paginationOpts = {}) {
    await this.#assertPermission(principal, 'user.list');
    return this.#userRepository.listAdmin({ ...filters, ...paginationOpts });
  }

  /**
   * Phase 11 Admin Platform: `GET /users/:id` (admin detail — distinct
   * from `GET /auth/me`, which already covers "my own profile"). No
   * owner fallback, same reasoning as `listUsers`.
   */
  async getAdminDetail(principal, targetUserId) {
    await this.#assertPermission(principal, 'user.view');
    const user = await this.#userRepository.findById(targetUserId);
    if (!user) throw new NotFoundError('User not found.');
    const roleCodes = await this.#userRepository.getRoleCodes(targetUserId);
    return { ...user, roleCodes };
  }

  /**
   * Phase 11 Admin Platform: `PATCH /users/:id/status` — suspend/
   * activate/ban. `PENDING_DELETION` is deliberately excluded (a
   * self-service account-deletion state, not an admin action) — see
   * `userValidators.js`'s `ADMIN_SETTABLE_USER_STATUSES` for the
   * enforced allow-list.
   */
  async updateStatus(principal, targetUserId, statusCode) {
    await this.#assertPermission(principal, 'user.suspend');

    const before = await this.#userRepository.findById(targetUserId);
    if (!before) throw new NotFoundError('User not found.');

    const updated = await this.#userRepository.updateStatusByCode(
      targetUserId,
      statusCode,
    );

    await this.#auditLogger.record({
      actorId: principal.userId,
      action: 'user.status_changed',
      targetType: 'user',
      targetId: targetUserId,
      beforeSnapshot: { statusCode: before.statusCode },
      afterSnapshot: { statusCode },
    });

    return updated;
  }
}

export default UserService;
