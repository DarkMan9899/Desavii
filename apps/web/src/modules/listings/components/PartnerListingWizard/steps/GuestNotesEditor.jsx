/**
 * GuestNotesEditor — the Guest information step's "Good to know" lists:
 * what to bring, what is not allowed, and what to know before going
 * (docs/LISTING_DETAIL_FIELD_GAP.md §5). Controlled: `ContentStep` owns
 * the rows per authoring language (so switching language never drops an
 * unsaved edit), their keys, and saves them; this renders one list per kind with add,
 * edit and remove, each kind capped on its own like the API.
 */

import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { Button } from '@desavii/ui/components/primitives';
import { Input } from '@desavii/ui/components/form-controls';
import { Stack } from '@desavii/ui/components/layout';
import {
  GUEST_NOTE_KINDS,
  GUEST_NOTES_PER_KIND_MAX,
} from '../../../constants/guestNotes.js';
import { GUEST_NOTE_TEXT_MAX_LENGTH } from '../../../constants/textLimits.js';
import styles from './ContentStep.module.scss';

export default function GuestNotesEditor({ rows, onRowsChange, onAddRow }) {
  const { t } = useTranslation();

  function updateText(rowKey, text) {
    onRowsChange(
      rows.map((row) => (row.rowKey === rowKey ? { ...row, text } : row)),
    );
  }

  return (
    <section>
      <h3>{t('partner.listingWizard.content.guestNotesTitle')}</h3>
      <p className={styles.sectionHint}>
        {t('partner.listingWizard.content.guestNotesHint')}
      </p>
      <Stack gap="6">
        {GUEST_NOTE_KINDS.map((kind) => {
          const kindRows = rows.filter((row) => row.kind === kind);
          const kindLabel = t(
            `partner.listingWizard.content.guestNoteKinds.${kind}`,
          );
          return (
            <Stack gap="3" key={kind}>
              <h4 className={styles.subheading}>{kindLabel}</h4>
              {kindRows.map((row) => (
                <div key={row.rowKey} className={styles.noteRow}>
                  <Input
                    size="sm"
                    label={kindLabel}
                    value={row.text}
                    maxLength={GUEST_NOTE_TEXT_MAX_LENGTH}
                    onChange={(event) =>
                      updateText(row.rowKey, event.target.value)
                    }
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      onRowsChange(
                        rows.filter((other) => other.rowKey !== row.rowKey),
                      )
                    }
                  >
                    {t('partner.listingWizard.content.removeRow')}
                  </Button>
                </div>
              ))}
              <Button
                size="sm"
                variant="secondary"
                disabled={kindRows.length >= GUEST_NOTES_PER_KIND_MAX}
                onClick={() => onAddRow(kind)}
              >
                {t('partner.listingWizard.content.addGuestNote', {
                  kind: kindLabel,
                })}
              </Button>
            </Stack>
          );
        })}
      </Stack>
    </section>
  );
}

GuestNotesEditor.propTypes = {
  rows: PropTypes.arrayOf(
    PropTypes.shape({
      rowKey: PropTypes.number.isRequired,
      kind: PropTypes.oneOf(GUEST_NOTE_KINDS).isRequired,
      text: PropTypes.string.isRequired,
    }),
  ).isRequired,
  onRowsChange: PropTypes.func.isRequired,
  onAddRow: PropTypes.func.isRequired,
};
