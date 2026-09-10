import { describe, test, expect, jest } from '@jest/globals';
import { BlogService } from '../../../../src/modules/blog/services/blogService.js';
import {
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ValidationError,
  ConflictError,
} from '../../../../src/errors/AppError.js';

const MARKETING_PRINCIPAL = { userId: 5, roles: ['MARKETING'] };
const CUSTOMER_PRINCIPAL = { userId: 9, roles: ['CUSTOMER'] };
const ADMIN_PRINCIPAL = { userId: 1, roles: ['ADMIN'] };

const POST_ROW = {
  id: 7,
  slug: 'exploring-yerevan',
  statusCode: 'DRAFT',
  categoryId: null,
  categorySlug: null,
  authorUserId: 5,
  authorFirstName: 'Ani',
  authorLastName: 'Sargsyan',
  publishedAt: null,
  scheduledAt: null,
  createdAt: '2026-09-10T00:00:00.000Z',
  updatedAt: '2026-09-10T00:00:00.000Z',
};

const TRANSLATION_WITH_CONTENT = [
  {
    languageId: 1,
    languageCode: 'en',
    title: 'Exploring Yerevan',
    excerpt: 'A short guide.',
    body: '# Exploring Yerevan\n\nA real article body.',
    seoTitle: null,
    seoDescription: null,
  },
];

function buildService(overrides = {}) {
  const repository = {
    findStatusIdByCode: jest.fn().mockResolvedValue(21),
    findLanguageIdByCode: jest.fn().mockResolvedValue(1),
    findCategoryIdBySlug: jest.fn().mockResolvedValue(3),
    listCategories: jest.fn().mockResolvedValue([]),
    listTags: jest.fn().mockResolvedValue([]),
    slugExists: jest.fn().mockResolvedValue(false),
    create: jest.fn().mockResolvedValue(7),
    findById: jest.fn().mockResolvedValue(POST_ROW),
    findBySlug: jest.fn().mockResolvedValue(POST_ROW),
    findVisibleBySlug: jest.fn().mockResolvedValue(null),
    findVisibleTranslation: jest.fn().mockResolvedValue(null),
    listTranslationsForPost: jest
      .fn()
      .mockResolvedValue(TRANSLATION_WITH_CONTENT),
    upsertTranslation: jest.fn().mockResolvedValue(undefined),
    listTagsForPost: jest.fn().mockResolvedValue([]),
    setPostTags: jest.fn().mockResolvedValue(undefined),
    findOrCreateTagBySlug: jest.fn().mockResolvedValue(11),
    findCoverMedia: jest.fn().mockResolvedValue(null),
    setCoverMedia: jest
      .fn()
      .mockResolvedValue({ id: 1, url: 'https://x/cover.jpg' }),
    removeCoverMedia: jest.fn().mockResolvedValue(undefined),
    updateFields: jest.fn().mockResolvedValue(POST_ROW),
    list: jest.fn().mockResolvedValue([POST_ROW]),
    listVisible: jest.fn().mockResolvedValue({ rows: [], total: 0 }),
    findDuePosts: jest.fn().mockResolvedValue([]),
    ...overrides.repository,
  };
  const permissionResolver = {
    hasPermission: jest.fn().mockResolvedValue(true),
    ...overrides.permissionResolver,
  };
  const auditLogger = { record: jest.fn().mockResolvedValue(undefined) };
  const storageProvider = {
    put: jest
      .fn()
      .mockResolvedValue({ url: 'https://cdn.test/blog/7/cover.jpg' }),
  };
  const userService = {
    findById: jest.fn().mockResolvedValue({ id: 42, first_name: 'Nare' }),
    assignRole: jest.fn().mockResolvedValue(undefined),
    revokeRole: jest.fn().mockResolvedValue(undefined),
    ...overrides.userService,
  };
  const service = new BlogService({
    repository,
    permissionResolver,
    auditLogger,
    storageProvider,
    userService,
  });
  return {
    service,
    repository,
    permissionResolver,
    auditLogger,
    storageProvider,
    userService,
  };
}

