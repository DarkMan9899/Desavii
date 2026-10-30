/** AI Search Controller (Stage 15.2) — parse input -> call Service -> shape response. */

import {
  toParsedSearchResponse,
  toAiSearchAvailabilityResponse,
} from '../dto/aiSearchDto.js';

export function createAiSearchController(aiSearchService) {
  return {
    availability(req, res, next) {
      try {
        res.status(200).json({
          success: true,
          data: toAiSearchAvailabilityResponse(
            aiSearchService.getAvailability(),
          ),
          meta: null,
          error: null,
        });
      } catch (err) {
        next(err);
      }
    },

    async parse(req, res, next) {
      try {
        const parsed = await aiSearchService.parseQuery(
          req.principal,
          req.validated.body,
        );
        res.status(200).json({
          success: true,
          data: toParsedSearchResponse(parsed),
          meta: null,
          error: null,
        });
      } catch (err) {
        next(err);
      }
    },
  };
}

export default createAiSearchController;
