/**
 * ApiErrorAlert — the one Partner-facing rendering of a rejected API call,
 * replacing every `<Alert>{mutation.error.message}</Alert>`. Shows a
 * translated headline for the error kind, then lists every issue the form
 * is NOT already showing inline (`inlinePaths`), so no backend-reported
 * problem is ever silently dropped — a path with no visible field still
 * appears here, labelled via `fieldLabels` when the caller knows one.
 */

import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { Alert } from '@desavii/ui/components/feedback-overlays';
import {
  parseApiError,
  getApiErrorSummary,
  getIssueMessage,
} from '../../utils/apiErrorFeedback.js';
import apiErrorPropType from './apiErrorPropType.js';
import styles from './ApiErrorAlert.module.scss';

export default function ApiErrorAlert({
  error = null,
  inlinePaths = [],
  fieldLabels = {},
  renderIssueAction = undefined,
}) {
  const { t } = useTranslation();
  const parsed = parseApiError(error);
  if (!parsed) return null;

  const inline = new Set(inlinePaths);
  const seen = new Set();
  const listed = [];
  parsed.issues.forEach((issue) => {
    if (inline.has(issue.path)) return;
    const message = getIssueMessage(t, issue);
    const key = `${issue.path}|${message}`;
    if (seen.has(key)) return;
    seen.add(key);
    listed.push({ issue, message, key });
  });

  return (
    <Alert variant="danger" title={getApiErrorSummary(t, error)}>
      {listed.length > 0 && (
        <ul className={styles.issues}>
          {listed.map(({ issue, message, key }) => (
            <li key={key} className={styles.issue}>
              <span>
                {fieldLabels[issue.path] && (
                  <span className={styles.label}>
                    {fieldLabels[issue.path]}:{' '}
                  </span>
                )}
                {message}
              </span>
              {renderIssueAction?.(issue)}
            </li>
          ))}
        </ul>
      )}
    </Alert>
  );
}

ApiErrorAlert.propTypes = {
  error: apiErrorPropType,
  inlinePaths: PropTypes.arrayOf(PropTypes.string),
  fieldLabels: PropTypes.objectOf(PropTypes.string),
  renderIssueAction: PropTypes.func,
};