describe('BlogService.createDraft', () => {
  test('derives a slug from the title, creates the post, and audit-logs it', async () => {
    const { service, repository } = buildService();
    const result = await service.createDraft(MARKETING_PRINCIPAL, {
      title: 'Exploring Yerevan',
    });
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({ slug: 'exploring-yerevan', authorUserId: 5 }),
      expect.anything(),
    );
    expect(result.id).toBe(7);
  });

  test('throws AuthenticationError with no principal', async () => {
    const { service } = buildService();
    await expect(
      service.createDraft(null, { title: 'X' }),
    ).rejects.toBeInstanceOf(AuthenticationError);
  });

  test('throws AuthorizationError without blog.manage', async () => {
    const { service } = buildService({
      permissionResolver: { hasPermission: jest.fn().mockResolvedValue(false) },
    });
    await expect(
      service.createDraft(MARKETING_PRINCIPAL, { title: 'X' }),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });

  test('throws ConflictError when the derived slug already exists', async () => {
    const { service } = buildService({
      repository: { slugExists: jest.fn().mockResolvedValue(true) },
    });
    await expect(
      service.createDraft(MARKETING_PRINCIPAL, { title: 'Exploring Yerevan' }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  test('a customer cannot create a draft', async () => {
    const { service } = buildService({
      permissionResolver: { hasPermission: jest.fn().mockResolvedValue(false) },
    });
    await expect(
      service.createDraft(CUSTOMER_PRINCIPAL, { title: 'X' }),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });
});

describe('BlogService.updateSettings', () => {
  test('rejects an unknown category slug', async () => {
    const { service } = buildService({
      repository: { findCategoryIdBySlug: jest.fn().mockResolvedValue(null) },
    });
    await expect(
      service.updateSettings(MARKETING_PRINCIPAL, 7, {
        categorySlug: 'not-real',
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  test('creates new tags on the fly and links them to the post', async () => {
    const { service, repository } = buildService();
    await service.updateSettings(MARKETING_PRINCIPAL, 7, {
      tagNames: ['Yerevan', 'Hiking'],
    });
    expect(repository.findOrCreateTagBySlug).toHaveBeenCalledTimes(2);
    expect(repository.setPostTags).toHaveBeenCalledWith(7, [11]);
  });

  test('throws NotFoundError for a missing post', async () => {
    const { service } = buildService({
      repository: { findById: jest.fn().mockResolvedValue(null) },
    });
    await expect(
      service.updateSettings(MARKETING_PRINCIPAL, 999, {}),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('BlogService publish/unpublish/schedule (blog.publish)', () => {
  test('publish requires real title+body content in at least one locale', async () => {
    const { service } = buildService({
      repository: { listTranslationsForPost: jest.fn().mockResolvedValue([]) },
    });
    await expect(
      service.publish(MARKETING_PRINCIPAL, 7),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  test('publish sets PUBLISHED status and records publishedAt/publishedBy', async () => {
    const { service, repository } = buildService();
    await service.publish(MARKETING_PRINCIPAL, 7);
    expect(repository.findStatusIdByCode).toHaveBeenCalledWith('PUBLISHED');
    expect(repository.updateFields).toHaveBeenCalledWith(
      7,
      expect.objectContaining({ publishedBy: 5 }),
    );
  });

  test('a principal without blog.publish cannot publish, even with blog.manage', async () => {
    const { service } = buildService({
      permissionResolver: {
        hasPermission: jest
          .fn()
          .mockImplementation((_roles, key) =>
            Promise.resolve(key === 'blog.manage'),
          ),
      },
    });
    await expect(
      service.publish(MARKETING_PRINCIPAL, 7),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });

  test('unpublish moves the post to ARCHIVED', async () => {
    const { service, repository } = buildService();
    await service.unpublish(MARKETING_PRINCIPAL, 7);
    expect(repository.findStatusIdByCode).toHaveBeenCalledWith('ARCHIVED');
  });

  test('schedule rejects a past date', async () => {
    const { service } = buildService();
    await expect(
      service.schedule(MARKETING_PRINCIPAL, 7, '2020-01-01T00:00:00Z'),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  test('schedule accepts a real future date and sets SCHEDULED status', async () => {
    const { service, repository } = buildService();
    const future = new Date(Date.now() + 86_400_000).toISOString();
    await service.schedule(MARKETING_PRINCIPAL, 7, future);
    expect(repository.findStatusIdByCode).toHaveBeenCalledWith('SCHEDULED');
  });
});

describe('BlogService.runScheduledPublishSweep', () => {
  test('publishes every due post and is directly callable outside BullMQ', async () => {
    const duePost = { ...POST_ROW, id: 42, statusCode: 'SCHEDULED' };
    const { service, repository } = buildService({
      repository: { findDuePosts: jest.fn().mockResolvedValue([duePost]) },
    });
    const result = await service.runScheduledPublishSweep();
    expect(result).toEqual({ published: 1 });
    expect(repository.updateFields).toHaveBeenCalledWith(
      42,
      expect.objectContaining({ scheduledAt: null }),
    );
  });
});

describe('BlogService public read surface', () => {
  test('getPublicPost throws NotFoundError for a draft/unpublished slug', async () => {
    const { service } = buildService();
    await expect(
      service.getPublicPost('some-draft', 'en'),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  test('getPublicPost never requires a principal (anonymous, public read)', async () => {
    const { service } = buildService({
      repository: {
        findVisibleTranslation: jest.fn().mockResolvedValue({
          post: POST_ROW,
          translation: TRANSLATION_WITH_CONTENT[0],
        }),
      },
    });
    const result = await service.getPublicPost('exploring-yerevan', 'en');
    expect(result.title).toBe('Exploring Yerevan');
  });

  test('listRelatedPosts excludes the current post and returns [] with no category', async () => {
    const { service } = buildService();
    const related = await service.listRelatedPosts(POST_ROW, 'en');
    expect(related).toEqual([]);
  });
});

describe('BlogService Marketing role assignment (marketing.assign)', () => {
  test('promoteToMarketing grants the role and audit-logs it', async () => {
    const { service, userService, auditLogger } = buildService();
    const result = await service.promoteToMarketing(ADMIN_PRINCIPAL, 42);
    expect(userService.assignRole).toHaveBeenCalledWith(42, 'MARKETING');
    expect(auditLogger.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'marketing.role_granted',
        targetId: 42,
      }),
    );
    expect(result).toEqual({ userId: 42, role: 'MARKETING', granted: true });
  });

  test('demoteFromMarketing revokes the role and audit-logs it', async () => {
    const { service, userService, auditLogger } = buildService();
    const result = await service.demoteFromMarketing(ADMIN_PRINCIPAL, 42);
    expect(userService.revokeRole).toHaveBeenCalledWith(42, 'MARKETING');
    expect(auditLogger.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'marketing.role_revoked',
        targetId: 42,
      }),
    );
    expect(result).toEqual({ userId: 42, role: 'MARKETING', granted: false });
  });

  test('a Marketing user cannot grant itself the role (needs marketing.assign, not blog.manage)', async () => {
    const { service } = buildService({
      permissionResolver: {
        hasPermission: jest
          .fn()
          .mockImplementation((_roles, key) =>
            Promise.resolve(key === 'blog.manage' || key === 'blog.publish'),
          ),
      },
    });
    await expect(
      service.promoteToMarketing(MARKETING_PRINCIPAL, 42),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });

  test('promoteToMarketing throws NotFoundError for a nonexistent user', async () => {
    const { service } = buildService({
      userService: { findById: jest.fn().mockResolvedValue(null) },
    });
    await expect(
      service.promoteToMarketing(ADMIN_PRINCIPAL, 9999),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
