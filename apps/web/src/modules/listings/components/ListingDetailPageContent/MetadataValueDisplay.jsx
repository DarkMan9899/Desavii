/**
 * MetadataValueDisplay — the read-only counterpart to `PartnerListingWizard/
 * MetadataFieldRenderer.jsx`: given a category's metadata `definitions`
 * (attributes or policies, `GET /listings/metadata`'s shape) and an
 * already-mapped `valuesByCode` domain-value map (built by the *existing*
 * `fromAttributeValuesResponse`/`fromPolicyValuesResponse` — reused
 * as-is, never re-derived here), renders one label+value row per
 * definition the listing actually has a value for. Labels and values use
 * the write side's i18n keys (`partner.listingWizard.{namespace}.{code}`,
 * `metadataValueFormat.js`), so a fact reads the same where it is entered
 * and where it is shown.
 *
 * A definition the listing has no value for (visible in the category's
 * metadata but never filled in by the partner) is skipped — this lists
 * what the listing DOES say, not every field a listing of this category
 * COULD have. Admin uses it as one flat list; the public page groups the
 * same rows by category (`listingFactGroups.js`) and renders them with
 * `FactList`.
 */

import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import {
  hasMetadataValue,
  toMetadataRow,
} from '../../utils/metadataValueFormat.js';
import styles from './MetadataValueDisplay.module.scss';

/**
 * Facts as a definition list: an icon, a short label and its value. One
 * column on a phone, two from tablet, up to three from laptop. Every value
 * is plain text.
 */
export function FactList({ rows, columns = 3 }) {
  if (rows.length === 0) return null;
  return (
    <dl className={styles.grid} data-columns={columns}>
      {rows.map(({ key, icon: Icon, label, value }) => (
        // A `<dl>` group holds only its `<dt>`/`<dd>`; the icon sits inside
        // the term, placed beside both lines by the styles.
        <div className={styles.row} key={key}>
          <dt className={styles.label}>
            <Icon
              className={styles.icon}
              aria-hidden="true"
              focusable="false"
            />
            {label}
          </dt>
          <dd className={styles.value}>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export const factRowShape = PropTypes.shape({
  key: PropTypes.string.isRequired,
  icon: PropTypes.elementType.isRequired,
  label: PropTypes.string.isRequired,
  value: PropTypes.string.isRequired,
});

FactList.propTypes = {
  rows: PropTypes.arrayOf(factRowShape).isRequired,
  // A narrow host (the reservation column's neighbour) caps the columns.
  columns: PropTypes.oneOf([2, 3]),
};

export default function MetadataValueDisplay({
  namespace,
  definitions,
  valuesByCode,
}) {
  const { t, i18n } = useTranslation();
  const rows = definitions
    .filter((definition) => hasMetadataValue(valuesByCode[definition.code]))
    .map((definition) =>
      toMetadataRow(
        namespace,
        definition,
        valuesByCode[definition.code],
        t,
        i18n.language,
      ),
    );
  return <FactList rows={rows} />;
}

const optionShape = PropTypes.shape({
  value: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
  code: PropTypes.string.isRequired,
});

MetadataValueDisplay.propTypes = {
  namespace: PropTypes.oneOf(['attributes', 'policies']).isRequired,
  definitions: PropTypes.arrayOf(
    PropTypes.shape({
      code: PropTypes.string.isRequired,
      data_type: PropTypes.string.isRequired,
      unit: PropTypes.string,
      options: PropTypes.arrayOf(optionShape),
    }),
  ).isRequired,
  // eslint-disable-next-line react/forbid-prop-types -- domain value shape varies by data_type (string/number/boolean/array), same as MetadataFieldRenderer's own `value` prop
  valuesByCode: PropTypes.object.isRequired,
};
