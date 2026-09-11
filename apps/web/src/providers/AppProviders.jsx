/**
 * Root provider composition.
 *
 * Implements FRONTEND_ARCHITECTURE.md §13 (State Management Strategy):
 * composes the small set of global-client-state Context providers plus
 * TanStack React Query's QueryClientProvider — the single place all of
 * these are wired together, so app/App.jsx itself stays a thin
 * composition root.
 *
 * Application Foundation phase: adds `AuthProvider` (§11 — session
 * bootstrap, login/register/logout), `ToastProvider` and
 * `ConfirmProvider` (§13.3's toast queue, plus the confirmation-modal
 * imperative API), each introduced only now because this phase is the
 * first with real consumers for them (a login flow, and global
 * components that need to raise a toast or ask for confirmation).
 * `LocaleContext`, `CurrencyContext`, `ThemeContext` are still deferred —
 * still no consumer needing them yet.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import PropTypes from 'prop-types';
import AuthProvider from './AuthProvider.jsx';
import ToastProvider from './ToastProvider.jsx';
import ConfirmProvider from './ConfirmProvider.jsx';
import { shouldRetryQuery } from './queryRetryPolicy.js';

// Sensible platform-wide defaults per FRONTEND_ARCHITECTURE.md §14.2.
// Per-resource overrides (e.g. availability/pricing's staleTime: 0) are
// set at the individual query-hook level in the sprint that adds them.
//
// Sprint L fix (real, reproduced defect): `retry: 2` as a plain number
// retried EVERY failure the same way, including permanent 4xx failures
// (a 404 lookup, an invalid token, a validation error) that can never
// succeed by retrying — each one burned ~1s + 2s of exponential backoff
// (React Query's default `retryDelay`) before `isError` ever became
// true, during which a screen gated on `isPending` alone kept showing a
// loading spinner. This is exactly why several query hooks (blog/CMS/
// invitation-preview lookups — all genuinely 404-able) had already
// worked around it locally with `retry: false`, one hook at a time —
// see `usePublicPostsQuery.js`'s own header. `shouldRetryQuery` fixes
// the root cause globally instead: skip retrying 4xx (they're permanent,
// not transient) but keep retrying everything else — network drops,
// 5xx, the exact "worth trying again" cases the original `retry: 2`
// existed for — up to twice, same as before.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000,
      retry: shouldRetryQuery,
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 0,
    },
  },
});

export default function AppProviders({ children }) {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter
        future={{
          v7_startTransition: true,
          v7_relativeSplatPath: true,
        }}
      >
        <AuthProvider>
          <ToastProvider>
            <ConfirmProvider>{children}</ConfirmProvider>
          </ToastProvider>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

AppProviders.propTypes = {
  children: PropTypes.node.isRequired,
};
