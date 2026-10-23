/**
 * Shared date-range length rule (Calendar Excellence). Availability writes,
 * holds and ledger reads lock or scan one row per date, so an unbounded
 * range lets a single request hold a transaction (and its row locks) for as
 * long as its caller likes. Every such range is capped at a year,
 * leap-safe. Crosscutting (`src/validation/*`), like `isoDate.js`.
 */

import { z } from 'zod';

export const MAX_DATE_SPAN_DAYS = 366;

const MS_PER_DAY = 86_400_000;

/**
 * Zod `superRefine`: `toKey` is at most `MAX_DATE_SPAN_DAYS` days after
 * `fromKey` (both `YYYY-MM-DD`). Reported as `DATE_SPAN_TOO_LONG` with its
 * `maximum`. An inverted or incomplete range is left to the range's own
 * rules.
 */
export function refineDateSpan(fromKey, toKey) {
  return (data, ctx) => {
    const from = data[fromKey];
    const to = data[toKey];
    if (!from || !to || to < from) return;
    const spanDays =
      (new Date(`${to}T00:00:00Z`).getTime() -
        new Date(`${from}T00:00:00Z`).getTime()) /
      MS_PER_DAY;
    if (spanDays > MAX_DATE_SPAN_DAYS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `The date range cannot exceed ${MAX_DATE_SPAN_DAYS} days.`,
        path: [toKey],
        params: { issue: 'DATE_SPAN_TOO_LONG', maximum: MAX_DATE_SPAN_DAYS },
      });
    }
  };
}

export default refineDateSpan;
