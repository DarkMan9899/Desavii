/**
 * FX module route wiring — Pass 8 (Multi-Currency / CBA FX Pricing).
 *
 * `GET /fx/rates` is public/unauthenticated by design (brief §13: every
 * customer-facing page, including anonymous visitors, needs it to render
 * converted prices) — the global `publicRateLimiter` in `app.js` already
 * covers it, same baseline as every other unauthenticated route
 * (`search`'s own routes take the identical no-per-route-limiter shape).
 */

import { Router } from 'express';

export default function createFxRoutes({ fxController }) {
  const router = Router();

  router.get('/rates', fxController.getRates);

  return router;
}
