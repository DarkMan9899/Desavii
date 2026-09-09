/**
 * RequireManager — FRONTEND_ARCHITECTURE.md §12, mirroring
 * `RequireRole.jsx`'s shape exactly: renders children if the
 * authenticated user's roles include the global MANAGER role code
 * (`AuthContext.roles`); otherwise renders `ForbiddenPage`. Reads
 * exclusively from `AuthContext` — never its own API call, per §12.
 *
 * A dedicated guard rather than `<RequireRole roles={['MANAGER']}>`
 * directly so the intent reads clearly at the route-tree call site,
 * matching `RequirePartner`'s own precedent for a membership-shaped
 * check that happens to also be a single role today.
 *
 * Must be composed inside `RequireAuth` (this component assumes
 * `isAuthenticated` — it doesn't itself redirect an anonymous visitor to
 * login, that's `RequireAuth`'s job).
 */

import PropTypes from 'prop-types';
import { useAuth } from '../contexts/AuthContext.jsx';
import ForbiddenPage from '../pages/ForbiddenPage.jsx';

export default function RequireManager({ children }) {
  const { roles } = useAuth();
  const isManager = roles.includes('MANAGER');

  if (!isManager) {
    return <ForbiddenPage />;
  }

  return children;
}

RequireManager.propTypes = {
  children: PropTypes.node.isRequired,
};
