/**
 * RedirectIfAuthenticated — the anonymous-only counterpart of
 * `RequireAuth`, for the screens that create or open a session (login,
 * customer registration, partner registration). A visitor sees them; a
 * signed-in user is sent where those screens would have sent them after
 * success, instead of being offered a second account:
 *
 *  - `destination="home"` (login, customer registration): a safe
 *    `?redirect=` if present, else the role-aware home
 *    (`resolvePostAuthPath`).
 *  - `destination="partnerStart"` (partner registration): the Partner
 *    "Start" target for this user — their partner workspace, or the
 *    partner application with the account they already have
 *    (`resolvePartnerStartPath`).
 *
 * The forms navigate to the same place themselves after a successful
 * submit (both read `authDestinations.js`), so whichever runs first the
 * user ends up on one destination. Renders `PageLoader` while the session
 * is still restoring, like `RequireAuth`, so a signed-in user reloading a
 * deep link never sees the form flash first.
 */

import { Navigate, useParams, useSearchParams } from 'react-router-dom';
import PropTypes from 'prop-types';
import { useAuth } from '../contexts/AuthContext.jsx';
import PageLoader from '../components/PageLoader/PageLoader.jsx';
import {
  resolvePartnerStartPath,
  resolvePostAuthPath,
} from '../utils/authDestinations.js';

const DESTINATIONS = ['home', 'partnerStart'];

export default function RedirectIfAuthenticated({
  destination = 'home',
  children,
}) {
  const { isAuthenticated, isBootstrapping, roles, partnerships } = useAuth();
  const { locale } = useParams();
  const [searchParams] = useSearchParams();

  if (isBootstrapping) {
    return <PageLoader />;
  }

  if (isAuthenticated) {
    const to =
      destination === 'partnerStart'
        ? resolvePartnerStartPath({ isAuthenticated, partnerships, locale })
        : resolvePostAuthPath({
            redirect: searchParams.get('redirect'),
            roles,
            partnerships,
            locale,
          });
    return <Navigate to={to} replace />;
  }

  return children;
}

/* eslint-disable react/require-default-props -- inline ES6 default above */
RedirectIfAuthenticated.propTypes = {
  destination: PropTypes.oneOf(DESTINATIONS),
  children: PropTypes.node.isRequired,
};
/* eslint-enable react/require-default-props */
