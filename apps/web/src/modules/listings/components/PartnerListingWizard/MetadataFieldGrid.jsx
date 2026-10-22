/**
 * MetadataFieldGrid — lays out a category's metadata fields (attributes on
 * Details, policies on Policies) through `MetadataFieldRenderer`: facts sit
 * two to a row from the tablet width, so no field stretches across a
 * desktop-wide column; a multi-choice group (languages, cuisines) takes the
 * whole row, since its chips need the room.
 */

import PropTypes from 'prop-types';
import MetadataFieldRenderer from './MetadataFieldRenderer.jsx';
import styles from './MetadataFieldGrid.module.scss';

const WIDE_DATA_TYPES = ['MULTI_ENUM'];

export default function MetadataFieldGrid({
  namespace,
  definitions,
  values,
  onChange,
  errorFor,
}) {
  return (
    <div className={styles.fields}>
      {definitions.map((definition) => (
        <div
          key={definition.code}
          className={
            WIDE_DATA_TYPES.includes(definition.data_type)
              ? styles.wide
              : undefined
          }
        >
          <MetadataFieldRenderer
            namespace={namespace}
            definition={definition}
            value={values[definition.code]}
            onChange={(value) => onChange(definition.code, value)}
            error={errorFor(definition.code)}
          />
        </div>
      ))}
    </div>
  );
}

MetadataFieldGrid.propTypes = {
  namespace: PropTypes.oneOf(['attributes', 'policies']).isRequired,
  definitions: PropTypes.arrayOf(
    PropTypes.shape({
      code: PropTypes.string.isRequired,
      data_type: PropTypes.string.isRequired,
    }),
  ).isRequired,
  // eslint-disable-next-line react/forbid-prop-types -- code -> domain value, shape varies by data_type
  values: PropTypes.object.isRequired,
  onChange: PropTypes.func.isRequired,
  /** `(code) => message | undefined` — the field's error, if any. */
  errorFor: PropTypes.func.isRequired,
};
