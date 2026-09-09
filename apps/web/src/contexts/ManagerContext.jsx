/**
 * ManagerContext — Sprint F (Manager Workspace): "which assigned company
 * am I acting as" for a signed-in Manager. Mirrors `PartnerContext.jsx`
 * exactly, for the same reason: a Manager may be assigned to more than
 * one company (`manager_companies`, migration 0042) and every Manager
 * Dashboard/Companies/Listings/Bookings/Analytics page needs one
 * consistent "current company" selection. Populated by `ManagerProvider`,
 * mounted inside `RequireManager` (so it only exists once the Manager's
 * own assigned-companies list has already been fetched).
 */

import { createContext, useContext } from 'react';

const ManagerContext = createContext(null);

export default ManagerContext;

export function useManagerContext() {
  const context = useContext(ManagerContext);
  if (!context) {
    throw new Error('useManagerContext must be used within a ManagerProvider.');
  }
  return context;
}
