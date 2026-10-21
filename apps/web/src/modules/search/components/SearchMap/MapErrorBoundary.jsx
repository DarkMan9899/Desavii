/**
 * MapErrorBoundary — keeps a map failure (its chunk failing to download,
 * Leaflet throwing) inside the map panel: the panel offers a retry and the
 * rest of Search, the List included, keeps working.
 */

import { Component } from 'react';
import PropTypes from 'prop-types';

export default class MapErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
    this.retry = this.retry.bind(this);
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  retry() {
    this.setState({ hasError: false });
  }

  render() {
    const { hasError } = this.state;
    const { children, renderFallback } = this.props;
    return hasError ? renderFallback(this.retry) : children;
  }
}

MapErrorBoundary.propTypes = {
  children: PropTypes.node.isRequired,
  /** `(retry) => node`: what the panel shows instead of a failed map. */
  renderFallback: PropTypes.func.isRequired,
};
