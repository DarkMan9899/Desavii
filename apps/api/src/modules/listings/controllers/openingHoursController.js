/**
 * Opening Hours Controller (Pass 6, Restaurant vertical) — parse input ->
 * call Service -> shape response, same shape as `restaurantMenuController.js`.
 * No business logic, no direct database access.
 */

import { toOpeningHoursDayResponse } from '../dto/openingHoursDto.js';

export function createOpeningHoursController(openingHoursService) {
  return {
    async getForListing(req, res, next) {
      try {
        const { id } = req.validated.params;
        const days = await openingHoursService.getOpeningHours(id);
        res.status(200).json({
          success: true,
          data: days.map(toOpeningHoursDayResponse),
          meta: null,
          error: null,
        });
      } catch (err) {
        next(err);
      }
    },

    async replaceForListing(req, res, next) {
      try {
        const { id } = req.validated.params;
        const days = await openingHoursService.replaceOpeningHours(
          req.principal,
          id,
          req.validated.body.days,
        );
        res.status(200).json({
          success: true,
          data: days.map(toOpeningHoursDayResponse),
          meta: null,
          error: null,
        });
      } catch (err) {
        next(err);
      }
    },
  };
}

export default createOpeningHoursController;
