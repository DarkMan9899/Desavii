/**
 * EngagementAnalyticsController — Step A2. Parse input -> call Service
 * -> shape response, nothing else (BACKEND_ARCHITECTURE.md Ch.5).
 *
 * Always 204 on the success path (A0.1 §35 locked response contract) —
 * collection disabled, silently-filtered internal traffic, and a
 * genuine write all look identical to the client, by design: this
 * endpoint's response must never leak whether/what was recorded.
 */

export function createEngagementAnalyticsController(
  engagementAnalyticsService,
) {
  return {
    async ingest(req, res, next) {
      try {
        const { events } = req.validated.body;
        await engagementAnalyticsService.ingestClientEvents({
          principal: req.principal ?? null,
          events,
          userAgent: req.get('User-Agent'),
          referer: req.get('Referer'),
        });
        res.status(204).send();
      } catch (err) {
        next(err);
      }
    },
  };
}

export default createEngagementAnalyticsController;
