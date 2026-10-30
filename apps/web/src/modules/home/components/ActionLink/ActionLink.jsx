/**
 * ActionLink — Home's navigational calls to action, as designed controls
 * rather than text with a trailing arrow character:
 *
 * - `section` — a section's "View all": the label beside an arrow in a
 *   ringed circle that fills and nudges on hover/focus. `tone="dark"` for
 *   sections on the ink and navy bands.
 * - `onImage` — a solid white pill over photography (the partner banner).
 * - `primary` — a royal-blue pill for a link that is the main next step
 *   (Ask Desavii's "Log in to ask").
 *
 * Buttons that act rather than navigate (Search, Ask Desavii, Show
 * results) are the shared `@desavii/ui` `Button`; this is only for links.
 */

import PropTypes from 'prop-types';
import { ArrowRight } from 'lucide-react';
import RouterLink from '../../../../components/RouterLink.jsx';
import styles from './ActionLink.module.scss';

export default function ActionLink({
  href,
  children,
  variant = 'section',
  tone = 'light',
  onClick = undefined,
}) {
  return (
    <RouterLink
      href={href}
      onClick={onClick}
      className={[
        styles.link,
        styles[`link--${variant}`],
        tone === 'dark' && styles['link--dark'],
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <span className={styles.label}>{children}</span>
      <span className={styles.icon} aria-hidden="true">
        <ArrowRight size={16} />
      </span>
    </RouterLink>
  );
}

ActionLink.propTypes = {
  href: PropTypes.string.isRequired,
  children: PropTypes.node.isRequired,
  variant: PropTypes.oneOf(['section', 'onImage', 'primary']),
  tone: PropTypes.oneOf(['light', 'dark']),
  onClick: PropTypes.func,
};
