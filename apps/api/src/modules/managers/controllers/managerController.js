/**
 * Managers module Controller.
 *
 * Implements BACKEND_ARCHITECTURE.md Ch.5: parse input -> call Service ->
 * shape response. No business logic, no direct database access.
 */

import {
  toManagerSummaryResponse,
  toAssignmentResponse,
  toManagerDetailResponse,
  toDashboardResponse,
  toAnalyticsResponse,
} from '../dto/managerDto.js';

export function createManagerController(managerService) {
  return {
    // --- Admin-side ---

    async promote(req, res, next) {
      try {
        const { userId } = req.validated.body;
        const manager = await managerService.promoteToManager(
          req.principal,
          userId,
        );
        res.status(200).json({
          success: true,
          data: toManagerSummaryResponse({
            ...manager,
            assigned_company_count: 0,
          }),
          meta: null,
          error: null,
        });
      } catch (err) {
        next(err);
      }
    },

    async list(req, res, next) {
      try {
        const { limit } = req.validated.query;
        const rows = await managerService.listManagers(req.principal, {
          limit,
        });
        res.status(200).json({
          success: true,
          data: rows.map(toManagerSummaryResponse),
          meta: null,
          error: null,
        });
      } catch (err) {
        next(err);
      }
    },

    async getDetail(req, res, next) {
      try {
        const { userId } = req.validated.params;
        const detail = await managerService.getManagerDetail(
          req.principal,
          userId,
        );
        res.status(200).json({
          success: true,
          data: toManagerDetailResponse(detail),
          meta: null,
          error: null,
        });
      } catch (err) {
        next(err);
      }
    },

    async assignCompany(req, res, next) {
      try {
        const { userId } = req.validated.params;
        const { partnerId } = req.validated.body;
        const assignments = await managerService.assignCompany(req.principal, {
          managerUserId: userId,
          partnerId,
        });
        res.status(200).json({
          success: true,
          data: assignments.map(toAssignmentResponse),
          meta: null,
          error: null,
        });
      } catch (err) {
        next(err);
      }
    },

    async unassignCompany(req, res, next) {
      try {
        const { userId, partnerId } = req.validated.params;
        const assignments = await managerService.unassignCompany(
          req.principal,
          { managerUserId: userId, partnerId },
        );
        res.status(200).json({
          success: true,
          data: assignments.map(toAssignmentResponse),
          meta: null,
          error: null,
        });
      } catch (err) {
        next(err);
      }
    },

    async getAdminAnalyticsForManager(req, res, next) {
      try {
        const { userId } = req.validated.params;
        const analytics = await managerService.getAdminAnalyticsForManager(
          req.principal,
          userId,
          req.validated.query,
        );
        res.status(200).json({
          success: true,
          data: toAnalyticsResponse(analytics),
          meta: null,
          error: null,
        });
      } catch (err) {
        next(err);
      }
    },

    // --- Manager self-service ---

    async listMyCompanies(req, res, next) {
      try {
        const rows = await managerService.listMyCompanies(req.principal);
        res.status(200).json({
          success: true,
          data: rows.map(toAssignmentResponse),
          meta: null,
          error: null,
        });
      } catch (err) {
        next(err);
      }
    },

    async getMyDashboard(req, res, next) {
      try {
        const dashboard = await managerService.getDashboard(req.principal);
        res.status(200).json({
          success: true,
          data: toDashboardResponse(dashboard),
          meta: null,
          error: null,
        });
      } catch (err) {
        next(err);
      }
    },

    async getMyAnalytics(req, res, next) {
      try {
        const analytics = await managerService.getAnalytics(
          req.principal,
          req.validated.query,
        );
        res.status(200).json({
          success: true,
          data: toAnalyticsResponse(analytics),
          meta: null,
          error: null,
        });
      } catch (err) {
        next(err);
      }
    },
  };
}

export default createManagerController;
