/**
 * Shared Layer-2 (structural) validation middleware factory.
 *
 * Implements BACKEND_ARCHITECTURE.md §10 (Validators) and §25 (Validation
 * Pipeline): every module's validators/ folder exports a Zod schema per
 * endpoint; this factory wraps that schema into Express middleware that
 * runs BEFORE any Controller/Service code, per the fixed middleware order
 * documented in src/app.js.
 *
 * This is Layer 2 only (structural/format validation from the request
 * payload alone) — Layer 3 (business-rule validation requiring a
 * database read, e.g. availability/ownership checks) belongs in the
 * Service layer, never here (BOOKING_ENGINE_ARCHITECTURE.md §11.1).
 *
 * Usage (inside a module's validators/ file, added in a later sprint):
 *   import { validate } from '../../../validation/validate.js';
 *   router.post('/booking-holds', validate(createHoldSchema), controller.create);
 */

import { ValidationError } from '../errors/AppError.js';

// Only the bounded, non-sensitive context a client needs to explain the
// problem ("at most 255 characters", "required") — never the rejected
// value itself or Zod's free-text message.
const CONTEXT_KEYS = ['minimum', 'maximum', 'type', 'validation'];

function toDetail(issue) {
  const detail = { field: issue.path.join('.'), issue: issue.code };
  CONTEXT_KEYS.forEach((key) => {
    const value = issue[key];
    if (typeof value === 'number' || typeof value === 'string') {
      detail[key] = value;
    }
  });
  // `received` is a type name ("undefined", "string") only for
  // `invalid_type`; on other issues (e.g. `invalid_enum_value`) Zod puts
  // the rejected input itself there, which must not be echoed back.
  if (issue.code === 'invalid_type' && typeof issue.received === 'string') {
    detail.received = issue.received;
  }
  return detail;
}

/**
 * @param {import('zod').ZodSchema} schema - validates { body, query, params }
 */
export function validate(schema) {
  return (req, res, next) => {
    const result = schema.safeParse({
      body: req.body,
      query: req.query,
      params: req.params,
    });

    if (!result.success) {
      const details = result.error.issues.map(toDetail);
      next(new ValidationError('One or more fields are invalid.', details));
      return;
    }

    // Replace request data with the parsed/coerced result so downstream
    // Controllers receive already-validated, already-typed values.
    req.validated = result.data;
    next();
  };
}

export default validate;
