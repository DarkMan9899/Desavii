/**
 * Blog module DI container (BACKEND_ARCHITECTURE.md §17). Depends on
 * Users' public Service interface only (`userService.assignRole`/
 * `revokeRole`/`findById` for Marketing role assignment, spec §17) —
 * never a second Repository over `users`, same cross-module rule
 * `managers/module.container.js` already follows.
 */

import { MySqlBlogRepository } from './repositories/mysqlBlogRepository.js';
import { BlogService } from './services/blogService.js';
import { createBlogController } from './controllers/blogController.js';
import { createStorageProvider } from '../../infrastructure/storage/createStorageProvider.js';

export default function createBlogContainer({
  permissionResolver,
  auditLogger,
  userService,
}) {
  const blogRepository = new MySqlBlogRepository();
  const storageProvider = createStorageProvider();

  const blogService = new BlogService({
    repository: blogRepository,
    permissionResolver,
    auditLogger,
    storageProvider,
    userService,
  });
  const blogController = createBlogController(blogService);

  return {
    blogRepository,
    blogService,
    blogController,
  };
}
