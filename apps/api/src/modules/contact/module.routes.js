/**
 * Contact module route wiring (BACKEND_ARCHITECTURE.md §2: route wiring
 * only, no logic).
 *
 * `POST /` is public and unauthenticated, gated by `sensitiveRateLimiter`
 * — the exact same tier/precedent `auth/module.routes.js` already
 * applies to every other public unauthenticated POST (register, login,
 * password reset). `/admin/*` requires `ADMIN`/`SUPER_ADMIN` outright
 * plus the granular `contact.manage` permission on every route —
 * `ContactService` re-checks the same permission internally (defense in
 * depth, same convention `managers/module.routes.js` already follows).
 */

import { Router } from 'express';
import { sensitiveRateLimiter } from '../../middleware/rateLimiter.js';
import { validate } from '../../validation/validate.js';
import {
  submitInquirySchema,
  inquiryIdParamsSchema,
  listInquiriesQuerySchema,
} from './validators/contactValidators.js';

const ADMIN_ROLES = ['ADMIN', 'SUPER_ADMIN'];

export default function createContactRoutes({ contactController, guards }) {
  const router = Router();
  const { requireAuth, requireRole, requirePermission } = guards;

  router.post(
    '/',
    sensitiveRateLimiter,
    validate(submitInquirySchema),
    contactController.submit,
  );

  const adminRouter = Router();
  adminRouter.use(
    requireAuth,
    requireRole(...ADMIN_ROLES),
    requirePermission('contact.manage'),
  );

  adminRouter.get(
    '/',
    validate(listInquiriesQuerySchema),
    contactController.list,
  );
  adminRouter.get(
    '/:id',
    validate(inquiryIdParamsSchema),
    contactController.getDetail,
  );
  adminRouter.post(
    '/:id/resolve',
    validate(inquiryIdParamsSchema),
    contactController.resolve,
  );

  router.use('/admin', adminRouter);

  return router;
}
