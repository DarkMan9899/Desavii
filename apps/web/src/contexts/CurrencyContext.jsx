/**
 * CurrencyContext — global client state (Pass 8, mirrors `AuthContext.jsx`'s
 * shape exactly). Populated exclusively by `CurrencyProvider`; every price
 * surface reads it through `useCurrency()`, never derives its own
 * locale-default or reads `localStorage` directly.
 */

import { createContext, useContext } from 'react';

const CurrencyContext = createContext(null);

export default CurrencyContext;

export function useCurrency() {
  const context = useContext(CurrencyContext);
  if (!context) {
    throw new Error('useCurrency must be used within a CurrencyProvider.');
  }
  return context;
}
