/**
 * useCheckoutQuote — Step L6.2H4. The quote state of one checkout.
 *
 * - `acceptedQuote`: the server quote the customer is booking at — the hold's
 *   own quote, then any new quote they explicitly accepted. Never a browser
 *   estimate. `null` when the held unit has no complete price.
 * - `changedQuote`: the current server quote after a `PRICE_CHANGED`
 *   rejection, waiting for the customer's explicit acceptance. While it is
 *   set, checkout must not submit.
 * - `acceptChangedQuote()`: makes it the accepted quote and writes it into
 *   the page's history state, so a same-tab refresh keeps the accepted
 *   quote with its hold. It never submits — the customer books again.
 *
 * A stale quote (back/forward, an older tab) is caught by the server, which
 * answers `PRICE_CHANGED` (or `HOLD_EXPIRED`) again.
 */

import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { readCurrentQuote } from '../utils/bookingQuote.js';

export function useCheckoutQuote(holdState) {
  const location = useLocation();
  const navigate = useNavigate();
  const [acceptedQuote, setAcceptedQuote] = useState(
    holdState?.holdBatch?.items?.[0]?.quote ?? null,
  );
  const [changedQuote, setChangedQuote] = useState(null);

  /** @returns {boolean} whether `error` was a price change it now handles. */
  function handleBookingError(error) {
    const currentQuote = readCurrentQuote(error);
    if (!currentQuote) return false;
    setChangedQuote(currentQuote);
    return true;
  }

  function acceptChangedQuote() {
    if (!changedQuote) return;
    const [firstItem, ...otherItems] = holdState.holdBatch.items;
    navigate(`${location.pathname}${location.search}`, {
      replace: true,
      state: {
        ...holdState,
        holdBatch: {
          ...holdState.holdBatch,
          items: [{ ...firstItem, quote: changedQuote }, ...otherItems],
        },
      },
    });
    setAcceptedQuote(changedQuote);
    setChangedQuote(null);
  }

  return {
    acceptedQuote,
    changedQuote,
    handleBookingError,
    acceptChangedQuote,
  };
}

export default useCheckoutQuote;
