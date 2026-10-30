/**
 * Footer — reusable site footer chrome.
 *
 * Lives in `src/components/` for the same reason as Header (see that
 * component's file header) — PublicLayout renders the full footer
 * described in FRONTEND_ARCHITECTURE.md §5.1 ("company/explore/
 * partners/support/legal columns"); other layouts that need a lighter
 * footer compose this same component with fewer `columns` rather than
 * a separate implementation.
 *
 * Zero business logic: `columns`/`bottomText` are supplied by the
 * composing layout.
 */

import { Link } from 'react-router-dom';
import PropTypes from 'prop-types';
import { Container, Stack } from '@desavii/ui/components/layout';
import styles from './Footer.module.scss';

export default function Footer({ columns = [], bottomText = undefined }) {
  return (
    <footer className={styles.footer}>
      <Container size="wide">
        {columns.length > 0 && (
          // Two columns on a phone, all of them in one row from tablet
          // (`Grid` pins one column count at every width, which squeezed
          // four columns into ~80px each on a phone).
          <div
            className={styles.columns}
            style={{ '--footer-columns': columns.length }}
          >
            {columns.map((column) => (
              <Stack
                as="nav"
                key={column.title}
                gap="3"
                aria-label={column.title}
              >
                <p className={styles.columnTitle}>{column.title}</p>
                <Stack as="ul" gap="2" className={styles.linkList}>
                  {column.links.map((link) => (
                    <li key={link.to}>
                      <Link to={link.to} className={styles.link}>
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </Stack>
              </Stack>
            ))}
          </div>
        )}
        {bottomText && <p className={styles.bottomText}>{bottomText}</p>}
      </Container>
    </footer>
  );
}

Footer.propTypes = {
  columns: PropTypes.arrayOf(
    PropTypes.shape({
      title: PropTypes.string.isRequired,
      links: PropTypes.arrayOf(
        PropTypes.shape({
          label: PropTypes.string.isRequired,
          to: PropTypes.string.isRequired,
        }),
      ).isRequired,
    }),
  ),
  bottomText: PropTypes.string,
};
