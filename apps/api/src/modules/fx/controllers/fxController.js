/**
 * FX module Controller — Pass 8 (Multi-Currency / CBA FX Pricing).
 *
 * Parse input -> call Service -> shape response, same as every other
 * controller (`contactController.js`, `searchController.js`). `GET
 * /fx/rates` takes no input — there is exactly one current rate set.
 */

import { toFxRatesResponse } from '../dto/fxDto.js';

export function createFxController(exchangeRateService) {
  return {
    async getRates(req, res, next) {
      try {
        const result = await exchangeRateService.getRates();
        res.status(200).json({
          success: true,
          data: toFxRatesResponse(result),
          meta: null,
          error: null,
        });
      } catch (err) {
        next(err);
      }
    },
  };
}

export default createFxController;
