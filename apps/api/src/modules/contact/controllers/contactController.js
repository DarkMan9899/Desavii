/**
 * Contact module Controller.
 *
 * Implements BACKEND_ARCHITECTURE.md Ch.5: parse input -> call Service ->
 * shape response. No business logic, no direct database access.
 */

import { toContactInquiryResponse } from '../dto/contactDto.js';

export function createContactController(contactService) {
  return {
    async submit(req, res, next) {
      try {
        const { inquiryType, name, email, subject, message } =
          req.validated.body;
        const result = await contactService.submitInquiry({
          typeCode: inquiryType,
          name,
          email,
          subject,
          message,
        });
        res.status(201).json({
          success: true,
          data: { id: result.id },
          meta: null,
          error: null,
        });
      } catch (err) {
        next(err);
      }
    },

    async list(req, res, next) {
      try {
        const { limit, status } = req.validated.query;
        const rows = await contactService.listInquiries(req.principal, {
          limit,
          statusCode: status,
        });
        res.status(200).json({
          success: true,
          data: rows.map(toContactInquiryResponse),
          meta: null,
          error: null,
        });
      } catch (err) {
        next(err);
      }
    },

    async getDetail(req, res, next) {
      try {
        const { id } = req.validated.params;
        const inquiry = await contactService.getInquiry(req.principal, id);
        res.status(200).json({
          success: true,
          data: toContactInquiryResponse(inquiry),
          meta: null,
          error: null,
        });
      } catch (err) {
        next(err);
      }
    },

    async resolve(req, res, next) {
      try {
        const { id } = req.validated.params;
        const inquiry = await contactService.resolveInquiry(req.principal, id);
        res.status(200).json({
          success: true,
          data: toContactInquiryResponse(inquiry),
          meta: null,
          error: null,
        });
      } catch (err) {
        next(err);
      }
    },
  };
}

export default createContactController;
