/**
 * Partner Analytics controller — Step A5. HTTP-to-Service translation
 * only (BACKEND_ARCHITECTURE.md §5) — every authorization/range/ratio/
 * zero-fill decision lives in `PartnerAnalyticsService`.
 */

export function createPartnerAnalyticsController(partnerAnalyticsService) {
  return {
    async getOverview(req, res, next) {
      try {
        const { partnerId, range } = req.validated.query;
        const data = await partnerAnalyticsService.getOverview(req.principal, {
          partnerId,
          rangeDays: range,
        });
        res.status(200).json({ success: true, data, meta: null, error: null });
      } catch (err) {
        next(err);
      }
    },

    async listListings(req, res, next) {
      try {
        const { partnerId, range, sort, cursor, limit } = req.validated.query;
        const { rows, meta } = await partnerAnalyticsService.listListings(
          req.principal,
          { partnerId, rangeDays: range, sort, cursor, limit },
        );
        res.status(200).json({ success: true, data: rows, meta, error: null });
      } catch (err) {
        next(err);
      }
    },

    async getListingDetail(req, res, next) {
      try {
        const { listingId } = req.validated.params;
        const { partnerId, range } = req.validated.query;
        const data = await partnerAnalyticsService.getListingDetail(
          req.principal,
          { partnerId, rangeDays: range, listingId },
        );
        res.status(200).json({ success: true, data, meta: null, error: null });
      } catch (err) {
        next(err);
      }
    },

    async listPromotions(req, res, next) {
      try {
        const { partnerId, range, cursor, limit } = req.validated.query;
        const { rows, meta } = await partnerAnalyticsService.listPromotions(
          req.principal,
          { partnerId, rangeDays: range, cursor, limit },
        );
        res.status(200).json({ success: true, data: rows, meta, error: null });
      } catch (err) {
        next(err);
      }
    },

    async getPromotionDetail(req, res, next) {
      try {
        const { promotionId } = req.validated.params;
        const { partnerId, range } = req.validated.query;
        const data = await partnerAnalyticsService.getPromotionDetail(
          req.principal,
          { partnerId, rangeDays: range, promotionId },
        );
        res.status(200).json({ success: true, data, meta: null, error: null });
      } catch (err) {
        next(err);
      }
    },
  };
}

export default createPartnerAnalyticsController;
