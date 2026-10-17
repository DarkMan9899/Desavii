/**
 * CheckboxGroup — the control for `input_type: 'MULTI_SELECT'` filters
 * (e.g. amenities, cuisine). A thin loop over `packages/ui`'s `Checkbox`
 * primitive — reused rather than reimplemented, per the "reuse existing
 * code" rule — with membership toggling and the comma-joined-ids encoding
 * handled by `FilterControl.jsx`, not here.
 */

import { useId } from 'react';
import PropTypes from 'prop-types';
import { Checkbox } from '@desavii/ui/components/form-controls';
import styles from './CheckboxGroup.module.scss';

export default function CheckboxGroup({
  label,
  options,
  selectedValues,
  onChange,
}) {
  const labelId = useId();
  const toggle = (value) => {
    const next = selectedValues.includes(value)
      ? selectedValues.filter((selected) => selected !== value)
      : [...selectedValues, value];
    onChange(next);
  };

  return (
    <div
      className={styles.checkboxGroup}
      role="group"
      aria-labelledby={labelId}
    >
      <span id={labelId} className={styles.label}>
        {label}
      </span>
      <div className={styles.options}>
        {options.map((option) => (
          <Checkbox
            key={option.value}
            label={option.label}
            checked={selectedValues.includes(option.value)}
            onChange={() => toggle(option.value)}
          />
        ))}
      </div>
    </div>
  );
}

CheckboxGroup.propTypes = {
  label: PropTypes.string.isRequired,
  options: PropTypes.arrayOf(
    PropTypes.shape({
      value: PropTypes.string.isRequired,
      label: PropTypes.node.isRequired,
    }),
  ).isRequired,
  selectedValues: PropTypes.arrayOf(PropTypes.string).isRequired,
  onChange: PropTypes.func.isRequired,
};
