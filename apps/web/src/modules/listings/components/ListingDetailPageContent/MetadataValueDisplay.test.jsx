/**
 * Uses synthetic `sample_*` codes (no real translation entries) so these
 * tests exercise per-`data_type` display logic, not translation-content
 * coverage — same convention `MetadataFieldRenderer.test.jsx` established.
 */
import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import MetadataValueDisplay from './MetadataValueDisplay.jsx';

describe('MetadataValueDisplay (Listing Details)', () => {
  test('renders nothing when no definition has a value', () => {
    const { container } = render(
      <MetadataValueDisplay
        namespace="attributes"
        definitions={[{ code: 'sample_string', data_type: 'STRING' }]}
        valuesByCode={{}}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  test('BOOLEAN renders translated Yes/No text (test locale default: hy)', () => {
    render(
      <MetadataValueDisplay
        namespace="policies"
        definitions={[{ code: 'sample_boolean', data_type: 'BOOLEAN' }]}
        valuesByCode={{ sample_boolean: true }}
      />,
    );
    expect(screen.getByText('sample_boolean')).toBeInTheDocument();
    expect(screen.getByText('Այո')).toBeInTheDocument();
  });

  test('INTEGER renders the value with its translated unit suffix', () => {
    render(
      <MetadataValueDisplay
        namespace="attributes"
        definitions={[
          { code: 'sample_integer', data_type: 'INTEGER', unit: 'sample_unit' },
        ]}
        valuesByCode={{ sample_integer: 3 }}
      />,
    );
    expect(screen.getByText('3 sample_unit')).toBeInTheDocument();
  });

  test('ENUM renders the resolved option label', () => {
    render(
      <MetadataValueDisplay
        namespace="attributes"
        definitions={[
          {
            code: 'sample_enum',
            data_type: 'ENUM',
            options: [{ value: 1, code: 'SAMPLE_OPTION' }],
          },
        ]}
        valuesByCode={{ sample_enum: 'SAMPLE_OPTION' }}
      />,
    );
    expect(screen.getByText('SAMPLE_OPTION')).toBeInTheDocument();
  });

  test('MULTI_ENUM renders a comma-joined list of resolved option labels', () => {
    render(
      <MetadataValueDisplay
        namespace="attributes"
        definitions={[{ code: 'sample_multi', data_type: 'MULTI_ENUM' }]}
        valuesByCode={{ sample_multi: ['OPTION_A', 'OPTION_B'] }}
      />,
    );
    expect(screen.getByText('OPTION_A, OPTION_B')).toBeInTheDocument();
  });

  test('STRING renders the plain value', () => {
    render(
      <MetadataValueDisplay
        namespace="policies"
        definitions={[{ code: 'sample_string', data_type: 'STRING' }]}
        valuesByCode={{ sample_string: 'Flexible' }}
      />,
    );
    expect(screen.getByText('Flexible')).toBeInTheDocument();
  });

  test('a definition with no value is skipped', () => {
    render(
      <MetadataValueDisplay
        namespace="attributes"
        definitions={[
          { code: 'sample_a', data_type: 'STRING' },
          { code: 'sample_b', data_type: 'STRING' },
        ]}
        valuesByCode={{ sample_a: 'present' }}
      />,
    );
    expect(screen.getByText('present')).toBeInTheDocument();
    expect(screen.queryByText('sample_b')).not.toBeInTheDocument();
  });

  // Listing Detail rebuild: a value already shown in the key facts strip
  // is not repeated in the specification grid.
  test('codes passed in excludeCodes are not shown', () => {
    render(
      <MetadataValueDisplay
        namespace="attributes"
        definitions={[
          { code: 'sample_shown', data_type: 'STRING' },
          { code: 'sample_in_key_facts', data_type: 'STRING' },
        ]}
        valuesByCode={{
          sample_shown: 'Shown',
          sample_in_key_facts: 'Already above',
        }}
        excludeCodes={['sample_in_key_facts']}
      />,
    );
    expect(screen.getByText('Shown')).toBeInTheDocument();
    expect(screen.queryByText('Already above')).not.toBeInTheDocument();
  });
});
