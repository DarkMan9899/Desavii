/**
 * SectionHeader — the shared eyebrow/title/subtitle/"view all" heading
 * block reused by every homepage section, so the pattern is written once
 * instead of once per section (Component architecture: "shared section
 * headers").
 *
 * `tone`: `'light'` (default, unchanged) is this component's original
 * dark-text-on-light-background palette. `'dark'` is the redesign
 * phase's white-text-on-dark-scene palette (Popular Experiences' own
 * cinematic panel) — a prop, not a second component, so every section
 * still shares one heading implementation regardless of which scene it
 * sits in.
 *
 * Home final design pass: "view all" is an `ActionLink` (a designed
 * control), not text with a trailing arrow character. Carousel sections
 * pass their link to `HomeCarousel` instead, so it sits beside the row's
 * controls.
 */

import PropTypes from 'prop-types';
import ActionLink from '../ActionLink/ActionLink.jsx';
import styles from './SectionHeader.module.scss';

export default function SectionHeader({
  id = undefined,
  eyebrow = undefined,
  title,
  subtitle = undefined,
  viewAllHref = undefined,
  viewAllLabel = undefined,
  tone = 'light',
}) {
  return (
    <div
      className={[styles.header, tone === 'dark' && styles['header--dark']]
        .filter(Boolean)
        .join(' ')}
    >
      <div className={styles.text}>
        {eyebrow && (
          <>
            <p className={styles.eyebrow}>{eyebrow}</p>
            <span className={styles.accentRule} aria-hidden="true" />
          </>
        )}
        <h2 id={id} className={styles.title}>
          {title}
        </h2>
        {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
      </div>
      {viewAllHref && viewAllLabel && (
        <ActionLink href={viewAllHref} tone={tone}>
          {viewAllLabel}
        </ActionLink>
      )}
    </div>
  );
}

SectionHeader.propTypes = {
  id: PropTypes.string,
  eyebrow: PropTypes.string,
  title: PropTypes.string.isRequired,
  subtitle: PropTypes.string,
  viewAllHref: PropTypes.string,
  viewAllLabel: PropTypes.string,
  tone: PropTypes.oneOf(['light', 'dark']),
};
