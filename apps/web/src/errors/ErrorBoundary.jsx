/**
 * Application-level error boundary.
 * Implements FRONTEND_ARCHITECTURE.md §27.1.3: catches unhandled render
 * exceptions and renders a fallback.
 *
 * Sprint L: this sits ABOVE `AppProviders` in `App.jsx` (so it can catch
 * a render error anywhere, including inside the router/providers
 * themselves), which means its fallback renders with NO Router context
 * available — `ErrorLayout` (COMPONENT_LIBRARY.md's "500 Page" chrome)
 * needs `useParams`/`<Link>` and would itself throw if used here. The
 * fallback below stays deliberately Router-free (shared `Container`/
 * `EmptyState` primitives have no such dependency) while still using the
 * real design system instead of hardcoded inline styles, with a working
 * recovery action — `window.location.reload()`, not `useNavigate`, for
 * the same reason (and it matches what the copy already told the user
 * to do: "Please reload the page").
 */

import { Component } from 'react';
import PropTypes from 'prop-types';
import { Container } from '@desavii/ui/components/layout';
import { EmptyState } from '@desavii/ui/components/feedback-overlays';
// The i18next singleton, not the `useTranslation` hook — a class
// component (this one, since React error boundaries can only be classes)
// can't call hooks. `i18n.t()` still reads the live, currently-active
// language at call time, the same as the hook would.
import i18n from '../translations/i18n.js';
import styles from './ErrorBoundary.module.scss';

function reloadPage() {
  window.location.reload();
}

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    // FRONTEND_ARCHITECTURE.md §36: real monitoring-pipeline reporting is
    // wired in a future sprint. For now, fail loudly in dev, silently in
    // build output — never silently swallowed.
    // eslint-disable-next-line no-console
    console.error('Unhandled render error caught by ErrorBoundary:', {
      error,
      info,
    });
  }

  render() {
    const { hasError } = this.state;
    const { children } = this.props;

    if (hasError) {
      return (
        <div className={styles.errorBoundary} role="alert">
          <Container size="narrow">
            <EmptyState
              title={i18n.t('errors.boundary.title')}
              description={i18n.t('errors.boundary.description')}
              actionLabel={i18n.t('errors.boundary.action')}
              onAction={reloadPage}
            />
          </Container>
        </div>
      );
    }
    return children;
  }
}

ErrorBoundary.propTypes = {
  children: PropTypes.node.isRequired,
};
