/**
 * Contact module response DTOs (Sprint G).
 */

export function toContactInquiryResponse(row) {
  return {
    id: row.id,
    type: row.type_code,
    status: row.status_code,
    name: row.name,
    email: row.email,
    subject: row.subject,
    message: row.message,
    resolved_at: row.resolved_at,
    resolved_by: row.resolved_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export default toContactInquiryResponse;
