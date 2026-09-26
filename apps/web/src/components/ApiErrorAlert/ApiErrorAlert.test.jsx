import { describe, test, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import ApiError from '../../api/ApiError.js';
import ApiErrorAlert from './ApiErrorAlert.jsx';

function validationError(details) {
  return new ApiError({
    code: 'VALIDATION_FAILED',
    message: 'One or more fields are invalid.',
    status: 422,
    details,
  });
}

describe('ApiErrorAlert', () => {
  test('renders nothing without an error', () => {
    const { container } = render(<ApiErrorAlert error={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  test('shows a translated summary — never the backend English message', () => {
    render(
      <ApiErrorAlert
        error={validationError([
          {
            field: 'body.title',
            issue: 'too_small',
            minimum: 1,
            type: 'string',
          },
        ])}
      />,
    );
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Որոշ տվյալներ պետք է ուղղել։');
    expect(alert).not.toHaveTextContent('One or more fields are invalid.');
  });

  test('lists issues not shown inline, with their label, and omits inline ones', () => {
    render(
      <ApiErrorAlert
        error={validationError([
          {
            field: 'body.translations.0.title',
            issue: 'too_big',
            maximum: 255,
            type: 'string',
          },
          { field: 'pricing.currencyCode', issue: 'UNKNOWN_CURRENCY' },
        ])}
        inlinePaths={['translations.0.title']}
        fieldLabels={{ 'pricing.currencyCode': 'Արժույթ' }}
      />,
    );
    const items = within(screen.getByRole('alert')).getAllByRole('listitem');
    expect(items).toHaveLength(1);
    expect(items[0]).toHaveTextContent('Արժույթ: Ընտրեք աջակցվող արժույթ։');
  });

  test('a path with no visible field is still shown (never silently dropped)', () => {
    render(
      <ApiErrorAlert
        error={validationError([
          { field: 'someInternalPath.3', issue: 'INVALID' },
        ])}
      />,
    );
    expect(screen.getByRole('listitem')).toHaveTextContent(
      'Այս արժեքը վավեր չէ։',
    );
    expect(screen.getByRole('alert')).not.toHaveTextContent('someInternalPath');
    expect(screen.getByRole('alert')).not.toHaveTextContent('INVALID');
  });

  test('a 500 shows only the generic server summary, not the server message', () => {
    render(
      <ApiErrorAlert
        error={
          new ApiError({
            code: 'INTERNAL_ERROR',
            message: 'ER_BAD_FIELD_ERROR: Unknown column in field list',
            status: 500,
          })
        }
      />,
    );
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(
      'Մեր կողմում խնդիր առաջացավ։ Խնդրում ենք փորձել կրկին։',
    );
    expect(alert).not.toHaveTextContent('ER_BAD_FIELD_ERROR');
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  test('renderIssueAction adds a per-issue control', () => {
    render(
      <ApiErrorAlert
        error={validationError([
          { field: 'media', issue: 'AT_LEAST_ONE_IMAGE_REQUIRED' },
        ])}
        renderIssueAction={(issue) => (
          <button type="button">{issue.path}</button>
        )}
      />,
    );
    expect(screen.getByRole('button', { name: 'media' })).toBeInTheDocument();
  });
});
