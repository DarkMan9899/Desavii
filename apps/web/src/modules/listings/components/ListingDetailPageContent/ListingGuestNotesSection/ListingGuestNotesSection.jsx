/**
 * ListingGuestNotesSection — Listing Detail rebuild: the partner-authored
 * "Good to know" lists (migration 0056, `listing_guest_notes`) for tours,
 * attractions, entertainment venues and car rentals: what to bring, what
 * is not allowed, and what to know before going. One column per kind the
 * partner filled in; renders nothing when there are no notes, so the page
 * never shows an empty block or invents guidance.
 */

import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { Backpack, Ban, Info } from 'lucide-react';
import { Section } from '@desavii/ui/components/layout';
import { GUEST_NOTE_KINDS } from '../../../constants/guestNotes.js';
import styles from './ListingGuestNotesSection.module.scss';

const ICON_BY_KIND = Object.freeze({
  BRING: Backpack,
  NOT_ALLOWED: Ban,
  KNOW_BEFORE: Info,
});

export default function ListingGuestNotesSection({
  notes = [],
  sectionId = undefined,
}) {
  const { t } = useTranslation();

  const groups = GUEST_NOTE_KINDS.map((kind) => ({
    kind,
    items: notes.filter((note) => note.kind === kind),
  })).filter((group) => group.items.length > 0);

  if (groups.length === 0) return null;

  const heading = t('pages.listingDetail.guestNotes.heading');

  return (
    <Section spacing="none" aria-label={heading}>
      <h2 id={sectionId}>{heading}</h2>
      <div className={styles.groups}>
        {groups.map(({ kind, items }) => {
          const Icon = ICON_BY_KIND[kind];
          return (
            <div key={kind} className={styles.group}>
              <h3 className={styles.groupHeading}>
                <Icon className={styles.icon} aria-hidden="true" />
                {t(`pages.listingDetail.guestNotes.kinds.${kind}`)}
              </h3>
              <ul className={styles.list}>
                {items.map((note) => (
                  <li key={note.id} className={styles.item}>
                    {note.text}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </Section>
  );
}

ListingGuestNotesSection.propTypes = {
  notes: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.number.isRequired,
      kind: PropTypes.oneOf(GUEST_NOTE_KINDS).isRequired,
      text: PropTypes.string.isRequired,
    }),
  ),
  sectionId: PropTypes.string,
};
