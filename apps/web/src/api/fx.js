/**
 * FX module — raw endpoint calls (Pass 8). Mirrors `apps/api/src/modules/
 * fx/module.routes.js` — the one public `GET /fx/rates` endpoint.
 *
 * Resolves to the raw `{ success, data, meta, error }` envelope, same
 * convention as every other `api/` file (unwrapping is a `queries/`-layer
 * concern).
 */

import apiClient from './client.js';

/** `GET /fx/rates` — public, unauthenticated. `{baseCurrency, rates, effectiveAt, source}` (brief §13). */
export function getRates() {
  return apiClient.get('/fx/rates').then((response) => response.data);
}

export default { getRates };
